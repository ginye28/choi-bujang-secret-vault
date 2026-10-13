// 설치형 웹앱의 서비스 워커: 화면 이동이 네트워크 때문에 실패했을 때 오프라인 안내만 보여 줍니다.
// 보호 자료(/api/*)와 인증 정보는 가로채지 않고, 아무것도 저장(캐시)하지 않습니다.
const OFFLINE_HTML = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>오프라인</title><body style="font-family:system-ui;background:#101a28;color:#ecf4ff;padding:24px"><h1>지금은 오프라인입니다</h1><p>보호된 자료는 서버가 이 기기를 등록 기기로 확인한 뒤에만 열립니다. 오프라인에서는 자료가 표시되지 않습니다. 인터넷에 다시 연결한 뒤 새로고침해 주세요.</p></body></html>';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => new Response(OFFLINE_HTML, {
    status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })));
});
