/* =============================================
   다빈치랩 – 관리자 대시보드 전용 JavaScript
   (공통 기능은 admin-common.js 에서 처리)
   ============================================= */

/* ★ Genspark DB API — Vercel 배포 환경에서도 동작 */
const _API = '/tables';

document.addEventListener('DOMContentLoaded', async () => {
  /* ── 테이블 상수 ── */
  const TABLE_STUDENTS    = 'student_profiles';
  const TABLE_ATTENDANCE  = 'attendance';
  const TABLE_ASSESSMENTS = 'assessments';
  const TABLE_CONSULT     = 'consult_requests';
  const TABLE_PLANNERS    = 'exam_planners';
  const TABLE_TASKS       = 'planner_tasks';

  /* ── 데이터 ── */
  let allStudents    = [];
  let todayAttendMap = {};
  let allAssessments = [];
  let consultReqs    = [];
  let stepBarInited  = false;

  /* ── 세션: dvl-session.js + admin-common.js 가 이미 검증한 window._dvlAdminSession 사용 ── */
  const session = window._dvlAdminSession || null;
  if (!session) return;

  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const el = id => document.getElementById(id);


  /* ══════════════════════════════════════════
     3. 피드백 모달
  ══════════════════════════════════════════ */
  const feedbackModal = el('feedbackModal');

  window.openFeedbackModal = (studentName, subject, assessId) => {
    el('modalTitle') && (el('modalTitle').textContent = '수행평가 피드백 작성');
    if (el('modalStudentInfo')) {
      el('modalStudentInfo').innerHTML =
        `<i class="fas fa-user" style="margin-right:8px;color:var(--mint-400)"></i>
         <strong>${studentName}</strong> &nbsp;·&nbsp; ${subject}`;
    }
    const textEl = el('feedbackText');
    if (textEl) textEl.value = '';
    if (feedbackModal) feedbackModal.dataset.assessId = assessId || '';
    feedbackModal?.classList.add('open');
  };

  const closeModal = (modal) => modal?.classList.remove('open');

  el('modalClose')?.addEventListener('click',   () => closeModal(feedbackModal));
  el('modalCancel')?.addEventListener('click',  () => closeModal(feedbackModal));
  feedbackModal?.addEventListener('click', (e) => {
    if (e.target === feedbackModal) closeModal(feedbackModal);
  });

  el('modalSubmit')?.addEventListener('click', async () => {
    const text = el('feedbackText')?.value.trim();
    if (!text) { alert('피드백 내용을 입력해주세요.'); return; }
    const assessId = feedbackModal?.dataset.assessId;

    if (assessId) {
      try {
        await fetch(`${_API}/${TABLE_ASSESSMENTS}/${assessId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: text, status: 'feedback', feedback_type: '종합' })
        });
        showToast('✅ 피드백이 전송되었습니다.', 'success');
        await loadDashboardData(); // 통계 갱신
      } catch { showToast('⚠️ 저장 중 오류가 발생했습니다.', 'error'); }
    } else {
      showToast('✅ 피드백이 전송되었습니다.', 'success');
    }
    closeModal(feedbackModal);
  });

  const fileDrop  = el('fileDrop');
  const fileInput = el('fileInput');
  fileDrop?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files?.length) {
      fileDrop.innerHTML = `<i class="fas fa-check-circle" style="color:var(--mint-400)"></i>
        <span>${files.length}개 파일 선택됨</span>`;
    }
  });


  /* ══════════════════════════════════════════
     5. 빠른 등록 모달
  ══════════════════════════════════════════ */
  const quickAddModal = el('quickAddModal');
  el('quickAddBtn')?.addEventListener('click',   () => quickAddModal?.classList.add('open'));
  el('quickAddClose')?.addEventListener('click', () => closeModal(quickAddModal));
  quickAddModal?.addEventListener('click', (e) => {
    if (e.target === quickAddModal) closeModal(quickAddModal);
  });

  document.querySelectorAll('.qa-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href && href !== '#') return; // 이미 href가 있는 항목은 그냥 이동
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const label = item.querySelector('span')?.textContent || '기능';
      closeModal(quickAddModal);
      showToast(`💡 "${label}" 페이지로 이동합니다.`, 'info');
    });
  });


  /* ══════════════════════════════════════════
     6. Nav 링크 – 구현된 페이지 연결
  ══════════════════════════════════════════ */
  const implementedPages = {
    dashboard:  'dashboard.html',
    students:   'students.html',
    attendance: 'attendance.html',
    assessment: 'assessment.html',
    plan:       'plan.html',
    grades:     'grades.html',
    record:     'record.html',
    exam:       'exam.html',
    notice:     'notice.html',
    consult:    'consult.html',
    parents:    'parents.html',
  };

  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    const page = link.getAttribute('data-page');
    if (!page || page === 'dashboard') return;
    if (implementedPages[page]) {
      link.setAttribute('href', implementedPages[page]);
    } else {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const label = link.querySelector('span')?.textContent || page;
        showToast(`💡 "${label}" 페이지는 다음 업데이트에 추가됩니다.`, 'info');
        if (window.innerWidth <= 900) closeSidebar();
      });
    }
  });


  /* ══════════════════════════════════════════
     7. 스텝 바 애니메이션
  ══════════════════════════════════════════ */
  function animateStepBars() {
    if (stepBarInited) return;
    stepBarInited = true;
    document.querySelectorAll('.step-bar-fill').forEach(el => {
      const target = el.style.width;
      el.style.transition = 'none';
      el.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'width 0.8s ease';
        el.style.width = target;
      }));
    });
  }

  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { animateStepBars(); barObserver.disconnect(); }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.step-bar-fill').forEach(el => barObserver.observe(el));


  /* ══════════════════════════════════════════
     8. ★ DB 연동 – 메인 데이터 로드
  ══════════════════════════════════════════ */
  async function loadDashboardData() {
    showLoadingState(true);
    try {
      await Promise.all([
        loadStudents(),
        loadTodayAttendance(todayStr),
        loadAssessments(),
        loadConsultRequests(),
      ]);
      renderKPIs();
      renderStudentTable('all');
      renderUrgentList();
      renderActivityFeed();
      renderNotifPanel();
      renderUpcomingList();
      loadArchiveCount();
    } catch (err) {
      console.error('대시보드 데이터 로드 오류:', err);
      showToast('⚠️ 일부 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      showLoadingState(false);
    }
  }

  /* 로딩 상태 표시 */
  function showLoadingState(on) {
    const ids = ['kpiAttend','kpiAssessment','kpiPlan','kpiConsult'];
    if (on) {
      ids.forEach(id => {
        const el2 = el(id);
        if (el2) el2.innerHTML = '<span style="font-size:14px;color:#aaa">로딩 중...</span>';
      });
    }
  }

  /* ── 학생 목록 로드 ── */
  async function loadStudents() {
    const res  = await fetch(`${_API}/${TABLE_STUDENTS}?limit=200`);
    const data = await res.json();
    allStudents = (data.data || []).filter(s =>
      s.status === '재원' || s.status === 'active'
    );
  }

  /* ── 오늘 출결 로드 ── */
  async function loadTodayAttendance(dateStr) {
    const res  = await fetch(`${_API}/${TABLE_ATTENDANCE}?limit=300&search=${dateStr}`);
    const data = await res.json();
    const recs = (data.data || []).filter(r => r.att_date === dateStr);
    todayAttendMap = {};
    recs.forEach(r => { todayAttendMap[r.student_id] = r; });
  }

  /* ── 수행평가 로드 ── */
  async function loadAssessments() {
    const res  = await fetch(`${_API}/${TABLE_ASSESSMENTS}?limit=300`);
    const data = await res.json();
    allAssessments = data.data || [];
  }

  /* ── 상담 신청 로드 ── */
  async function loadConsultRequests() {
    const res  = await fetch(`${_API}/${TABLE_CONSULT}?limit=100`);
    const data = await res.json();
    consultReqs = (data.data || []).filter(r => r.status === 'pending' || r.status === 'submitted');
  }


  /* ══════════════════════════════════════════
     9. KPI 카드 렌더링
  ══════════════════════════════════════════ */
  function renderKPIs() {
    const total   = allStudents.length;
    const attended = Object.values(todayAttendMap).filter(r =>
      r.status === '등원' || r.status === '재원'
    ).length;
    const absent   = total - attended;

    // 수행평가 피드백 대기 (unread_admin 기반 - 새 제출 건)
    const pendingAssess = allAssessments.filter(a =>
      a.status === 'submitted' || a.status === 'revising'
    ).length;
    const unreadAssess = allAssessments.filter(a => a.unread_admin).length;

    // 플래너 완료율 (오늘 기준)
    const planPct = calcPlannerPct();

    // 상담 대기
    const consultWait = consultReqs.length;

    /* KPI ① 오늘 등원 */
    const kpiA = el('kpiAttend');
    if (kpiA) {
      kpiA.innerHTML = `${attended}<span class="kpi-total">/${total}명</span>`;
      const sub = kpiA.closest('.kpi-card')?.querySelector('.kpi-sub');
      if (sub) sub.innerHTML = `미등원 <strong>${absent}명</strong>`;
    }

    /* KPI ② 수행평가 알림 */
    const kpiB = el('kpiAssessment');
    if (kpiB) {
      kpiB.innerHTML = `${unreadAssess > 0 ? unreadAssess : pendingAssess}<span class="kpi-total">건</span>`;
      const sub = kpiB.closest('.kpi-card')?.querySelector('.kpi-sub');
      if (sub) {
        if (unreadAssess > 0) {
          sub.textContent = `새 제출 ${unreadAssess}건 확인 필요`;
          sub.style.color = '#ef4444';
        } else {
          sub.textContent = pendingAssess > 0 ? '피드백 대기 중' : '모두 처리됨 ✅';
          sub.style.color = '';
        }
      }
    }

    /* 사이드바 배지 */
    const nb = el('navBadgeAssessment');
    if (nb) {
      const cnt = unreadAssess || pendingAssess;
      nb.textContent = cnt;
      nb.style.display = cnt > 0 ? '' : 'none';
    }
    const kpiC = el('kpiPlan');
    if (kpiC) {
      kpiC.innerHTML = `${planPct}<span class="kpi-total">%</span>`;
    }

    /* KPI ④ 상담 신청 */
    const kpiD = el('kpiConsult');
    if (kpiD) {
      kpiD.innerHTML = `${consultWait}<span class="kpi-total">건</span>`;
      const sub = kpiD.closest('.kpi-card')?.querySelector('.kpi-sub');
      if (sub) sub.textContent = consultWait > 0 ? '확인 대기 중' : '처리 완료 ✅';
    }

    const ns = el('navBadgeStudents');
    if (ns) ns.textContent = total;

    /* 단계별 분포 바 */
    renderStepBars();
  }

  /* 플래너 완료율 계산 (student_profiles × 최근 7일 tasks) */
  function calcPlannerPct() {
    // 수행평가 완료율로 대체 (플래너 테이블 별도 fetch 없이)
    const done  = allAssessments.filter(a => a.status === 'confirmed' || a.status === 'feedback').length;
    const total = allAssessments.length;
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }


  /* ══════════════════════════════════════════
     10. 수강 구분 분포 바 렌더링 (컨설팅 / 일반)
  ══════════════════════════════════════════ */
  function renderStepBars() {
    const active = allStudents.filter(s => s.status === '재원' || s.status === 'active');
    const total  = active.length || 1;
    const conCnt = active.filter(s => (s.stage || '').includes('컨설팅') || s.consulting === true).length;
    const genCnt = total - conCnt;

    const barData = [
      { label: '컨설팅',  cnt: conCnt, fillClass: 'fill-4' },
      { label: '일반 수강', cnt: genCnt, fillClass: 'fill-1' },
    ];

    const container = document.querySelector('.step-bars');
    if (!container) return;

    container.innerHTML = barData.map(b => {
      const pct = Math.round((b.cnt / total) * 100);
      return `
        <div class="step-bar-item">
          <div class="step-bar-label">
            <span>${b.label}</span><span>${b.cnt}명</span>
          </div>
          <div class="step-bar-track">
            <div class="step-bar-fill ${b.fillClass}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');

    // 탭 카운트 업데이트
    document.querySelectorAll('#studentTabs .tab-btn').forEach(btn => {
      const f = btn.dataset.filter;
      let cnt = 0;
      if (f === 'all')         cnt = active.length;
      else if (f === 'consulting') cnt = conCnt;
      else if (f === 'general')    cnt = genCnt;
      const span = btn.querySelector('.tab-cnt');
      if (span) span.textContent = cnt;
    });

    stepBarInited = false;
    animateStepBars();
  }


  /* ══════════════════════════════════════════
     11. 학생 현황 테이블 렌더링 (DB 기준)
  ══════════════════════════════════════════ */
  const ATT_LABEL = { '등원':'등원', '재원':'재원', '지각':'지각', '결석':'결석', '조퇴':'조퇴' };
  const ATT_CLASS = { '등원':'attend','재원':'attend','지각':'late','결석':'absent','조퇴':'late' };

  function makeStudentRow(s) {
    const att    = todayAttendMap[s.student_id];
    const attLbl = att ? (ATT_LABEL[att.status] || att.status) : '미등원';
    const attCls = att ? (ATT_CLASS[att.status] || 'absent') : 'absent';
    const isCon  = (s.stage || '').includes('컨설팅') || s.consulting === true;
    const conTag = isCon
      ? '<span class="step-pill step-con">재원 <em style="font-style:normal;font-weight:800;color:#7c3aed;">(컨)</em></span>'
      : '<span class="step-pill step-gen">재원</span>';

    // 해당 학생의 수행평가 중 pending 개수
    const myAssess = allAssessments.filter(a => a.student_id === s.student_id);
    const pendCnt  = myAssess.filter(a => a.status === 'pending' || a.status === 'submitted').length;
    const assessTxt = pendCnt > 0 ? `<span style="color:#ef4444;font-weight:600">D-day ${pendCnt}건</span>` : (myAssess.length > 0 ? '완료' : '-');

    return `
      <tr data-con="${isCon}" data-sid="${s.student_id}">
        <td><span class="student-name">${s.name}</span></td>
        <td>${s.school || '-'} ${s.grade || ''}학년</td>
        <td>${conTag}</td>
        <td><span class="status-dot status-${attCls}">${attLbl}</span></td>
        <td>-</td>
        <td>${assessTxt}</td>
        <td>-</td>
        <td>
          <div class="tbl-action-btns">
            <button class="tbl-btn tbl-btn-primary"
              onclick="location.href='students.html'">상세</button>
            <button class="tbl-btn tbl-btn-outline"
              onclick="openFeedbackModal('${s.name}','피드백 작성','')">피드백</button>
          </div>
        </td>
      </tr>`;
  }

  let currentFilter = 'all';
  let searchQuery   = '';

  function renderStudentTable(filter) {
    currentFilter = filter;
    const tbody = el('studentTbody');
    if (!tbody) return;

    let list = [...allStudents];

    // 구분 필터
    if (filter === 'consulting') {
      list = list.filter(s => (s.stage || '').includes('컨설팅') || s.consulting === true);
    } else if (filter === 'general') {
      list = list.filter(s => !(s.stage || '').includes('컨설팅') && s.consulting !== true);
    }

    // 검색 필터
    if (searchQuery) {
      list = list.filter(s =>
        (s.name || '').includes(searchQuery) ||
        (s.school || '').includes(searchQuery)
      );
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#aaa;">
        ${searchQuery ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.slice(0, 20).map(makeStudentRow).join('');
  }

  // 탭 필터
  document.querySelectorAll('#studentTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#studentTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStudentTable(btn.dataset.filter);
    });
  });

  // 전역 검색
  let searchTimeout;
  el('globalSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderStudentTable(currentFilter);
    }, 300);
  });

  window.viewStudent = () => { location.href = 'students.html'; };


  /* ══════════════════════════════════════════
     12. 긴급 처리 필요 패널 (DB 기준)
  ══════════════════════════════════════════ */
  function renderUrgentList() {
    const container = el('urgentList');
    if (!container) return;

    // 피드백 대기 중인 긴급 수행평가
    const urgents = allAssessments
      .filter(a => (a.status === 'pending' || a.status === 'submitted') && a.is_urgent)
      .slice(0, 5);

    // 긴급 아닌 것도 포함 (최대 5개)
    const normals = allAssessments
      .filter(a => (a.status === 'pending' || a.status === 'submitted') && !a.is_urgent)
      .slice(0, Math.max(0, 5 - urgents.length));

    const items = [...urgents, ...normals];

    const countEl = el('urgentCount');
    if (countEl) countEl.textContent = `${items.length}건`;

    if (!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px;color:#aaa;">
        <i class="fas fa-check-circle" style="font-size:28px;margin-bottom:8px;display:block;"></i>
        긴급 처리 항목이 없습니다 ✅</div>`;
      return;
    }

    const today = new Date();

    container.innerHTML = items.map(a => {
      const due    = new Date(a.due_date);
      const diff   = Math.ceil((due - today) / 86400000);
      const dLabel = diff < 0 ? `D+${Math.abs(diff)}` : diff === 0 ? 'D-day' : `D-${diff}`;
      const isUrgent = a.is_urgent || diff <= 2;
      const colorCls = isUrgent ? 'urgent-red' : 'urgent-orange';
      const tagCls   = isUrgent ? 'tag-red'    : 'tag-orange';

      return `
        <div class="urgent-item ${colorCls}">
          <div class="urgent-left">
            <span class="urgent-tag ${tagCls}">수행평가</span>
            <div>
              <div class="urgent-name">${a.student_name || a.student_id}</div>
              <div class="urgent-desc">${a.subject || ''} – ${a.title || ''} · ${dLabel}</div>
            </div>
          </div>
          <button class="btn-feedback"
            onclick="openFeedbackModal('${(a.student_name || a.student_id).replace(/'/g,"\\'")}',
                      '${(a.subject || '').replace(/'/g,"\\'")} ${(a.title || '').replace(/'/g,"\\'")}',
                      '${a.id}')">
            <i class="fas fa-comment-alt"></i> 피드백
          </button>
        </div>`;
    }).join('');
  }


  /* ══════════════════════════════════════════
     13. 오늘 활동 피드 (출결 + 상담 기반)
  ══════════════════════════════════════════ */
  function renderActivityFeed() {
    const container = el('activityFeed');
    if (!container) return;

    const items = [];

    // 오늘 출결 데이터
    Object.values(todayAttendMap).slice(0, 6).forEach(r => {
      const t = r.in_time ? r.in_time.slice(0, 5) : '';
      items.push({
        badge: 'act-attend',
        label: '출결',
        text:  `${r.student_name || r.student_id} ${r.status}${t ? ' ' + t : ''}`,
        time:  t || '-',
        ts:    r.created_at || 0,
      });
    });

    // 수행평가 최신 3개
    [...allAssessments]
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
      .slice(0, 3)
      .forEach(a => {
        const ts = new Date(a.updated_at || a.created_at || 0);
        const h  = ts.getHours().toString().padStart(2, '0');
        const m  = ts.getMinutes().toString().padStart(2, '0');
        items.push({
          badge: 'act-assess',
          label: '수행평가',
          text:  `${a.student_name || a.student_id} – ${a.title || '수행평가 등록'}`,
          time:  `${h}:${m}`,
          ts:    a.updated_at || 0,
        });
      });

    // 상담 신청 최신 2개
    consultReqs.slice(0, 2).forEach(c => {
      const ts = new Date(c.created_at || 0);
      const h  = ts.getHours().toString().padStart(2, '0');
      const m  = ts.getMinutes().toString().padStart(2, '0');
      items.push({
        badge: 'act-consult',
        label: '상담',
        text:  `${c.requester_name || '학부모'} 상담 신청 접수`,
        time:  `${h}:${m}`,
        ts:    c.created_at || 0,
      });
    });

    // 최신순 정렬
    items.sort((a, b) => b.ts - a.ts);

    if (!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:24px;color:#aaa;">
        오늘 활동 내역이 없습니다.</div>`;
      return;
    }

    container.innerHTML = items.slice(0, 8).map(it => `
      <div class="activity-item">
        <span class="act-badge ${it.badge}">${it.label}</span>
        <span class="act-text">${it.text}</span>
        <span class="act-time">${it.time}</span>
      </div>`).join('');
  }


  /* ══════════════════════════════════════════
     14. 알림 패널 동적 렌더링
  ══════════════════════════════════════════ */
  function renderNotifPanel() {
    const notifList = document.querySelector('.notif-list');
    if (!notifList) return;

    // unread_admin 플래그 기반 미확인 제출 건
    const newSubmissions = allAssessments
      .filter(a => a.unread_admin)
      .slice(0, 5);

    const consultNew = consultReqs.slice(0, 2);

    const items = [
      ...newSubmissions.map(a => ({
        icon: 'fa-clipboard-check',
        colorCls: 'notif-red',
        text: `${a.student_name || ''} – ${a.subject || ''} ${a.status === 'revising' ? '재제출 완료' : '수행평가 공지 제출'}`,
        time: timeAgo(a.updated_at || a.created_at),
        unread: true,
        link: 'assessment.html',
      })),
      ...consultNew.map(c => ({
        icon: 'fa-comments',
        colorCls: 'notif-teal',
        text: `${c.requester_name || '학부모'} 상담 신청 접수`,
        time: timeAgo(c.created_at),
        unread: true,
      })),
    ];

    if (!items.length) {
      notifList.innerHTML = `<div style="text-align:center;padding:24px;color:#aaa;font-size:13px;">
        새 알림이 없습니다.</div>`;
      const dot = document.querySelector('.notif-dot');
      if (dot) dot.style.display = 'none';
      return;
    }

    // 알림 뱃지 표시
    const dot = document.querySelector('.notif-dot');
    if (dot) dot.style.display = '';

    notifList.innerHTML = items.map(it => `
      <div class="notif-item ${it.unread ? 'notif-unread' : ''}" ${it.link ? `onclick="location.href='${it.link}'" style="cursor:pointer;"` : ''}>
        <span class="notif-icon ${it.colorCls}"><i class="fas ${it.icon}"></i></span>
        <div>
          <div class="notif-text">${it.text}</div>
          <div class="notif-time">${it.time}</div>
        </div>
      </div>`).join('');
  }

  function timeAgo(ts) {
    if (!ts) return '-';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return '방금 전';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  }


  /* ══════════════════════════════════════════
     15. Toast 알림
  ══════════════════════════════════════════ */
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
        z-index:9999; display:flex; flex-direction:column; gap:8px;
        align-items:center; pointer-events:none;`;
      document.body.appendChild(container);
    }

    const colors = { success:'#163A33', info:'#245A4E', error:'#ef4444' };
    const toast  = document.createElement('div');
    toast.style.cssText = `
      background:${colors[type] || colors.info}; color:#fff;
      padding:12px 22px; border-radius:999px; font-size:13.5px;
      font-weight:600; font-family:'Noto Sans KR',sans-serif;
      box-shadow:0 4px 20px rgba(0,0,0,.2);
      opacity:0; transform:translateY(10px);
      transition:opacity .3s,transform .3s;
      pointer-events:auto; white-space:nowrap;
      max-width:90vw; overflow:hidden; text-overflow:ellipsis;`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateY(0)';
    }));
    setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  window.showToast = showToast;


  /* ══════════════════════════════════════════
     16. 이번 주 수행평가 마감 일정 렌더링
  ══════════════════════════════════════════ */
  function renderUpcomingList() {
    const container = el('upcomingList');
    if (!container) return;

    const DAY_KO = ['일','월','화','수','목','금','토'];
    const today  = new Date();

    // 앞으로 14일 이내 마감 수행평가
    const upcoming = allAssessments
      .filter(a => {
        if (!a.due_date) return false;
        const due  = new Date(a.due_date);
        const diff = Math.ceil((due - today) / 86400000);
        return diff >= -1 && diff <= 14;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 6);

    if (!upcoming.length) {
      container.innerHTML = `<div style="text-align:center;padding:24px;color:#aaa;font-size:13px;">
        이번 주 예정된 수행평가 마감이 없습니다.</div>`;
      return;
    }

    container.innerHTML = upcoming.map(a => {
      const due  = new Date(a.due_date);
      const diff = Math.ceil((due - today) / 86400000);
      const mm   = due.getMonth() + 1;
      const dd   = due.getDate();
      const dow  = DAY_KO[due.getDay()];

      let dLabel, tagCls;
      if (diff < 0)      { dLabel = `D+${Math.abs(diff)}`;  tagCls = 'tag-gray'; }
      else if (diff === 0) { dLabel = 'D-day';              tagCls = 'tag-red'; }
      else if (diff <= 3)  { dLabel = `D-${diff}`;          tagCls = 'tag-red'; }
      else if (diff <= 7)  { dLabel = `D-${diff}`;          tagCls = 'tag-orange'; }
      else                 { dLabel = `D-${diff}`;          tagCls = 'tag-green'; }

      return `
        <div class="schedule-item">
          <div class="sch-date">${mm}.${dd}<span>${dow}</span></div>
          <div class="sch-content">
            <div class="sch-title">${a.student_name || a.student_id} – ${a.subject || ''} ${a.title || ''}</div>
            <span class="sch-tag ${tagCls}">${dLabel}</span>
          </div>
        </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════
     17. 아카이브 카운트 (inactive 학생)
  ══════════════════════════════════════════ */
  async function loadArchiveCount() {
    try {
      const res  = await fetch(`${_API}/${TABLE_STUDENTS}?limit=200`);
      const data = await res.json();
      const all  = data.data || [];

      const graduated = all.filter(s => s.status === 'graduated').length;
      const paused    = all.filter(s => s.status === 'paused' || s.status === 'inactive').length;
      const archived  = all.filter(s => s.status === 'archived').length;

      const items = document.querySelectorAll('.arc-val');
      if (items[0]) items[0].textContent = `${graduated}명`;
      if (items[1]) items[1].textContent = `${paused}명`;
      if (items[2]) items[2].textContent = `${archived}명`;
    } catch { /* 실패 시 기존 값 유지 */ }
  }

  /* ══════════════════════════════════════════
     18. 새로고침 버튼
  ══════════════════════════════════════════ */
  el('refreshDashboard')?.addEventListener('click', async () => {
    showToast('🔄 데이터를 새로 불러오는 중...', 'info');
    await loadDashboardData();
  });

  /* ══════════════════════════════════════════
     16. 로그아웃
  ══════════════════════════════════════════ */
  document.querySelectorAll('.sidebar-logout, #logoutBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.clear();
      // 관리자 + 학생/학부모 세션 모두 해제
      ['dvl_admin_session','dvl_admin_id',
       'dvl_user','dvl_session','dvSession',
       'dvl_student_session','dvl_parent_session'].forEach(k => localStorage.removeItem(k));
      location.href = '../login.html';
    });
  });


  /* ══════════════════════════════════════════
     🚀 대시보드 초기화
  ══════════════════════════════════════════ */
  await loadDashboardData();

  /* ══════════════════════════════════════════
     🔔 실시간 알림 폴링 엔진 (15초 간격)
     - 수행평가 새 제출 / 재제출 감지
     - 상담 신청 감지
     - 웹 푸시 + 토스트 + 알림음
  ══════════════════════════════════════════ */

  // 알림 권한 요청 + SW 폴링 시작
  (async function requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const res = await Notification.requestPermission().catch(() => 'denied');
      if (res === 'granted') {
        showToast('✅ 실시간 알림이 활성화됐습니다.', 'success');
        // SW에도 백그라운드 폴링 시작 명령
        navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
      }
    } else if (Notification.permission === 'granted') {
      // 이미 허용 → SW 폴링 시작
      navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'START_POLL' }));
    }
  })();

  // 이미 감지된 ID 세트 (페이지 최초 로드 시 현재 상태 기준점)
  let _prevAssessUnread = new Set(
    (allAssessments || []).filter(a => a.unread_admin).map(a => a.id)
  );
  let _prevConsultPending = new Set(
    (consultReqs || []).filter(c => c.status === 'pending').map(c => c.id)
  );

  // 알림음 재생
  function playAlertSound(freq = 880) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  }

  // 웹 푸시 + SW 메시지 전송 (앱이 백그라운드일 때도 작동)
  function sendNotification({ title, body, url, tag }) {
    // 포어그라운드: 앱 내 토스트
    showToast(`🔔 ${body}`, 'info');
    playAlertSound();

    // Web Notification API (포어그라운드 / 백그라운드 공통)
    if ('Notification' in window && Notification.permission === 'granted') {
      // SW가 활성화된 경우 SW를 통해 전송 (백그라운드에서도 표시)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'NOTIFY', title, body, url, tag,
        });
      } else {
        // SW 없을 때 직접 Notification API
        const n = new Notification(title, {
          body,
          icon:               '../images/icon-192.png',
          badge:              '../images/icon-192.png',
          tag,
          renotify:           true,
          requireInteraction: true,
          data:               { url },
        });
        n.onclick = () => { window.focus(); if (url) location.href = url; n.close(); };
      }
    }
  }

  // 폴링 실행
  setInterval(async () => {
    try {
      // 수행평가 폴링
      const aRes  = await fetch(`${_API}/${TABLE_ASSESSMENTS}?limit=300`);
      const aData = await aRes.json();
      const aList = aData.data || [];
      const newUnreadIds = new Set(aList.filter(a => a.unread_admin).map(a => a.id));

      aList.filter(a => a.unread_admin && !_prevAssessUnread.has(a.id))
        .forEach(a => {
          const statusLabel = a.status === 'revising' ? '재제출' : '신규 제출';
          sendNotification({
            title: `📋 수행평가 ${statusLabel}`,
            body:  `${a.student_name || '학생'} · ${a.subject || ''} ${a.title ? '– ' + a.title : ''}`,
            url:   '../admin/assessment.html',
            tag:   `assess-${a.id}`,
          });
        });

      if (aList.some(a => a.unread_admin && !_prevAssessUnread.has(a.id))) {
        allAssessments = aList;
        renderKPIs();
        renderNotifPanel();
      }
      _prevAssessUnread = newUnreadIds;

      // 상담 신청 폴링
      const cRes  = await fetch(`${_API}/${TABLE_CONSULT}?limit=200`);
      const cData = await cRes.json();
      const cList = cData.data || [];
      const newPendingIds = new Set(cList.filter(c => c.status === 'pending').map(c => c.id));

      cList.filter(c => c.status === 'pending' && !_prevConsultPending.has(c.id))
        .forEach(c => {
          sendNotification({
            title: '💬 새 상담 신청',
            body:  `${c.student_name || '학생'} · ${c.subject || c.type || '상담'} – ${c.message ? c.message.slice(0, 30) : ''}`,
            url:   '../admin/consult.html',
            tag:   `consult-${c.id}`,
          });
        });

      if (cList.some(c => c.status === 'pending' && !_prevConsultPending.has(c.id))) {
        consultReqs = cList;
        renderKPIs();
      }
      _prevConsultPending = newPendingIds;

    } catch(e) { /* 폴링 오류 무시 */ }
  }, 15000); // 15초 간격

});
