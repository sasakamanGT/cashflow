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
  function prevBusinessDay(s) { while (isBankHoliday(s)) s = addDays(s, -1); return s; }

  // ---- 予定の展開 ----
  // item: {id,type:'in'|'out'|'transfer',account:'bank'|'sec',to,date,name,amount,repeat:'none'|'monthly'|'yearly',until,shift}
  function occurrences(item, from, to) {
    var out = [];
    var start = item.date, p = parse(start);
    function push(raw) {
      if (raw < start) return;
      if (item.until && raw > item.until) return;
      var d = item.shift === 'prev' ? prevBusinessDay(raw) : (item.shift ? nextBusinessDay(raw) : raw);
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

  // ---- 予測シミュレーション（実績確認方式） ----
  // data: {balances:[{date,bank,sec}], items:[...], marks:{"itemId|raw":{status:'done'|'skip'|'moved',date,amount,type,account,to,name}}}
  // ・残高記録＝その日時点の実際の残高。確定した実績（marks done）は記録日の翌日以降の分だけ加算
  // ・予定は実績確認するまで口座に反映しない。予定日を過ぎた未確認分は「確認待ち」として今日に計上して予測
  // ・最初の残高記録日以前の予定は対象外
  function sortedSnaps(data) {
    return (data.balances || []).slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  }
  function latestBalance(data) { var b = sortedSnaps(data); return b.length ? b[b.length - 1] : null; }
  function markKey(item, raw) { return item.id + '|' + raw; }

  // 指定日時点の実績残高（その日以前の最新の残高記録＋その後の確定実績）
  function actualAt(data, date) {
    var snaps = sortedSnaps(data), s = null;
    snaps.forEach(function (x) { if (x.date <= date) s = x; });
    if (!s) return null;
    var bank = s.bank, sec = s.sec, marks = data.marks || {};
    Object.keys(marks).forEach(function (k) {
      var m = marks[k];
      if (m.status === 'done' && m.date > s.date && m.date <= date) { bank += signed(m, 'bank'); sec += signed(m, 'sec'); }
    });
    return { date: date, bank: bank, sec: sec, total: bank + sec, snap: s };
  }

  function simulate(data, opts) {
    opts = opts || {};
    var snaps = sortedSnaps(data);
    if (!snaps.length) return null;
    var base0 = snaps[0].date, base = snaps[snaps.length - 1];
    var T = opts.today || todayStr();
    if (T < base.date) T = base.date;
    var end = addMonths(T, (opts.maxYears || 30) * 12);
    var marks = data.marks || {};
    var ev = [];
    Object.keys(marks).forEach(function (k) {
      var m = marks[k];
      if (m.status === 'done' && m.date > base.date) ev.push({ date: m.date, kind: 'actual', key: k, mark: m, amount: m.amount });
    });
    (data.items || []).forEach(function (it) {
      occurrences(it, addDays(base0, 1), end).forEach(function (o) {
        var k = markKey(it, o.raw), m = marks[k];
        if (m && (m.status === 'done' || m.status === 'skip')) return;
        var eff = (m && m.status === 'moved') ? m.date : o.date;
        if (eff <= base0) return;
        var overdue = eff <= T;
        ev.push({ date: overdue ? T : eff, sched: eff, kind: 'plan', overdue: overdue, key: k, item: it, raw: o.raw, amount: it.amount });
      });
    });
    var rank = function (e) { return e.kind === 'actual' ? 0 : ((e.item.type === 'in') ? 1 : 2); };
    ev.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (a.sched || a.date) < (b.sched || b.date) ? -1 : 1;
    });
    var bank = Math.round(base.bank || 0), sec = Math.round(base.sec || 0);
    var cur = { bank: bank, sec: sec };
    var events = [], daily = [{ date: base.date, bank: bank, sec: sec, total: bank + sec }];
    var depletion = null, below100k = null, i = 0;
    while (i < ev.length) {
      var d = ev[i].date;
      while (i < ev.length && ev[i].date === d) {
        var e = ev[i], src = e.kind === 'actual' ? e.mark : e.item;
        bank += signed(src, 'bank'); sec += signed(src, 'sec');
        if (e.kind === 'actual' && e.date <= T) { cur.bank += signed(src, 'bank'); cur.sec += signed(src, 'sec'); }
        e.bank = bank; e.sec = sec; e.total = bank + sec;
        events.push(e); i++;
      }
      if (d >= T && bank < 0 && sec > 0) {
        var need = Math.min(-bank, sec);
        bank += need; sec -= need;
        events.push({ date: d, kind: 'auto', amount: need, bank: bank, sec: sec, total: bank + sec });
      }
      daily.push({ date: d, bank: bank, sec: sec, total: bank + sec });
      if (d >= T) {
        if (!below100k && bank + sec < 100000) below100k = d;
        if (!depletion && bank + sec < 0) depletion = d;
      }
    }
    cur.total = cur.bank + cur.sec;
    if (!below100k && cur.total < 100000) below100k = T;
    if (!depletion && cur.total < 0) depletion = T;
    var overdue = events.filter(function (e) { return e.kind === 'plan' && e.overdue; });
    return { base: base, base0: base0, today: T, events: events, daily: daily, current: cur, overdue: overdue,
      depletion: depletion, below100k: below100k, end: end };
  }

  // 指定日の終わり時点の残高（予測込み）
  function balanceAt(sim, date) {
    var last = null;
    for (var i = 0; i < sim.daily.length; i++) {
      if (sim.daily[i].date <= date) last = sim.daily[i]; else break;
    }
    return last;
  }

  function level(v) { return v < 0 ? 'neg' : (v < 100000 ? 'warn' : 'ok'); }

  var api = {
    pad: pad, ymd: ymd, parse: parse, toDate: toDate, fromDate: fromDate, addDays: addDays,
    addMonths: addMonths, monthEnd: monthEnd, todayStr: todayStr, daysInMonth: daysInMonth,
    holidays: holidays, isBankHoliday: isBankHoliday, nextBusinessDay: nextBusinessDay, prevBusinessDay: prevBusinessDay,
    occurrences: occurrences, simulate: simulate, balanceAt: balanceAt, latestBalance: latestBalance,
    actualAt: actualAt, markKey: markKey,
    level: level, signed: signed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CF = api;
})(this);
