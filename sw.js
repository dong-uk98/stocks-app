/* 주식 워치리스트 — 서비스워커.
 *
 * 껍데기(HTML·CSS·아이콘)는 캐시를 먼저 주고 뒤에서 갱신한다(stale-while-revalidate).
 * 값(data.json)은 반대로 네트워크를 먼저 본다 — 옛 시세를 새 시세처럼 보여주는 쪽이
 * 잠깐 느린 쪽보다 나쁘다. 네트워크가 죽으면 그때만 캐시를 주고, 페이지가 '오프라인'
 * 이라고 적는다.
 */
var VER = "v2";   // 규칙 탭 추가 — 껍데기가 바뀌면 올린다
var SHELL = "wl-shell-" + VER;
var DATA  = "wl-data-" + VER;
var FILES = ["./", "./index.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", function(e){
  e.waitUntil(
    Promise.all([
      caches.open(SHELL).then(function(c){
        // 하나가 404 여도 설치는 살린다 — 아이콘 때문에 앱 전체가 안 깔리면 곤란하다
        return Promise.all(FILES.map(function(f){ return c.add(f).catch(function(){}); }));
      }),
      // 값도 설치할 때 같이 받아 둔다. 첫 방문의 data.json 요청은 워커가 붙기 전에
      // 나가서 가로채이지 않는다 — 여기서 안 받아두면 첫 오프라인이 빈 화면이 된다.
      caches.open(DATA).then(function(c){ return c.add("./data.json").catch(function(){}); })
    ]).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){
        if(k !== SHELL && k !== DATA) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  if(url.pathname.endsWith("/data.json")){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(DATA).then(function(c){ c.put("./data.json", copy); });
        }
        return res;
      }).catch(function(){
        return caches.match("./data.json").then(function(r){
          if(!r) return new Response('{"stocks":[]}', {status:503, headers:{"Content-Type":"application/json"}});
          // 캐시로 때웠다고 표시해 준다 — 페이지가 '지금 시세'와 '받아둔 시세'를 구분해야 한다
          return r.blob().then(function(b){
            var h = new Headers(r.headers);
            h.set("X-From-Cache", "1");
            return new Response(b, {status:200, headers:h});
          });
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && res.ok && res.type === "basic"){
          var copy = res.clone();
          caches.open(SHELL).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return hit || caches.match("./index.html");
      });
      return hit || net;
    })
  );
});
