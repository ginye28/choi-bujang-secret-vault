// 설치형 웹앱의 서비스 워커: 화면 이동이 네트워크 때문에 실패했을 때 오프라인 안내만 보여 줍니다.
// 보호 자료(/api/*)와 인증 정보는 캐시하지 않고 가로채지도 않습니다.
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('offline-v1').then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
});
