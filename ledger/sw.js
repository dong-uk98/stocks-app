// 앱 껍데기는 캐시에서 바로 띄우고, book.json 은 늘 네트워크 먼저(없으면 마지막 받은 것).
var C = "ledger-v2", SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function(e){ e.waitUntil(caches.open(C).then(function(c){ return c.addAll(SHELL); })); self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== C; }).map(function(k){ return caches.delete(k); })); })); self.clients.claim(); });
self.addEventListener("fetch", function(e){
  var u = new URL(e.request.url);
  if(e.request.method !== "GET" || u.origin !== location.origin) return;
  var net = fetch(e.request).then(function(r){ if(r.ok){ var cp = r.clone(); caches.open(C).then(function(c){ c.put(e.request, cp); }); } return r; });
  // 앱 코드도 네트워크 먼저 — 고친 판이 바로 보이게. 오프라인이면 캐시.
  e.respondWith(net.catch(function(){ return caches.match(e.request); }));
});
