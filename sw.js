// 다빈치랩 Service Worker - 완전 비활성화 버전
// 이 SW는 설치 즉시 자신을 해제합니다

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});

// fetch 인터셉트 없음 - 모든 요청은 네트워크로 직접 전달
