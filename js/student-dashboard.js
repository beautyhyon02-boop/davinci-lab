/* =============================================
   다빈치랩 학생 대시보드 JS – v16 DB 연동
   ============================================= */

/* ★ Genspark DB API — Vercel 배포 환경 포함 */
const _API = '/tables';

/* ── 테이블 상수 ── */
const TABLE_STUDENTS    = 'student_profiles';
const TABLE_ATTENDANCE  = 'attendance';
const TABLE_ASSESSMENTS = 'assessments';
const TABLE_NOTICES     = 'notices';
const TABLE_NOTICE_READ = 'notice_reads';
const TABLE_CONSULT     = 'consult_requests';
const TABLE_TASKS       = 'planner_tasks';
const TABLE_PLANNERS    = 'exam_planners';

/* ── 전역 ── */
let studentId   = '';
let studentName = '';
let calYear     = new Date().getFullYear();
let calMonth    = new Date().getMonth();
let attendMap   = {}; // YYYY-MM-DD → status

(async function () {

  /* ═══════════════════════════════════════════
     0. 세션 & 학생 정보
  ═══════════════════════════════════════════ */
  const session = (() => {
    try {
      const raw =
        localStorage.getItem('dvl_student_session') ||
        localStorage.getItem('dvl_user') ||
        localStorage.getItem('dvl_session') ||
        sessionStorage.getItem('dvl_user') ||
        sessionStorage.getItem('dvl_session') ||
        sessionStorage.getItem('dvSession') ||
        '{}';
      // sessionStorage에 동기화 (다른 코드 호환)
      sessionStorage.setItem('dvl_user',    raw);
      sessionStorage.setItem('dvl_session', raw);
      sessionStorage.setItem('dvSession',   raw);
      return JSON.parse(raw);
    } catch { return {}; }
  })();

  // role이 없거나 비어있으면 student로 간주 (구버전 세션 호환)
  if (!session.id || (session.role && session.role !== 'student')) {
    location.href = '../login.html';
    return;
  }

  studentId   = session.id   || '';
  studentName = session.name || '학생';

  /* ─── 관리자 대리열람 배너 표시 ─── */
  const isProxyView = localStorage.getItem('dvl_admin_proxy_view') === 'true'
                   || sessionStorage.getItem('dvl_admin_proxy_view') === 'true';
  const proxyBanner = document.getElementById('adminProxyBanner');
  if (isProxyView && proxyBanner) {
    const proxyAdminName = localStorage.getItem('dvl_admin_proxy_name') || '관리자';
    proxyBanner.style.display = 'flex';
    proxyBanner.style.alignItems = 'center';
    proxyBanner.style.justifyContent = 'space-between';
    const nameEl  = document.getElementById('proxyStudentName');
    const adminEl = document.getElementById('proxyAdminName');
    if (nameEl)  nameEl.textContent  = studentName;
    if (adminEl) adminEl.textContent = `(${proxyAdminName} 열람 중)`;
  }

  // 날짜 표시
  const DAYS = ['일','월','화','수','목','금','토'];
  const now  = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const el = (id) => document.getElementById(id);

  el('welcomeDate')  && (el('welcomeDate').textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}요일`);
  el('welcomeName')  && (el('welcomeName').textContent   = studentName);
  el('topbarName')   && (el('topbarName').textContent    = studentName);
  el('sidebarStudentName') && (el('sidebarStudentName').textContent = studentName);

  const avatarChar = studentName.charAt(0);
  document.querySelector('.stu-avatar')    && (document.querySelector('.stu-avatar').textContent    = avatarChar);
  document.querySelector('.topbar-avatar') && (document.querySelector('.topbar-avatar').textContent = avatarChar);

  // 학생 프로필 DB 조회
  await loadStudentProfile();

  /* ═══════════════════════════════════════════
     1. 학생 프로필 로드
  ═══════════════════════════════════════════ */
  async function loadStudentProfile() {
    try {
      const res  = await fetch(`${_API}/${TABLE_STUDENTS}?limit=200`);
      const data = await res.json();
      const prof = (data.data || []).find(s => s.student_id === studentId);
      if (prof) {
        studentName = prof.name || studentName;
        el('welcomeName')  && (el('welcomeName').textContent   = studentName);
        el('topbarName')   && (el('topbarName').textContent    = studentName);
        el('sidebarStudentName') && (el('sidebarStudentName').textContent = studentName);
        const av = studentName.charAt(0);
        document.querySelector('.stu-avatar')    && (document.querySelector('.stu-avatar').textContent    = av);
        document.querySelector('.topbar-avatar') && (document.querySelector('.topbar-avatar').textContent = av);

        const isConsulting = (prof.stage || '').includes('컨설팅') || prof.consulting === true;
        const stageEl = document.getElementById('sidebarStage') || document.querySelector('.stu-stage-badge');
        if (stageEl) stageEl.textContent = isConsulting ? '재원 (컨)' : '재원';
        el('sidebarStudentSchool') && (el('sidebarStudentSchool').textContent =
          `${prof.school || ''} ${prof.grade || ''}`);

        const roleEl = document.getElementById('topbarRole') || document.querySelector('.topbar-user-role');
        if (roleEl) roleEl.textContent = isConsulting ? '학생 · 컨설팅' : '학생';

        // id 기반 아바타 업데이트
        const avEl2 = document.getElementById('sidebarAvatar');
        const av2 = studentName.charAt(0);
        if (avEl2) avEl2.textContent = av2;
        document.querySelector('.topbar-avatar') && (document.querySelector('.topbar-avatar').textContent = av2);
      }
    } catch (e) {
      console.warn('학생 프로필 로드 실패:', e);
    }
  }

  /* ═══════════════════════════════════════════
     2. 병렬로 모든 데이터 로드
  ═══════════════════════════════════════════ */
  const [, attData, assessData, noticeData, plannerData] = await Promise.allSettled([
    loadStudentProfile(),
    loadAttendance(),
    loadAssessments(),
    loadNotices(),
    loadPlannerTasks(),
  ]).then(res => res.map(r => r.value));

  /* ═══════════════════════════════════════════
     3. 출결 데이터 로드 & 미니 캘린더 렌더
  ═══════════════════════════════════════════ */
  async function loadAttendance() {
    try {
      const res  = await fetch(`${_API}/${TABLE_ATTENDANCE}?limit=300`);
      const data = await res.json();
      const recs = (data.data || []).filter(r => r.student_id === studentId);

      // 이번 달 데이터 맵
      attendMap = {};
      recs.forEach(r => { if (r.att_date) attendMap[r.att_date] = r.status; });

      // 출결 통계 계산 (이번 달)
      const yearStr  = String(now.getFullYear());
      const monthStr = String(now.getMonth() + 1).padStart(2, '0');
      const prefix   = `${yearStr}-${monthStr}`;

      const monthRecs  = recs.filter(r => r.att_date && r.att_date.startsWith(prefix));
      const attendCnt  = monthRecs.filter(r => r.status === '등원' || r.status === '재원').length;
      const lateCnt    = monthRecs.filter(r => r.status === '지각').length;
      const absentCnt  = monthRecs.filter(r => r.status === '결석').length;

      // 출석률 계산 — 데이터 없으면 0% 표시
      const totalDays = monthRecs.length;
      const rate      = totalDays > 0
        ? Math.round(((totalDays - absentCnt) / totalDays) * 100)
        : 0;

      // KPI 카드 업데이트 (id 기반으로 안전하게)
      const kpiRateEl = document.getElementById('kpiAttRate');
      const kpiSubEl  = document.getElementById('kpiAttSub');
      const kpiCard0  = document.querySelectorAll('.kpi-card')[0];

      if (kpiRateEl) {
        kpiRateEl.innerHTML = (totalDays > 0 ? rate : '–') + '<span class="kpi-unit">%</span>';
      } else if (kpiCard0) {
        kpiCard0.querySelector('.kpi-value').innerHTML =
          (totalDays > 0 ? rate : '–') + '<span class="kpi-unit">%</span>';
      }
      if (kpiSubEl) {
        kpiSubEl.textContent = totalDays > 0
          ? `결석 ${absentCnt}회 · 지각 ${lateCnt}회`
          : '이번 달 기록 없음';
      } else if (kpiCard0) {
        kpiCard0.querySelector('.kpi-sub').textContent = totalDays > 0
          ? `결석 ${absentCnt}회 · 지각 ${lateCnt}회`
          : '이번 달 기록 없음';
      }

      // 오늘 출결 상태 → D-day 카드1 업데이트 (출결 있을 때만)
      const todayStatus = attendMap[todayStr];
      const ddayCard1 = document.getElementById('ddayCard1') || document.querySelector('.dday-card:first-child');
      if (ddayCard1 && todayStatus) {
        const lbl = ddayCard1.querySelector('.dday-label');
        const num = ddayCard1.querySelector('.dday-num');
        const dt  = ddayCard1.querySelector('.dday-date');
        if (lbl) lbl.textContent = '오늘 출결';
        if (num) num.textContent = todayStatus;
        if (dt)  dt.textContent  = `${now.getMonth()+1}월 ${now.getDate()}일`;
      }

      renderMiniCal();
      return recs;
    } catch (e) {
      console.warn('출결 로드 실패:', e);
      renderMiniCal();
      return [];
    }
  }

  /* ── 미니 캘린더 렌더 ── */
  function renderMiniCal() {
    const container = el('miniCalendar');
    if (!container) return;

    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    const DOW = ['일','월','화','수','목','금','토'];
    const STATUS_CLS = { '등원':'present','재원':'present','지각':'late','결석':'absent','조퇴':'late' };

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push('<div class="mini-cal-day empty"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const mm  = String(calMonth + 1).padStart(2, '0');
      const dd  = String(d).padStart(2, '0');
      const key = `${calYear}-${mm}-${dd}`;
      const isToday  = (d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear());
      const isFuture = new Date(calYear, calMonth, d) > now && !isToday;
      const st = attendMap[key];

      let cls = 'mini-cal-day';
      if (isToday)          cls += ' today';
      else if (isFuture)    cls += ' future';
      else if (st)          cls += ` ${STATUS_CLS[st] || ''}`;

      cells.push(`<div class="${cls}" title="${st || ''}">${d}</div>`);
    }

    container.innerHTML = `
      <div class="mini-cal-header">
        <button class="mini-cal-nav" onclick="window.changeCalMonth(-1)">
          <i class="fas fa-chevron-left"></i>
        </button>
        <h4>${calYear}년 ${calMonth+1}월</h4>
        <button class="mini-cal-nav" onclick="window.changeCalMonth(1)">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
      <div class="mini-cal-grid">
        ${DOW.map(d => `<div class="mini-cal-dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>`;
  }

  window.changeCalMonth = function(dir) {
    calMonth += dir;
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0;  calYear++; }
    renderMiniCal();
  };

  /* ═══════════════════════════════════════════
     4. 수행평가 로드 & 렌더
  ═══════════════════════════════════════════ */
  async function loadAssessments() {
    try {
      const res  = await fetch(`${_API}/${TABLE_ASSESSMENTS}?limit=200`);
      const data = await res.json();
      const list = (data.data || []).filter(a => a.student_id === studentId);

      // KPI 카드 업데이트
      const total   = list.length;
      // pending → 아직 제출 안 한 것 (submitted 이전 상태 or draft)
      const pending = list.filter(a => !a.status || a.status === 'draft').length;
      const done    = list.filter(a => a.status === 'confirmed').length;
      // 미읽음 피드백 (unread_student 플래그)
      const unreadFb = list.filter(a => a.unread_student).length;

      const kpiCards = document.querySelectorAll('.kpi-card');
      if (kpiCards[2]) {
        kpiCards[2].querySelector('.kpi-value').innerHTML =
          `${list.length}<span class="kpi-unit">건</span>`;
        const sub = kpiCards[2].querySelector('.kpi-sub');
        if (sub) {
          if (unreadFb > 0) {
            sub.textContent = `새 피드백 ${unreadFb}건 확인!`;
            sub.className = 'kpi-sub kpi-sub--alert';
          } else {
            sub.textContent = done > 0 ? `${done}건 최종 완료` : '진행 중';
            sub.className = 'kpi-sub';
          }
        }
      }

      // 수행평가 알림 배지 (미읽음 피드백 or 미처리)
      const badge = document.querySelector('.nav-badge--alert');
      const alertCnt = unreadFb;
      if (badge && alertCnt > 0) { badge.textContent = alertCnt; badge.style.display = ''; }
      else if (badge) badge.style.display = 'none';

      // 사이드바 수행평가 링크 배지
      const sideAssessLink = document.querySelector('a[href="assessment.html"]');
      if (sideAssessLink && unreadFb > 0) {
        let nb = sideAssessLink.querySelector('.nav-badge');
        if (!nb) {
          nb = document.createElement('span');
          nb.className = 'nav-badge nav-badge--alert';
          sideAssessLink.appendChild(nb);
        }
        nb.textContent = unreadFb;
      }

      // D-day 배너 업데이트 (가장 가까운 마감)
      const upcoming = list
        .filter(a => a.due_date && a.status !== 'confirmed')
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

      const ddCard2 = document.getElementById('ddayCard2') || document.querySelector('.dday-card--alert');
      if (ddCard2) {
        const lbl2 = ddCard2.querySelector('.dday-label');
        const num2 = ddCard2.querySelector('.dday-num');
        const dt2  = ddCard2.querySelector('.dday-date');
        if (upcoming.length > 0) {
          const nearest = upcoming[0];
          const due  = new Date(nearest.due_date);
          const diff = Math.ceil((due - now) / 86400000);
          if (lbl2) lbl2.textContent = '수행평가 마감';
          if (num2) num2.textContent = diff < 0 ? `D+${Math.abs(diff)}` : diff === 0 ? 'D-day' : `D-${diff}`;
          if (dt2)  dt2.textContent  = nearest.due_date.replace(/-/g,'.').slice(5) + ` (${nearest.title||nearest.subject||''})`;
        } else {
          if (lbl2) lbl2.textContent = '수행평가 마감';
          if (num2) num2.textContent = '–';
          if (dt2)  dt2.textContent  = '등록된 항목 없음';
        }
      }

      // 수행평가 KPI 카드 업데이트
      const kpiAssessEl  = document.getElementById('kpiAssessCnt');
      const kpiAssessSubEl = document.getElementById('kpiAssessSub');
      if (kpiAssessEl) {
        kpiAssessEl.innerHTML = `${pending}<span class="kpi-unit">건</span>`;
      }
      if (kpiAssessSubEl) {
        kpiAssessSubEl.textContent = pending > 0 ? `미제출 ${pending}건 남음` : '모두 제출 완료 ✅';
        kpiAssessSubEl.className = 'kpi-sub' + (pending > 0 ? ' kpi-sub--alert' : '');
      }

      // 수행평가 리스트 렌더
      renderAssessList(list.slice(0, 4));
      return list;
    } catch (e) {
      console.warn('수행평가 로드 실패:', e);
      renderAssessList([]);
      return [];
    }
  }

  function renderAssessList(list) {
    const container = el('assessList');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;">
        등록된 수행평가가 없습니다.</div>`;
      return;
    }

    const STATUS_LABEL = {
      pending:'제출 필요', submitted:'제출 완료',
      feedback:'피드백 수령', revising:'수정 중', confirmed:'최종 확정'
    };

    container.innerHTML = list.map(a => {
      const due    = a.due_date ? new Date(a.due_date) : null;
      const diff   = due ? Math.ceil((due - now) / 86400000) : null;
      const urgent = diff !== null && diff >= 0 && diff <= 7;
      const dLabel = diff !== null
        ? (diff < 0 ? '마감 완료' : diff === 0 ? 'D-day' : `D-${diff}`)
        : '';

      return `
        <div class="assess-item" onclick="location.href='assessment.html'">
          <div class="assess-item-top">
            <span class="assess-subject">${a.subject || '수행평가'}</span>
            <span class="assess-status ${a.status || 'pending'}">${STATUS_LABEL[a.status] || '제출 필요'}</span>
          </div>
          <div class="assess-title">${a.title || '수행평가'}</div>
          <div class="assess-deadline ${urgent ? 'urgent' : ''}">
            <i class="fas fa-clock" style="font-size:11px;margin-right:3px;"></i>
            마감 ${a.due_date ? a.due_date.slice(5).replace('-','/') : '-'}
            ${dLabel ? ` · ${dLabel}` : ''}
            ${a.is_urgent ? ' 🔴' : ''}
          </div>
        </div>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     5. 공지사항 로드 & 렌더
  ═══════════════════════════════════════════ */
  async function loadNotices() {
    try {
      const [noticeRes, readRes] = await Promise.all([
        fetch(`${_API}/${TABLE_NOTICES}?limit=20&sort=created_at`),
        fetch(`${_API}/${TABLE_NOTICE_READ}?limit=200`)
      ]);
      const noticeData = await noticeRes.json();
      const readData   = await readRes.json();

      const notices = (noticeData.data || [])
        .filter(n => n.status !== 'draft')
        .sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          return (b.created_at || 0) - (a.created_at || 0);
        })
        .slice(0, 5);

      const readSet = new Set(
        (readData.data || [])
          .filter(r => r.reader_id === studentId && r.is_read)
          .map(r => r.notice_id)
      );

      renderNoticeList(notices, readSet);

      // 알림 배지 (읽지 않은 공지)
      const unread = notices.filter(n => !readSet.has(n.id)).length;
      const noticeBadge = document.querySelector('.nav-badge:not(.nav-badge--alert)');
      if (noticeBadge) {
        noticeBadge.textContent = unread;
        noticeBadge.style.display = unread > 0 ? '' : 'none';
      }

      // 알림 패널
      renderNotifPanel(notices, readSet);

      return notices;
    } catch (e) {
      console.warn('공지 로드 실패:', e);
      renderNoticeList([], new Set());
      return [];
    }
  }

  function renderNoticeList(notices, readSet) {
    const container = el('noticeList');
    if (!container) return;

    if (!notices.length) {
      container.innerHTML = `<li style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;list-style:none;">
        등록된 공지사항이 없습니다.</li>`;
      return;
    }

    container.innerHTML = notices.map(n => {
      const isRead = readSet.has(n.id);
      const dateStr = n.created_at
        ? new Date(n.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        : '';
      return `
        <li onclick="location.href='notice.html'" style="cursor:pointer;">
          <span class="notice-dot ${isRead ? 'read' : ''}"></span>
          <div class="notice-item-body">
            <div class="notice-item-title">
              ${n.is_important ? '<span style="color:#ef4444;font-size:11px;font-weight:700;margin-right:4px;">[중요]</span>' : ''}
              ${n.title || '공지'}
            </div>
            <div class="notice-item-date">${dateStr}</div>
          </div>
          <i class="fas fa-chevron-right" style="color:var(--text-300);font-size:11px;"></i>
        </li>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════
     6. 시험 플래너 태스크 로드 & 학습플랜 렌더
  ═══════════════════════════════════════════ */
  async function loadPlannerTasks() {
    try {
      const res  = await fetch(`${_API}/${TABLE_TASKS}?limit=200`);
      const data = await res.json();
      const all  = (data.data || []).filter(t => t.student_id === studentId);

      // 이번 주 태스크
      const weekStart = getWeekStart(now);
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

      const weekTasks = all.filter(t => {
        if (!t.task_date) return false;
        const d = new Date(t.task_date);
        return d >= weekStart && d <= weekEnd;
      });

      // KPI: 학습 플랜 달성률
      const done  = weekTasks.filter(t => t.is_done).length;
      const total = weekTasks.length;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

      const kpiPlanRateEl = document.getElementById('kpiPlanRate');
      const kpiPlanSubEl  = document.getElementById('kpiPlanSub');
      if (kpiPlanRateEl) {
        kpiPlanRateEl.innerHTML = (total > 0 ? pct : '–') + '<span class="kpi-unit">%</span>';
      } else {
        const kpiCards = document.querySelectorAll('.kpi-card');
        if (kpiCards[1]) {
          kpiCards[1].querySelector('.kpi-value').innerHTML =
            (total > 0 ? pct : '–') + '<span class="kpi-unit">%</span>';
        }
      }
      if (kpiPlanSubEl) {
        kpiPlanSubEl.textContent = total > 0 ? `이번 주 ${done}/${total} 완료` : '이번 주 플랜 없음';
      } else {
        const kpiCards = document.querySelectorAll('.kpi-card');
        if (kpiCards[1]) kpiCards[1].querySelector('.kpi-sub').textContent =
          total > 0 ? `이번 주 ${done}/${total} 완료` : '이번 주 플랜 없음';
      }
      const pfill = document.querySelector('.plan-progress-fill');
      const plbl  = document.querySelector('.plan-progress-label strong');
      if (pfill) pfill.style.width = `${pct}%`;
      if (plbl)  plbl.textContent  = `${pct}%`;

      // 이번 주 할 일 렌더
      renderWeeklyPlan(weekTasks);

      // 누적 학습 시간 (localStorage timer 합계)
      const monthTimerKey = `dvl_month_timer_${studentId}_${now.getFullYear()}_${now.getMonth()+1}`;
      const monthSeconds  = parseInt(localStorage.getItem(monthTimerKey) || '0', 10);
      const monthHours    = Math.floor(monthSeconds / 3600);
      if (kpiCards[3]) {
        kpiCards[3].querySelector('.kpi-value').innerHTML =
          `${monthHours}<span class="kpi-unit">h</span>`;
        kpiCards[3].querySelector('.kpi-sub').textContent =
          `이번 달 ${monthHours}h 학습`;
      }

      return weekTasks;
    } catch (e) {
      console.warn('플래너 태스크 로드 실패:', e);
      renderWeeklyPlan([]);
      return [];
    }
  }

  /* ── 이번 주 시작일 ── */
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // 월요일 기준
    d.setHours(0,0,0,0);
    return d;
  }

  function renderWeeklyPlan(tasks) {
    const container = el('weeklyPlanList');
    if (!container) return;

    if (!tasks.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;">
          이번 주 플래너가 없습니다.<br>
          <a href="exam.html" style="color:#4f46e5;font-weight:600;">시험 플래너 만들기 →</a>
        </div>`;
      return;
    }

    const DAYS = ['월','화','수','목','금','토','일'];
    const dayOf = (dateStr) => {
      const d = new Date(dateStr);
      return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
    };

    const SUBJ_COLORS = {
      '수학':'#dbeafe','영어':'#d1fae5','국어':'#ede9fe',
      '과학':'#fef3c7','사회':'#fce7f3','한국사':'#fee2e2'
    };

    // 오늘 날짜 기준 오늘 것 먼저, 나머지 순서
    const sorted = [...tasks].sort((a, b) => {
      if (a.task_date === todayStr && b.task_date !== todayStr) return -1;
      if (b.task_date === todayStr && a.task_date !== todayStr) return 1;
      return a.task_date.localeCompare(b.task_date);
    });

    container.innerHTML = sorted.slice(0, 6).map(t => `
      <div class="plan-item ${t.is_done ? 'done-item' : ''}" style="cursor:pointer;"
        onclick="location.href='exam.html'">
        <div class="plan-check ${t.is_done ? 'done' : ''}">
          ${t.is_done ? '<i class="fas fa-check"></i>' : ''}
        </div>
        <div class="plan-item-info">
          <div class="plan-item-subject" style="background:${SUBJ_COLORS[t.subject] || '#f3f4f6'};
            color:#374151;padding:1px 6px;border-radius:4px;display:inline-block;font-size:11px;margin-bottom:2px;">
            ${t.subject || '기타'}</div>
          <div class="plan-item-title">${t.task_content || '-'}</div>
        </div>
        <div class="plan-item-day">${t.task_date ? dayOf(t.task_date) : '-'}</div>
      </div>`).join('');
  }

  /* ═══════════════════════════════════════════
     7. 알림 패널 렌더
  ═══════════════════════════════════════════ */
  function renderNotifPanel(notices, readSet) {
    const container = el('notifList');
    if (!container) return;

    const items = (notices || []).filter(n => !readSet?.has(n.id)).slice(0, 5);

    if (!items.length) {
      container.innerHTML = `<li class="notif-item" style="text-align:center;padding:16px;color:#9ca3af;">
        새 알림이 없습니다.</li>`;
      const dot = document.querySelector('.notif-dot');
      if (dot) dot.style.display = 'none';
      return;
    }

    container.innerHTML = items.map(n => `
      <li class="notif-item unread"
        onclick="location.href='notice.html'" style="cursor:pointer;">
        ${n.is_important ? '🔴 ' : '📢 '}${n.title || '공지'}
      </li>`).join('');
  }

  /* ═══════════════════════════════════════════
     8. 피드백 리스트 (수행평가 피드백에서)
  ═══════════════════════════════════════════ */
  async function loadFeedbacks() {
    try {
      const res  = await fetch(`${_API}/${TABLE_ASSESSMENTS}?limit=200`);
      const data = await res.json();
      const list = (data.data || [])
        .filter(a => a.student_id === studentId && a.feedback)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, 3);

      renderFeedbackList(list);
    } catch (e) {
      console.warn('피드백 로드 실패:', e);
      renderFeedbackList([]);
    }
  }

  function renderFeedbackList(list) {
    const container = el('feedbackList');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;">
        아직 피드백이 없습니다.</div>`;
      return;
    }

    container.innerHTML = list.map(a => {
      const dateStr = a.updated_at
        ? new Date(a.updated_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        : '';
      return `
        <div class="feedback-item" onclick="location.href='assessment.html'" style="cursor:pointer;">
          <div class="feedback-meta">
            <span class="feedback-teacher">
              <i class="fas fa-user-tie" style="margin-right:4px;font-size:11px;"></i>
              ${a.admin_name || '선생님'} · ${a.subject || ''}
            </span>
            <span class="feedback-date">${dateStr}</span>
          </div>
          <div class="feedback-text">${a.feedback || ''}</div>
        </div>`;
    }).join('');
  }

  await loadFeedbacks();

  /* ═══════════════════════════════════════════
     9. 알림 패널 토글
  ═══════════════════════════════════════════ */
  const notifBtn     = el('notifBtn');
  const notifPanel   = el('notifPanel');
  const notifOverlay = el('notifOverlay');
  const notifClose   = el('notifClose');

  notifBtn?.addEventListener('click', () => {
    notifPanel?.classList.toggle('open');
    notifOverlay?.classList.toggle('show');
  });
  notifClose?.addEventListener('click', closeNotif);
  notifOverlay?.addEventListener('click', closeNotif);

  function closeNotif() {
    notifPanel?.classList.remove('open');
    notifOverlay?.classList.remove('show');
  }

  /* ═══════════════════════════════════════════
     10. 사이드바 토글 (표준 — sidebar-dim 연동)
  ═══════════════════════════════════════════ */
  // 인라인 스크립트에서 통합 처리하므로 여기서는 등록하지 않음
  // (중복 이벤트 방지)

  /* ── 로그아웃 ── */
  el('logoutBtn')?.addEventListener('click', e => {
    e.preventDefault();
    // localStorage + sessionStorage 모두 삭제
    ['dvl_user','dvl_session','dvSession',
     'dvl_student_session','dvl_parent_session'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    sessionStorage.clear();
    window.location.href = '../login.html';
  });

})();

/* ═══════════════════════════════════════════
   관리자 대리열람 종료 — 관리자 화면으로 복귀
═══════════════════════════════════════════ */
function closeProxyView() {
  // 대리열람 플래그 제거
  localStorage.removeItem('dvl_admin_proxy_view');
  localStorage.removeItem('dvl_admin_proxy_name');
  localStorage.removeItem('dvl_student_session');
  sessionStorage.removeItem('dvl_admin_proxy_view');
  sessionStorage.removeItem('dvl_admin_proxy_name');

  // 탭 닫기 시도 (새 탭으로 열린 경우)
  if (window.opener && !window.opener.closed) {
    window.close();
  } else {
    // 직접 탐색된 경우 관리자 학생 관리 페이지로 이동
    window.location.href = '../admin/students.html';
  }
}
