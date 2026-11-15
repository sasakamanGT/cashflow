// GitHub（cashflow-data）との読み書き
'use strict';
function b64enc(str){var b=new TextEncoder().encode(str),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}
function b64dec(b64){var s=atob(b64.replace(/\s/g,'')),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a);}
function api(method,body){
  return fetch('https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/'+FILE+(method==='GET'?'?t='+Date.now():''),{
    method:method,cache:'no-store',
    headers:{'Authorization':'Bearer '+token(),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    body:body?JSON.stringify(body):undefined});
}
function emptyData(){return {version:1,balances:[],items:[],marks:{}};}
function normalize(d){d.balances=d.balances||[];d.items=d.items||[];d.marks=d.marks||{};return d;}
function cache(){try{localStorage.setItem('cf_cache',JSON.stringify(data));}catch(e){}}

// 最新のデータを取得（data と sha を更新）
function fetchLatest(){
  return api('GET').then(function(r){
    if(r.status===404){data=emptyData();sha=null;return;}
    if(r.status===401||r.status===403) throw new Error('トークンが無効か、権限がありません（'+r.status+'）');
    if(!r.ok) throw new Error('読み込みに失敗しました（'+r.status+'）');
    return r.json().then(function(j){data=normalize(JSON.parse(b64dec(j.content)));sha=j.sha;});
  });
}
var saving=Promise.resolve(), lastLoad=0;
// quiet=true のときはエラーを表示しない（自動の読み込み用）
function load(quiet){
  if(!token()){openSettings(true);return;}
  saving=saving.then(function(){
    setStatus('読込中…');
    return fetchLatest().then(function(){
      lastLoad=Date.now();cache();setStatus('');render();
    }).catch(function(e){
      setStatus('オフライン');
      try{var c=localStorage.getItem('cf_cache');if(c&&!data){data=normalize(JSON.parse(c));render();}}catch(x){}
      if(!quiet)alert(e.message||'通信できませんでした');
    });
  });
}
// 変更を保存する。fn は data を書き換える関数。
// 他の端末で先に更新されていたら、最新のデータに同じ変更をやり直して保存する
function commit(msg,fn){
  fn(data);cache();render();
  saving=saving.then(function(){return put(msg,fn,0);});
}
function put(msg,fn,retry){
  setStatus('保存中…');
  var body={message:msg||'update',content:b64enc(JSON.stringify(data,null,1))};
  if(sha)body.sha=sha;
  return api('PUT',body).then(function(r){
    if((r.status===409||r.status===422)&&retry<2){
      return fetchLatest().then(function(){fn(data);cache();render();return put(msg,fn,retry+1);});
    }
    if(!r.ok) throw new Error(r.status);
    return r.json().then(function(j){sha=j.content.sha;lastLoad=Date.now();setStatus('保存済み');setTimeout(function(){if($('#status').textContent==='保存済み')setStatus('');},2000);});
  }).catch(function(e){setStatus('保存失敗');alert('保存に失敗しました（'+(e.message||e)+'）。通信状態を確認して、⟳で読み込み直してください。');});
}
// アプリを前面に戻したら、最新のデータを読み込み直す（入力画面を開いているときは除く）
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible'||!token()||!data)return;
  if(document.querySelector('.ov'))return;
  if(Date.now()-lastLoad<30000){render();return;}
  load(true);
});
