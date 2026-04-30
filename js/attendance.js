/* =============================================
   다빈치랩 – 출결 관리 JavaScript (DB 연동 ver.)
   ============================================= */

const TABLE_ATT = 'attendance';
const TABLE_STU = 'student_profiles';

/* ─── API Base URL: Genspark DB (Vercel 배포 환경 포함) ─── */
const API = '/tables';

let session       = null;
let allStudents   = [];   // student_profiles
let todayRecords  = [];   // 오늘의 attendance 레코드
let allRecords    = [];   // 캘린더/월간용 전체 레코드 (선택 학생)
let currentDate   = new Date();
let calDate       = new Date();
let attFilter     = 'all';
let editTarget    = null; // { student, record (or null) }

const ATTEND_LABEL = { attend:'등원', late:'지각', absent:'결석', leave_early:'조퇴' };
const WEEK_DAYS    = ['일','월','화','수','목','금','토'];

/* ─── 날짜 유틸 ─── */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateKo(d) {
  return d.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
}

/* ─── 세션 확인: admin-common.js + DVL_SESSION 에서 이미 처리 ─── */
function checkSession() {
  /* window._dvlAdminSession 은 dvl-session.js → admin-common.js 가 설정 */
  session = window._dvlAdminSession || null;
  if (!session) {
    location.replace('../login.html');
    return false;
  }
  return true;
}

/* ─── 학생 목록 로드 ─── */
async function loadStudents() {
  try {
    const r = await fetch(`${API}/${TABLE_STU}?limit=100`);
    const d = await r.json();
    allStudents = (d.data || []).filter(s =>
      s.status === '재원' || s.status === 'active'
    );
    // 학생 수 KPI
    const kpiTotal = document.getElementById('kpiTotal');
    if (kpiTotal) kpiTotal.textContent = allStudents.length;
    populateCalSelector();
  } catch(e) {
    // fallback: 빈 목록 (가짜 데이터 생성 방지)
    allStudents = [];
    populateCalSelector();
  }
}

/* ─── 오늘 출결 로드 ─── */
async function loadTodayRecords() {
  const dateStr = toDateStr(currentDate);
  try {
    const r = await fetch(`${API}/${TABLE_ATT}?limit=200`);
    const d = await r.json();
    const all = d.data || [];
    todayRecords = all.filter(x => x.att_date === dateStr);
  } catch(e) { todayRecords = []; }
  updateKPIs();
  renderAttTable();
}

/* ─── KPI 업데이트 ─── */
function updateKPIs() {
  // 학생 전체에 오늘 레코드를 매핑
  const dateStr = toDateStr(currentDate);
  let attend = 0, absent = 0, late = 0;
  allStudents.forEach(s => {
    const rec = todayRecords.find(r => r.student_id === s.student_id);
    if (!rec) { absent++; return; }
    if (rec.status === 'attend') attend++;
    else if (rec.status === 'late' || rec.status === 'leave_early') { attend++; late++; }
    else absent++;
  });
  const total = allStudents.length || 1;
  document.getElementById('kpiIn').textContent     = attend;
  document.getElementById('kpiAbsent').textContent = absent;
  document.getElementById('kpiLate').textContent   = late;
  document.getElementById('kpiRate').textContent   = Math.round(attend / total * 100) + '%';
}

/* ─── 날짜 네비게이션 ─── */
function updateDateLabel() {
  const label = document.getElementById('dateNavLabel');
  if (label) label.textContent = formatDateKo(currentDate);
  const today = document.getElementById('todayLabel');
  if (today) today.textContent = formatDateKo(new Date());
}

document.getElementById('prevDay')?.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  updateDateLabel(); loadTodayRecords();
});
document.getElementById('nextDay')?.addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  updateDateLabel(); loadTodayRecords();
});
document.getElementById('todayBtn')?.addEventListener('click', () => {
  currentDate = new Date();
  updateDateLabel(); loadTodayRecords();
});

/* ─── 출결 테이블 렌더링 ─── */
function renderAttTable() {
  const q = document.getElementById('searchInput')?.value.trim() || '';
  const tbody = document.getElementById('attendTbody');
  if (!tbody) return;

  // 학생 목록 기반으로 오늘 출결 매핑
  let list = allStudents.map(s => {
    const rec = todayRecords.find(r => r.student_id === s.student_id);
    return {
      student_id: s.student_id,
      name: s.name || s.student_id,
      stage: s.stage || '',
      consulting: (s.stage || '').includes('컨설팅') || s.consulting === true,
      attend: rec?.status || 'absent',
      inTime: rec?.in_time || '-',
      outTime: rec?.out_time || '-',
      memo: rec?.memo || '',
      recordId: rec?.id || null
    };
  });

  if (attFilter !== 'all') list = list.filter(s => s.attend === attFilter);
  if (q) list = list.filter(s => s.name.includes(q) || s.student_id.includes(q));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-300);">조건에 맞는 학생이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const conTag = s.consulting
      ? '<span class="step-pill step-con">재원 <em style="font-style:normal;font-weight:800;color:#7c3aed;">(컨)</em></span>'
      : '<span class="step-pill step-gen">재원</span>';
    return `<tr>
      <td><span class="student-name">${s.name}</span></td>
      <td>${conTag}</td>
      <td>${s.inTime !== '-' ? `<span style="font-weight:600;color:var(--green-700)">${s.inTime}</span>` : '<span style="color:var(--text-300)">-</span>'}</td>
      <td>${s.outTime !== '-' ? s.outTime : '<span style="color:var(--text-300)">-</span>'}</td>
      <td><span class="status-dot status-${s.attend}">${ATTEND_LABEL[s.attend] || s.attend}</span></td>
      <td style="font-size:12.5px;color:var(--text-500);">${s.memo || '-'}</td>
      <td><button class="tbl-btn tbl-btn-outline" onclick="openEditModal('${s.student_id}','${s.recordId||''}')"><i class="fas fa-edit"></i> 수정</button></td>
    </tr>`;
  }).join('');
}

/* ─── 탭 필터 ─── */
document.querySelectorAll('.att-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.att-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    attFilter = btn.dataset.filter;
    renderAttTable();
  });
});
document.getElementById('searchInput')?.addEventListener('input', () => {
  clearTimeout(window._at);
  window._at = setTimeout(renderAttTable, 250);
});

/* ─── 주간 요약 ─── */
async function renderWeeklySummary() {
  const container = document.getElementById('weeklySummary');
  if (!container) return;

  const today = new Date();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  // 이번 주 날짜 목록
  const weekDates = Array.from({length:5}, (_,i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
  const dateStrs = weekDates.map(toDateStr);

  let weekRecs = [];
  try {
    const r = await fetch(`${API}/${TABLE_ATT}?limit=500`);
    const d = await r.json();
    weekRecs = (d.data||[]).filter(x => dateStrs.includes(x.att_date));
  } catch(e) {}

  container.innerHTML = weekDates.map(d => {
    const ds     = toDateStr(d);
    const isToday  = ds === toDateStr(today);
    const isFuture = d > today;
    const recs   = weekRecs.filter(x => x.att_date === ds);
    const attend = recs.filter(x => ['attend','late','leave_early'].includes(x.status)).length;
    const late   = recs.filter(x => x.status === 'late').length;
    const absent = recs.filter(x => x.status === 'absent').length;
    return `
      <div class="week-day-row ${isToday?'current-day':''}">
        <span class="week-day-name">${WEEK_DAYS[d.getDay()]}</span>
        <span class="week-day-date">${d.getMonth()+1}/${d.getDate()}</span>
        ${isFuture
          ? '<span style="font-size:12px;color:var(--text-300)">예정</span>'
          : recs.length === 0
            ? '<span style="font-size:12px;color:var(--text-300)">미등록</span>'
            : `<div class="week-day-stats">
                <span class="wds-pill wds-attend">${attend}명</span>
                ${late?`<span class="wds-pill wds-late">${late}지각</span>`:''}
                ${absent?`<span class="wds-pill wds-absent">${absent}결석</span>`:''}
              </div>`}
      </div>`;
  }).join('');
}

/* ─── 월간 캘린더 ─── */
async function loadAndRenderCalendar() {
  const sel   = document.getElementById('calStudentSelect');
  const stuId = sel?.value || '';
  const year  = calDate.getFullYear();
  const month = calDate.getMonth();
  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;

  let monthRecs = [];
  if (stuId) {
    try {
      const r = await fetch(`${API}/${TABLE_ATT}?limit=200`);
      const d = await r.json();
      monthRecs = (d.data||[]).filter(x => x.student_id === stuId && x.att_date?.startsWith(monthStr));
    } catch(e) {}
  }
  renderCalendar(monthRecs);
}

function renderCalendar(monthRecs = []) {
  const label = document.getElementById('calMonthLabel');
  if (label) label.textContent = `${calDate.getFullYear()}년 ${calDate.getMonth()+1}월`;
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const today    = new Date();
  const year     = calDate.getFullYear();
  const month    = calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month+1, 0).getDate();

  const recMap = {};
  monthRecs.forEach(r => {
    const day = parseInt(r.att_date?.split('-')[2] || '0');
    if (day) recMap[day] = r.status;
  });

  let html = WEEK_DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= lastDate; d++) {
    const dt      = new Date(year, month, d);
    const isToday = dt.toDateString() === today.toDateString();
    const isFuture= dt > today;
    const isSun   = dt.getDay() === 0;
    const status  = recMap[d];
    let cls = 'cal-day';
    if (isToday)  cls += ' today';
    if (isFuture || isSun) cls += ' cal-future';
    else if (status === 'attend') cls += ' cal-attend';
    else if (status === 'late' || status === 'leave_early') cls += ' cal-late';
    else if (status === 'absent') cls += ' cal-absent';

    html += `<div class="${cls}">
      <span class="cal-day-num">${d}</span>
      ${!isFuture && !isSun && status ? '<div class="cal-day-dot"></div>' : ''}
    </div>`;
  }
  grid.innerHTML = html;
}

function populateCalSelector() {
  const sel = document.getElementById('calStudentSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">학생 선택</option>` + allStudents.map(s =>
    `<option value="${s.student_id}">${s.name}${(s.stage||'').includes('\ucee8\uc124\ud305') ? ' (\ucee8)' : ''}</option>`
  ).join('');
  sel.addEventListener('change', loadAndRenderCalendar);
}

document.getElementById('prevMonth')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth()-1); loadAndRenderCalendar(); });
document.getElementById('nextMonth')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth()+1); loadAndRenderCalendar(); });

/* ─── 출결 수정 모달 ─── */
window.openEditModal = (studentId, recordId) => {
  const s   = allStudents.find(x => x.student_id === studentId);
  const rec = todayRecords.find(x => x.id === recordId);
  if (!s) return;
  editTarget = { student: s, record: rec || null };

  document.getElementById('editAttendStudent').textContent = `학생: ${s.name}${s.consulting ? ' (컨설팅)' : ''}`;
  document.getElementById('editInTime').value   = rec?.in_time  || '';
  document.getElementById('editOutTime').value  = rec?.out_time || '';
  document.getElementById('editStatus').value   = rec?.status   || 'attend';
  document.getElementById('editMemo').value     = rec?.memo     || '';
  document.getElementById('editAttendModal')?.classList.add('open');
};

const closeEditModal = () => document.getElementById('editAttendModal')?.classList.remove('open');
document.getElementById('editAttendClose')?.addEventListener('click', closeEditModal);
document.getElementById('editAttendCancel')?.addEventListener('click', closeEditModal);
document.getElementById('editAttendModal')?.addEventListener('click', e => {
  if (e.target.id === 'editAttendModal') closeEditModal();
});

document.getElementById('editAttendSubmit')?.addEventListener('click', async () => {
  if (!editTarget) return;
  const payload = {
    student_id:  editTarget.student.student_id,
    student_name: editTarget.student.name,
    stage:       editTarget.student.stage || '',
    att_date:    toDateStr(currentDate),
    status:      document.getElementById('editStatus').value,
    in_time:     document.getElementById('editInTime').value  || '',
    out_time:    document.getElementById('editOutTime').value || '',
    memo:        document.getElementById('editMemo').value    || '',
    recorded_by: session?.id || 'admin'
  };

  try {
    let res;
    if (editTarget.record?.id) {
      // 기존 레코드 수정
      res = await fetch(`${API}/${TABLE_ATT}/${editTarget.record.id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
    } else {
      // 신규 등록
      res = await fetch(`${API}/${TABLE_ATT}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
    }
    if (!res.ok) throw new Error();
    showToast(`✅ ${editTarget.student.name} 출결이 저장되었습니다.`, 'success');
    closeEditModal();
    await loadTodayRecords();
    renderWeeklySummary();
  } catch(e) {
    showToast('저장 중 오류가 발생했습니다.', 'error');
  }
});

/* ─── 일괄 등록 버튼 (미등록 학생 전체 '등원' 처리) ─── */
async function bulkMarkAttend() {
  const dateStr   = toDateStr(currentDate);
  const unrecorded = allStudents.filter(s => !todayRecords.find(r => r.student_id === s.student_id));
  if (!unrecorded.length) { showToast('미등록 학생이 없습니다.'); return; }
  if (!confirm(`미등록 학생 ${unrecorded.length}명을 모두 '등원' 처리하시겠습니까?`)) return;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  try {
    for (const s of unrecorded) {
      await fetch(`${API}/${TABLE_ATT}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          student_id: s.student_id, student_name: s.name, stage: s.stage||'',
          att_date: dateStr, status:'attend', in_time: timeStr, out_time:'',
          memo:'', recorded_by: session?.id||'admin'
        })
      });
    }
    showToast(`✅ ${unrecorded.length}명 등원 처리 완료`, 'success');
    await loadTodayRecords();
  } catch(e) { showToast('일괄 처리 중 오류가 발생했습니다.', 'error'); }
}

/* ─── Sidebar ─── */
const sidebar        = document.getElementById('sidebar');
const sidebarToggle  = document.getElementById('sidebarToggle');
const sidebarClose   = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');

const openSb  = () => { sidebar?.classList.add('open'); sidebarOverlay?.classList.add('open'); document.body.style.overflow='hidden'; };
const closeSb = () => { sidebar?.classList.remove('open'); sidebarOverlay?.classList.remove('open'); document.body.style.overflow=''; };

sidebarToggle?.addEventListener('click', () => sidebar?.classList.contains('open') ? closeSb() : openSb());
sidebarClose?.addEventListener('click', closeSb);
sidebarOverlay?.addEventListener('click', closeSb);

/* ─── Toast ─── */
function showToast(msg, type='info') {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div'); c.id='toastContainer';
    c.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(c);
  }
  const col = { success:'#163A33', info:'#245A4E', error:'#ef4444' };
  const t = document.createElement('div');
  t.style.cssText=`background:${col[type]||col.info};color:#fff;padding:12px 22px;border-radius:999px;font-size:13.5px;font-weight:600;font-family:'Noto Sans KR',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2);opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;pointer-events:auto;white-space:nowrap;max-width:90vw;overflow:hidden;`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; }));
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(()=>t.remove(),350); }, 3500);
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', async () => {
  /* 세션은 admin-common.js 에서 이미 검증됨 — window._dvlAdminSession 사용 */
  session = window._dvlAdminSession;
  if (!session) return;
  updateDateLabel();
  await loadStudents();
  await loadTodayRecords();
  await renderWeeklySummary();
  renderCalendar();

  // 일괄 등원 버튼 (있으면 연결)
  document.getElementById('btnBulkAttend')?.addEventListener('click', bulkMarkAttend);
});
