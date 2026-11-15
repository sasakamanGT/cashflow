// グラフ（銀行のみ・合計）。銀行は最初にマイナスになる日で止める
'use strict';
function drawChart(K){
  var t=CF.todayStr(), end=horizonEnd(), stop=(K==='bank'&&sim.bankNeg)?sim.bankNeg:null;
  if(stop)end=stop;
  var past=[], fut=[];
  if(view.all){
    data.balances.slice().sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(b){
      if(b.date<sim.base.date) past.push({date:b.date,bank:b.bank,total:b.bank+b.sec});
    });
  }
  var startF = view.all? sim.base.date : (sim.base.date>t?sim.base.date:t);
  var st=CF.balanceAt(sim,startF)||sim.daily[0];
  fut.push({date:startF,bank:st.bank,total:st.total});
  sim.daily.forEach(function(d){if(d.date>startF&&d.date<=end)fut.push(d);});
  if(!stop)fut.push({date:end,bank:fut[fut.length-1].bank,total:fut[fut.length-1].total});
  if(past.length) past.push({date:sim.base.date,bank:sim.base.bank,total:sim.base.bank+sim.base.sec});
  var all=past.concat(fut);
  var x0=CF.toDate(all[0].date).getTime(), x1=CF.toDate(end).getTime(); if(x1<=x0)x1=x0+864e5; if(stop)x1+=(x1-x0)*0.08;
  var COL=K==='bank'?'var(--bank)':'var(--total)';
  var vmin=0,vmax=100000; all.forEach(function(p){vmin=Math.min(vmin,p[K]);vmax=Math.max(vmax,p[K]);});
  vmax*=1.08; if(vmin<0)vmin*=1.1;
  var W=340,H=170,L=38,R=6,T=8,B=20;
  function X(s){return L+(CF.toDate(s).getTime()-x0)/(x1-x0)*(W-L-R);}
  function Y(v){return T+(vmax-v)/(vmax-vmin)*(H-T-B);}
  function path(pts,key){var d='';pts.forEach(function(p,i){var x=X(p.date).toFixed(1),y=Y(p[key]).toFixed(1);if(i===0)d+='M'+x+','+y;else d+='H'+x+'V'+y;});return d;}
  function lab(v){return Math.abs(v)>=10000?Math.round(v/10000)+'万':String(Math.round(v));}
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" id="csvg_'+K+'" style="touch-action:pan-y">';
  s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(0)+'" y2="'+Y(0)+'" stroke="#e24b4a" stroke-width=".8" stroke-dasharray="3 3"/>';
  s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(100000)+'" y2="'+Y(100000)+'" stroke="#ef9f27" stroke-width=".8" stroke-dasharray="3 3"/>';
  s+='<text x="'+(L-3)+'" y="'+(Y(0)+3)+'" text-anchor="end">0</text><text x="'+(L-3)+'" y="'+(Y(vmax)+8)+'" text-anchor="end">'+lab(vmax/1.08)+'</text>';
  if(Y(100000)<Y(0)-10&&Y(100000)>T+14) s+='<text x="'+(L-3)+'" y="'+(Y(100000)+3)+'" text-anchor="end">10万</text>';
  if(vmin<0) s+='<text x="'+(L-3)+'" y="'+(Y(vmin)+3)+'" text-anchor="end">'+lab(vmin/1.1)+'</text>';
  if(view.all&&t>=all[0].date&&t<=end) s+='<line x1="'+X(t)+'" x2="'+X(t)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--muted)" stroke-width=".6"/><text x="'+(X(t)+2)+'" y="'+(T+8)+'">今日</text>';
  if(K==='total'&&sim.depletion&&sim.depletion<=end) s+='<line x1="'+X(sim.depletion)+'" x2="'+X(sim.depletion)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#e24b4a" stroke-width=".8"/>';
  if(past.length>1){s+='<path d="'+path(past,K)+'" fill="none" stroke="'+COL+'" stroke-width="2"/>';}
  var dash=view.all?' stroke-dasharray="4 2"':'';
  s+='<path d="'+path(fut,K)+'" fill="none" stroke="'+COL+'" stroke-width="2"'+dash+'/>';
  if(stop)s+='<circle cx="'+X(stop)+'" cy="'+Y(sim.bankNegAmt)+'" r="3.5" fill="#e24b4a"/><text x="'+(X(stop)-6)+'" y="'+(Y(sim.bankNegAmt)+4)+'" text-anchor="end" style="fill:#e24b4a;font-size:11px">'+md(stop)+' '+num(sim.bankNegAmt)+'</text>';
  var a=CF.parse(all[0].date),z=CF.parse(end);
  s+='<text x="'+L+'" y="'+(H-5)+'">'+a.y+'/'+a.m+'</text><text x="'+(W-R)+'" y="'+(H-5)+'" text-anchor="end">'+z.y+'/'+z.m+'</text>';
  s+='<line id="cur_'+K+'" x1="0" x2="0" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--accent)" stroke-width=".8" visibility="hidden"/></svg>';
  $('#chart_'+K).innerHTML=s;
  var svg=$('#csvg_'+K);
  function pick(ev){
    var r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)/r.width*W;
    if(px<L||px>W-R)return;
    var ms=x0+(px-L)/(W-L-R)*(x1-x0), d=CF.fromDate(new Date(ms)), p=null;
    all.forEach(function(q){if(q.date<=d)p=q;});
    if(!p)return;
    var c=$('#cur_'+K);c.setAttribute('x1',px);c.setAttribute('x2',px);c.setAttribute('visibility','visible');
    $('#tip_'+K).innerHTML=jd(d)+'　'+(K==='bank'?'銀行':'合計')+' <b class="'+lvCls(p[K])+'">'+yen(p[K])+'</b>'+(d>t?'（予測）':'');
  }
  svg.addEventListener('pointerdown',pick);svg.addEventListener('pointermove',function(e){if(e.buttons||e.pointerType==='mouse')pick(e);});
}
