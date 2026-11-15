// オフライン用キャッシュ（アプリ本体のみ。データは毎回GitHubから取得）
var CACHE='cashflow-v2';
var FILES=['./','index.html','style.css','calc.js','util.js','github.js','main.js','chart.js','forms.js','manifest.json','icon.svg'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(FILES);}));self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}));self.clients.claim();});
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(u.origin!==location.origin||e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(function(r){var c=r.clone();caches.open(CACHE).then(function(x){x.put(e.request,c);});return r;}).catch(function(){return caches.match(e.request);}));
});
