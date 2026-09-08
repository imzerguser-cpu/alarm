// sw.js
const CACHE_NAME = 'classroom-alarm-v2';
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

// 네트워크 우선(network-first). 캐시 우선이면 한 번 설치된 태블릿이 새로 배포한
// 버전을 영영 못 받는다. 네트워크가 되면 항상 최신을 쓰고 캐시도 갱신하며,
// 실패했을 때만 캐시로 떨어진다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 같은 출처의 GET만 캐시 대상 — Firestore 스트리밍/외부 CDN 요청은 그대로 통과시킨다.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        // 정상 응답만 캐시에 쓴다 — 404/500이나 학교 와이파이 캡티브 포털이
        // 가로챈 로그인 페이지가 캐시에 저장되면 다음 오프라인 접속 때
        // 그 잘못된 응답이 앱 대신 뜬다.
        if (res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
