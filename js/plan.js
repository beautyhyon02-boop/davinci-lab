/* =============================================
   학습 플랜 & 일일 기록 JavaScript
   ※ 모든 학생 데이터는 DB(student_profiles)에서 동적으로 로드
   ※ status='active' 인 학생만 표시
   ============================================= */

/* ──────────────────────────────────────────
   상태 변수
────────────────────────────────────────── */
let PLAN_STUDENTS      = [];          // DB에서 로드한 승인 학생 목록
let currentPlanStudent = null;        // 현재 선택된 학생 ID
let currentWeek        = new Date();
let editingPlanItem    = null;

/* ──────────────────────────────────────────
   DB API 기본 경로 (관리자 페이지는 한 단계 위)
────────────────────────────────────────── */
const PLAN_API_BASE = 'tables';

/* ──────────────────────────────────────────
   Toast
────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  if (window.showAdminToast) { window.showAdminToast(msg, type === 'error' ? 'warn' : type); return; }
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(c);
  }
  const col = { success: '#163A33', info: '#245A4E', error: '#ef4444', warn: '#d97706' };
  const t = document.createElement('div');
  t.style.cssText = `background:${col[type] || col.info};color:#fff;padding:12px 22px;border-radius:999px;font-size:13.5px;font-weight:600;font-family:'Noto Sans KR',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2);opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;pointer-events:auto;white-space:nowrap;max-width:90vw;`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; }));
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 350); }, 3500);
}

/* ──────────────────────────────────────────
   DB에서 승인된 학생 목록 로드
────────────────────────────────────────── */
async function loadStudentsFromDB() {
  try {
    // 캐시 무시: 매번 최신 DB 데이터 요청
    const ts   = Date.now();
    const res  = await fetch(`${PLAN_API_BASE}/student_profiles?limit=200&_t=${ts}`, {
      cache: 'no-store'
    });
    const data = await res.json();
    const rows = data.data || [];

    // status가 '재원', 'active', 또는 기타 비pending 상태인 학생 포함
    PLAN_STUDENTS = rows
      .filter(r => r.student_id && r.name &&
                   r.status !== 'pending' && r.status !== '휴원' && r.status !== '졸업')
      .map(r => ({
        id:     r.student_id,
        dbId:   r.id,
        name:   r.name,
        step:   r.stage || '1단계',
        school: r.school || '',
        grade:  r.grade  || '',
      }));
    console.log('[plan.js] 학생 로드 완료:', PLAN_STUDENTS.length, '명');
    return true;
  } catch (e) {
    console.error('[plan.js] 학생 로드 오류:', e);
    return false;
  }
}

/* ──────────────────────────────────────────
   학생 탭 렌더
────────────────────────────────────────── */
function renderStudentTabs() {
  const container = document.getElementById('planStudentTabs');
  if (!container) return;

  if (!PLAN_STUDENTS.length) {
    container.innerHTML = '<p style="padding:16px;color:#94a3b8;font-size:13px;">승인된 학생이 없습니다.</p>';
    return;
  }

  container.innerHTML = PLAN_STUDENTS.map(s =>
    `<button class="stu-tab ${s.id === currentPlanStudent ? 'active' : ''}" data-sid="${s.id}">
      ${s.name} <span style="font-size:11px;opacity:.7">${s.step}</span>
    </button>`
  ).join('');

  container.querySelectorAll('.stu-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPlanStudent = btn.dataset.sid;
      renderStudentTabs();
      loadAndRenderPlan();
    });
  });
}

/* ──────────────────────────────────────────
   주간 헤더
────────────────────────────────────────── */
function getWeekLabel(d) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  return `${mon.getMonth()+1}월 ${mon.getDate()}일 ~ ${fri.getMonth()+1}월 ${fri.getDate()}일`;
}

function getWeekRange(d) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end:   sun.toISOString().slice(0, 10),
  };
}

document.getElementById('prevWeek')?.addEventListener('click', () => {
  currentWeek.setDate(currentWeek.getDate() - 7);
  document.getElementById('weekLabel').textContent = getWeekLabel(currentWeek);
  if (currentPlanStudent) loadAndRenderPlan();
});
document.getElementById('nextWeek')?.addEventListener('click', () => {
  currentWeek.setDate(currentWeek.getDate() + 7);
  document.getElementById('weekLabel').textContent = getWeekLabel(currentWeek);
  if (currentPlanStudent) loadAndRenderPlan();
});

/* ──────────────────────────────────────────
   학습 플랜 DB 조회 & 렌더
────────────────────────────────────────── */
async function loadAndRenderPlan() {
  if (!currentPlanStudent) return;

  const stu   = PLAN_STUDENTS.find(s => s.id === currentPlanStudent);
  const title = document.getElementById('planTableTitle');
  if (title && stu) title.innerHTML = `<i class="fas fa-tasks"></i> ${stu.name} – 이번 주 학습 플랜`;

  const tbody = document.getElementById('planTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</td></tr>';

  const { start, end } = getWeekRange(currentWeek);

  try {
    const res  = await fetch(`${PLAN_API_BASE}/planner_tasks?search=${encodeURIComponent(currentPlanStudent)}&limit=1000`);
    const data = await res.json();
    const tasks = (data.data || []).filter(t =>
      t.student_id === currentPlanStudent &&
      t.task_date >= start && t.task_date <= end
    );

    renderPlanTable(tasks);
    updatePlanKPIs(tasks);
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#ef4444;">데이터 로드 실패</td></tr>';
  }
}

function renderPlanTable(tasks = []) {
  const tbody = document.getElementById('planTbody');
  if (!tbody) return;

  if (!tasks.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">
      이번 주 등록된 플랜이 없습니다.<br>
      <span style="font-size:12px;">"항목 추가" 버튼으로 플랜을 작성하세요.</span>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => `
    <tr data-tid="${t.id}">
      <td><strong>${t.subject || '-'}</strong></td>
      <td style="max-width:240px;">${t.task_content || '-'}</td>
      <td>${t.task_date || '-'}</td>
      <td>
        <select class="plan-status-select" onchange="updatePlanTaskStatus('${t.id}', this.value)">
          <option value="0" ${!t.is_done ? 'selected' : ''}>미완료</option>
          <option value="1" ${t.is_done  ? 'selected' : ''}>완료</option>
        </select>
      </td>
      <td style="font-size:12.5px;color:var(--text-500);">${t.student_memo || '-'}</td>
      <td style="font-size:12.5px;color:var(--mint-400);max-width:180px;">${t.admin_comment || '-'}</td>
      <td>
        <button class="tbl-btn tbl-btn-outline" onclick="editPlanTask('${t.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="tbl-btn tbl-btn-danger" style="margin-left:4px;" onclick="deletePlanTask('${t.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function updatePlanKPIs(tasks = []) {
  const total = tasks.length;
  const done  = tasks.filter(t => t.is_done).length;
  const todo  = total - done;
  const rate  = total ? Math.round(done / total * 100) : 0;

  document.getElementById('planKpiTotal') && (document.getElementById('planKpiTotal').textContent = total);
  document.getElementById('planKpiDone')  && (document.getElementById('planKpiDone').textContent  = done);
  document.getElementById('planKpiIng')   && (document.getElementById('planKpiIng').textContent   = 0);
  document.getElementById('planKpiTodo')  && (document.getElementById('planKpiTodo').textContent  = todo);
  document.getElementById('planKpiRate')  && (document.getElementById('planKpiRate').textContent  = rate + '%');
}

/* 플랜 상태 업데이트 */
window.updatePlanTaskStatus = async (taskId, val) => {
  try {
    await fetch(`${PLAN_API_BASE}/planner_tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_done: val === '1' }),
    });
    showToast('✅ 상태가 업데이트되었습니다.', 'success');
    loadAndRenderPlan();
  } catch (e) { showToast('업데이트 실패', 'error'); }
};

/* 플랜 삭제 */
window.deletePlanTask = async (taskId) => {
  if (!confirm('이 플랜 항목을 삭제할까요?')) return;
  try {
    await fetch(`${PLAN_API_BASE}/planner_tasks/${taskId}`, { method: 'DELETE' });
    showToast('🗑 삭제되었습니다.', 'info');
    loadAndRenderPlan();
  } catch (e) { showToast('삭제 실패', 'error'); }
};

/* 플랜 수정 */
let editingTaskId = null;
window.editPlanTask = async (taskId) => {
  const res  = await fetch(`${PLAN_API_BASE}/planner_tasks/${taskId}`);
  const task = await res.json();
  editingTaskId = taskId;
  editingPlanItem = task;

  document.getElementById('planItemModalTitle').textContent = '플랜 항목 수정';
  document.getElementById('piSubject').value  = task.subject       || '';
  document.getElementById('piContent').value  = task.task_content  || '';
  document.getElementById('piTarget').value   = task.task_date     || '';
  document.getElementById('piStatus').value   = task.is_done ? '1' : '0';
  document.getElementById('piComment').value  = task.admin_comment || '';
  document.getElementById('planItemModal')?.classList.add('open');
};

/* ──────────────────────────────────────────
   전체 학생 플랜 현황 (overview 탭)
────────────────────────────────────────── */
async function renderAllPlanOverview() {
  const tbody = document.getElementById('allPlanTbody');
  if (!tbody) return;

  if (!PLAN_STUDENTS.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">승인된 학생이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></td></tr>';

  try {
    const res  = await fetch(`${PLAN_API_BASE}/planner_tasks?limit=500`);
    const data = await res.json();
    const allTasks = data.data || [];
    const today = new Date().toISOString().slice(0, 10);

    tbody.innerHTML = PLAN_STUDENTS.map(s => {
      const tasks = allTasks.filter(t => t.student_id === s.id);
      const total = tasks.length;
      const done  = tasks.filter(t => t.is_done).length;
      const rate  = total ? Math.round(done / total * 100) : 0;
      const rateCol = rate >= 80 ? '#16a34a' : rate >= 50 ? 'var(--mint-400)' : 'var(--text-300)';
      const stepCls = s.step.includes('+') ? 'step-3c' : s.step.startsWith('3') ? 'step-3' : s.step.startsWith('2') ? 'step-2' : 'step-1';
      return `<tr>
        <td><span class="student-name">${s.name}</span></td>
        <td><span class="step-pill ${stepCls}">${s.step}</span></td>
        <td>${total}개</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:var(--bg-section);border-radius:999px;overflow:hidden;">
              <div style="width:${rate}%;height:100%;background:${rateCol};border-radius:999px;"></div>
            </div>
            <span style="font-weight:700;color:${rateCol};font-size:13px;min-width:36px;">${rate}%</span>
          </div>
        </td>
        <td style="font-size:12.5px;color:var(--text-500);">${s.school || '-'}</td>
        <td style="font-size:12.5px;color:var(--text-500);">${s.grade || '-'}</td>
        <td>
          <button class="tbl-btn tbl-btn-primary" onclick="jumpToStudent('${s.id}')">보기</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">데이터 로드 실패</td></tr>';
  }
}

window.jumpToStudent = (sid) => {
  currentPlanStudent = sid;
  renderStudentTabs();
  loadAndRenderPlan();

  // 플랜 탭으로 전환
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
  const planTab = document.querySelector('.main-tab[data-main="plan"]');
  if (planTab) {
    planTab.classList.add('active');
    document.getElementById('mainPanel-plan')?.classList.add('active');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ──────────────────────────────────────────
   일일 기록 (student_logs 기반)
────────────────────────────────────────── */
let dailyDate = new Date();

function formatDailyDate(d) {
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

async function renderDailyGrid() {
  const label = document.getElementById('dailyDateLabel');
  if (label) label.textContent = formatDailyDate(dailyDate);

  const grid = document.getElementById('dailyGrid');
  if (!grid) return;

  if (!PLAN_STUDENTS.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">승인된 학생이 없습니다.</div>';
    return;
  }

  grid.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></div>';

  const dateStr = dailyDate.toISOString().slice(0, 10);

  try {
    const res  = await fetch(`${PLAN_API_BASE}/student_logs?limit=500`);
    const data = await res.json();
    const allLogs = data.data || [];

    // log_type별 아이콘·색상
    const LOG_META = {
      plan_done:  { icon: 'fa-check-circle', color: '#16a34a', bg: '#dcfce7', label: '플랜 완료' },
      exam_timer: { icon: 'fa-stopwatch',    color: '#2563eb', bg: '#dbeafe', label: '순공 타이머' },
      ai_log:     { icon: 'fa-robot',        color: '#7c3aed', bg: '#ede9fe', label: 'AI 로그' },
      golden_time:{ icon: 'fa-star',         color: '#d97706', bg: '#fef3c7', label: '황금시간' },
      default:    { icon: 'fa-pen-alt',      color: '#475569', bg: '#f1f5f9', label: '기록' },
    };
    function getLogMeta(type) { return LOG_META[type] || LOG_META.default; }

    grid.innerHTML = PLAN_STUDENTS.map(s => {
      const logs = allLogs.filter(l => {
        if (l.student_id !== s.id) return false;
        let logDate = '';
        if (l.log_date) {
          logDate = l.log_date.slice(0, 10);
        } else if (l.created_at) {
          const ts = Number(l.created_at);
          logDate = (!isNaN(ts) && ts > 1e10)
            ? new Date(ts).toISOString().slice(0, 10)
            : String(l.created_at).slice(0, 10);
        }
        return logDate === dateStr;
      });

      const stepStr   = s.step || '1단계';
      const stepCls   = stepStr.includes('+') ? 'step-3c' : stepStr.startsWith('3') ? 'step-3' : stepStr.startsWith('2') ? 'step-2' : 'step-1';
      const totalMins = logs.reduce((acc, l) => acc + (Number(l.duration_min) || 0), 0);
      const hasLogs   = logs.length > 0;

      return `
      <div class="daily-card" style="border-left:4px solid ${hasLogs ? 'var(--mint-400)' : '#e2e8f0'};">
        <div class="daily-card-header">
          <div class="daily-card-student">
            <div class="daily-avatar" style="background:${hasLogs ? 'var(--mint-400)' : '#e2e8f0'};color:${hasLogs ? '#fff' : '#94a3b8'};">${s.name[0]}</div>
            <div>
              <div class="daily-student-name">${s.name}</div>
              <div class="daily-student-step">${s.step} · ${s.school || '-'}</div>
            </div>
          </div>
          <span class="step-pill ${stepCls}" style="font-size:12px;">${logs.length}건</span>
        </div>
        <div class="daily-card-body">
          <div class="daily-session-list">
            ${hasLogs ? logs.map((l, i) => {
              const m = getLogMeta(l.log_type);
              const dur = l.duration_min ? `<span style="font-size:11px;color:#64748b;margin-left:6px;">${l.duration_min}분</span>` : '';
              const subj = l.subject ? `<span style="display:inline-block;padding:1px 7px;border-radius:999px;background:${m.bg};color:${m.color};font-size:11px;font-weight:700;margin-right:4px;">${l.subject}</span>` : '';
              return `
              <div class="daily-session-item" style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                <span style="width:22px;height:22px;border-radius:50%;background:${m.bg};color:${m.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;">
                  <i class="fas ${m.icon}"></i>
                </span>
                <span style="font-size:13px;line-height:1.5;flex:1;">
                  ${subj}<strong style="color:${m.color};">${m.label}</strong>${dur}<br>
                  <span style="color:#475569;">${l.title || l.content || '-'}</span>
                </span>
              </div>`;
            }).join('') : '<p style="font-size:13px;color:var(--text-300);padding:12px 0;text-align:center;"><i class="fas fa-moon" style="margin-right:6px;opacity:.4;"></i>이 날 기록 없음</p>'}
          </div>
        </div>
        <div class="daily-card-footer" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #f1f5f9;margin-top:4px;">
          <span style="font-size:12.5px;color:var(--text-500);">총 <strong style="color:var(--text-900);">${logs.length}건</strong> 기록</span>
          ${totalMins > 0 ? `<span style="font-size:12.5px;font-weight:700;color:#2563eb;"><i class="fas fa-stopwatch" style="margin-right:3px;"></i>${totalMins}분</span>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    console.error('[plan.js] 일일 기록 로드 오류:', e);
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;"><i class="fas fa-exclamation-circle" style="margin-bottom:8px;display:block;font-size:24px;"></i>데이터 로드 실패: ' + e.message + '</div>';
  }
}

document.getElementById('prevDayPlan')?.addEventListener('click', () => {
  dailyDate.setDate(dailyDate.getDate() - 1);
  renderDailyGrid();
});
document.getElementById('nextDayPlan')?.addEventListener('click', () => {
  dailyDate.setDate(dailyDate.getDate() + 1);
  renderDailyGrid();
});
document.getElementById('dailyTodayBtn')?.addEventListener('click', () => {
  dailyDate = new Date();
  renderDailyGrid();
});

/* ──────────────────────────────────────────
   Main 탭 전환
────────────────────────────────────────── */
document.querySelectorAll('.main-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.main;
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`mainPanel-${target}`)?.classList.add('active');

    const btn = document.getElementById('writePlanBtn');
    if (btn) btn.innerHTML = target === 'plan'
      ? '<i class="fas fa-plus"></i> 플랜 작성'
      : '<i class="fas fa-plus"></i> 기록 작성';

    if (target === 'daily') {
      // 학생 목록이 아직 안 로드됐으면 먼저 로드 후 렌더
      if (!PLAN_STUDENTS.length) {
        loadStudentsFromDB().then(() => renderDailyGrid());
      } else {
        renderDailyGrid();
      }
    }
    if (target === 'overview') renderAllPlanOverview();
  });
});

/* ──────────────────────────────────────────
   플랜 항목 추가/수정 모달
────────────────────────────────────────── */
document.getElementById('addPlanItemBtn')?.addEventListener('click', () => {
  editingTaskId   = null;
  editingPlanItem = null;
  document.getElementById('planItemModalTitle').textContent = '플랜 항목 추가';
  ['piSubject', 'piContent', 'piTarget', 'piComment'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // 기본 날짜를 오늘로
  const dateEl = document.getElementById('piTarget');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  if (document.getElementById('piStatus')) document.getElementById('piStatus').value = '0';
  document.getElementById('planItemModal')?.classList.add('open');
});

document.getElementById('writePlanBtn')?.addEventListener('click', () => {
  if (!currentPlanStudent) {
    showToast('💡 좌측 학생 탭에서 학생을 먼저 선택하세요.', 'info');
    return;
  }
  document.getElementById('addPlanItemBtn')?.click();
});

const closePlanModal = () => document.getElementById('planItemModal')?.classList.remove('open');
document.getElementById('planItemClose')?.addEventListener('click',  closePlanModal);
document.getElementById('planItemCancel')?.addEventListener('click', closePlanModal);
document.getElementById('planItemModal')?.addEventListener('click', e => {
  if (e.target.id === 'planItemModal') closePlanModal();
});

document.getElementById('planItemSubmit')?.addEventListener('click', async () => {
  if (!currentPlanStudent) { showToast('학생을 먼저 선택하세요.', 'error'); return; }
  const sub = document.getElementById('piSubject')?.value;
  const con = document.getElementById('piContent')?.value.trim();
  if (!sub || !con) { showToast('과목과 내용을 입력해주세요.', 'error'); return; }

  const payload = {
    student_id:    currentPlanStudent,
    subject:       sub,
    task_content:  con,
    task_date:     document.getElementById('piTarget')?.value || new Date().toISOString().slice(0, 10),
    is_done:       document.getElementById('piStatus')?.value === '1',
    admin_comment: document.getElementById('piComment')?.value || '',
    planner_id:    '',
    week_num:      0,
  };

  try {
    if (editingTaskId) {
      await fetch(`${PLAN_API_BASE}/planner_tasks/${editingTaskId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      showToast('✅ 플랜 항목이 수정되었습니다.', 'success');
    } else {
      await fetch(`${PLAN_API_BASE}/planner_tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      showToast('✅ 플랜 항목이 추가되었습니다.', 'success');
    }
    closePlanModal();
    loadAndRenderPlan();
    renderAllPlanOverview();
  } catch (e) {
    showToast('저장 실패: ' + e.message, 'error');
  }
});

/* ──────────────────────────────────────────
   Init
────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  /* 세션 검증: dvl-session.js + admin-common.js 가 이미 처리 */
  if (!window._dvlAdminSession) return;

  document.getElementById('weekLabel').textContent = getWeekLabel(currentWeek);

  const ok = await loadStudentsFromDB();
  if (!ok || !PLAN_STUDENTS.length) {
    showToast('⚠️ 승인된 학생이 없거나 데이터를 불러오지 못했습니다.', 'warn');
  }

  // 첫 번째 학생 자동 선택
  if (PLAN_STUDENTS.length) currentPlanStudent = PLAN_STUDENTS[0].id;

  renderStudentTabs();
  await loadAndRenderPlan();
  updatePlanKPIs([]);
  renderAllPlanOverview();
  renderDailyGrid();

  /* ── URL ?tab=daily 처리: daily.html에서 리다이렉트 시 일일 기록 탭 자동 활성화 ── */
  const urlTab = new URLSearchParams(location.search).get('tab');
  if (urlTab === 'daily') {
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
    const dailyTab = document.querySelector('.main-tab[data-main="daily"]');
    if (dailyTab) dailyTab.classList.add('active');
    document.getElementById('mainPanel-daily')?.classList.add('active');
    const btn = document.getElementById('writePlanBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> 기록 작성';
    renderDailyGrid();
  }
});
