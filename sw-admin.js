/* ================================================================
   다빈치랩 – 관리자 알림 전용 Service Worker (sw-admin.js)
   역할: 백그라운드 폴링으로 신규 가입·수행평가를 감지 → 푸시 알림
   ================================================================ */

const SW_VERSION  = 'dvl-admin-v3';
const POLL_INTERVAL = 60 * 1000;   // 1분마다 폴링
const API_BASE    = '/tables';

/* ── 설치 & 활성화 ── */
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

/* ── 메시지 수신 (페이지 → SW) ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'START_POLL') {
    startPolling();
  }
  if (e.data?.type === 'STOP_POLL') {
    stopPolling();
  }
  // admin.js에서 직접 보내는 NOTIFY 메시지 처리 (포어그라운드→백그라운드 브릿지)
  if (e.data?.type === 'NOTIFY') {
    const { title, body, url, tag } = e.data;
    sendNotification(title, body, url, tag);
  }
});

/* ── 폴링 상태 ── */
let pollTimer  = null;
let lastCounts = { students: 0, assessments: 0 };
let initialized = false;

function startPolling() {
  if (pollTimer) return;          // 이미 실행 중
  poll();                         // 즉시 1회 실행 후
  pollTimer = setInterval(poll, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function poll() {
  try {
    const [resS, resA] = await Promise.all([
      fetch(`${API_BASE}/student_profiles?limit=300`, { cache: 'no-store' }),
      fetch(`${API_BASE}/assessments?limit=500`,      { cache: 'no-store' }),
    ]);
    if (!resS.ok || !resA.ok) return;

    const dataS = await resS.json();
    const dataA = await resA.json();

    const pending   = (dataS.data || []).filter(s => s.status === 'pending');
    const unreadAdm = (dataA.data || []).filter(a => a.unread_admin === true || a.unread_admin === 1 || a.unread_admin === 'true');

    const newStudents    = pending.length;
    const newAssessments = unreadAdm.length;

    if (!initialized) {
      // 첫 폴링은 기준값만 저장, 알림 안 띄움
      lastCounts = { students: newStudents, assessments: newAssessments };
      initialized = true;
      return;
    }

    /* ── 신규 학생 가입 감지 ── */
    if (newStudents > lastCounts.students) {
      const diff = newStudents - lastCounts.students;
      await sendNotification(
        '👤 신규 회원 가입',
        `${diff}명의 학생이 가입 승인을 기다리고 있습니다.`,
        '/admin/students.html',
        'student'
      );
    }

    /* ── 미확인 수행평가 감지 ── */
    if (newAssessments > lastCounts.assessments) {
      const diff = newAssessments - lastCounts.assessments;
      // 가장 최근 수행평가 정보
      const latest = unreadAdm.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
      await sendNotification(
        '📋 새 수행평가 제출',
        `${latest?.student_name || '학생'}의 ${latest?.subject || ''} 수행평가가 제출되었습니다.`,
        '/admin/assessment.html',
        'assessment'
      );
    }

    lastCounts = { students: newStudents, assessments: newAssessments };

  } catch(e) {
    // 네트워크 오류 등 무시
  }
}

async function sendNotification(title, body, url, tag) {
  const perm = await self.registration.pushManager.permissionState(
    { userVisibleOnly: true }, 'push'
  ).catch(() => 'unknown');

  // Notification API 직접 사용 (Web Push 서버 없이)
  if (self.Notification?.permission === 'granted' ||
      (await self.registration.pushManager.permissionState({ userVisibleOnly: true }, 'push').catch(() => 'denied')) === 'granted') {
    // 지원 안 되는 환경 무시
  }

  try {
    await self.registration.showNotification(title, {
      body,
      icon:    '/images/icon-192.png',
      badge:   '/images/icon-96.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      sound:   '/sounds/notify.mp3',
      data:    { url },
      actions: [
        { action: 'open',    title: '확인하기' },
        { action: 'dismiss', title: '닫기'     },
      ],
    });
  } catch(e) {
    console.warn('[SW] showNotification 실패:', e);
  }
}

/* ── 알림 클릭 처리 ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const targetUrl = e.notification.data?.url || '/admin/dashboard.html';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // 이미 열린 탭이 있으면 포커스
      for (const client of clients) {
        if (client.url.includes('/admin/') && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // 없으면 새 탭
      return self.clients.openWindow(targetUrl);
    })
  );
});
