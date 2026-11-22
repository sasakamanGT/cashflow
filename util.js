// 共通の変数・表示用の関数・入力（テンキー）・モーダル
'use strict';
var OWNER='sasakamanGT', REPO='cashflow-data', FILE='data.json';
var ACC={bank:'銀行',sec:'証券'};
var data=null, sha=null, sim=null;
var view={months:2};
var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
var $=function(s,el){return (el||document).querySelector(s);};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function yen(v){v=Math.round(v);return (v<0?'-¥':'¥')+Math.abs(v).toLocaleString('ja-JP');}
function num(v){return Math.round(v).toLocaleString('ja-JP');}
function lvCls(v){var l=CF.level(v);return l==='ok'?'':'lv-'+l;}
function md(s){var p=CF.parse(s);return p.m+'/'+p.d;}
function jd(s){var p=CF.parse(s);return p.y+'年'+p.m+'月'+p.d+'日';}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function token(){try{return localStorage.getItem('cf_token')||'';}catch(e){return '';}}
function setStatus(t){$('#status').textContent=t;}
function copy(o){return JSON.parse(JSON.stringify(o));}
function accName(x){return x.type==='transfer'?ACC[x.account]+'→'+ACC[x.to]:ACC[x.account];}
function findItem(id){return data.items.filter(function(x){return String(x.id)===String(id);})[0];}

// ---------- 金額入力・テンキー ----------
// 「2万3千」「1万+5000」のような式も計算する
function evalAmt(str){
  str=String(str||'').replace(/[,，\s¥円]/g,'').replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-65248);}).replace(/[＋]/g,'+').replace(/[−－ー]/g,'-');
  if(!str)return null;
  var total=0, ok=false, re=/([+-]?)([^+-]+)/g, m;
  while((m=re.exec(str))){
    var term=0, tm, r2=/(\d+)(万|千)?/g, found=false;
    while((tm=r2.exec(m[2]))){found=true;term+=Number(tm[1])*(tm[2]==='万'?10000:tm[2]==='千'?1000:1);}
    if(!found)continue; ok=true;
    total+=(m[1]==='-'?-1:1)*term;
  }
  return ok?total:null;
}
function bindAmt(input){
  var out=input.closest('div').parentNode.querySelector('.amtv');
  function upd(){var v=evalAmt(input.value);out.textContent=(v!==null&&/[+\-万千]/.test(input.value))?'= '+num(v)+' 円':'';}
  input.addEventListener('input',upd);upd();
  if(coarse){
    input.readOnly=true;input.setAttribute('inputmode','none');
    input.addEventListener('click',function(){showKeypad(input,upd);});
  }else{
    input.setAttribute('inputmode','numeric');
    var kb=input.parentNode.querySelector('.kpbtn');
    if(kb)kb.onclick=function(){showKeypad(input,upd);};
  }
}
var kpTarget=null;
function showKeypad(input,upd){
  var sheet=input.closest('.sheet'), kp=$('.kp',sheet);
  sheet.querySelectorAll('input.amt').forEach(function(x){x.classList.remove('active');});
  input.classList.add('active');kpTarget={input:input,upd:upd};
  if(!kp){
    kp=document.createElement('div');kp.className='kp';
    var keys=['7','8','9','⌫','4','5','6','万','1','2','3','千','0','00','000','+','C','-','','完了'];
    kp.innerHTML=keys.map(function(k){if(!k)return '<span></span>';var c=/^\d+$/.test(k)?'':(k==='完了'?'ok':'f');return '<button type="button" class="'+c+'" data-k="'+k+'">'+(k==='-'?'−':k)+'</button>';}).join('');
    sheet.appendChild(kp);
    kp.addEventListener('click',function(e){
      var k=e.target.dataset&&e.target.dataset.k;if(!k||!kpTarget)return;
      var inp=kpTarget.input,v=inp.value.replace(/,/g,'');
      if(k==='完了'){kp.remove();inp.classList.remove('active');kpTarget=null;return;}
      if(k==='⌫')v=v.slice(0,-1);else if(k==='C')v='';
      else if(k==='+'||k==='-'){if(v&&!/[+-]$/.test(v))v+=k;}
      else if(k==='万'||k==='千'){if(/\d$/.test(v))v+=k;}
      else v+=k;
      inp.value=v.replace(/\d+/g,function(d){return Number(d).toLocaleString('ja-JP');});
      kpTarget.upd();
    });
  }
  input.scrollIntoView({block:'nearest'});
}

// ---------- モーダル（下から出る入力画面） ----------
function openSheet(title,body,onSave,extra){
  var ov=document.createElement('div');ov.className='ov';
  ov.innerHTML='<div class="sheet"><div class="sh-h"><button class="hbtn" data-x>キャンセル</button><b>'+title+'</b>'+(onSave?'<button class="hbtn" data-s style="color:var(--accent);font-weight:600">保存</button>':'<span style="width:60px"></span>')+'</div><div class="sh-b">'+body+'</div></div>';
  $('#modal').appendChild(ov);
  var close=function(){ov.remove();kpTarget=null;};
  $('[data-x]',ov).onclick=close;
  ov.addEventListener('click',function(e){if(e.target===ov)close();});
  if(onSave)$('[data-s]',ov).onclick=function(){if(onSave(ov)!==false)close();};
  ov.querySelectorAll('input.amt').forEach(bindAmt);
  ov.querySelectorAll('.segf').forEach(function(g){g.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;g.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});g.dataset.v=b.dataset.v;g.dispatchEvent(new Event('change'));});});
  if(extra)extra(ov,close);
  return ov;
}
function seg(name,opts,val){
  return '<div class="segf" data-name="'+name+'" data-v="'+val+'" style="grid-template-columns:repeat('+opts.length+',1fr)">'+opts.map(function(o){return '<button type="button" data-v="'+o[0]+'" class="'+(o[0]===val?'on':'')+'">'+o[1]+'</button>';}).join('')+'</div>';
}
function amtField(label,name,val){
  return '<div><div class="fl">'+label+'</div><div class="amtrow"><input type="text" class="amt" name="'+name+'" value="'+(val!=null&&val!==''?num(val):'')+'" autocomplete="off">'+(coarse?'':'<button type="button" class="kpbtn">テンキー</button>')+'</div><div class="amtv"></div></div>';
}
