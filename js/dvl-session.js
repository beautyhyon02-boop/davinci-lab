/* ================================================================
   DaVinci Lab – 세션 통합 모듈 (dvl-session.js)
   ================================================================
   ▶ 이 파일 하나가 세션의 저장/읽기/검증을 모두 담당합니다.
   ▶ 모든 admin 페이지에서 admin-common.js 보다 먼저 로드하세요.

   [ 관리자 세션 ]
   - 저장 키: localStorage.dvl_admin_session
   - role 값: 'admin' | 'master'
   - 검증: DVL_SESSION.requireAdmin() — 실패 시 login.html 이동

   [ 학생 세션 ]
   - 저장 키: localStorage.dvl_student_session
   - role 값: 'student'
   - 검증: DVL_SESSION.requireStudent()

   [ 학부모 세션 ]
   - 저장 키: localStorage.dvl_parent_session
   - role 값: 'parent'
   - 검증: DVL_SESSION.requireParent()
================================================================ */

window.DVL_SESSION = (function () {
  'use strict';

  /* ── 내부 상수 ── */
  const KEY_ADMIN   = 'dvl_admin_session';
  const KEY_STUDENT = 'dvl_student_session';
  const KEY_PARENT  = 'dvl_parent_session';

  /* ── 경로 계산 (어느 depth에서 호출해도 login.html을 찾음) ── */
  function loginPath() {
    const p = location.pathname;
    if (p.includes('/admin/')   ||
        p.includes('/student/') ||
        p.includes('/parent/'))  return '../login.html';
    return 'login.html';
  }

  /* ── JSON 안전 파싱 ── */
  function safeParse(raw) {
    if (!raw || raw === '{}' || raw === 'null' || raw === 'undefined') return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  /* ────────────────────────────────────────────────
     get(key) : localStorage → sessionStorage 순으로 읽어
                항상 최신 파싱 객체를 반환. 실패 시 null.
  ──────────────────────────────────────────────── */
  function get(key) {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      return safeParse(raw);
    } catch(e) {
      /* localStorage 접근 자체가 막힌 환경(드문 경우) */
      try { return safeParse(sessionStorage.getItem(key)); } catch { return null; }
    }
  }

  /* ────────────────────────────────────────────────
     save(key, obj) : localStorage + sessionStorage 양쪽에 저장
     ★ localStorage가 핵심 — 페이지 이동 후에도 세션 유지됨
  ──────────────────────────────────────────────── */
  function save(key, obj) {
    const json = JSON.stringify(obj);
    try { localStorage.setItem(key, json); }   catch(e) { console.warn('[DVL_SESSION] localStorage 저장 실패:', key, e); }
    try { sessionStorage.setItem(key, json); } catch(e) {}
    /* 저장 직후 검증 — 실패하면 다시 시도 */
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, json);
      }
    } catch(e) {}
  }

  /* ────────────────────────────────────────────────
     clear() : 모든 세션 키 삭제 (로그아웃 공통)
  ──────────────────────────────────────────────── */
  function clear() {
    [KEY_ADMIN, KEY_STUDENT, KEY_PARENT,
     'dvl_admin_tab_session', 'dvl_admin_id',
     'dvl_user', 'dvl_session', 'dvSession',
     'userId', 'userName', 'userRole'].forEach(k => {
      try { localStorage.removeItem(k); }   catch(e) {}
      try { sessionStorage.removeItem(k); } catch(e) {}
    });
    try { sessionStorage.clear(); } catch(e) {}
  }

  /* ────────────────────────────────────────────────
     saveAdmin(obj) : 로그인 성공 시 관리자 세션 저장
     obj = { id, name, role, title }
  ──────────────────────────────────────────────── */
  function saveAdmin(obj) {
    const data = {
      id:    obj.id,
      name:  obj.name,
      role:  obj.role,   // 'admin' | 'master'
      title: obj.title || (obj.role === 'master' ? '총괄 관리자' : '관리자'),
      school:'다빈치랩',
      grade: '', gradeNum: 0, stage: '', child: '', childName: '',
    };
    save(KEY_ADMIN, data);
    /* 구형 코드 호환 — dvl_admin_tab_session도 동일하게 저장 */
    try { localStorage.setItem('dvl_admin_tab_session', JSON.stringify(data)); } catch(e) {}
    return data;
  }

  /* ────────────────────────────────────────────────
     saveStudent(obj) : 학생 세션 저장
  ──────────────────────────────────────────────── */
  function saveStudent(obj) {
    const data = {
      id:       obj.id,
      name:     obj.name,
      role:     'student',
      school:   obj.school   || '',
      grade:    obj.grade    || '',
      gradeNum: obj.gradeNum || 0,
      stage:    obj.stage    || '',
      child: '', childName: '',
    };
    save(KEY_STUDENT, data);
    /* 구형 코드 호환 */
    try {
      const json = JSON.stringify(data);
      localStorage.setItem('dvl_user', json);
      sessionStorage.setItem('dvl_user', json);
      sessionStorage.setItem('dvl_session', json);
      sessionStorage.setItem('dvSession', json);
    } catch(e) {}
    return data;
  }

  /* ────────────────────────────────────────────────
     saveParent(obj) : 학부모 세션 저장
  ──────────────────────────────────────────────── */
  function saveParent(obj) {
    const data = {
      id:        obj.id,
      name:      obj.name,
      role:      'parent',
      child:     obj.child     || '',
      childName: obj.childName || '',
      school:    obj.school    || '',
      grade:     obj.grade     || '',
    };
    save(KEY_PARENT, data);
    try {
      const json = JSON.stringify(data);
      localStorage.setItem('dvl_user', json);
      sessionStorage.setItem('dvl_user', json);
      sessionStorage.setItem('dvl_session', json);
      sessionStorage.setItem('dvSession', json);
    } catch(e) {}
    return data;
  }

  /* ────────────────────────────────────────────────
     getAdmin() : 현재 관리자 세션 객체 반환 (없으면 null)
  ──────────────────────────────────────────────── */
  function getAdmin() {
    const s = get(KEY_ADMIN);
    if (!s || !s.id) return null;
    if (s.role !== 'admin' && s.role !== 'master') return null;
    return s;
  }

  /* ────────────────────────────────────────────────
     requireAdmin() : 관리자 세션 필수 검증
     - 유효하면 세션 객체 반환 + window._dvlAdminSession 설정
     - 실패하면 login.html 이동 후 null 반환
  ──────────────────────────────────────────────── */
  function requireAdmin() {
    let s = getAdmin();

    /* ★ 1차 시도 실패 시 — 폴백 키로 재시도 */
    if (!s) {
      const fallbackRaw =
        localStorage.getItem('dvl_admin_tab_session') ||
        localStorage.getItem('dvl_user') ||
        sessionStorage.getItem(KEY_ADMIN) ||
        sessionStorage.getItem('dvl_admin_tab_session') ||
        sessionStorage.getItem('dvl_user');
      const fb = safeParse(fallbackRaw);
      if (fb && fb.id && (fb.role === 'admin' || fb.role === 'master')) {
        /* 폴백 세션 복원: 정규 키에 다시 저장 */
        save(KEY_ADMIN, fb);
        s = fb;
      }
    }

    if (!s) {
      location.replace(loginPath());
      return null;
    }
    /* 성공 플래그 — admin-common.js 등 후속 코드 호환 */
    window._dvlAdminSessionOK = true;
    window._dvlAdminSession   = s;
    /* localStorage/sessionStorage 완전 동기화 */
    save(KEY_ADMIN, s);
    try { localStorage.setItem('dvl_admin_tab_session', JSON.stringify(s)); } catch(e) {}
    try { sessionStorage.setItem('dvl_admin_tab_session', JSON.stringify(s)); } catch(e) {}
    return s;
  }

  /* ────────────────────────────────────────────────
     getStudent() : 현재 학생 세션 반환
  ──────────────────────────────────────────────── */
  function getStudent() {
    const s = get(KEY_STUDENT)
           || get('dvl_user');  // 구형 호환
    if (!s || !s.id) return null;
    if (s.role && s.role !== 'student') return null;
    return s;
  }

  /* ────────────────────────────────────────────────
     requireStudent() : 학생 세션 필수 검증
  ──────────────────────────────────────────────── */
  function requireStudent() {
    const s = getStudent();
    if (!s) {
      location.replace(loginPath());
      return null;
    }
    return s;
  }

  /* ────────────────────────────────────────────────
     getParent() : 현재 학부모 세션 반환
  ──────────────────────────────────────────────── */
  function getParent() {
    const s = get(KEY_PARENT)
           || get('dvl_user');
    if (!s || !s.id) return null;
    if (s.role && s.role !== 'parent') return null;
    return s;
  }

  /* ────────────────────────────────────────────────
     requireParent() : 학부모 세션 필수 검증
  ──────────────────────────────────────────────── */
  function requireParent() {
    const s = getParent();
    if (!s) {
      location.replace(loginPath());
      return null;
    }
    return s;
  }

  /* ────────────────────────────────────────────────
     페이지 로드 즉시: admin 페이지라면 세션 동기화
     (스크립트 load 시점에 실행 — DOMContentLoaded 불필요)
  ──────────────────────────────────────────────── */
  (function syncOnLoad() {
    const path = location.pathname;
    const isAdmin   = path.includes('/admin/');
    const isStudent = path.includes('/student/');
    const isParent  = path.includes('/parent/');

    if (isAdmin) {
      /* localStorage 우선, 없으면 폴백 키에서 복원 */
      let s = getAdmin();
      if (!s) {
        const raw =
          localStorage.getItem('dvl_admin_tab_session') ||
          localStorage.getItem('dvl_user') ||
          sessionStorage.getItem(KEY_ADMIN) ||
          sessionStorage.getItem('dvl_admin_tab_session') ||
          sessionStorage.getItem('dvl_user');
        const fb = safeParse(raw);
        if (fb && fb.id && (fb.role === 'admin' || fb.role === 'master')) s = fb;
      }
      if (s) {
        save(KEY_ADMIN, s);
        try { localStorage.setItem('dvl_admin_tab_session', JSON.stringify(s)); } catch(e) {}
      }
    } else if (isStudent) {
      const s = getStudent();
      if (s) saveStudent(s);
    } else if (isParent) {
      const s = getParent();
      if (s) saveParent(s);
    }
  })();

  /* ── 공개 API ── */
  return {
    /* 저장 */
    saveAdmin,
    saveStudent,
    saveParent,
    /* 읽기 */
    getAdmin,
    getStudent,
    getParent,
    /* 검증 (실패 시 리디렉트) */
    requireAdmin,
    requireStudent,
    requireParent,
    /* 로그아웃 */
    clear,
  };
})();
