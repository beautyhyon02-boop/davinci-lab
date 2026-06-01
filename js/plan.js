/* =============================================
   학습 플랜 & 일일 기록 JavaScript
   통합 패치본
   - student_profiles 로드 500 오류(_t 파라미터) 제거
   - planner_tasks 조회 시 search 대신 student_id 필터 사용
   - 관리자 플랜/일일기록 렌더 안정화
   ============================================= */

let PLAN_STUDENTS = [];
let currentPlanStudent = null;
let currentWeek = new Date();
let dailyDate = new Date();
let editingTaskId = null;

const PLAN_API_BASE = '/tables';

function showToast(msg, type = 'info') {
  if (window.showAdminToast) {
    window.showAdminToast(msg, type === 'error' ? 'warn' : type);
    return;
  }

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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
  }));
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Accept': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `API 오류 (${res.status})`);
  }
  return json;
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekLabel(d) {
  const mon = new Date(d);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return `${mon.getMonth() + 1}월 ${mon.getDate()}일 ~ ${fri.getMonth() + 1}월 ${fri.getDate()}일`;
}

function getWeekRange(d) {
  const mon = new Date(d);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: formatDate(mon), end: formatDate(sun) };
}

function getStepClass(step) {
  const str = String(step || '1단계');
  if (str.includes('+')) return 'step-3c';
  if (str.startsWith('3')) return 'step-3';
  if (str.startsWith('2')) return 'step-2';
  return 'step-1';
}

async function loadStudentsFromDB() {
  try {
    const data = await fetchJson(`${PLAN_API_BASE}/student_profiles?limit=200&sort=created_at.desc`);
    const rows = data.data || [];

    PLAN_STUDENTS = rows
      .filter(r => {
        const hasIdentity = !!r.student_id && !!r.name;
        const status = String(r.status || '').trim().toLowerCase();
        const approvalStatus = String(r.approval_status || '').trim().toLowerCase();
        const approved = r.approved === true || approvalStatus === 'approved' || status === 'active';
        const blocked = ['pending', '휴원', '졸업', 'withdrawn', 'inactive', 'rejected'].includes(status);
        return hasIdentity && approved && !blocked;
      })
      .map(r => ({
        id: r.student_id,
        dbId: r.id,
        name: r.name,
        step: r.stage || '1단계',
        school: r.school || '',
        grade: r.grade || ''
      }));

    console.log('[plan.js] 학생 로드 완료:', PLAN_STUDENTS.length, '명');
    return true;
  } catch (e) {
    console.error('[plan.js] 학생 로드 오류:', e);
    showToast(`학생 목록을 불러오지 못했습니다: ${e.message}`, 'error');
    PLAN_STUDENTS = [];
    return false;
  }
}

function renderStudentTabs() {
  const container = document.getElementById('planStudentTabs');
  if (!container) return;

  if (!PLAN_STUDENTS.length) {
    container.innerHTML = '<p style="padding:16px;color:#94a3b8;font-size:13px;">승인된 학생이 없습니다.</p>';
    return;
  }

  container.innerHTML = PLAN_STUDENTS.map(s => `
    <button class="stu-tab ${s.id === currentPlanStudent ? 'active' : ''}" data-sid="${escapeHtml(s.id)}">
      ${escapeHtml(s.name)} <span style="font-size:11px;opacity:.7">${escapeHtml(s.step)}</span>
    </button>
  `).join('');

  container.querySelectorAll('.stu-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPlanStudent = btn.dataset.sid;
      renderStudentTabs();
      loadAndRenderPlan();
    });
  });
}

async function loadAndRenderPlan() {
  if (!currentPlanStudent) return;

  const stu = PLAN_STUDENTS.find(s => s.id === currentPlanStudent);
  const title = document.getElementById('planTableTitle');
  if (title && stu) title.innerHTML = `<i class="fas fa-tasks"></i> ${escapeHtml(stu.name)} – 이번 주 학습 플랜`;

  const tbody = document.getElementById('planTbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</td></tr>';
  }

  const { start, end } = getWeekRange(currentWeek);

  try {
    const data = await fetchJson(
      `${PLAN_API_BASE}/planner_tasks?student_id=eq.${encodeURIComponent(currentPlanStudent)}&task_date=gte.${start}&task_date=lte.${end}&limit=1000&sort=task_date.asc`
    );

    const tasks = (data.data || []).filter(t => String(t.student_id || '').trim() === currentPlanStudent);
    renderPlanTable(tasks);
    updatePlanKPIs(tasks);
  } catch (e) {
    console.error('[plan.js] 플랜 로드 오류:', e);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#ef4444;">데이터 로드 실패: ${escapeHtml(e.message)}</td></tr>`;
    }
    updatePlanKPIs([]);
  }
}

function renderPlanTable(tasks = []) {
  const tbody = document.getElementById('planTbody');
  if (!tbody) return;

  if (!tasks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">
          이번 주 등록된 플랜이 없습니다.<br>
          <span style="font-size:12px;">"항목 추가" 버튼으로 플랜을 작성하세요.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tasks.map(t => `
    <tr data-tid="${t.id}">
      <td><strong>${escapeHtml(safeText(t.subject))}</strong></td>
      <td style="max-width:240px;">${escapeHtml(safeText(t.task_content))}</td>
      <td>${escapeHtml(safeText(t.task_date))}</td>
      <td>
        <select class="plan-status-select" onchange="updatePlanTaskStatus('${t.id}', this.value)">
          <option value="0" ${!t.is_done ? 'selected' : ''}>미완료</option>
          <option value="1" ${t.is_done ? 'selected' : ''}>완료</option>
        </select>
      </td>
      <td style="font-size:12.5px;color:var(--text-500);">${escapeHtml(safeText(t.student_memo, '-'))}</td>
      <td style="font-size:12.5px;color:var(--mint-400);max-width:180px;">${escapeHtml(safeText(t.admin_comment, '-'))}</td>
      <td>
        <button class="tbl-btn tbl-btn-outline" onclick="editPlanTask('${t.id}')"><i class="fas fa-edit"></i></button>
        <button class="tbl-btn tbl-btn-danger" style="margin-left:4px;" onclick="deletePlanTask('${t.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function updatePlanKPIs(tasks = []) {
  const total = tasks.length;
  const done = tasks.filter(t => !!t.is_done).length;
  const todo = total - done;
  const rate = total ? Math.round((done / total) * 100) : 0;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('planKpiTotal', total);
  setText('planKpiDone', done);
  setText('planKpiIng', 0);
  setText('planKpiTodo', todo);
  setText('planKpiRate', `${rate}%`);
}

window.updatePlanTaskStatus = async (taskId, value) => {
  try {
    await fetchJson(`${PLAN_API_BASE}/planner_tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_done: value === '1' })
    });
    showToast('✅ 상태가 업데이트되었습니다.', 'success');
    await loadAndRenderPlan();
    await renderAllPlanOverview();
  } catch (e) {
    showToast(`업데이트 실패: ${e.message}`, 'error');
  }
};

window.deletePlanTask = async (taskId) => {
  if (!confirm('이 플랜 항목을 삭제할까요?')) return;
  try {
    await fetchJson(`${PLAN_API_BASE}/planner_tasks/${taskId}`, { method: 'DELETE' });
    showToast('🗑 삭제되었습니다.', 'info');
    await loadAndRenderPlan();
    await renderAllPlanOverview();
  } catch (e) {
    showToast(`삭제 실패: ${e.message}`, 'error');
  }
};

window.editPlanTask = async (taskId) => {
  try {
    const task = await fetchJson(`${PLAN_API_BASE}/planner_tasks/${taskId}`);
    editingTaskId = taskId;

    document.getElementById('planItemModalTitle').textContent = '플랜 항목 수정';
    document.getElementById('piSubject').value = task.subject || '';
    document.getElementById('piContent').value = task.task_content || '';
    document.getElementById('piTarget').value = task.task_date || '';
    document.getElementById('piStatus').value = task.is_done ? '1' : '0';
    document.getElementById('piComment').value = task.admin_comment || '';
    document.getElementById('planItemModal')?.classList.add('open');
  } catch (e) {
    showToast(`플랜 불러오기 실패: ${e.message}`, 'error');
  }
};

async function renderAllPlanOverview() {
  const tbody = document.getElementById('allPlanTbody');
  if (!tbody) return;

  if (!PLAN_STUDENTS.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">승인된 학생이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i></td></tr>';

  try {
    const data = await fetchJson(`${PLAN_API_BASE}/planner_tasks?limit=1000&sort=task_date.desc`);
    const allTasks = data.data || [];

    tbody.innerHTML = PLAN_STUDENTS.map(s => {
      const tasks = allTasks.filter(t => String(t.student_id || '').trim() === s.id);
      const total = tasks.length;
      const done = tasks.filter(t => !!t.is_done).length;
      const rate = total ? Math.round((done / total) * 100) : 0;
      const rateCol = rate >= 80 ? '#16a34a' : rate >= 50 ? 'var(--mint-400)' : 'var(--text-300)';

      const lastUpdated = tasks[0]?.updated_at || tasks[0]?.created_at || '';
      const lastText = lastUpdated ? String(lastUpdated).slice(0, 16).replace('T', ' ') : '-';

      return `
        <tr>
          <td><span class="student-name">${escapeHtml(s.name)}</span></td>
          <td><span class="step-pill ${getStepClass(s.step)}">${escapeHtml(s.step)}</span></td>
          <td>${total}개</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:var(--bg-section);border-radius:999px;overflow:hidden;">
                <div style="width:${rate}%;height:100%;background:${rateCol};border-radius:999px;"></div>
              </div>
              <span style="font-weight:700;color:${rateCol};font-size:13px;min-width:36px;">${rate}%</span>
            </div>
          </td>
          <td style="font-size:12.5px;color:var(--text-500);">${escapeHtml(lastText)}</td>
          <td style="font-size:12.5px;color:var(--text-500);">${escapeHtml(s.school || '-')} · ${escapeHtml(s.grade || '-')}</td>
          <td><button class="tbl-btn tbl-btn-primary" onclick="jumpToStudent('${escapeHtml(s.id)}')">보기</button></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('[plan.js] 전체 플랜 현황 로드 오류:', e);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;">데이터 로드 실패: ${escapeHtml(e.message)}</td></tr>`;
  }
}

window.jumpToStudent = async sid => {
  currentPlanStudent = sid;
  renderStudentTabs();
  await loadAndRenderPlan();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function formatDailyDate(d) {
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
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
  const dateStr = formatDate(dailyDate);

  try {
    const data = await fetchJson(`${PLAN_API_BASE}/student_logs?limit=1000&sort=created_at.desc`);
    const allLogs = data.data || [];

    const LOG_META = {
      plan_done: { icon: 'fa-check-circle', color: '#16a34a', bg: '#dcfce7', label: '플랜 완료' },
      exam_timer: { icon: 'fa-stopwatch', color: '#2563eb', bg: '#dbeafe', label: '순공 타이머' },
      ai_log: { icon: 'fa-robot', color: '#7c3aed', bg: '#ede9fe', label: 'AI 로그' },
      golden_time: { icon: 'fa-star', color: '#d97706', bg: '#fef3c7', label: '황금시간' },
      default: { icon: 'fa-pen-alt', color: '#475569', bg: '#f1f5f9', label: '기록' }
    };

    const getLogMeta = type => LOG_META[type] || LOG_META.default;

    grid.innerHTML = PLAN_STUDENTS.map(s => {
      const logs = allLogs.filter(l => {
        if (String(l.student_id || '').trim() !== s.id) return false;
        let logDate = '';
        if (l.log_date) logDate = String(l.log_date).slice(0, 10);
        else if (l.created_at) logDate = String(l.created_at).slice(0, 10);
        return logDate === dateStr;
      });

      const totalMins = logs.reduce((acc, l) => acc + (Number(l.duration_min) || 0), 0);
      const hasLogs = logs.length > 0;

      return `
        <div class="daily-card" style="border-left:4px solid ${hasLogs ? 'var(--mint-400)' : '#e2e8f0'};">
          <div class="daily-card-header">
            <div class="daily-card-student">
              <div class="daily-avatar" style="background:${hasLogs ? 'var(--mint-400)' : '#e2e8f0'};color:${hasLogs ? '#fff' : '#94a3b8'};">${escapeHtml(s.name[0] || '학')}</div>
              <div>
                <div class="daily-student-name">${escapeHtml(s.name)}</div>
                <div class="daily-student-step">${escapeHtml(s.step)} · ${escapeHtml(s.school || '-')}</div>
              </div>
            </div>
            <span class="step-pill ${getStepClass(s.step)}" style="font-size:12px;">${logs.length}건</span>
          </div>
          <div class="daily-card-body">
            <div class="daily-session-list">
              ${hasLogs ? logs.map(l => {
                const m = getLogMeta(l.log_type);
                const dur = l.duration_min ? `<span style="font-size:11px;color:#64748b;margin-left:6px;">${l.duration_min}분</span>` : '';
                const subj = l.subject ? `<span style="display:inline-block;padding:1px 7px;border-radius:999px;background:${m.bg};color:${m.color};font-size:11px;font-weight:700;margin-right:4px;">${escapeHtml(l.subject)}</span>` : '';
                return `
                  <div class="daily-session-item" style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                    <span style="width:22px;height:22px;border-radius:50%;background:${m.bg};color:${m.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;">
                      <i class="fas ${m.icon}"></i>
                    </span>
                    <span style="font-size:13px;line-height:1.5;flex:1;">
                      ${subj}<strong style="color:${m.color};">${m.label}</strong>${dur}<br>
                      <span style="color:#475569;">${escapeHtml(l.title || l.content || '-')}</span>
                    </span>
                  </div>
                `;
              }).join('') : '<p style="font-size:13px;color:var(--text-300);padding:12px 0;text-align:center;"><i class="fas fa-moon" style="margin-right:6px;opacity:.4;"></i>이 날 기록 없음</p>'}
            </div>
          </div>
          <div class="daily-card-footer" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #f1f5f9;margin-top:4px;">
            <span style="font-size:12.5px;color:var(--text-500);">총 <strong style="color:var(--text-900);">${logs.length}건</strong> 기록</span>
            ${totalMins > 0 ? `<span style="font-size:12.5px;font-weight:700;color:#2563eb;"><i class="fas fa-stopwatch" style="margin-right:3px;"></i>${totalMins}분</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('[plan.js] 일일 기록 로드 오류:', e);
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;"><i class="fas fa-exclamation-circle" style="margin-bottom:8px;display:block;font-size:24px;"></i>데이터 로드 실패: ${escapeHtml(e.message)}</div>`;
  }
}

function setupTabs() {
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.main;
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`mainPanel-${target}`)?.classList.add('active');

      const btn = document.getElementById('writePlanBtn');
      if (btn) {
        btn.innerHTML = target === 'plan'
          ? '<i class="fas fa-plus"></i> 플랜 작성'
          : '<i class="fas fa-plus"></i> 기록 작성';
      }

      if (target === 'daily') renderDailyGrid();
    });
  });
}

function openPlanModalForCreate() {
  editingTaskId = null;
  document.getElementById('planItemModalTitle').textContent = '플랜 항목 추가';
  ['piSubject', 'piContent', 'piComment'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('piTarget');
  if (dateEl) dateEl.value = formatDate(new Date());
  const statusEl = document.getElementById('piStatus');
  if (statusEl) statusEl.value = '0';
  document.getElementById('planItemModal')?.classList.add('open');
}

function closePlanModal() {
  document.getElementById('planItemModal')?.classList.remove('open');
}

function setupModal() {
  document.getElementById('addPlanItemBtn')?.addEventListener('click', openPlanModalForCreate);
  document.getElementById('writePlanBtn')?.addEventListener('click', () => {
    if (!currentPlanStudent) {
      showToast('💡 학생을 먼저 선택하세요.', 'info');
      return;
    }
    openPlanModalForCreate();
  });

  document.getElementById('planItemClose')?.addEventListener('click', closePlanModal);
  document.getElementById('planItemCancel')?.addEventListener('click', closePlanModal);
  document.getElementById('planItemModal')?.addEventListener('click', e => {
    if (e.target.id === 'planItemModal') closePlanModal();
  });

  document.getElementById('planItemSubmit')?.addEventListener('click', async () => {
    if (!currentPlanStudent) {
      showToast('학생을 먼저 선택하세요.', 'error');
      return;
    }

    const subject = document.getElementById('piSubject')?.value || '';
    const content = (document.getElementById('piContent')?.value || '').trim();
    const taskDate = document.getElementById('piTarget')?.value || formatDate(new Date());
    const isDone = document.getElementById('piStatus')?.value === '1';
    const adminComment = document.getElementById('piComment')?.value || '';

    if (!subject || !content) {
      showToast('과목과 내용을 입력해주세요.', 'error');
      return;
    }

    const payload = {
      student_id: currentPlanStudent,
      subject,
      task_content: content,
      task_date: taskDate,
      is_done: isDone,
      admin_comment: adminComment,
      planner_id: '',
      week_num: 0
    };

    try {
      if (editingTaskId) {
        await fetchJson(`${PLAN_API_BASE}/planner_tasks/${editingTaskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('✅ 플랜 항목이 수정되었습니다.', 'success');
      } else {
        await fetchJson(`${PLAN_API_BASE}/planner_tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('✅ 플랜 항목이 추가되었습니다.', 'success');
      }

      closePlanModal();
      await loadAndRenderPlan();
      await renderAllPlanOverview();
    } catch (e) {
      showToast(`저장 실패: ${e.message}`, 'error');
    }
  });
}

function setupNavigationButtons() {
  document.getElementById('prevWeek')?.addEventListener('click', async () => {
    currentWeek.setDate(currentWeek.getDate() - 7);
    const label = document.getElementById('weekLabel');
    if (label) label.textContent = getWeekLabel(currentWeek);
    if (currentPlanStudent) await loadAndRenderPlan();
  });

  document.getElementById('nextWeek')?.addEventListener('click', async () => {
    currentWeek.setDate(currentWeek.getDate() + 7);
    const label = document.getElementById('weekLabel');
    if (label) label.textContent = getWeekLabel(currentWeek);
    if (currentPlanStudent) await loadAndRenderPlan();
  });

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
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', () => {
    const keyword = input.value.trim();
    if (!keyword) {
      renderStudentTabs();
      return;
    }

    const container = document.getElementById('planStudentTabs');
    if (!container) return;
    const filtered = PLAN_STUDENTS.filter(s =>
      s.name.includes(keyword) || s.school.includes(keyword) || s.grade.includes(keyword)
    );

    if (!filtered.length) {
      container.innerHTML = '<p style="padding:16px;color:#94a3b8;font-size:13px;">검색 결과가 없습니다.</p>';
      return;
    }

    container.innerHTML = filtered.map(s => `
      <button class="stu-tab ${s.id === currentPlanStudent ? 'active' : ''}" data-sid="${escapeHtml(s.id)}">
        ${escapeHtml(s.name)} <span style="font-size:11px;opacity:.7">${escapeHtml(s.step)}</span>
      </button>
    `).join('');

    container.querySelectorAll('.stu-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPlanStudent = btn.dataset.sid;
        renderStudentTabs();
        loadAndRenderPlan();
      });
    });
  });
}

function _waitAdminSession(cb, timeout = 5000) {
  const start = Date.now();
  (function check() {
    let storageSession = null;
    try {
      storageSession = window._dvlAdminSession
        || JSON.parse(sessionStorage.getItem('dvl_admin_tab_session') || 'null')
        || JSON.parse(localStorage.getItem('dvl_admin_session') || 'null');
    } catch (_e) {}

    if (storageSession && (storageSession.role === 'admin' || storageSession.role === 'master')) {
      cb(storageSession);
      return;
    }
    if (Date.now() - start > timeout) {
      cb(null);
      return;
    }
    setTimeout(check, 120);
  })();
}

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupModal();
  setupNavigationButtons();
  setupSearch();

  _waitAdminSession(async () => {
    const weekLabel = document.getElementById('weekLabel');
    if (weekLabel) weekLabel.textContent = getWeekLabel(currentWeek);

    const ok = await loadStudentsFromDB();
    if (!ok || !PLAN_STUDENTS.length) {
      showToast('⚠️ 승인된 학생이 없거나 데이터를 불러오지 못했습니다.', 'warn');
    }

    if (PLAN_STUDENTS.length) currentPlanStudent = PLAN_STUDENTS[0].id;

    renderStudentTabs();
    await loadAndRenderPlan();
    await renderAllPlanOverview();
    await renderDailyGrid();

    const urlTab = new URLSearchParams(location.search).get('tab');
    if (urlTab === 'daily') {
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.main-tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.main-tab[data-main="daily"]')?.classList.add('active');
      document.getElementById('mainPanel-daily')?.classList.add('active');
      const btn = document.getElementById('writePlanBtn');
      if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> 기록 작성';
      await renderDailyGrid();
    }
  });
});
