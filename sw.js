// sw.js
const CACHE_NAME = 'classroom-alarm-v10';
const APP_SHELL = [
  './',
  './index.html',
  './tablet-display.html',
  './timer-popup.html',
  './css/app.css',
  './manifest.json',
  './manifest-display.json',
  './js/bell.js',
  './js/bell-schedule.js',
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
  './js/tablet-display.js',
  './js/timer.js',
  './js/timetable.js',
];

self.addEventListener('install', (event) => {
  // { cache: 'no-store' }가 여기도 필요하다 — 없으면 cache.addAll이 내부적으로
  // 하는 fetch()가 브라우저 자체 HTTP 캐시를 그대로 따를 수 있어서, CACHE_NAME을
  // 새 버전으로 올려도 그 "새" 캐시 안에 낡은 파일이 그대로 복사돼 들어갈 수
  // 있다(런타임 fetch 핸들러에서 이미 한 번 고쳤던 것과 같은 종류의 문제).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'no-store' })))
    )
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

// 페이지 탭이 백그라운드(다른 앱 사용 중)일 때도 시스템 알림은 뜰 수 있다.
// speechSynthesis는 Service Worker 안에서 쓸 수 없으므로 완전한 대체는 아니지만,
// 소리·진동으로라도 놓치지 않게 하는 최소한의 안전망이다.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_ALARM_NOTIFICATION') return;
  const { title, body } = event.data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon.svg',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: 'class-bell-alarm',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(self.registration.scope));
      if (existing) return existing.focus();
      return self.clients.openWindow('./');
    })
  );
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
