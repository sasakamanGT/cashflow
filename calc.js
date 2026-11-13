// キャッシュフロー計算ロジック（金額データは含まない）
(function (root) {
  'use strict';

  // ---- 日付ユーティリティ（"YYYY-MM-DD" 文字列で扱う） ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parse(s) { var p = s.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function toDate(s) { var p = parse(s); return new Date(p.y, p.m - 1, p.d); }
  function fromDate(dt) { return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function addDays(s, n) { var dt = toDate(s); dt.setDate(dt.getDate() + n); return fromDate(dt); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function todayStr() { return fromDate(new Date()); }
  function addMonths(s, n) {
    var p = parse(s); var t = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(t / 12), m = t % 12 + 1;
    return ymd(y, m, Math.min(p.d, daysInMonth(y, m)));
  }
  function monthEnd(s) { var p = parse(s); return ymd(p.y, p.m, daysInMonth(p.y, p.m)); }

  // ---- 日本の祝日 ----
  var holidayCache = {};
  function nthMonday(y, m, n) {
    var first = new Date(y, m - 1, 1).getDay();
    var d = 1 + ((8 - first) % 7) + (n - 1) * 7;
    return ymd(y, m, d);
  }
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    var list = [ymd(y, 1, 1), ymd(y, 2, 11), ymd(y, 4, 29), ymd(y, 5, 3), ymd(y, 5, 4), ymd(y, 5, 5),
      ymd(y, 11, 3), ymd(y, 11, 23)];
    if (y >= 2020) list.push(ymd(y, 2, 23));
    if (y >= 2016) list.push(ymd(y, 8, 11));
    list.push(nthMonday(y, 1, 2), nthMonday(y, 7, 3), nthMonday(y, 9, 3), nthMonday(y, 10, 2));
    var k = y - 1980, q = Math.floor(k / 4);
    list.push(ymd(y, 3, Math.floor(20.8431 + 0.242194 * k - q)));
    list.push(ymd(y, 9, Math.floor(23.2488 + 0.242194 * k - q)));
    var set = {};
    list.forEach(function (s) { set[s] = true; });
    // 国民の休日（祝日に挟まれた平日）
    list.forEach(function (s) {
      var mid = addDays(s, 1), next = addDays(s, 2);
      if (set[next] && !set[mid] && toDate(mid).getDay() !== 0) set[mid] = true;
    });
    // 振替休日
    Object.keys(set).sort().forEach(function (s) {
      if (toDate(s).getDay() === 0) {
        var d = addDays(s, 1);
        while (set[d]) d = addDays(d, 1);
        set[d] = true;
      }
    });
    holidayCache[y] = set;
    return set;
  }
  function isBankHoliday(s) {
    var dt = toDate(s), w = dt.getDay();
    if (w === 0 || w === 6) return true;
    var p = parse(s);
    if ((p.m === 12 && p.d === 31) || (p.m === 1 && p.d <= 3)) return true;
    return !!holidays(p.y)[s];
  }
  function nextBusinessDay(s) { while (isBankHoliday(s)) s = addDays(s, 1); return s; }

  // ---- 予定の展開 ----
  // item: {id,type:'in'|'out'|'transfer',account:'bank'|'sec',to,date,name,amount,repeat:'none'|'monthly'|'yearly',until,shift}
  function occurrences(item, from, to) {
    var out = [];
    var start = item.date, p = parse(start);
    function push(raw) {
      if (raw < start) return;
      if (item.until && raw > item.until) return;
      var d = item.shift ? nextBusinessDay(raw) : raw;
      if (d >= from && d <= to) out.push({ date: d, raw: raw, item: item });
    }
    if (!item.repeat || item.repeat === 'none') { push(start); return out; }
    var limit = addDays(to, 10);
    if (item.repeat === 'monthly') {
      for (var i = 0; ; i++) {
        var t = p.y * 12 + (p.m - 1) + i, y = Math.floor(t / 12), m = t % 12 + 1;
        var raw = ymd(y, m, Math.min(p.d, daysInMonth(y, m)));
        if (raw > limit || (item.until && raw > item.until)) break;
        push(raw);
      }
    } else if (item.repeat === 'yearly') {
      for (var j = 0; ; j++) {
        var yy = p.y + j;
        var r = ymd(yy, p.m, Math.min(p.d, daysInMonth(yy, p.m)));
        if (r > limit || (item.until && r > item.until)) break;
        push(r);
      }
    }
    return out;
  }

  function signed(item, account) {
    var a = Math.round(Number(item.amount) || 0);
    if (item.type === 'in') return item.account === account ? a : 0;
    if (item.type === 'out') return item.account === account ? -a : 0;
    if (item.type === 'transfer') {
      if (item.account === account) return -a;
      if (item.to === account) return a;
    }
    return 0;
  }

  // ---- 予測シミュレーション ----
  // data: {balances:[{date,bank,sec}], items:[...]}
  // 残高記録はその日の入出金を反映済みとみなし、翌日以降の予定を適用する
  function latestBalance(data) {
    var b = (data.balances || []).slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    return b.length ? b[b.length - 1] : null;
  }

  function simulate(data, opts) {
    opts = opts || {};
    var base = latestBalance(data);
    if (!base) return null;
    var maxYears = opts.maxYears || 30;
    var end = addMonths(base.date, maxYears * 12);
    var items = data.items || [];
    var occ = [];
    items.forEach(function (it) {
      occurrences(it, addDays(base.date, 1), end).forEach(function (o) { occ.push(o); });
    });
    occ.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // 同じ日は入金を先に
      var oa = a.item.type === 'in' ? 0 : 1, ob = b.item.type === 'in' ? 0 : 1;
      return oa - ob;
    });
    var bank = Math.round(base.bank || 0), sec = Math.round(base.sec || 0);
    var events = [];          // 明細（補填含む）
    var daily = [{ date: base.date, bank: bank, sec: sec, total: bank + sec }];
    var depletion = null, below100k = null;
    if (bank + sec < 100000) below100k = base.date;
    if (bank + sec < 0) depletion = base.date;
    var i = 0;
    while (i < occ.length) {
      var d = occ[i].date;
      while (i < occ.length && occ[i].date === d) {
        var o = occ[i];
        bank += signed(o.item, 'bank');
        sec += signed(o.item, 'sec');
        events.push({ date: d, item: o.item, raw: o.raw, auto: false, bank: bank, sec: sec, total: bank + sec });
        i++;
      }
      // 銀行が不足したら証券から自動補填（予測）
      if (bank < 0 && sec > 0) {
        var need = Math.min(-bank, sec);
        bank += need; sec -= need;
        events.push({ date: d, auto: true, amount: need, bank: bank, sec: sec, total: bank + sec });
      }
      daily.push({ date: d, bank: bank, sec: sec, total: bank + sec });
      if (!below100k && bank + sec < 100000) below100k = d;
      if (!depletion && bank + sec < 0) depletion = d;
    }
    return { base: base, events: events, daily: daily, depletion: depletion, below100k: below100k, end: end };
  }

  // 指定日の終わり時点の残高
  function balanceAt(sim, date) {
    var last = null;
    for (var i = 0; i < sim.daily.length; i++) {
      if (sim.daily[i].date <= date) last = sim.daily[i]; else break;
    }
    return last;
  }

  function level(v) { return v < 0 ? 'neg' : (v < 100000 ? 'warn' : 'ok'); }

  // 実際の金額式評価（テンキー用）：terms = [{sign:1|-1, value:number}]
  var api = {
    pad: pad, ymd: ymd, parse: parse, toDate: toDate, fromDate: fromDate, addDays: addDays,
    addMonths: addMonths, monthEnd: monthEnd, todayStr: todayStr, daysInMonth: daysInMonth,
    holidays: holidays, isBankHoliday: isBankHoliday, nextBusinessDay: nextBusinessDay,
    occurrences: occurrences, simulate: simulate, balanceAt: balanceAt, latestBalance: latestBalance,
    level: level, signed: signed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CF = api;
})(this);
