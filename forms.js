// 入力画面（追加・編集、実績確認、実績の編集、残高記録、一覧、設定）
'use strict';
function openItem(it){
  var isNew=!it;
  it=it||{type:'out',account:'bank',to:'sec',date:CF.todayStr(),name:'',amount:'',repeat:'none',until:'',shift:false};
  var names={};data.items.forEach(function(x){if(x.name)names[x.name]=1;});
  var body=seg('type',[['in','入金'],['out','出金'],['transfer','振替']],it.type)+
    '<div><div class="fl" id="accLabel">口座</div>'+seg('account',[['bank','銀行'],['sec','証券']],it.account)+'</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><div class="fl">日付</div><input type="date" name="date" value="'+it.date+'"></div>'+
    '<div><div class="fl">項目</div><input type="text" name="name" list="names" value="'+esc(it.name)+'" placeholder="給料"><datalist id="names">'+Object.keys(names).map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist></div></div>'+
    amtField('金額（例：2万3千、1万+5000）','amount',it.amount)+
    (isNew?seg('mode',[['done','✓ 実績'],['plan','予定']],'done'):'')+
    '<div id="planBox" style="display:flex;flex-direction:column;gap:12px"><div><div class="fl">繰り返し</div>'+seg('repeat',[['none','なし'],['monthly','毎月'],['yearly','毎年']],it.repeat||'none')+'</div>'+
    '<div id="untilBox"><div class="fl">終了日（空欄なら無期限）</div><input type="date" name="until" value="'+(it.until||'')+'"></div>'+
    '<div><div class="fl">土日祝・年末年始のとき</div>'+seg('shift',[['none','そのまま'],['prev','前営業日'],['next','翌営業日']],it.shift==='prev'?'prev':(it.shift?'next':'none'))+'</div></div>'+
    (isNew?'':'<button class="btn dan" id="del">この予定を削除</button>');
  openSheet(isNew?'追加':'予定を編集',body,function(ov){
    var g=function(n){return $('[data-name='+n+']',ov).dataset.v;};
    var amt=evalAmt($('[name=amount]',ov).value), date=$('[name=date]',ov).value;
    if(!date){alert('日付を入力してください');return false;}
    if(amt===null||amt<0){alert('金額を入力してください（0円以上）');return false;}
    var o=isNew?{id:uid()}:copy(it);
    o.type=g('type');o.account=g('account');o.to=o.type==='transfer'?(o.account==='bank'?'sec':'bank'):undefined;
    o.date=date;o.name=$('[name=name]',ov).value.trim();o.amount=amt;o.repeat=g('repeat');
    o.until=o.repeat==='none'?'':$('[name=until]',ov).value;var sv=g('shift');o.shift=sv==='prev'?'prev':(sv==='next');
    var done=isNew&&g('mode')==='done', mark=null;
    if(done){o.repeat='none';o.until='';o.shift=false;mark={status:'done',date:o.date,amount:o.amount,type:o.type,account:o.account,to:o.to,name:o.name,at:Date.now()};}
    commit((isNew?'add ':'edit ')+o.id,function(d){
      var i=d.items.findIndex(function(x){return String(x.id)===String(o.id);});
      if(i>=0)d.items[i]=copy(o);else d.items.push(copy(o));
      if(mark)d.marks[CF.markKey(o,o.date)]=copy(mark);
    });
  },function(ov,close){
    var upd=function(){
      var tp=$('[data-name=type]',ov).dataset.v;
      $('#accLabel',ov).textContent=tp==='transfer'?'出金元（もう一方へ移す）':'口座';
      $('#untilBox',ov).style.display=$('[data-name=repeat]',ov).dataset.v==='none'?'none':'';
      var mo=$('[data-name=mode]',ov);
      $('#planBox',ov).style.display=(mo&&mo.dataset.v==='done')?'none':'flex';
    };
    ov.querySelectorAll('.segf').forEach(function(g){g.addEventListener('change',upd);});upd();
    if($('#del',ov))$('#del',ov).onclick=function(){
      if(!confirm('「'+(it.name||'この予定')+'」を削除しますか？'+(it.repeat!=='none'?'（繰り返し分もすべて消えます）':'')))return;
      var id=it.id;close();
      commit('delete '+id,function(d){d.items=d.items.filter(function(x){return String(x.id)!==String(id);});});
    };
  });
}

function openBalance(rec){
  var t=CF.todayStr(), est=sim?sim.current:null;
  rec=rec||{date:t,bank:est?est.bank:'',sec:est?est.sec:''};
  var isEdit=data.balances.indexOf(rec)>=0, oldDate=rec.date;
  var body='<div class="note" style="margin:0">通帳や証券口座の実際の残高を入力します。確認待ちの予定は、先に実績確認しておくと差額が正しく出ます。</div>'+
    '<div><div class="fl">日付</div><input type="date" name="date" value="'+rec.date+'"></div>'+
    '<div class="info" id="ref"></div>'+
    amtField('銀行の残高','bank',rec.bank)+amtField('証券口座の現金','sec',rec.sec)+
    (isEdit?'<button class="btn dan" id="del">この記録を削除</button>':'');
  openSheet('残高を記録',body,function(ov){
    var dt=$('[name=date]',ov).value,b=evalAmt($('[name=bank]',ov).value),s=evalAmt($('[name=sec]',ov).value);
    if(!dt||b===null||s===null){alert('日付と2つの残高を入力してください（0円なら0）');return false;}
    var pend=sim?sim.events.filter(function(e){return e.kind==='plan'&&e.sched<=dt;}).length:0;
    if(pend&&!confirm(md(dt)+'までに確認待ちの予定が'+pend+'件あります。実際にはもう引き落とされている場合、二重に計算されます。このまま記録しますか？'))return false;
    var ref=CF.actualAt(data,dt), msg='';
    if(ref&&!isEdit&&(ref.bank!==b||ref.sec!==s)) msg='アプリの計算との差額：銀行 '+(b-ref.bank>=0?'+':'')+num(b-ref.bank)+'　証券 '+(s-ref.sec>=0?'+':'')+num(s-ref.sec)+'\n（確認漏れの入出金がないか見直してみてください）';
    commit('balance '+dt,function(d){
      d.balances=d.balances.filter(function(x){return x.date!==dt&&!(isEdit&&x.date===oldDate);});
      d.balances.push({date:dt,bank:b,sec:s,at:Date.now()});
    });
    if(msg)setTimeout(function(){alert(msg);},50);
  },function(ov,close){
    var refUpd=function(){var dt=$('[name=date]',ov).value,r=dt?CF.actualAt(data,dt):null;
      $('#ref',ov).innerHTML=r&&!isEdit?'アプリ上の残高（'+md(dt)+'時点の実績）<br>銀行 '+yen(r.bank)+'　証券 '+yen(r.sec):'';
      $('#ref',ov).style.display=$('#ref',ov).innerHTML?'':'none';};
    $('[name=date]',ov).addEventListener('change',refUpd);refUpd();
    if($('#del',ov))$('#del',ov).onclick=function(){
      if(!confirm('この残高記録を削除しますか？'))return;close();
      commit('delete balance '+oldDate,function(d){d.balances=d.balances.filter(function(x){return x.date!==oldDate;});});
    };
  });
}

function openConfirm(e){
  var it=e.item, t=CF.todayStr(), key=e.key, sign=it.type==='in'?'入金':it.type==='out'?'出金':'振替';
  var body='<div class="info"><b style="color:var(--text)">'+esc(it.name||'（無題）')+'</b>　'+sign+'・'+accName(it)+'<br>予定日 '+jd(e.sched)+'　予定額 '+num(it.amount)+' 円</div>'+
    '<div><div class="fl">実際の日付</div><input type="date" name="adate" value="'+e.sched+'"></div>'+
    amtField('実際の金額','aamt',it.amount)+
    '<div class="btns"><button class="btn" id="skip">今回はなし</button><button class="btn" id="edit">予定を編集</button></div>'+
    '<div><div class="fl">延期する場合の新しい予定日</div><div class="amtrow"><input type="date" name="mdate" value="'+CF.addDays(e.sched<t?t:e.sched,7)+'"><button class="kpbtn" id="move">延期</button></div></div>';
  function setMark(msg,val){commit(msg+' '+key,function(d){d.marks[key]=copy(val);});}
  openSheet('実績確認',body,function(ov){
    var dt=$('[name=adate]',ov).value,a=evalAmt($('[name=aamt]',ov).value);
    if(!dt){alert('実際の日付を入力してください');return false;}
    if(a===null||a<0){alert('実際の金額を入力してください');return false;}
    setMark('confirm',{status:'done',date:dt,amount:a,type:it.type,account:it.account,to:it.to,name:it.name,itemId:it.id,raw:e.raw,at:Date.now()});
  },function(ov,close){
    $('[data-s]',ov).textContent='確定';
    $('#skip',ov).onclick=function(){close();setMark('skip',{status:'skip',itemId:it.id,raw:e.raw,name:it.name});};
    $('#edit',ov).onclick=function(){close();openItem(it);};
    $('#move',ov).onclick=function(){var dt=$('[name=mdate]',ov).value;if(!dt)return;close();setMark('move',{status:'moved',date:dt,itemId:it.id,raw:e.raw,name:it.name});};
  });
}
function openActual(key){
  var m=data.marks[key]; if(!m)return;
  var body='<div class="info"><b style="color:var(--text)">✓ '+esc(m.name||'（無題）')+'</b>　'+accName(m)+'</div>'+
    '<div><div class="fl">実際の日付</div><input type="date" name="adate" value="'+m.date+'"></div>'+amtField('実際の金額','aamt',m.amount)+
    '<button class="btn dan" id="undo">実績確認を取り消す（予定に戻す）</button>';
  openSheet('実績を編集',body,function(ov){
    var dt=$('[name=adate]',ov).value,a=evalAmt($('[name=aamt]',ov).value);
    if(!dt||a===null||a<0){alert('日付と金額を入力してください');return false;}
    commit('edit actual '+key,function(d){if(d.marks[key]){d.marks[key].date=dt;d.marks[key].amount=a;}});
  },function(ov,close){
    $('#undo',ov).onclick=function(){
      if(!confirm('この実績を取り消しますか？'+(m.itemId?'（予定に戻ります）':'')))return;close();
      commit('undo '+key,function(d){delete d.marks[key];});
    };
  });
}
function openList(){
  var t=CF.todayStr();
  function line(it){
    var rp=it.repeat==='monthly'?'毎月'+CF.parse(it.date).d+'日':it.repeat==='yearly'?'毎年'+md(it.date):jd(it.date);
    var sign=it.type==='in'?'+':it.type==='out'?'-':'';
    return '<div class="lrow" data-id="'+esc(it.id)+'"><span>'+esc(it.name||'（無題）')+' <span class="x">'+accName(it)+'・'+rp+(it.until?'（〜'+md(it.until)+'）':'')+'</span></span><span>'+sign+num(it.amount)+'</span></div>';
  }
  var rep=data.items.filter(function(x){return x.repeat&&x.repeat!=='none';});
  // 確定・スキップ済みの単発の予定は、予定の欄には出さない（確定したものは「確定した実績」の欄に出る）
  var settled={};Object.keys(data.marks).forEach(function(k){var st=data.marks[k].status;if(st==='done'||st==='skip')settled[k.split('|')[0]]=true;});
  var one=data.items.filter(function(x){return (!x.repeat||x.repeat==='none')&&!settled[x.id];}).sort(function(a,b){return a.date<b.date?1:-1;});
  var bal=data.balances.slice().sort(function(a,b){return a.date<b.date?1:-1;});
  var mk=Object.keys(data.marks).map(function(k){return {k:k,m:data.marks[k]};}).filter(function(x){return x.m.status==='done';}).sort(function(a,b){return a.m.date<b.m.date?1:-1;}).slice(0,100);
  var body='<h3>繰り返しの予定（'+rep.length+'）</h3><div>'+rep.map(line).join('')+'</div>'+
    '<h3>これからの単発の予定</h3><div>'+one.filter(function(x){return x.date>=t;}).map(line).join('')+'</div>'+
    '<h3>過去の単発の予定</h3><div>'+one.filter(function(x){return x.date<t;}).map(line).join('')+'</div>'+
    '<h3>確定した実績（新しい順）</h3><div>'+mk.map(function(x){var m=x.m,sg=m.type==='in'?'+':m.type==='out'?'-':'';return '<div class="lrow" data-mk="'+esc(x.k)+'"><span>✓ '+esc(m.name||'（無題）')+' <span class="x">'+jd(m.date)+'・'+accName(m)+'</span></span><span>'+sg+num(m.amount)+'</span></div>';}).join('')+'</div>'+
    '<h3>残高の記録</h3><div>'+bal.map(function(b,i){return '<div class="lrow" data-b="'+i+'"><span>'+jd(b.date)+'</span><span class="x">銀行 '+num(b.bank)+'　証券 '+num(b.sec)+'</span></div>';}).join('')+'</div>';
  openSheet('登録一覧',body,null,function(ov,close){
    ov.querySelectorAll('[data-id]').forEach(function(el){el.onclick=function(){close();openItem(findItem(el.dataset.id));};});
    ov.querySelectorAll('[data-b]').forEach(function(el){el.onclick=function(){close();openBalance(bal[+el.dataset.b]);};});
    ov.querySelectorAll('[data-mk]').forEach(function(el){el.onclick=function(){close();openActual(el.dataset.mk);};});
  });
}

function openSettings(first){
  var body=(first?'<div class="note" style="margin:0;font-size:13px">最初にGitHubのアクセストークン（github_pat_ で始まる文字列）を貼り付けてください。トークンはこの端末の中だけに保存されます。</div>':'')+
    '<div><div class="fl">アクセストークン'+(token()?'（設定済み）':'')+'</div><input type="password" name="tk" placeholder="'+(token()?'変更するときだけ入力':'github_pat_...')+'" autocomplete="off"></div>'+
    '<div class="note" style="margin:0">保存先：'+OWNER+'/'+REPO+'/'+FILE+'</div>'+
    (token()?'<button class="btn dan" id="rm">この端末からトークンを消す</button>':'');
  openSheet('設定',body,function(ov){
    var v=$('[name=tk]',ov).value.trim();
    if(v){try{localStorage.setItem('cf_token',v);}catch(e){alert('この端末に保存できませんでした');return false;}data=null;load();}
    else if(!token()){alert('トークンを入力してください');return false;}
  },function(ov,close){
    if($('#rm',ov))$('#rm',ov).onclick=function(){if(!confirm('この端末からトークンを消しますか？（GitHub上のデータは消えません）'))return;localStorage.removeItem('cf_token');localStorage.removeItem('cf_cache');data=null;close();render();openSettings(true);};
  });
}
