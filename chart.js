// グラフ：合計（2口座）の年末残高の棒グラフ
'use strict';
// 合計（2口座）の年末残高を、0円を下回る年まで棒グラフで表示（値は最初から書いておく）
function drawYearly(){
  var t=sim.today, y0=+t.slice(0,4), dep=sim.depletion, y1=dep?+dep.slice(0,4):+sim.end.slice(0,4)-1;
  if(y1<y0)y1=y0;
  var pts=[];
  for(var y=y0;y<=y1;y++){var b=CF.balanceAt(sim,y+'-12-31')||sim.daily[0];pts.push({y:y,v:b.total});}
  var head;
  if(dep){
    var days=Math.round((CF.toDate(dep)-CF.toDate(t))/864e5),yy=Math.floor(days/365),mo=Math.floor((days%365)/30.44),p=CF.parse(dep);
    head='0円になるのは <b class="lv-neg">'+p.y+'年'+p.m+'月ごろ</b>'+(days>0?'（あと'+(yy?yy+'年':'')+mo+'か月）':'（すでに0円以下）');
  }else head='30年以内に0円になりません';
  var vals=pts.map(function(p){return p.v;}).concat([0]);
  var vmax=Math.max.apply(null,vals), vmin=Math.min.apply(null,vals); if(vmax===vmin)vmax=vmin+1;
  var W=340,H=160,T=14,B=26,n=pts.length,gap=W/n,bw=Math.max(4,Math.min(24,gap*0.6)),step=Math.ceil(n/12);
  function Y(v){return T+(vmax-v)/(vmax-vmin)*(H-T-B);}
  var s='<div style="font-size:14px;margin:2px 0 4px">'+head+'</div><svg viewBox="0 0 '+W+' '+H+'" width="100%">';
  s+='<line x1="0" x2="'+W+'" y1="'+Y(0)+'" y2="'+Y(0)+'" stroke="var(--muted)" stroke-width=".8"/>';
  pts.forEach(function(p,i){
    var x=gap*i+(gap-bw)/2, y=Math.min(Y(p.v),Y(0)), h=Math.max(1,Math.abs(Y(p.v)-Y(0)));
    var col=p.v<=0?'#e24b4a':(dep&&i>=n-4?'#ef9f27':'var(--total)');
    s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+col+'"/>';
    if(i%step===0||i===n-1){
      var cx=(x+bw/2).toFixed(1), lab=Math.round(p.v/10000), ty=p.v>=0?Y(p.v)-3:Y(p.v)+10;
      s+='<text x="'+cx+'" y="'+ty.toFixed(1)+'" text-anchor="middle" style="font-size:9px;fill:'+(p.v<=0?'#e24b4a':'var(--text)')+'">'+lab+'</text>';
      s+='<text x="'+cx+'" y="'+(H-4)+'" text-anchor="middle">'+String(p.y).slice(2)+'</text>';
    }
  });
  s+='</svg><div class="tip" style="color:var(--text2)">数字は万円（年末時点）、下の数字は年（'+String(y0)+'年〜）</div>';
  $('#chart_total').innerHTML=s;
}
