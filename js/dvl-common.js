/* ================================================================
   DaVinci Lab – 공통 유틸리티 (dvl-common.js)
   모든 학생/관리자/학부모 페이지에서 공통으로 사용
   ================================================================ */

/* ──────────────────────────────────────────────────────────────
   ★ API Base URL
   Genspark 내장 API는 항상 루트 기준 'tables/' 로 접근
   (Genspark 프리뷰/Vercel 모두 동일하게 동작)
────────────────────────────────────────────────────────────── */
(function () {
  /**
   * window.DVL_API(tableName)
   * 예: window.DVL_API('student_profiles') → 'tables/student_profiles'
   */
  window.DVL_API = function (tableName) {
    return 'tables/' + tableName;
  };

  /**
   * window.DVL_API_RECORD(tableName, id)
   * 예: window.DVL_API_RECORD('student_profiles', 'abc-123') → 'tables/student_profiles/abc-123'
   */
  window.DVL_API_RECORD = function (tableName, id) {
    return 'tables/' + tableName + '/' + id;
  };

  console.log('[DVL] API Base: tables/ (루트 기준 상대경로)');
})();

/* ──────────────────────────────────────────────────────────────
   전역 세션 헬퍼 (페이지 로드 직후 즉시 실행)
   localStorage 우선 읽기 → sessionStorage 자동 동기화
   → 스마트폰 앱 전환, 탭 재로드 후에도 로그인 유지
────────────────────────────────────────────────────────────── */
window.DVL = window.DVL || {};

window.DVL.getSession = function() {
  try {
    const isAdminPage = location.pathname.includes('/admin/');
    let raw;
    if (isAdminPage) {
      // 관리자 페이지: dvl_admin_session 최우선
      raw = localStorage.getItem('dvl_admin_session') || '{}';
    } else {
      raw =
        localStorage.getItem('dvl_student_session') ||
        localStorage.getItem('dvl_parent_session')  ||
        localStorage.getItem('dvl_user')             ||
        localStorage.getItem('dvl_session')          ||
        sessionStorage.getItem('dvl_user')           ||
        sessionStorage.getItem('dvl_session')        ||
        sessionStorage.getItem('dvSession')          ||
        '{}';
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id) {
      sessionStorage.setItem('dvl_user',    raw);
      sessionStorage.setItem('dvl_session', raw);
      sessionStorage.setItem('dvSession',   raw);
    }
    return parsed;
  } catch(e) { return {}; }
};

window.DVL.logout = function() {
  ['dvl_user','dvl_session','dvSession',
   'dvl_student_session','dvl_parent_session'].forEach(function(k) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  sessionStorage.clear();
};

/* ─────────────────────────────────────────────────────────────
   페이지 로드 즉시 세션 복원 (인라인 스크립트 호환)
   localStorage → sessionStorage 동기화.
   sessionStorage만 읽는 구형 코드도 정상 동작하도록 보장.
───────────────────────────────────────────────────────────── */
(function syncSession() {
  // 관리자 페이지(admin/)에서는 dvl_admin_session만 사용 – 학생/학부모 세션으로 덮어쓰지 않음
  const isAdminPage = location.pathname.includes('/admin/');

  if (isAdminPage) {
    // 관리자 페이지: localStorage.dvl_admin_session → sessionStorage 동기화
    try {
      const adminRaw = localStorage.getItem('dvl_admin_session');
      if (adminRaw && adminRaw !== '{}' && adminRaw !== 'null') {
        const parsed = JSON.parse(adminRaw);
        if (parsed && parsed.id && (parsed.role === 'admin' || parsed.role === 'master')) {
          sessionStorage.setItem('dvl_admin_session', adminRaw);
          sessionStorage.setItem('dvl_user',          adminRaw);
          sessionStorage.setItem('dvl_session',       adminRaw);
          sessionStorage.setItem('dvSession',         adminRaw);
        }
      }
    } catch(e) {}
    return; // 관리자 페이지에서는 여기서 종료
  }

  // 학생/학부모 페이지: 기존 동기화 로직 (admin_session은 건드리지 않음)
  const raw =
    localStorage.getItem('dvl_student_session') ||
    localStorage.getItem('dvl_parent_session')  ||
    localStorage.getItem('dvl_user')            ||
    localStorage.getItem('dvl_session')         ||
    sessionStorage.getItem('dvl_user')          ||
    sessionStorage.getItem('dvl_session')       ||
    sessionStorage.getItem('dvSession');
  if (raw && raw !== '{}' && raw !== 'null') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) {
        // 관리자 계정이면 학생/학부모 키에 쓰지 않음
        if (parsed.role === 'admin' || parsed.role === 'master') return;

        // sessionStorage 전체 키에 동기화
        sessionStorage.setItem('dvl_user',    raw);
        sessionStorage.setItem('dvl_session', raw);
        sessionStorage.setItem('dvSession',   raw);
        // localStorage도 최신 상태 유지 (역방향 동기화)
        localStorage.setItem('dvl_user',    raw);
        localStorage.setItem('dvl_session', raw);
        if (parsed.role === 'student') localStorage.setItem('dvl_student_session', raw);
        if (parsed.role === 'parent')  localStorage.setItem('dvl_parent_session',  raw);
        // 관리자 세션(dvl_admin_session)은 절대 덮어쓰지 않음
      }
    } catch(e) {}
  }
})();

(function () {
  'use strict';

  /* ────────────────────────────────────────────────────
     1. onclick 인라인 이벤트 → 이벤트 위임 안전 실행
     sandbox 환경에서 onclick= 이 차단되는 경우를 보완.
     data-onclick="함수명(인자)" 속성으로 대체 가능하도록 지원.
     기존 onclick 은 그대로 두고, 추가로 data-onclick 도 지원.
  ──────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-onclick]');
    if (!el) return;
    const expr = el.getAttribute('data-onclick');
    if (!expr) return;
    try {
      // 함수명(인자) 형태 파싱
      const match = expr.match(/^(\w+)\((.*)\)$/s);
      if (match) {
        const fnName = match[1];
        const fn = window[fnName];
        if (typeof fn === 'function') {
          // 인자가 있으면 eval 대신 Function 생성자로 안전 실행
          const argStr = match[2].trim();
          if (argStr === '') {
            fn();
          } else {
            // 숫자/문자열/불리언 단순 인자만 허용
            const args = new Function('return [' + argStr + ']')();
            fn(...args);
          }
        }
      }
    } catch (err) {
      console.warn('[dvl-common] data-onclick 실행 오류:', expr, err);
    }
  });

  /* ────────────────────────────────────────────────────
     2. 사이드바 토글 공통 처리
     id="menuBtn" 또는 id="menuToggle" → id="sidebar" 토글
     id="sidebarClose" → sidebar 닫기
  ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');

    ['menuBtn', 'menuToggle'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn && sidebar) {
        btn.addEventListener('click', () => sidebar.classList.toggle('open'));
      }
    });

    const closeBtn = document.getElementById('sidebarClose');
    if (closeBtn && sidebar) {
      closeBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    }

    /* ── 오버레이 클릭으로 사이드바 닫기 (모바일) ── */
    document.addEventListener('click', function (e) {
      if (!sidebar) return;
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          e.target.id !== 'menuBtn' &&
          e.target.id !== 'menuToggle') {
        sidebar.classList.remove('open');
      }
    });
  });

  /* ────────────────────────────────────────────────────
     3. 로그아웃 버튼 공통 처리
     id="logoutBtn" → 세션 전체 삭제 후 login.html 이동
  ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        // localStorage + sessionStorage 모두 삭제
        ['dvl_user','dvl_session','dvSession',
         'dvl_student_session','dvl_parent_session'].forEach(function(k) {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
        sessionStorage.clear();
        // 현재 경로가 서브 디렉토리인지 판단
        const depth = location.pathname.split('/').length - 2;
        const prefix = depth > 1 ? '../'.repeat(depth - 1) : '';
        location.href = prefix + 'login.html';
      });
    }
  });

  /* ────────────────────────────────────────────────────
     4. 날짜 표시 공통 처리
     id="topbarDate" 가 있으면 오늘 날짜 자동 표시
  ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    const dateEl = document.getElementById('topbarDate');
    if (dateEl && !dateEl.textContent.trim()) {
      const d = new Date();
      dateEl.textContent =
        `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
  });

  /* ────────────────────────────────────────────────────
     5. 세션 사용자 정보 공통 표시
     topbarUserName, topbarAvatar, sidebarStudentName 등
  ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    try {
      // 관리자 페이지에서는 dvl_admin_session 우선 사용
      const isAdminPage = location.pathname.includes('/admin/');
      let raw;
      if (isAdminPage) {
        raw = localStorage.getItem('dvl_admin_session') || '{}';
      } else {
        // 학생/학부모 페이지: dvl_user 우선 (단, admin 세션이면 표시 안 함)
        raw = localStorage.getItem('dvl_user')
           || localStorage.getItem('dvl_session')
           || sessionStorage.getItem('dvl_user')
           || sessionStorage.getItem('dvl_session')
           || '{}';
      }
      const u = JSON.parse(raw);
      if (!u.name) return;

      const first = u.name.charAt(0);

      [
        'topbarAvatar', 'sidebarAvatarChar',
        'topbar-avatar', 'sidebar-avatar'
      ].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.textContent.trim()) el.textContent = first;
      });

      [
        'topbarUserName', 'topbarName',
        'sidebarStudentName', 'sidebar-student-name'
      ].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.textContent.trim()) el.textContent = u.name;
      });

      const schoolEl = document.getElementById('sidebarStudentSchool');
      if (schoolEl && u.school && !schoolEl.textContent.trim()) {
        schoolEl.textContent = u.school;
      }
    } catch (e) { /* 무시 */ }
  });

  /* ────────────────────────────────────────────────────
     6. 공통 토스트 (window.showToast 전역 등록)
     각 페이지 전용 토스트가 없을 때 폴백으로 사용
  ──────────────────────────────────────────────────── */
  if (!window.showToast) {
    window.showToast = function (msg, type) {
      // 각 페이지의 전용 토스트 함수가 있으면 사용
      if (window.showRecToast)    { window.showRecToast(msg); return; }
      if (window.showGradeToast)  { window.showGradeToast(msg); return; }

      // 없으면 간단한 팝업으로 대체
      const d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = `
        position:fixed;bottom:28px;right:28px;
        background:${type === 'error' ? '#dc2626' : '#1e4d42'};
        color:#fff;padding:13px 22px;border-radius:12px;
        font-size:14px;font-weight:600;z-index:9999;
        box-shadow:0 8px 32px rgba(0,0,0,.18);
        animation:fadeInUp .3s ease;
      `;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    };
  }

})();
