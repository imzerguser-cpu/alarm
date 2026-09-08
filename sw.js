// sw.js
const CACHE_NAME = 'classroom-alarm-v3';
const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './manifest.json',
  './js/bell.js',
  './js/daily-reset.js',
  './js/excel-import.js',
  './js/firebase-config.js',
  './js/floating-widget.js',
  './js/main.js',
  './js/notice-format.js',
  './js/pin-lock.js',
  './js/pwa-install.js',
  './js/schedule-times.js',
  './js/seed-data.js',
  './js/store.js',
  './js/timer.js',
  './js/timetable.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 캐시 우선 + 백그라운드 갱신(stale-while-revalidate). 캐시가 있으면 그걸
// 바로 돌려줘서 체감 로딩이 즉시 끝나고, 그와 동시에 네트워크에서 최신 버전을
// 받아와 캐시를 갱신한다 — 그래서 "지금 이 접속"은 예전 버전을 볼 수 있지만
// 바로 다음 접속부터는 최신이 반영된다. 순수 네트워크 우선보다 한 번 접속치
// 정도 최신 반영이 늦어지는 대신, 체감 속도가 훨씬 빠르다.
//
// { cache: 'no-store' }가 중요하다 — 이게 없으면 이 fetch()도 브라우저 자체의
// HTTP 캐시(Cache-Control 헤더 기준)를 그대로 따르므로, 배경 갱신이 네트워크가
// 아니라 브라우저 캐시에서 응답을 받아와 서비스워커 캐시를 갱신 안 한 것처럼
// 보이는 문제가 생길 수 있다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 같은 출처의 GET만 캐시 대상 — Firestore 스트리밍/외부 CDN 요청은 그대로 통과시킨다.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);

      // 정상 응답만 캐시에 쓴다 — 404/500이나 학교 와이파이 캡티브 포털이
      // 가로챈 로그인 페이지가 캐시에 저장되면 다음 접속 때 그 잘못된 응답이
      // 앱 대신 뜬다.
      const networkUpdate = fetch(req, { cache: 'no-store' })
        .then(async (res) => {
          // cache.put()을 await하지 않으면 이 then이 fetch 응답 도착 즉시
          // resolve돼버려서, 아래 waitUntil이 실제 저장 완료를 못 붙잡는다
          // — 응답을 보낸 직후 SW가 종료되면(태블릿처럼 메모리가 빠듯한
          // 환경에서 흔함) 캐시 갱신 자체가 씹힐 수 있다.
          if (res.ok) await cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // 캐시를 먼저 돌려주고, 갱신은 응답을 보낸 뒤에도 계속 진행되게
        // waitUntil로 붙잡아 둔다(안 붙잡으면 서비스워커가 응답 직후 종료돼
        // 갱신 fetch가 끝까지 못 갈 수 있다).
        event.waitUntil(networkUpdate);
        return cached;
      }

      // 캐시가 아예 없던 첫 접속(또는 첫 오프라인 접속)이면 네트워크를 기다린다.
      const networkRes = await networkUpdate;
      return networkRes || new Response('오프라인 상태이고 저장된 캐시도 없습니다.', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }).catch(() => fetch(req)) // caches API 자체가 실패하는 극히 드문 경우의 최후 안전망
  );
});
