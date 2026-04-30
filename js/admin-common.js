/* =============================================
   다빈치랩 – 관리자 공통 JavaScript v2
   ▶ 세션 검증은 DVL_SESSION.requireAdmin() 단일 호출로 통일
   ▶ dvl-session.js 보다 뒤에 로드해야 합니다
   ============================================= */

/* ── SW 등록 (알림 전용) ── */
(async function () {
  if (!('serviceWorker' in navigator)) return;
  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map(k => caches.delete(k)));
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => {
      if (!r.active?.scriptURL?.includes('sw-admin.js')) r.unregister();
    }));
    const reg = await navigator.serviceWorker.register('../sw-admin.js');
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
    } else if (Notification.permission !== 'denied') {
      window._dvlAskNotif = async () => {
        const perm = await Notification.requestPermission();
        if (perm === 'granted')
          navigator.serviceWorker.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
      };
    }
  } catch (e) { console.warn('[admin-common] SW 등록 실패:', e); }
})();

/* ══════════════════════════════════════════
   0. 세션 검증 — 즉시 실행 (DOMContentLoaded 이전)
   DVL_SESSION.requireAdmin() 이 실패하면 login.html 으로 이동
══════════════════════════════════════════ */
(function () {
  /* dvl-session.js 가 먼저 로드됐는지 확인 */
  if (typeof DVL_SESSION === 'undefined') {
    /* 혹시 로드 안 됐을 경우 — 직접 검증 (폴백) */
    try {
      const raw = localStorage.getItem('dvl_admin_session')
               || localStorage.getItem('dvl_admin_tab_session')
               || sessionStorage.getItem('dvl_admin_session')
               || sessionStorage.getItem('dvl_user');
      const p = raw ? JSON.parse(raw) : null;
      if (!p || !p.id || (p.role !== 'admin' && p.role !== 'master')) {
        location.replace('../login.html'); return;
      }
      window._dvlAdminSessionOK = true;
      window._dvlAdminSession   = p;
    } catch (e) { location.replace('../login.html'); }
    return;
  }

  /* 정상 경로: DVL_SESSION 모듈 사용 */
  const session = DVL_SESSION.requireAdmin();
  if (!session) return; /* requireAdmin 이 이미 리디렉트 처리 */
})();

/* ══════════════════════════════════════════
   DOM 준비 후 UI 초기화
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  const session = window._dvlAdminSession;
  if (!session) return;

  const el = id => document.getElementById(id);

  /* ── 사이드바 프로필 ── */
  const adminName   = session.name  || '관리자';
  const adminRole   = session.title || (session.role === 'master' ? '총괄 관리자' : '관리자');
  const adminAvatar = adminName.charAt(0);
  if (el('sidebarAdminName'))   el('sidebarAdminName').textContent   = adminName;
  if (el('sidebarAdminRole'))   el('sidebarAdminRole').textContent   = adminRole;
  if (el('sidebarAdminAvatar')) el('sidebarAdminAvatar').textContent = adminAvatar;

  /* ── 오늘 날짜 ── */
  const todayDateEl = el('todayDate');
  if (todayDateEl) {
    todayDateEl.textContent = new Date().toLocaleDateString('ko-KR',
      { year:'numeric', month:'long', day:'numeric', weekday:'long' });
  }

  /* ══════════════════════════════════════════
     1. 사이드바 토글
  ══════════════════════════════════════════ */
  const sidebar    = el('sidebar');
  const sidebarDim = el('sidebarDim') || el('sidebarOverlay');

  const openSidebar = () => {
    if (sidebar?.classList.contains('open')) return;
    sidebar?.classList.add('open');
    sidebarDim?.classList.add('show');
    document.body.style.overflow = 'hidden';
  };
  const closeSidebar = () => {
    sidebar?.classList.remove('open');
    sidebarDim?.classList.remove('show');
    sidebarDim?.classList.remove('open');
    document.body.style.overflow = '';
  };

  ['sidebarToggle', 'menuBtn', 'menuToggle', 'sidebarToggleBtn'].forEach(id => {
    el(id)?.addEventListener('click', e => {
      e.stopPropagation();
      sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();
    });
  });
  document.querySelectorAll('#sidebarClose, .sidebar-close').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); closeSidebar(); });
  });
  sidebarDim?.addEventListener('click', closeSidebar);


  /* ══════════════════════════════════════════
     2. 알림 패널 토글
  ══════════════════════════════════════════ */
  const notifBtn   = el('notifBtn');
  const notifPanel = el('notifPanel');

  notifBtn?.addEventListener('click', e => {
    e.stopPropagation();
    notifPanel?.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!notifPanel?.contains(e.target) && e.target !== notifBtn)
      notifPanel?.classList.remove('open');
  });
  document.querySelector('.notif-read-all')?.addEventListener('click', () => {
    document.querySelectorAll('.notif-unread').forEach(n => n.classList.remove('notif-unread'));
    const dot = document.querySelector('.notif-dot');
    if (dot) dot.style.display = 'none';
  });


  /* ══════════════════════════════════════════
     3. 로그아웃 (DVL_SESSION.clear 통일)
  ══════════════════════════════════════════ */
  document.querySelectorAll('.sidebar-logout, #logoutBtn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (typeof DVL_SESSION !== 'undefined') DVL_SESSION.clear();
      else {
        sessionStorage.clear();
        ['dvl_admin_session','dvl_admin_id','dvl_admin_tab_session',
         'dvl_user','dvl_session','dvl_student_session','dvl_parent_session']
          .forEach(k => localStorage.removeItem(k));
      }
      location.href = '../login.html';
    });
  });


  /* ══════════════════════════════════════════
     4. 승인 대기 뱃지 (사이드바 + 벨 아이콘 + 알림 패널)
  ══════════════════════════════════════════ */
  async function loadPendingBadge() {
    try {
      const [resS, resP] = await Promise.all([
        fetch('../tables/student_profiles?limit=500'),
        fetch('../tables/parent_profiles?limit=500')
      ]);
      const dataS = await resS.json();
      const dataP = await resP.json();
      const pendingStudents = (dataS.data || []).filter(s => s.status === 'pending').length;
      const pendingParents  = (dataP.data || []).filter(p => p.status === 'pending').length;
      const total = pendingStudents + pendingParents;

      /* 사이드바 학생관리 뱃지 */
      const navBadge = el('navBadgeStudents');
      if (navBadge) {
        navBadge.textContent    = total;
        navBadge.style.display  = total > 0 ? '' : 'none';
      }

      /* 상단 벨 아이콘 뱃지 */
      if (notifBtn) {
        let bellBadge = el('bellBadge');
        if (!bellBadge) {
          bellBadge = document.createElement('span');
          bellBadge.id        = 'bellBadge';
          bellBadge.className = 'bell-badge';
          notifBtn.appendChild(bellBadge);
          const dot = notifBtn.querySelector('.notif-dot');
          if (dot) dot.style.display = 'none';
        }
        bellBadge.textContent  = total;
        bellBadge.style.display = total > 0 ? '' : 'none';
      }

      /* 알림 드롭다운 패널 내용 */
      const panel    = el('notifPanel') || document.getElementById('notifPanel');
      const notifList = el('notifList');
      if (notifList) {
        if (total > 0) {
          const parts = [];
          if (pendingStudents > 0)
            parts.push(`<li class="notif-item notif-unread" style="cursor:pointer;"
              onclick="location.href='students.html?filter=pending'">
              <div class="notif-icon" style="background:#fef3c7;color:#d97706;">
                <i class="fas fa-user-clock"></i></div>
              <div class="notif-body">
                <div class="notif-title">학생 가입 승인 대기</div>
                <div class="notif-sub">${pendingStudents}명이 승인을 기다리고 있습니다</div>
              </div></li>`);
          if (pendingParents > 0)
            parts.push(`<li class="notif-item notif-unread" style="cursor:pointer;"
              onclick="location.href='parents.html'">
              <div class="notif-icon" style="background:#fce7f3;color:#9d174d;">
                <i class="fas fa-users"></i></div>
              <div class="notif-body">
                <div class="notif-title">학부모 가입 승인 대기</div>
                <div class="notif-sub">${pendingParents}명이 승인을 기다리고 있습니다</div>
              </div></li>`);
          notifList.innerHTML = `<ul style="list-style:none;margin:0;padding:0;">${parts.join('')}</ul>`;
        } else {
          notifList.innerHTML = `<div style="text-align:center;padding:28px 16px;color:#94a3b8;">
            <i class="fas fa-check-circle" style="font-size:24px;display:block;margin-bottom:8px;color:#22c55e;"></i>
            <p style="font-size:13px;">새 알림이 없습니다</p></div>`;
        }
      }

      /* 모바일 하단 네비 뱃지 */
      const mobileStudentNav = document.querySelector('.mobile-nav-item[href="students.html"]');
      if (mobileStudentNav && total > 0) {
        let mb = mobileStudentNav.querySelector('.mobile-pending-badge');
        if (!mb) {
          mb = document.createElement('span');
          mb.className = 'mobile-pending-badge';
          mobileStudentNav.style.position = 'relative';
          mobileStudentNav.appendChild(mb);
        }
        mb.textContent   = total;
        mb.style.display = '';
      }
    } catch (e) { /* 네트워크 오류 무시 */ }
  }

  /* 알림 패널이 HTML에 없으면 동적 생성 */
  if (!el('notifPanel') && notifBtn) {
    const panel = document.createElement('div');
    panel.id        = 'notifPanel';
    panel.className = 'notif-panel';
    panel.innerHTML = `
      <div class="notif-panel-header">
        <h4><i class="fas fa-bell" style="color:#f59e0b;margin-right:6px;"></i>알림</h4>
        <span class="notif-read-all">모두 읽음</span>
      </div>
      <div id="notifList" style="max-height:320px;overflow-y:auto;">
        <div style="text-align:center;padding:28px 16px;color:#94a3b8;">
          <i class="fas fa-spinner fa-spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>
          <p style="font-size:13px;">불러오는 중...</p>
        </div>
      </div>
      <div style="padding:10px 16px;border-top:1px solid #f1f5f9;text-align:center;">
        <a href="students.html?filter=pending"
           style="font-size:12.5px;color:#0ea5e9;font-weight:600;text-decoration:none;">
          <i class="fas fa-external-link-alt" style="margin-right:4px;"></i>승인 관리 바로가기
        </a>
      </div>`;
    document.body.appendChild(panel);

    notifBtn.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== notifBtn)
        panel.classList.remove('open');
    });
    panel.querySelector('.notif-read-all')?.addEventListener('click', () => {
      const bb = el('bellBadge');
      if (bb) bb.style.display = 'none';
      const nb = el('navBadgeStudents');
      if (nb) nb.style.display = 'none';
      panel.classList.remove('open');
    });
  }

  loadPendingBadge();
  setInterval(loadPendingBadge, 30_000);


  /* ══════════════════════════════════════════
     5. 알림 권한 배너
  ══════════════════════════════════════════ */
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
    } else if (Notification.permission === 'default' && !sessionStorage.getItem('dvl_notif_asked')) {
      sessionStorage.setItem('dvl_notif_asked', '1');
      const banner = document.createElement('div');
      banner.id = 'notifPermBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#163A33;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;font-size:13.5px;font-weight:600;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.3);';
      banner.innerHTML = `
        <span><i class="fas fa-bell" style="margin-right:8px;color:#fbbf24;"></i>
          학생 가입·수행평가 제출 시 실시간 알림을 받으시겠습니까?</span>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button id="notifAllowBtn" style="background:#22c55e;color:#fff;border:none;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🔔 허용</button>
          <button id="notifDenyBtn"  style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:13px;cursor:pointer;">✕</button>
        </div>`;
      document.body.prepend(banner);
      el('notifAllowBtn')?.addEventListener('click', async () => {
        banner.remove();
        const perm = await Notification.requestPermission();
        if (perm === 'granted')
          navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
      });
      el('notifDenyBtn')?.addEventListener('click', () => banner.remove());
    }
  }


  /* ══════════════════════════════════════════
     6. 전역 토스트 헬퍼
  ══════════════════════════════════════════ */
  if (!window.showAdminToast) {
    window.showAdminToast = (msg, type = 'ok') => {
      let toast = el('adminCommonToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'adminCommonToast';
        toast.style.cssText = 'position:fixed;bottom:28px;right:28px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;z-index:9999;transition:all .3s ease;pointer-events:none;opacity:0;transform:translateY(10px);max-width:320px;';
        document.body.appendChild(toast);
      }
      const colors = { ok:'#163A33', success:'#16a34a', error:'#dc2626', warn:'#d97706', info:'#0ea5e9' };
      toast.style.background = colors[type] || colors.ok;
      toast.textContent = msg;
      requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateY(0)';
      });
      clearTimeout(toast._t);
      toast._t = setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateY(10px)';
      }, 3000);
    };
  }

}); /* end DOMContentLoaded */
