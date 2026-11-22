// メイン画面（残高・月末残高・確認待ち・明細）
'use strict';
// 最初に銀行がマイナスになる月を、その月だけ乗り切るのに必要な振替額
function transferNeed(){
  var t=sim.today, c=sim.current, first=c.bank<0?t:sim.bankNeg;
  if(!first)return null;
  var me=CF.monthEnd(first), low=c.bank<0?{date:t,bank:c.bank}:null;
  sim.daily.forEach(function(d){if(d.date>=first&&d.date<=me&&(!low||d.bank<low.bank))low=d;});
  var end=CF.balanceAt(sim,me)||low;
  return {first:first,month:CF.parse(first).m,low:low,need:-low.bank,monthEnd:end.bank,sec:c.sec};
}
function render(){
  var m=$('#main');
  if(!data){m.innerHTML='<div class="empty">読み込み中…</div>';return;}
  sim=CF.simulate(data);
  if(!sim){
    m.innerHTML='<div class="empty"><p>はじめに、今日の残高を入力してください。</p><button class="btn pri" id="firstBal">残高を入力</button></div>';
    $('#firstBal').onclick=function(){openBalance();};
    return;
  }
  var t=sim.today, now=sim.current, h='';
  // 現在の残高（確定した実績まで）
  h+='<div class="sec"><div class="grid3">'+
    '<div class="acc" data-bal><div class="l">銀行</div><div class="v '+lvCls(now.bank)+'">'+yen(now.bank)+'</div></div>'+
    '<div class="acc" data-bal><div class="l">証券</div><div class="v '+lvCls(now.sec)+'">'+yen(now.sec)+'</div></div>'+
    '<div class="acc" data-bal style="background:var(--sub)"><div class="l">合計</div><div class="v '+lvCls(now.total)+'">'+yen(now.total)+'</div></div>'+
    '</div><div class="note">現在の残高（確定した実績まで）　最終の残高記録：'+md(sim.base.date)+'（タップして実際の残高を記録）</div></div>';
  // 月末残高（銀行を大きく）
  h+='<div class="sec" style="padding-top:0"><div class="grid3">';
  for(var i=0;i<3;i++){
    var me=CF.monthEnd(CF.addMonths(t.slice(0,8)+'01',i)), b=CF.balanceAt(sim,me)||sim.daily[0], lv=CF.level(b.bank);
    h+='<div class="me '+(lv==='ok'?'':lv)+'"><div class="l">'+CF.parse(me).m+'月末（銀行）</div><div class="v">'+yen(b.bank)+'</div><div class="s">合計 <span class="'+lvCls(b.total)+'">'+yen(b.total)+'</span></div></div>';
  }
  h+='</div></div>';
  // 銀行が最初にマイナスになる月と、その月に必要な振替額
  var need=transferNeed();
  if(need)h+='<div class="sec need" style="padding-top:0"><b>'+md(need.first)+'</b>に銀行がマイナスになります。'+need.month+'月を乗り切るには、証券から <b>'+num(need.need)+'円</b> の振替が必要（'+need.month+'月末の銀行：'+num(need.monthEnd)+'円）'+(need.sec<need.need?'。証券の現金も足りません':'')+'</div>';
  // 確認待ち
  if(sim.overdue.length){
    h+='<div class="phead">確認待ち（'+sim.overdue.length+'件）　タップして実績確認</div>';
    sim.overdue.forEach(function(e){h+=rowHtml(e,true);});
  }
  // 明細（実績＋予定）
  var until=CF.monthEnd(CF.addMonths(t.slice(0,8)+'01',view.months-1)), cur='';
  var ev=sim.events.filter(function(e){return e.date<=until&&!(e.kind==='plan'&&e.overdue);});
  if(!ev.length&&!sim.overdue.length) h+='<div class="empty">予定がありません。右下の＋から追加してください。</div>';
  ev.forEach(function(e){
    var mk=e.date.slice(0,7);
    if(mk!==cur){cur=mk;h+='<div class="mhead">'+CF.parse(e.date).y+'年'+CF.parse(e.date).m+'月</div>';}
    h+=rowHtml(e,false);
  });
  if(sim.events.some(function(e){return e.date>until;})) h+='<button class="more" id="more">もう3か月表示</button>';
  // グラフ（銀行のみ・合計）
  // グラフ（合計（2口座）の年末残高）
  h+='<div class="sec"><div class="chartbox"><div class="chart-top"><span class="ctitle">合計（2口座）の年末残高</span></div>'+
    '<div id="chart_total"></div></div></div>';
  m.innerHTML=h;
  m.querySelectorAll('[data-bal]').forEach(function(el){el.onclick=function(){openBalance();};});
  m.querySelectorAll('.row[data-k]').forEach(function(el){el.onclick=function(){
    var e=sim.events.filter(function(x){return x.key===el.dataset.k&&x.kind===el.dataset.kind;})[0];
    if(!e)return; if(e.kind==='actual')openActual(e.key); else openConfirm(e);
  };});
  if($('#more'))$('#more').onclick=function(){view.months+=3;render();};
  drawYearly();
}
function rowHtml(e,pend){
  var bal='<div class="bal">銀行 <span class="'+lvCls(e.bank)+'">'+num(e.bank)+'</span>　合計 <span class="'+lvCls(e.total)+'">'+num(e.total)+'</span></div>';
  var src=e.kind==='actual'?e.mark:e.item, sign=src.type==='in'?'+':(src.type==='out'?'-':''), cls=src.type==='in'?'plus':'';
  var tag='<span class="tag '+src.account+'">'+accName(src)+'</span>';
  var st=e.kind==='actual'?'<span class="tag done">実績</span>':(pend?'':'<span class="tag plan">予定</span>');
  var rep=e.kind==='plan'&&e.item.repeat&&e.item.repeat!=='none'?' ↻':'';
  var d=pend?md(e.sched):md(e.date);
  return '<div class="row '+(pend?'pend':(e.kind==='actual'?'done':''))+'" data-k="'+esc(e.key)+'" data-kind="'+e.kind+'"><span class="d">'+d+'</span><span class="n"><div class="nm">'+(e.kind==='actual'?'✓ ':'')+esc(src.name||'（無題）')+rep+tag+st+'</div></span><span><div class="a '+cls+'">'+sign+num(e.amount)+'</div>'+(pend?'':bal)+'</span></div>';
}
