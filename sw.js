/* 주식 워치리스트 — 서비스워커.
 *
 * 화면(HTML)은 **네트워크를 먼저** 본다(2026-09-26 v6 에서 바꿨다). 예전엔 캐시를 먼저 주고 뒤에서
 * 갱신했는데(stale-while-revalidate), 그러면 앱을 올려도 폰에선 옛 화면이 한두 번 더 떴다 —
 * 순점을 체크리스트로 합친 뒤에도 '아직 순점으로 나온다'가 그것이었다. 아이콘 같은 정적 파일만
 * 캐시를 먼저 준다. 설치할 때 미리 받는 것도 브라우저 HTTP 캐시를 건너뛴다(cache:"reload").
 * 값(data.json)은 반대로 네트워크를 먼저 본다 — 옛 시세를 새 시세처럼 보여주는 쪽이
 * 잠깐 느린 쪽보다 나쁘다. 네트워크가 죽으면 그때만 캐시를 주고, 페이지가 '오프라인'
 * 이라고 적는다.
 */
var VER = "v8";   // v8: 실적 달력 탭 · v7: AI 노출(대체 위험·해자 약화·자금 동조) · v6: 화면 network-first — 껍데기가 바뀌면 올린다
var SHELL = "wl-shell-" + VER;
var DATA  = "wl-data-" + VER;
var FILES = ["./", "./index.html", "./rules.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", function(e){
  e.waitUntil(
    Promise.all([
      caches.open(SHELL).then(function(c){
        // 하나가 404 여도 설치는 살린다 — 아이콘 때문에 앱 전체가 안 깔리면 곤란하다
        return Promise.all(FILES.map(function(f){
          return c.add(new Request(f, {cache: "reload"})).catch(function(){}); }));
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

  // 화면(HTML) — 네트워크 먼저, 죽었을 때만 캐시
  if(req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")){
    e.respondWith(
      // navigate 요청에 옵션을 붙여 fetch(req, {...}) 하면 브라우저가 예외를 던져 곧장 캐시로 떨어진다 —
      // URL 로 새 요청을 만들어 HTTP 캐시를 건너뛴다(no-cache = 서버에 확인하고 받는다).
      fetch(new Request(req.url, {cache: "no-cache", credentials: "same-origin"})).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(SHELL).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){ return hit || caches.match("./index.html"); });
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
