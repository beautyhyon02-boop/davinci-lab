/* =============================================
   다빈치랩 – 학생 관리 JavaScript v4
   완전 DB 연동 / 하드코딩 데이터 제거
   ============================================= */

/* ★ Genspark DB API — 루트 기준 상대경로 사용 */
const _API = '/tables';

const TABLE_PROFILES = 'student_profiles';

const attendLabels = { attend:'등원', absent:'미등원', late:'지각', '-':'-' };
/* 단계 구분 폐지 — consulting(true/false) 만 사용 */

let allStudents    = [];  // API에서 로드한 전체 데이터
let currentFilter  = 'active';
let currentStudent = null;
let selectedIds    = new Set();

/* ── 컨설팅 여부 판별 (stage 값이 무엇이든 '컨설팅' 포함이면 true) ── */
function isConsulting(r) {
  if (r.consulting === true) return true;
  if (typeof r.consulting === 'string' && r.consulting === 'true') return true;
  if ((r.stage || '').includes('컨설팅')) return true;
  return false;
}

/* ═══════════════════════════════════════
   API 연동
═══════════════════════════════════════ */
async function loadStudentsFromAPI() {
  try {
    showLoadingState();
    const res = await fetch(`${_API}/${TABLE_PROFILES}?limit=500`);
    if (!res.ok) throw new Error(`API 오류 (${res.status})`);
    const data = await res.json();
    const rows = data.data || [];
    console.log('[students] API 응답:', rows.length, '건, pending:', rows.filter(r=>r.status==='pending').length);

    /* API 데이터를 내부 포맷으로 변환 */
    allStudents = rows.map(r => ({
      _id:      r.id,           // REST API 레코드 ID
      id:       r.student_id,
      name:     r.name,
      school:   r.school,
      grade:    r.grade,
      gradeNum: r.grade_num || 0,
      classNum: r.class_num || 0,
      studentNum: r.student_num || 0,
      stage:    r.stage || '',
      status:   r.status || 'pending',  // status 미설정은 승인 대기로 처리
      memo:     r.memo || '',
      consulting: isConsulting(r),
      attend:   'attend',   // 출결은 별도 테이블 (추후 연동)
      plan:     '-',
      assess:   '-',
      manager:  '박소현 대표',
      joinDate: r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-',
    }));

    updateSummaryBar();
    renderTable();
  } catch (err) {
    console.warn('[students] API 로드 실패, 폴백 데이터 사용:', err);
    loadFallbackData();
  }
}

function loadFallbackData() {
  /* API 실패 시 빈 목록으로 시작 */
  allStudents = [];
  console.warn('[students] 폴백 데이터 사용 중 — API 연결 실패');
  updateSummaryBar();
  renderTable();
}

function showLoadingState() {
  const tbody = document.getElementById('studentTbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-300);">
      <i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block;"></i>
      학생 데이터를 불러오는 중...
    </td></tr>`;
  }
}

/* ═══════════════════════════════════════
   필터링
═══════════════════════════════════════ */
function getPendingStudents() {
  return allStudents.filter(s => s.status === 'pending');
}
function getActiveStudents() {
  return allStudents.filter(s => s.status !== '휴원' && s.status !== '졸업' && s.status !== 'pending');
}
function getBreakStudents() {
  return allStudents.filter(s => s.status === '휴원');
}
function getAllStudents() { return allStudents; }

/* ═══════════════════════════════════════
   가입 승인 모달
═══════════════════════════════════════ */
let _approveTarget = null; // { _id, id, name, school, grade, stage }

function openApproveModal(dbId, studentId) {
  // allStudents에서 해당 학생 찾기
  const s = allStudents.find(x => x._id === dbId || x.id === studentId);
  if (!s) { showToast('학생 정보를 찾을 수 없습니다.', 'warn'); return; }

  _approveTarget = s;

  // 모달 필드 채우기
  const el = id => document.getElementById(id);
  el('apv-name').textContent  = s.name;
  el('apv-id').textContent    = s.id || '-';
  el('apv-school').value      = s.school || '';
  el('apv-grade').value       = s.grade  || '';
  /* DB 스키마 options: 1단계|2단계|3단계|3단계+컨설팅 */
  const curStage = s.stage || '1단계';
  const apvEl = el('apv-stage');
  if (apvEl) {
    // 기존 stage 값이 있으면 그대로 선택, 없으면 기본값
    apvEl.value = curStage;
    if (!apvEl.value) apvEl.value = '1단계'; // 매칭 실패 시 기본값
  }

  el('approveModal').classList.add('open');
}

function closeApproveModal() {
  document.getElementById('approveModal')?.classList.remove('open');
  _approveTarget = null;
}

async function confirmApprove() {
  if (!_approveTarget) return;

  const school = document.getElementById('apv-school').value.trim();
  const grade  = document.getElementById('apv-grade').value.trim();
  const stage  = document.getElementById('apv-stage').value;

  if (!stage) { showToast('수강 구분을 선택해주세요.', 'warn'); return; }

  const btn = document.getElementById('apv-confirm-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';

  try {
    // DB 레코드 ID(_id) 확보 — 없으면 student_id로 재검색
    let dbId = _approveTarget._id;
    if (!dbId || dbId === 'null' || dbId === 'undefined') {
      const res  = await fetch(`${_API}/${TABLE_PROFILES}?search=${encodeURIComponent(_approveTarget.id)}&limit=10`);
      const data = await res.json();
      const found = (data.data || []).find(r =>
        r.student_id === _approveTarget.id || r.id === _approveTarget.id
      );
      if (!found) throw new Error('학생 레코드를 찾을 수 없습니다.');
      dbId = found.id;
    }

        const payload = {
      status:          'active',
      approval_status: 'approved',
      approved:        true,
      approved_at:     new Date().toISOString(),
      is_active:       true,
      stage,
      consulting:      stage.includes('컨설팅'),
      ...(school && { school }),
      ...(grade  && { grade  }),
    };

    const res = await fetch(`${_API}/${TABLE_PROFILES}/${dbId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`서버 오류 (${res.status}): ${errText}`);
    }

    const stageLabel = stage.includes('컨설팅') ? '컨설팅 포함' : '일반 수강';
    showToast(`✅ ${_approveTarget.name} (${_approveTarget.id}) 승인 완료! (${stageLabel})`, 'ok');
    closeApproveModal();
    await loadStudentsFromAPI();

  } catch(e) {
    showToast('승인 처리 오류: ' + e.message, 'warn');
    console.error('[approveStudent]', e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check-circle"></i> 승인 완료';
  }
}

/* 가입 거절 */
async function rejectStudent(dbId, studentId) {
  const s = allStudents.find(x => x._id === dbId || x.id === studentId);
  const name = s ? s.name : studentId;
  if (!confirm(`'${name}' 가입 신청을 거절하시겠습니까?\n해당 계정이 삭제됩니다.`)) return;
  try {
    let targetId = dbId;
    if (!targetId || targetId === 'null' || targetId === 'undefined') {
      const res  = await fetch(`${_API}/${TABLE_PROFILES}?search=${encodeURIComponent(studentId)}&limit=10`);
      const data = await res.json();
      const found = (data.data || []).find(r => r.student_id === studentId || r.id === studentId);
      if (!found) { showToast('학생 정보를 찾을 수 없습니다.', 'warn'); return; }
      targetId = found.id;
    }
    await fetch(`${_API}/${TABLE_PROFILES}/${targetId}`, { method: 'DELETE' });
    showToast(`${name} 가입 신청이 거절되었습니다.`, 'ok');
    await loadStudentsFromAPI();
  } catch(e) {
    showToast('처리 중 오류가 발생했습니다: ' + e.message, 'warn');
  }
}

// 승인 모달 닫기 이벤트 + URL 파라미터 처리
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('apv-cancel-btn')?.addEventListener('click', closeApproveModal);
  document.getElementById('apv-confirm-btn')?.addEventListener('click', confirmApprove);
  document.getElementById('approveModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('approveModal')) closeApproveModal();
  });

  // URL ?filter=pending 처리: 대시보드 배너에서 넘어온 경우 pending 필터 자동 선택
  const urlParams = new URLSearchParams(window.location.search);
  const filterParam = urlParams.get('filter');
  if (filterParam === 'pending') {
    currentFilter = 'pending';
    // pending 카드 활성화
    document.querySelectorAll('.sum-card').forEach(c => c.classList.remove('active-sum'));
    const pendingCard = document.querySelector('.sum-card[data-filter="pending"]');
    if (pendingCard) pendingCard.classList.add('active-sum');
    // 데이터 로드 후 자동으로 pending 섹션이 보임 (renderTable에서 항상 표시)
  }
});

function filterStudents() {
  const q      = document.getElementById('globalSearch')?.value.trim().toLowerCase() || '';
  const grade  = document.getElementById('filterGrade')?.value  || '';

  let list;
  if      (currentFilter === 'break')   list = getBreakStudents();
  else if (currentFilter === 'pending') list = [];  // pending은 renderTable 상단 섹션에서 별도 표시
  else if (currentFilter === 'active')  list = getActiveStudents();
  else if (currentFilter === 'consulting') list = getActiveStudents().filter(s => s.consulting);
  else if (currentFilter === 'general')    list = getActiveStudents().filter(s => !s.consulting);
  else list = getActiveStudents();

  if (q)     list = list.filter(s => s.name.includes(q) || s.school.includes(q));
  if (grade) list = list.filter(s => s.grade === grade || s.grade === '고'+grade);

  return list;
}

/* ═══════════════════════════════════════
   요약 바 업데이트
═══════════════════════════════════════ */
function updateSummaryBar() {
  const active  = getActiveStudents();
  const breaks  = getBreakStudents();
  const pending = getPendingStudents();
  const elAll     = document.getElementById('sumAll');
  const el1       = document.getElementById('sum1');
  const el2       = document.getElementById('sum2');
  const el3       = document.getElementById('sum3');
  const el3c      = document.getElementById('sum3c');
  const elBreak   = document.getElementById('sumBreak');
  const elPending = document.getElementById('sumPending');
  if (elAll)     elAll.textContent     = active.length;
  if (el1)       el1.textContent       = active.filter(s =>  s.consulting).length;  // 컨설팅
  if (el2)       el2.textContent       = active.filter(s => !s.consulting).length;  // 일반
  if (el3)       el3.style && (el3.closest('.sum-card') || el3).parentElement?.style && (el3.parentElement.style.display = 'none');
  if (el3c)      el3c.style && (el3c.closest('.sum-card') || el3c).parentElement?.style && (el3c.parentElement.style.display = 'none');
  if (elBreak)   elBreak.textContent   = breaks.length;
  if (elPending) elPending.textContent = pending.length;

  /* 승인 대기 카드 강조 */
  const pendingCard = document.querySelector('.sum-card[data-filter="pending"]');
  if (pendingCard) {
    pendingCard.style.display = pending.length > 0 ? '' : '';
    if (pending.length > 0) {
      pendingCard.style.boxShadow = '0 0 0 2px #f59e0b';
    } else {
      pendingCard.style.boxShadow = '';
    }
  }
}

/* ═══════════════════════════════════════
   테이블 렌더링
═══════════════════════════════════════ */
function renderTable() {
  const list  = filterStudents();
  const tbody = document.getElementById('studentTbody');
  const empty = document.getElementById('emptyState');
  const rc    = document.getElementById('resultCount');
  if (rc) rc.textContent = `${list.length}명 표시 중`;

  /* 가입 대기 학생 섹션 */
  const pending = getPendingStudents();
  let pendingHtml = '';
  if (pending.length > 0) {
    pendingHtml = `
      <tr>
        <td colspan="11" style="background:#fffbeb;padding:8px 14px;border-bottom:2px solid #f59e0b;">
          <span style="font-size:12px;font-weight:700;color:#92400e;">
            <i class="fas fa-user-clock"></i> 가입 승인 대기 (${pending.length}명)
          </span>
        </td>
      </tr>
      ${pending.map(s => `
        <tr style="background:#fffbeb;" data-id="${s.id}">
          <td><input type="checkbox" disabled /></td>
          <td><span style="color:#92400e;font-weight:700;">${s.name}</span><br><span style="font-size:11px;color:#b45309;">${s.id}</span></td>
          <td>${s.school || '미입력'}</td>
          <td>${s.grade || '미입력'}</td>
          <td><span class="step-pill step-1">${s.stage || '미설정'}</span></td>
          <td>–</td>
          <td><span style="background:#fef3c7;color:#92400e;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">승인 대기</span></td>
          <td>–</td>
          <td>–</td>
          <td>–</td>
          <td>
            <div class="tbl-action-btns">
              <button class="tbl-btn tbl-btn-primary" style="background:#22c55e;border-color:#22c55e;white-space:nowrap;" onclick="openApproveModal('${s._id}','${s.id}')">
                <i class="fas fa-user-check"></i> 승인
              </button>
              <button class="tbl-btn tbl-btn-outline" style="color:#ef4444;border-color:#ef4444;white-space:nowrap;" onclick="rejectStudent('${s._id}','${s.id}')">
                <i class="fas fa-times"></i> 거절
              </button>
            </div>
          </td>
        </tr>
      `).join('')}
    `;
  }

  if (!list.length && !pending.length) {
    if (tbody) tbody.innerHTML = pendingHtml;
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = pendingHtml + list.map(s => `
    <tr data-id="${s.id}">
      <td><input type="checkbox" class="row-check" data-id="${s.id}" ${selectedIds.has(s.id)?'checked':''}/></td>
      <td>
        <span class="student-name" style="cursor:pointer;color:var(--green-700);font-weight:700;" onclick="adminLoginAsStudent('${s.id}')" title="클릭하면 학생 대시보드로 바로 이동합니다">${s.name}</span>
        <span style="display:inline-block;margin-left:5px;font-size:10px;color:#94a3b8;vertical-align:middle;" title="대시보드 바로 열기"><i class="fas fa-external-link-alt"></i></span>
      </td>
      <td>${s.school}</td>
      <td>${s.consulting
        ? '<span class="step-pill step-con">재원 <em style="font-style:normal;font-weight:800;color:#7c3aed;">(컨)</em></span>'
        : '<span class="step-pill step-gen">재원</span>'
      }</td>
      <td><span class="status-dot status-attend">등원</span></td>
      <td>${s.plan}</td>
      <td>${s.assess !== '-' ? `<span style="color:var(--red);font-weight:600;">${s.assess}</span>` : s.assess}</td>
      <td>${s.manager}</td>
      <td>${s.status === '휴원'
        ? '<span style="background:#fef3c7;color:#92400e;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">휴원</span>'
        : '<span style="background:rgba(34,197,94,.12);color:#16a34a;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">활성</span>'
      }</td>
      <td>
        <div class="tbl-action-btns">
          <button class="tbl-btn tbl-btn-primary" onclick="openDetail('${s.id}')" title="학생 상세 정보">상세</button>
          <button class="tbl-btn tbl-btn-outline" onclick="openStepModal('${s.id}')">단계변경</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkBar();
    });
  });
}

/* ═══════════════════════════════════════
   요약 바 클릭
═══════════════════════════════════════ */
document.querySelectorAll('.sum-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.sum-card').forEach(c => c.classList.remove('active-sum'));
    card.classList.add('active-sum');
    currentFilter = card.dataset.filter;
    selectedIds.clear();
    updateBulkBar();
    renderTable();
  });
});

/* ═══════════════════════════════════════
   필터
═══════════════════════════════════════ */
['filterGrade','filterConsult','filterAttend'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', renderTable);
});

document.getElementById('globalSearch')?.addEventListener('input', () => {
  clearTimeout(window._searchT);
  window._searchT = setTimeout(renderTable, 250);
});

document.getElementById('filterReset')?.addEventListener('click', () => {
  ['filterGrade','filterConsult','filterAttend'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const gs = document.getElementById('globalSearch');
  if (gs) gs.value = '';
  renderTable();
});

/* ═══════════════════════════════════════
   전체 체크박스
═══════════════════════════════════════ */
document.getElementById('checkAll')?.addEventListener('change', (e) => {
  const list = filterStudents();
  if (e.target.checked) list.forEach(s => selectedIds.add(s.id));
  else selectedIds.clear();
  renderTable();
  updateBulkBar();
});

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const cnt = document.getElementById('bulkCount');
  if (selectedIds.size > 0) {
    bar?.classList.add('show');
    if (cnt) cnt.textContent = `${selectedIds.size}명 선택됨`;
  } else {
    bar?.classList.remove('show');
  }
}

/* ═══════════════════════════════════════
   Bulk actions
═══════════════════════════════════════ */
window.bulkAction = (type) => {
  const labels = { step:'단계 변경', notice:'공지 발송', break:'휴원 처리' };
  showToast(`💡 일괄 "${labels[type]}" 기능은 다음 업데이트에 추가됩니다.`, 'info');
};

/* ═══════════════════════════════════════
   학생 상세 모달
═══════════════════════════════════════ */
window.openDetail = (id) => {
  const s = allStudents.find(x => x.id === id);
  if (!s) return;
  currentStudent = s;
  window._currentStudentId = s.id; // 모달 헤더 인라인 onclick에서 접근용

  document.getElementById('detailAvatar').textContent = s.name[0];
  document.getElementById('detailName').textContent   = s.name;
  document.getElementById('detailMeta').textContent   = `${s.school}${s.consulting ? ' · 컨설팅 포함' : ''}`;  

  document.getElementById('infoRows').innerHTML = [
    { l:'계정 ID', v: s.id },
    { l:'학교',    v: s.school },
    { l:'학년',    v: s.grade || '-' },
    { l:'등록일',  v: s.joinDate },
    { l:'상태',    v: s.status },
  ].map(r=>`<div class="info-row"><span class="info-row-label">${r.l}</span><span class="info-row-val">${r.v}</span></div>`).join('');

  document.getElementById('settingRows').innerHTML = [
    { l:'담당 관리자', v: s.manager },
    { l:'컨설팅',     v: s.consulting ? '포함' : '미포함' },
    { l:'계정 상태',  v: s.status === '휴원' ? '휴원' : '활성' },
    { l:'학생부 입력', v: s.consulting ? '활성' : '일반' },
    { l:'학부모 공유', v: '활성' },
  ].map(r=>`<div class="info-row"><span class="info-row-label">${r.l}</span><span class="info-row-val">${r.v}</span></div>`).join('');

  document.getElementById('historyPills').innerHTML = [
    `<span class="history-pill"><i class="fas fa-check" style="color:var(--mint-400)"></i> 재원 중</span>`,
    s.consulting ? `<span class="history-pill"><i class="fas fa-star" style="color:var(--blue)"></i> 학생부 컨설팅</span>` : '',
    `<span class="history-pill"><i class="fas fa-calendar" style="color:var(--text-300)"></i> 등록 ${s.joinDate}</span>`,
    `<span class="history-pill" onclick="viewStudentRecord('${s.id}')" style="cursor:pointer;background:var(--mint-50);color:var(--mint-700);border-color:var(--mint-300);">
      <i class="fas fa-book-open" style="color:var(--mint-500)"></i> 학생부 보기
    </span>`,
  ].filter(Boolean).join('');

  // 출결 탭 — 실제 DB 조회
  document.getElementById('attendStats').innerHTML = `
    <div class="att-stat-card"><div class="att-stat-num" id="detailAttCount">–</div><div class="att-stat-label">이번 달 등원</div></div>
    <div class="att-stat-card"><div class="att-stat-num" id="detailLateCount">–</div><div class="att-stat-label">지각</div></div>
    <div class="att-stat-card"><div class="att-stat-num" id="detailAbsentCount">–</div><div class="att-stat-label">결석</div></div>
    <div class="att-stat-card"><div class="att-stat-num" id="detailAttRate" style="color:var(--mint-400)">–</div><div class="att-stat-label">출석률</div></div>
  `;
  document.getElementById('attendTbody').innerHTML =
    '<tr><td colspan="5" style="text-align:center;color:var(--text-300);padding:20px;">불러오는 중...</td></tr>';

  // 비동기로 출결 데이터 조회
  (async () => {
    try {
      const thisMonth = new Date().toISOString().slice(0,7); // YYYY-MM
      const res  = await fetch(`${_API}/attendance?limit=100&search=${s.id}`);
      const data = await res.json();
      const rows = (data.data || []).filter(r => r.student_id === s.id);
      const monthly = rows.filter(r => (r.att_date||'').startsWith(thisMonth));

      const attend = monthly.filter(r => r.status === 'attend' || r.status === '등원').length;
      const late   = monthly.filter(r => r.status === 'late'   || r.status === '지각').length;
      const absent = monthly.filter(r => r.status === 'absent' || r.status === '결석').length;
      const total  = attend + late + absent;
      const rate   = total > 0 ? Math.round((attend + late) / total * 100) : 0;

      const elAtt    = document.getElementById('detailAttCount');
      const elLate   = document.getElementById('detailLateCount');
      const elAbsent = document.getElementById('detailAbsentCount');
      const elRate   = document.getElementById('detailAttRate');
      if (elAtt)    elAtt.textContent    = attend;
      if (elLate)   elLate.textContent   = late;
      if (elAbsent) elAbsent.textContent = absent;
      if (elRate)   elRate.textContent   = total > 0 ? rate + '%' : '–';

      const tbody = document.getElementById('attendTbody');
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-300);padding:20px;">출결 기록이 없습니다.</td></tr>';
      } else {
        const sorted = [...rows].sort((a,b) => (b.att_date||'').localeCompare(a.att_date||'')).slice(0,20);
        tbody.innerHTML = sorted.map(a => `<tr>
          <td>${a.att_date||'-'}</td>
          <td>${a.in_time||'-'}</td>
          <td>${a.out_time||'-'}</td>
          <td><span class="status-dot status-${a.status}">${attendLabels[a.status]||a.status||'-'}</span></td>
          <td>${a.memo||'-'}</td>
        </tr>`).join('');
      }
    } catch(e) {
      document.getElementById('attendTbody').innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--text-300);padding:20px;">출결 데이터를 불러올 수 없습니다.</td></tr>';
    }
  })();

  // 학습 플랜 탭
  document.getElementById('planList').innerHTML = `
    <p style="color:var(--text-300);font-size:14px;padding:12px;">
      학습 플랜은 학생별 페이지에서 확인하세요.
    </p>`;

  // 수행평가 탭
  document.getElementById('assessList').innerHTML = `
    <p style="color:var(--text-300);font-size:14px;padding:12px;">
      등록된 수행평가가 없습니다.
    </p>`;

  // 메모 탭
  document.getElementById('memoText').value = s.memo || '';
  document.getElementById('memoHistory').innerHTML = s.memo ? `
    <div class="memo-entry">
      <div class="memo-entry-date">최근 메모</div>
      <div class="memo-entry-text">${s.memo}</div>
    </div>
  ` : '<p style="color:var(--text-300);font-size:13px;padding:8px;">저장된 메모가 없습니다.</p>';

  // Detail 탭 초기화
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.detail-tab[data-tab="info"]')?.classList.add('active');
  document.getElementById('tab-info')?.classList.add('active');

  document.getElementById('studentDetailModal').classList.add('open');
};

/* ─ 학생부 보기 (관리자용) ─ */
window.viewStudentRecord = (studentId) => {
  sessionStorage.setItem('admin_viewing_student', studentId);
  window.open(`record.html?student=${studentId}`, '_blank');
};

/* ═══════════════════════════════════════
   관리자 → 학생 대시보드 대리 열람
   : DB에서 학생 비밀번호를 조회해 세션 생성 후
     student/dashboard.html을 새 탭으로 오픈
═══════════════════════════════════════ */
window.adminLoginAsStudent = async (studentId) => {
  const s = allStudents.find(x => x.id === studentId);
  if (!s) return;

  // 로딩 표시
  showToast('🔄 학생 대시보드 불러오는 중...', 'info');

  try {
    /* DB에서 비밀번호 포함 전체 프로필 조회 */
    const res  = await fetch(`${_API}/${TABLE_PROFILES}?limit=500`);
    const data = await res.json();
    const profile = (data.data || []).find(r => r.student_id === studentId);

    if (!profile) {
      showToast('⚠️ 학생 정보를 찾을 수 없습니다.', 'error');
      return;
    }

    /* 학생 세션 객체 생성 */
    const studentSession = {
      id:       profile.student_id,
      name:     profile.name,
      role:     'student',
      school:   profile.school   || '',
      grade:    profile.grade    || '',
      gradeNum: profile.grade_num || 0,
      stage:    profile.stage    || '',
      child:    '',
      childName:'',
    };
    const sessionJson = JSON.stringify(studentSession);

    /* 관리자가 대리 열람 중임을 표시 — 기존 admin 세션은 보존 */
    sessionStorage.setItem('dvl_admin_proxy_view', 'true');
    sessionStorage.setItem('dvl_admin_proxy_name', window._dvlAdminSession?.name || '관리자');

    /* 학생 세션 저장 (새 탭에서 읽을 수 있도록 localStorage 사용) */
    localStorage.setItem('dvl_student_session', sessionJson);
    localStorage.setItem('dvl_admin_proxy_view', 'true');
    localStorage.setItem('dvl_admin_proxy_name', window._dvlAdminSession?.name || '관리자');

    /* 새 탭으로 학생 대시보드 오픈 */
    window.open('../student/dashboard.html', '_blank');

    showToast(`✅ ${s.name} 학생 대시보드를 새 탭으로 열었습니다.`, 'success');
  } catch(e) {
    console.error('[adminLoginAsStudent] 오류:', e);
    showToast('⚠️ 대시보드를 여는 중 오류가 발생했습니다.', 'error');
  }
};

/* ═══════════════════════════════════════
   상세 모달 탭 전환
═══════════════════════════════════════ */
document.getElementById('detailTabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-tab');
  if (!btn) return;
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
});

/* ═══════════════════════════════════════
   모달 닫기
═══════════════════════════════════════ */
['detailClose','detailCancel'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    document.getElementById('studentDetailModal').classList.remove('open');
  });
});

/* 학생 화면 열기 버튼 */
document.getElementById('viewDashboardBtn')?.addEventListener('click', () => {
  if (!currentStudent) return;
  adminLoginAsStudent(currentStudent.id);
});

document.getElementById('studentDetailModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

/* ═══════════════════════════════════════
   학생 삭제
═══════════════════════════════════════ */
document.getElementById('deleteStudentBtn')?.addEventListener('click', async () => {
  if (!currentStudent) return;

  const confirmed = confirm(
    `⚠️ 정말로 '${currentStudent.name}' 학생을 삭제하시겠습니까?\n\n` +
    `• 학생 계정 및 모든 기본 정보가 삭제됩니다.\n` +
    `• 성적, 출결, 수행평가 데이터는 별도 테이블에 보관됩니다.\n\n` +
    `이 작업은 되돌릴 수 없습니다.`
  );
  if (!confirmed) return;

  // 한 번 더 확인
  const reConfirmed = confirm(`'${currentStudent.name}' 삭제를 최종 확인합니다.`);
  if (!reConfirmed) return;

  try {
    if (currentStudent._id) {
      await fetch(`${_API}/${TABLE_PROFILES}/${currentStudent._id}`, {
        method: 'DELETE'
      });
    }

    // 로컬 목록에서도 제거
    allStudents = allStudents.filter(s => s.id !== currentStudent.id);

    document.getElementById('studentDetailModal').classList.remove('open');
    updateSummaryBar();
    renderTable();
    showToast(`🗑️ ${currentStudent.name} 학생이 삭제되었습니다.`, 'info');
    currentStudent = null;
  } catch(e) {
    showToast('삭제 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
  }
});

/* ═══════════════════════════════════════
   단계 변경 모달
═══════════════════════════════════════ */
window.openStepModal = (id) => {
  const s = allStudents.find(x => x.id === id);
  if (!s) return;
  currentStudent = s;
  document.getElementById('stepModalStudent').textContent = `${s.name} (${s.school})`;
  // 현재 단계 라디오 선택
  const val = (s.stage || '').includes('컨설팅') ? 'con' : 'gen';
  const radio = document.querySelector(`input[name="newStep"][value="${val}"]`);
  if (radio) radio.checked = true;
  document.getElementById('stepModal').classList.add('open');
};

['stepModalClose','stepModalCancel'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    document.getElementById('stepModal').classList.remove('open');
  });
});

document.getElementById('stepChangeBtn')?.addEventListener('click', () => {
  if (currentStudent) openStepModal(currentStudent.id);
});

document.getElementById('stepModalSubmit')?.addEventListener('click', async () => {
  const radio = document.querySelector('input[name="newStep"]:checked');
  if (!radio || !currentStudent) return;
  const isCon   = radio.value === 'con';
  /* DB 스키마 stage options: 1단계|2단계|3단계|3단계+컨설팅 */
  const newStage = isCon ? '3단계+컨설팅' : '3단계';
  const label    = isCon ? '컨설팅 포함' : '일반 수강';

  /* API 업데이트 */
  if (currentStudent._id) {
    try {
      const patchRes = await fetch(`${_API}/${TABLE_PROFILES}/${currentStudent._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage, consulting: isCon }),
      });
      if (!patchRes.ok) console.warn('컨설팅 변경 API 실패:', patchRes.status);
    } catch(e) { console.warn('컨설팅 변경 API 오류:', e); }
  }

  /* 로컬 데이터 업데이트 */
  const s = allStudents.find(x => x.id === currentStudent.id);
  if (s) {
    s.stage      = newStage;
    s.consulting = isCon;
  }

  document.getElementById('stepModal').classList.remove('open');
  document.getElementById('studentDetailModal').classList.remove('open');
  updateSummaryBar();
  renderTable();
  showToast(`✅ ${currentStudent.name} → ${label}으로 변경되었습니다.`);
});

/* ═══════════════════════════════════════
   학생 추가 모달
═══════════════════════════════════════ */
document.getElementById('addStudentBtn')?.addEventListener('click', () => {
  document.getElementById('addStudentModal').classList.add('open');
});

['addStudentClose','addStudentCancel'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    document.getElementById('addStudentModal').classList.remove('open');
  });
});

document.getElementById('addStudentSubmit')?.addEventListener('click', async () => {
  const name     = document.getElementById('newName')?.value.trim();
  const school   = document.getElementById('newSchool')?.value.trim();
  const grade    = document.getElementById('newGrade')?.value;
  const step     = document.getElementById('newStep')?.value;
  const memo     = document.getElementById('newMemo')?.value.trim();
  const inputId  = document.getElementById('newStudentId')?.value.trim();
  const inputPw  = document.getElementById('newStudentPw')?.value.trim();

  if (!name || !school || !grade || !step) {
    showToast('⚠️ 이름, 학교, 학년, 단계는 필수 입력 항목입니다.', 'warn');
    return;
  }

  /* ── ID: 입력값 우선, 없으면 자동 생성 ── */
  let newId = inputId;
  if (!newId) {
    const maxNum = allStudents
      .map(s => parseInt((s.id || '').replace(/^s0*/,'')) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    newId = 's' + String(maxNum + 1).padStart(3, '0');
  } else {
    /* 아이디 중복 체크 */
    try {
      const dupRes = await fetch(`${_API}/${TABLE_PROFILES}?search=${encodeURIComponent(newId)}&limit=5`);
      const dupData = await dupRes.json();
      const dup = (dupData.data || []).find(r => r.student_id === newId);
      if (dup) {
        showToast(`⚠️ 아이디 '${newId}'는 이미 사용 중입니다.`, 'warn');
        return;
      }
    } catch(e) { /* 중복 체크 실패 시 계속 진행 */ }
  }

  /* ── 비밀번호: 입력값 우선, 없으면 기본값 ── */
  const newPw = inputPw || 'dvl2024!';

  /* ── grade 값은 이미 "고1", "중1" 형태로 옴 ── */
  const gradeVal   = grade; // 예: "고1", "중1"
  const gradeNum   = parseInt(grade.replace(/[^0-9]/g, '')) || 0;
  const isConsult  = step === 'con';
  /* DB 스키마 stage options: 1단계 | 2단계 | 3단계 | 3단계+컨설팅 */
  const stageVal   = isConsult ? '3단계+컨설팅' : '1단계';
  const parentPhone = (document.getElementById('newParentPhone')?.value || '').trim();

  const newProfile = {
    student_id:   newId,
    name,
    school,
    grade:        gradeVal,
    grade_num:    gradeNum,
    class_num:    1,
    student_num:  1,
    stage:        stageVal,        // DB 스키마 options에 맞는 값
    consulting:   isConsult,       // bool 필드
    status:       '재원',          // DB 스키마 options: 재원|휴원|졸업|대기|pending
    password:     newPw,
    parent_phone: parentPhone,
    memo:         memo || '',
  };

  try {
    const res = await fetch(`${_API}/${TABLE_PROFILES}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile),
    });

    /* 실패 시 서버 오류 메시지까지 표시 */
    if (!res.ok) {
      let errMsg = `서버 오류 (${res.status})`;
      try { const errData = await res.json(); errMsg = errData.message || errMsg; } catch(e) {}
      throw new Error(errMsg);
    }
    const created = await res.json();

    /* 로컬 배열에 추가 (화면 즉시 반영) */
    allStudents.push({
      _id:        created.id,
      id:         newId,
      name,
      school,
      grade:      gradeVal,
      gradeNum,
      stage:      stageVal,
      status:     '재원',
      memo:       memo || '',
      consulting: isConsult,
      attend:     'attend',
      plan:       '-',
      assess:     '-',
      manager:    '박소현 대표',
      joinDate:   new Date().toLocaleDateString('ko-KR'),
    });

    updateSummaryBar();
    renderTable();
    document.getElementById('addStudentModal').classList.remove('open');
    ['newName','newSchool','newParentPhone','newMemo','newStudentId','newStudentPw'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = id === 'newStudentPw' ? 'davinci1!' : '';
    });
    showToast(`✅ ${name} 학생 등록 완료! 아이디: ${newId} / 비밀번호: ${newPw}`);
  } catch(err) {
    showToast(`❌ 학생 등록 실패: ${err.message}`, 'warn');
    console.error('[addStudent] 오류:', err);
  }
});

/* ═══════════════════════════════════════
   메모 저장
═══════════════════════════════════════ */
document.getElementById('saveMemoBtn')?.addEventListener('click', async () => {
  if (!currentStudent) return;
  const memo = document.getElementById('memoText')?.value || '';

  if (currentStudent._id) {
    try {
      await fetch(`${_API}/${TABLE_PROFILES}/${currentStudent._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo }),
      });
    } catch(e) { console.warn('메모 저장 API 실패:', e); }
  }

  const s = allStudents.find(x => x.id === currentStudent.id);
  if (s) s.memo = memo;
  showToast('✅ 메모가 저장되었습니다.');
});

/* ═══════════════════════════════════════
   사이드바 & 상단바 — admin.js에서 통합 처리
═══════════════════════════════════════ */
// 사이드바 토글은 admin.js에서 전역 처리 (중복 바인딩 방지)

/* ── 사용자 정보 표시 ── */
(function () {
  try {
    const u = JSON.parse(sessionStorage.getItem('dvl_user') || '{}');
    if (u.name) {
      const first = u.name.charAt(0);
      ['sidebarAdminName'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=u.name; });
      ['sidebarAdminRole'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=u.title||'관리자'; });
      const av = document.querySelector('.sidebar-user-avatar');
      if (av) av.textContent = first;
    }
  } catch(e) {}
})();

/* ── 토스트 ── */
function showToast(msg, type='ok') {
  let el = document.getElementById('dvl-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dvl-toast';
    el.style.cssText = `position:fixed;bottom:28px;right:28px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;z-index:9999;transition:all .3s ease;pointer-events:none;opacity:0;transform:translateY(10px);max-width:320px;`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'warn' ? '#b91c1c' : '#163A33';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
  }, 3000);
}

/* ═══════════════════════════════════════
   아카이브 (졸업/비활성화) 기능
═══════════════════════════════════════ */

// 모달에서 아카이브 버튼 클릭
document.getElementById('archiveBtn')?.addEventListener('click', () => {
  if (!currentStudent) return;
  const name = currentStudent.name;
  const confirmMsg = `${name} 학생을 졸업/비활성화 처리하시겠습니까?\n비활성화 후에는 활성 학생 목록에서 제외됩니다.`;
  if (!confirm(confirmMsg)) return;
  archiveStudent(currentStudent._id || currentStudent.id, currentStudent.id, '졸업');
});

// 파라미터: dbId = REST API id, localId = student_id (s001 등), statusVal = '졸업'|'비활성'
async function archiveStudent(dbId, localId, statusVal = '졸업') {
  try {
    // student_profiles에서 status 필드를 '졸업'으로 업데이트
    if (dbId) {
      await fetch(`${_API}/${TABLE_PROFILES}/${dbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusVal }),
      });
    }
    // 로컬 데이터 업데이트
    const s = allStudents.find(x => x.id === localId || x._id === dbId);
    if (s) s.status = statusVal;

    document.getElementById('studentDetailModal')?.classList.remove('open');
    updateSummaryBar();
    renderTable();
    updateArchiveList();
    showToast(`🎓 ${(s&&s.name)||localId} 학생이 ${statusVal} 처리되었습니다.`);
  } catch(e) {
    showToast('❌ 처리 중 오류가 발생했습니다.', 'warn');
    console.error(e);
  }
}

// 아카이브 섹션 토글
window.toggleArchive = function() {
  const sec = document.getElementById('archiveSection');
  const btn = document.getElementById('archiveToggleBtn');
  if (!sec) return;
  const isOpen = sec.style.display !== 'none';
  sec.style.display = isOpen ? 'none' : '';
  if (btn) btn.innerHTML = isOpen
    ? '<i class="fas fa-archive"></i> 졸업/비활성 학생 보기'
    : '<i class="fas fa-archive"></i> 졸업/비활성 학생 닫기';
  if (!isOpen) updateArchiveList();
};

// 아카이브 목록 렌더
function updateArchiveList() {
  const archived = allStudents.filter(s =>
    s.status === '졸업' || s.status === '비활성' || s.status === 'inactive' || s.status === '퇴원'
  );
  const label = document.getElementById('archiveCountLabel');
  if (label) label.textContent = `총 ${archived.length}명`;

  const list = document.getElementById('archiveList');
  if (!list) return;
  if (!archived.length) {
    list.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">졸업/비활성 학생이 없습니다.</p>';
    return;
  }
  list.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#64748b;font-size:11.5px;border-bottom:1px solid #e2e8f0;">이름</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#64748b;font-size:11.5px;border-bottom:1px solid #e2e8f0;">학교</th>
          <th style="padding:8px 12px;text-align:left;font-weight:700;color:#64748b;font-size:11.5px;border-bottom:1px solid #e2e8f0;">학년</th>
          <th style="padding:8px 12px;text-align:center;font-weight:700;color:#64748b;font-size:11.5px;border-bottom:1px solid #e2e8f0;">상태</th>
          <th style="padding:8px 12px;text-align:center;font-weight:700;color:#64748b;font-size:11.5px;border-bottom:1px solid #e2e8f0;">복원</th>
        </tr>
      </thead>
      <tbody>
        ${archived.map(s => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:9px 12px;color:#374151;font-weight:600;">${s.name}</td>
            <td style="padding:9px 12px;color:#6b7280;">${s.school||'–'}</td>
            <td style="padding:9px 12px;color:#6b7280;">${s.grade||'–'}</td>
            <td style="padding:9px 12px;text-align:center;">
              <span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;background:#f1f5f9;color:#64748b;">${s.status||'비활성'}</span>
            </td>
            <td style="padding:9px 12px;text-align:center;">
              <button onclick="restoreStudent('${s._id||''}','${s.id}')"
                style="padding:4px 12px;border-radius:7px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;font-size:12px;font-weight:600;cursor:pointer;">
                <i class="fas fa-undo"></i> 복원
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// 아카이브 → 활성 복원
window.restoreStudent = async function(dbId, localId) {
  try {
    if (dbId) {
      await fetch(`${_API}/${TABLE_PROFILES}/${dbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '재원' }),
      });
    }
    const s = allStudents.find(x => x.id === localId || x._id === dbId);
    if (s) s.status = '재원';
    updateSummaryBar();
    renderTable();
    updateArchiveList();
    showToast(`✅ ${(s&&s.name)||localId} 학생이 활성 복원되었습니다.`);
  } catch(e) {
    showToast('❌ 복원 중 오류가 발생했습니다.', 'warn');
  }
};

// 휴원 처리 버튼 연결
document.getElementById('breakBtn')?.addEventListener('click', async () => {
  if (!currentStudent) return;
  if (!confirm(`${currentStudent.name} 학생을 휴원 처리하시겠습니까?`)) return;
  try {
    if (currentStudent._id) {
      await fetch(`${_API}/${TABLE_PROFILES}/${currentStudent._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '휴원' }),
      });
    }
    const s = allStudents.find(x => x.id === currentStudent.id);
    if (s) s.status = '휴원';
    document.getElementById('studentDetailModal')?.classList.remove('open');
    updateSummaryBar();
    renderTable();
    showToast(`⏸ ${currentStudent.name} 학생이 휴원 처리되었습니다.`);
  } catch(e) {
    showToast('❌ 처리 중 오류가 발생했습니다.', 'warn');
  }
});

/* ═══════════════════════════════════════
   페이지 초기화
   admin-common.js IIFE 완료 후 즉시 실행:
   - 세션 OK  → loadStudentsFromAPI() 호출
   - 세션 실패 → location.replace() 가 이미 실행 중이므로 아무것도 하지 않음
═══════════════════════════════════════ */
if (!window._dvlSessionFailed) {
  loadStudentsFromAPI();
}
