/* =============================================
   다빈치랩 – 수행평가 관리 JS (admin, v5)
   - 모든 fetch: ../tables/... (admin 페이지 URL 기준)
   - 30초 폴링: 신규 제출 감지 → 브라우저 알림 + 소리 + 뱃지
   - 모든 관리자 계정에서 동일하게 동작
   ============================================= */

function _initAssessmentAdmin() {
  (async () => {

/* ─── 전역 변수 ─── */
const TABLE_ASSESS = 'assessments';
const TABLE_STU_A  = 'student_profiles';

let session        = null;
let allStudents    = [];
let allAssessments = [];
let currentFilter  = 'all';
let editTarget     = null;
let newAssessMode  = false;

/* 폴링용 */
let _pollTimer     = null;
let _lastKnownIds  = new Set();
let _pollStarted   = false;

const STATUS_LABEL = {
  draft:     '작성 중',
  submitted: '제출 완료',
  feedback:  '피드백 완료',
  revising:  '학생 수정 중',
  confirmed: '최종 확정',
};
const STATUS_CLASS = {
  draft:     'badge-gray',
  submitted: 'badge-blue',
  feedback:  'badge-orange',
  revising:  'badge-teal',
  confirmed: 'badge-green',
};

/* ─── 날짜 유틸 ─── */
function fmtDate(str) {
  if (!str) return '-';
  return str.replace('T', ' ').substring(0, 16);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysLeft(dueDate) {
  if (!dueDate) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const due = new Date(dueDate); due.setHours(0,0,0,0);
  return Math.ceil((due - now) / 86400000);
}
function nowKR() {
  return new Date().toLocaleString('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  });
}

/* ─── API 경로 (admin 폴더 기준 상대경로) ─── */
// admin/assessment.html 에서 ../js/assessment.js 로 로드됨
// fetch는 페이지의 현재 URL 기준으로 동작:
//   현재 URL: /api/code_sandbox_light/preview/{id}/admin/assessment.html
//   fetch('tables/assessments') → /api/code_sandbox_light/preview/{id}/admin/tables/assessments (❌ 잘못됨)
//   fetch('../tables/assessments') → /api/code_sandbox_light/preview/{id}/tables/assessments (✅ 올바름)
// 따라서 admin 페이지에서는 ../tables/ 경로를 사용해야 함
const API = '../tables/';

/* ─── 세션 확인: admin-common.js + DVL_SESSION 에서 이미 처리 ─── */
function checkSession() {
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
    const r = await fetch(`${API}${TABLE_STU_A}?limit=200`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    allStudents = (d.data || []).filter(s =>
      s.status === '재원' || s.status === 'active'
    );
    console.log('[admin] 학생 로드:', allStudents.length, '명');
  } catch(e) {
    console.error('[admin] 학생 로드 실패:', e);
    allStudents = [];
  }
}

/* ─── 수행평가 목록 로드 ─── */
async function loadAssessments(silent = false) {
  try {
    const r = await fetch(`${API}${TABLE_ASSESS}?limit=300`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const rawList = d.data || [];

    console.log('[admin] 수행평가 fetch 결과:', rawList.length, '건 (silent:', silent, ')');

    const newList = rawList.sort((a, b) =>
      (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0)
    );

    /* ── 신규 제출 감지 (폴링용) ── */
    if (_pollStarted && _lastKnownIds.size > 0) {
      const newItems = newList.filter(a => {
        const isNew = !_lastKnownIds.has(a.id);
        const becameUnread = !isNew &&
          allAssessments.find(x => x.id === a.id)?.unread_admin === false &&
          a.unread_admin === true;
        return isNew || becameUnread;
      });
      if (newItems.length > 0) {
        newItems.forEach(a => {
          fireNotification(
            `📋 새 수행평가 제출`,
            `${a.student_name || '학생'} · ${a.subject || ''} – ${a.title || '수행평가'}`,
            a
          );
        });
      }
    }

    /* 현재 ID 세트 업데이트 */
    _lastKnownIds = new Set(newList.map(a => a.id));
    allAssessments = newList;

  } catch(e) {
    console.error('[admin] 수행평가 로드 실패:', e);
    if (!silent) allAssessments = [];
  }

  renderCards();
  updateTabCounts();
  updatePendingBadge();
}

/* ─── 탭 카운트 업데이트 ─── */
function updateTabCounts() {
  const cnt = (status) => {
    if (status === 'all') return allAssessments.length;
    if (status === 'pending') return allAssessments.filter(a => a.status === 'submitted').length;
    return allAssessments.filter(a => a.status === status).length;
  };
  const ids = {
    all:       'cntAll',
    pending:   'cntPending',
    feedback:  'cntFeedback',
    revising:  'cntRevising',
    confirmed: 'cntConfirmed',
  };
  Object.entries(ids).forEach(([s, id]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = cnt(s);
  });
}

function updatePendingBadge() {
  const badge = document.getElementById('pendingBadge');
  if (!badge) return;
  const cnt = allAssessments.filter(a => a.unread_admin).length;
  badge.textContent = cnt;
  badge.style.display = cnt > 0 ? '' : 'none';

  if (cnt > 0) {
    document.title = `(${cnt}) 수행평가 관리 – 다빈치랩`;
  } else {
    document.title = '수행평가 관리 – 다빈치랩';
  }
}

/* ─── 카드 렌더링 ─── */
function renderCards() {
  const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const list = allAssessments.filter(a => {
    if (currentFilter === 'pending' && a.status !== 'submitted') return false;
    if (currentFilter !== 'all' && currentFilter !== 'pending' && a.status !== currentFilter) return false;
    if (q && !`${a.student_name}${a.subject}${a.title}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const container = document.getElementById('assessCardList');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#94a3b8;">
        <i class="fas fa-clipboard-list" style="font-size:2.5rem;margin-bottom:12px;display:block"></i>
        <p style="font-size:1rem;font-weight:600">등록된 수행평가가 없습니다.</p>
        <p style="font-size:.85rem;margin-top:4px">학생이 공지를 등록하면 여기에 표시됩니다.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(a => {
    const dl     = daysLeft(a.due_date);
    const dlText = dl === null ? '-' : dl < 0 ? `D+${Math.abs(dl)} 지남` : dl === 0 ? 'D-DAY' : `D-${dl}`;
    const dlCls  = dl !== null && dl <= 3 ? 'style="color:#ef4444;font-weight:700"' : 'style="color:#94a3b8"';
    const urgent = a.is_urgent ? '<span class="urgent-tag"><i class="fas fa-bolt"></i> 긴급</span>' : '';
    const sCls   = STATUS_CLASS[a.status] || 'badge-gray';
    const unreadDot = a.unread_admin
      ? '<span style="display:inline-block;width:9px;height:9px;background:#f59e0b;border-radius:50%;margin-left:6px;vertical-align:middle;" title="새 제출 확인 필요"></span>'
      : '';

    let history = [];
    try { history = JSON.parse(a.feedback_history || '[]'); } catch(e) {}
    const lastEntry = history[history.length - 1];
    const previewHtml = lastEntry
      ? `<div class="assess-feedback-preview">
           <i class="fas fa-${lastEntry.who === 'admin' ? 'comment-dots' : 'user-circle'}" style="margin-right:4px;"></i>
           <strong>${lastEntry.who === 'admin' ? '선생님' : '학생'}</strong>: ${(lastEntry.text || '').substring(0, 60)}${(lastEntry.text || '').length > 60 ? '…' : ''}
         </div>`
      : '';

    /* 제출 이미지 썸네일 */
    let imgThumb = '';
    try {
      const imgs = JSON.parse(a.notice_images || '[]');
      if (imgs.length) {
        imgThumb = `<div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
          ${imgs.slice(0,3).map(img =>
            `<img src="${img}" style="width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid #e5e7eb;cursor:pointer;"
                 onclick="event.stopPropagation();window._openAdminViewer('${img}')">`
          ).join('')}
          ${imgs.length > 3 ? `<div style="width:48px;height:48px;border-radius:6px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;font-weight:700;">+${imgs.length-3}</div>` : ''}
        </div>`;
      }
    } catch(e) {}

    return `
    <div class="assess-card" onclick="window._openFeedbackModal('${a.id}')">
      <div class="assess-card-top">
        <div class="assess-card-left">
          <div class="assess-avatar">${(a.student_name||'?')[0]}</div>
          <div>
            <div class="assess-student-name">${a.student_name || '-'} ${a.stage && a.stage.includes('\ucee8\uc124\ud305') ? '<span class="assess-stage con-badge">(컨)</span>' : ''}${unreadDot}</div>
            <div class="assess-subject-row">
              <span class="subject-tag">${a.subject || '-'}</span>
              <span class="assess-type">${a.assess_type || ''}</span>
              ${urgent}
            </div>
          </div>
        </div>
        <span class="status-badge ${sCls}">${STATUS_LABEL[a.status] || a.status}</span>
      </div>

      <div class="assess-title-row">
        <h4 class="assess-title">${a.title || '(제목 없음)'}</h4>
      </div>

      ${imgThumb}

      <div class="assess-meta-row">
        <span ${dlCls}><i class="fas fa-calendar-alt"></i> 마감: ${a.due_date || '-'} (${dlText})</span>
        <span style="color:#94a3b8">${a.year || ''} ${a.semester || ''}</span>
      </div>

      ${previewHtml}

      <div class="assess-card-actions" onclick="event.stopPropagation()">
        <button class="btn-ep-action btn-ep-view" onclick="window._openFeedbackModal('${a.id}')"><i class="fas fa-eye"></i> 상세</button>
        <button class="btn-ep-action btn-ep-edit" onclick="window._openNewModal('${a.id}')"><i class="fas fa-edit"></i> 수정</button>
        <button class="btn-ep-action btn-ep-del"  onclick="window._deleteAssessment('${a.id}')"><i class="fas fa-trash"></i> 삭제</button>
      </div>
    </div>`;
  }).join('');
}

/* ─── 탭 이벤트 ─── */
document.querySelectorAll('.assess-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.assess-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    renderCards();
  });
});
document.getElementById('searchInput')?.addEventListener('input', () => {
  clearTimeout(window._as);
  window._as = setTimeout(renderCards, 250);
});

/* ─── 신규/수정 모달 열기 ─── */
window._openNewModal = window.openNewModal = (assessId = null) => {
  newAssessMode = !assessId;
  editTarget    = assessId ? (allAssessments.find(a => a.id === assessId) || null) : null;

  const modal = document.getElementById('newAssessModal');
  if (!modal) return;

  const sel = document.getElementById('naStudent');
  if (sel) {
    sel.innerHTML = '<option value="">학생 선택</option>' +
      allStudents.map(s =>
        `<option value="${s.student_id}" data-name="${s.name}" data-stage="${s.stage||''}">${s.name}${(s.stage||'').includes('\ucee8\uc124\ud305') ? ' (\ucee8)' : ''}</option>`
      ).join('');
  }

  if (editTarget) {
    document.getElementById('naModalTitle').textContent = '수행평가 수정';
    if (sel) sel.value = editTarget.student_id || '';
    document.getElementById('naSubject').value  = editTarget.subject     || '';
    document.getElementById('naTitle').value    = editTarget.title       || '';
    document.getElementById('naType').value     = editTarget.assess_type || '보고서형';
    document.getElementById('naDueDate').value  = editTarget.due_date    || '';
    document.getElementById('naScope').value    = editTarget.scope       || '';
    document.getElementById('naNote').value     = editTarget.note        || '';
    document.getElementById('naYear').value     = editTarget.year        || new Date().getFullYear();
    document.getElementById('naSemester').value = editTarget.semester    || '1학기';
    document.getElementById('naUrgent').checked = !!editTarget.is_urgent;
  } else {
    document.getElementById('naModalTitle').textContent = '새 수행평가 등록';
    if (sel) sel.value = '';
    ['naSubject','naTitle','naScope','naNote'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('naType').value     = '보고서형';
    document.getElementById('naDueDate').value  = toDateStr(new Date(Date.now() + 7*86400000));
    document.getElementById('naYear').value     = new Date().getFullYear();
    document.getElementById('naSemester').value = '1학기';
    document.getElementById('naUrgent').checked = false;
  }

  modal.classList.add('open');

  /* 이미지 미리보기 초기화 */
  const imgPreview = document.getElementById('naImagePreview');
  const imgInput   = document.getElementById('naImageInput');
  if (imgPreview) imgPreview.innerHTML = '';
  if (imgInput)   imgInput.value = '';
  window._naImages = [];

  /* 수정 모드: 기존 이미지 복원 */
  if (editTarget) {
    try {
      const existing = JSON.parse(editTarget.notice_images || '[]');
      window._naImages = [...existing];
      renderNaImagePreview();
    } catch(e) {}
  }
};

/* ─── 이미지 미리보기 렌더 ─── */
function renderNaImagePreview() {
  const wrap = document.getElementById('naImagePreview');
  if (!wrap) return;
  wrap.innerHTML = (window._naImages || []).map((src, i) => `
    <div class="na-img-preview-item">
      <img src="${src}" alt="첨부 ${i+1}" />
      <button class="na-img-remove" onclick="removeNaImage(${i})" type="button">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}
window.removeNaImage = function(idx) {
  if (!window._naImages) return;
  window._naImages.splice(idx, 1);
  renderNaImagePreview();
};

/* ─── 이미지 파일 선택 공통 핸들러 ─── */
function handleNaImageFiles(fileList, inputEl) {
  const files = Array.from(fileList || []);
  if (!window._naImages) window._naImages = [];
  const remaining = 3 - window._naImages.length;
  if (remaining <= 0) { showToast('사진은 최대 3장까지 첨부할 수 있습니다.', 'warn'); return; }
  const toAdd = files.filter(f => f.type.startsWith('image/')).slice(0, remaining);
  if (files.length > remaining) showToast(`사진은 최대 3장입니다. ${toAdd.length}장만 추가합니다.`, 'warn');
  if (toAdd.length === 0) return;
  let loaded = 0;
  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      window._naImages.push(ev.target.result);
      loaded++;
      if (loaded === toAdd.length) renderNaImagePreview();
    };
    reader.readAsDataURL(file);
  });
  if (inputEl) inputEl.value = '';
}

/* 갤러리 선택 */
document.getElementById('naImageInput')?.addEventListener('change', function(e) {
  handleNaImageFiles(e.target.files, this);
});

/* 카메라 바로 촬영 */
document.getElementById('naCameraInput')?.addEventListener('change', function(e) {
  handleNaImageFiles(e.target.files, this);
});

/* ─── 저장 ─── */
document.getElementById('naSave')?.addEventListener('click', async () => {
  const sel     = document.getElementById('naStudent');
  const stuId   = sel?.value || '';
  const stuOpt  = sel?.options[sel.selectedIndex];
  const stuName = stuOpt?.dataset.name  || '';
  const stage   = stuOpt?.dataset.stage || '';

  const subject = (document.getElementById('naSubject')?.value || '').trim();
  const title   = (document.getElementById('naTitle')?.value   || '').trim();
  const dueDate = document.getElementById('naDueDate')?.value  || '';

  if (!stuId || !subject || !title || !dueDate) {
    showToast('⚠️ 학생·과목·제목·마감일은 필수입니다.', 'error');
    return;
  }

  const histEntry = [{
    who:  'admin',
    date: nowKR(),
    text: `관리자가 수행평가를 등록했습니다. [${subject}] ${title}`,
  }];

  const payload = {
    student_id:       stuId,
    student_name:     stuName,
    stage,
    subject,
    title,
    assess_type:      document.getElementById('naType')?.value     || '보고서형',
    due_date:         dueDate,
    scope:            document.getElementById('naScope')?.value    || '',
    note:             document.getElementById('naNote')?.value     || '',
    year:             String(document.getElementById('naYear')?.value  || new Date().getFullYear()),
    semester:         document.getElementById('naSemester')?.value || '1학기',
    is_urgent:        !!document.getElementById('naUrgent')?.checked,
    status:           editTarget?.status || 'submitted',
    admin_id:         session?.id   || 'admin',
    admin_name:       session?.name || '관리자',
    notice_images:    JSON.stringify(window._naImages || []),
  };

  if (!editTarget) {
    payload.unread_student   = true;
    payload.unread_admin     = false;
    payload.feedback_history = JSON.stringify(histEntry);
    payload.submit_count     = 0;
  }

  const btn = document.getElementById('naSave');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

  try {
    let res;
    if (editTarget?.id) {
      res = await fetch(`${API}${TABLE_ASSESS}/${editTarget.id}`, {
        method: 'PUT', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${API}${TABLE_ASSESS}`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
    }
    const resText = await res.text();
    console.log('[naSave] status:', res.status, resText.substring(0,100));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${resText}`);

    showToast(editTarget ? '✅ 수정되었습니다.' : '✅ 등록되었습니다. 학생에게 알림이 갑니다.', 'success');
    document.getElementById('newAssessModal')?.classList.remove('open');
    await loadAssessments(false);
  } catch(e) {
    console.error('[naSave 오류]', e);
    showToast(`⚠️ 저장 실패: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
  }
});

/* ─── 피드백 모달 열기 ─── */
window._openFeedbackModal = window.openFeedbackModal = (assessId) => {
  const a = allAssessments.find(x => x.id === assessId);
  if (!a) return;
  editTarget = a;

  const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setEl('fbAvatar', (a.student_name||'?')[0]);
  setEl('fbTitle',  a.title || '-');
  setEl('fbMeta',   `${a.student_name} · ${a.subject} · 마감: ${a.due_date || '-'}`);

  const statusEl = document.getElementById('fbCurrentStatus');
  if (statusEl) {
    statusEl.textContent = STATUS_LABEL[a.status] || a.status;
    statusEl.className   = `fb-status-label status-badge ${STATUS_CLASS[a.status] || 'badge-gray'}`;
  }

  const fbTextEl = document.getElementById('fbText');
  if (fbTextEl) fbTextEl.value = '';

  const nextStatusEl = document.getElementById('nextStatus');
  if (nextStatusEl) {
    nextStatusEl.value = (a.status === 'submitted' || a.status === 'revising') ? 'feedback' : (a.status || 'feedback');
  }

  const fbTypeRadio = document.querySelector('input[name="fbType"][value="direction"]');
  if (fbTypeRadio) fbTypeRadio.checked = true;

  const urgRadio = document.querySelector(`input[name="urgency"][value="${a.is_urgent?'urgent':'normal'}"]`);
  if (urgRadio) urgRadio.checked = true;

  const fbScoreEl = document.getElementById('fbScore');
  if (fbScoreEl) fbScoreEl.value = a.score || '';

  /* ── 공지 탭: notice_images ── */
  let noticeImages = [];
  try { noticeImages = JSON.parse(a.notice_images || '[]'); } catch(e) {}

  const noticeArea = document.getElementById('noticeImageArea');
  if (noticeArea) {
    noticeArea.innerHTML = noticeImages.length
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          ${noticeImages.map(img =>
            `<img src="${img}" style="width:110px;height:110px;border-radius:8px;object-fit:cover;cursor:pointer;border:1.5px solid #e5e7eb;"
                 onclick="window._openAdminViewer('${img}')" alt="공지이미지">`
          ).join('')}
         </div>`
      : '<div style="padding:12px;background:#f9fafb;border-radius:8px;text-align:center;color:#94a3b8;font-size:13px;margin-bottom:12px;"><i class="fas fa-image" style="margin-right:6px;"></i>업로드된 공지 이미지가 없습니다.</div>';
  }

  /* 기본 정보 */
  const noticeBox = document.getElementById('noticeDetailBox');
  if (noticeBox) {
    noticeBox.innerHTML = `
      <div class="notice-detail-grid">
        <div class="notice-detail-item"><span class="nd-label">과목</span><span class="nd-val">${a.subject||'-'}</span></div>
        <div class="notice-detail-item"><span class="nd-label">유형</span><span class="nd-val">${a.assess_type||'-'}</span></div>
        <div class="notice-detail-item"><span class="nd-label">마감일</span><span class="nd-val">${a.due_date||'-'}</span></div>
        <div class="notice-detail-item"><span class="nd-label">학년도</span><span class="nd-val">${a.year||''} ${a.semester||''}</span></div>
        <div class="notice-detail-item" style="grid-column:span 2"><span class="nd-label">범위·내용</span><span class="nd-val">${a.scope||'-'}</span></div>
        <div class="notice-detail-item" style="grid-column:span 2"><span class="nd-label">비고·메모</span><span class="nd-val">${a.note||'-'}</span></div>
        ${a.student_memo ? `<div class="notice-detail-item" style="grid-column:span 2"><span class="nd-label">학생 메모</span><span class="nd-val" style="color:#4f46e5;white-space:pre-wrap;">${a.student_memo}</span></div>` : ''}
        <div class="notice-detail-item"><span class="nd-label">제출 횟수</span><span class="nd-val">${a.submit_count || 1}회</span></div>
        <div class="notice-detail-item"><span class="nd-label">현재 상태</span><span class="nd-val">${STATUS_LABEL[a.status]||a.status}</span></div>
      </div>`;
  }

  /* ── 이력 탭: feedback_history ── */
  let history = [];
  try { history = JSON.parse(a.feedback_history || '[]'); } catch(e) {}

  const timelineEl = document.getElementById('historyTimeline');
  if (timelineEl) {
    if (!history.length) {
      timelineEl.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:30px 0;">아직 대화 이력이 없습니다.</p>';
    } else {
      timelineEl.innerHTML = history.map(h => {
        const isAdmin = h.who === 'admin';
        return `
          <div style="margin-bottom:14px;padding:12px 14px;
               background:${isAdmin?'#f0fdf4':'#eef2ff'};border-radius:12px;
               border-left:3px solid ${isAdmin?'#059669':'#4f46e5'};">
            <div style="font-size:12px;font-weight:700;color:${isAdmin?'#059669':'#4f46e5'};margin-bottom:5px;">
              ${isAdmin ? '👩‍🏫 관리자' : '👤 학생'}
              <span style="font-size:11px;color:#94a3b8;font-weight:400;margin-left:6px;">${h.date||''}</span>
            </div>
            <div style="font-size:13px;color:#374151;line-height:1.65;white-space:pre-wrap;">${h.text||''}</div>
            ${h.score ? `<div style="margin-top:6px;display:inline-block;padding:3px 12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border-radius:20px;font-size:12px;font-weight:700;">최종 점수: ${h.score}점</div>` : ''}
          </div>`;
      }).join('');
    }
  }

  /* 탭 초기화 */
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.detail-tab[data-tab="notice"]')?.classList.add('active');
  document.getElementById('tab-notice')?.classList.add('active');

  /* 미읽음 처리 */
  if (a.unread_admin) markAdminRead(a.id);

  document.getElementById('feedbackModal')?.classList.add('open');
};

/* 관리자 읽음 처리 */
async function markAdminRead(id) {
  try {
    await fetch(`${API}${TABLE_ASSESS}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ unread_admin: false }),
    });
    const r = allAssessments.find(x => x.id === id);
    if (r) r.unread_admin = false;
    updatePendingBadge();
  } catch(e) {}
}

/* 이미지 뷰어 */
window._openAdminViewer = window.openAdminViewer = (src) => {
  let viewer = document.getElementById('adminImgViewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'adminImgViewer';
    viewer.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;';
    viewer.innerHTML = `
      <button onclick="document.getElementById('adminImgViewer').style.display='none'"
        style="position:fixed;top:20px;right:24px;background:rgba(255,255,255,.25);color:white;border:none;border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-times"></i>
      </button>
      <img id="adminViewerImg" src="" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;" onclick="event.stopPropagation()">`;
    viewer.addEventListener('click', e => { if(e.target===viewer) viewer.style.display='none'; });
    document.body.appendChild(viewer);
  }
  document.getElementById('adminViewerImg').src = src;
  viewer.style.display = 'flex';
};

/* ─── 피드백 전송 ─── */
document.getElementById('fbSubmit')?.addEventListener('click', async () => {
  if (!editTarget) return;

  const fbText     = (document.getElementById('fbText')?.value || '').trim();
  const nextStatus = document.getElementById('nextStatus')?.value || 'feedback';
  const fbType     = document.querySelector('input[name="fbType"]:checked')?.value || 'direction';
  const isUrgent   = document.querySelector('input[name="urgency"]:checked')?.value === 'urgent';
  const scoreVal   = (document.getElementById('fbScore')?.value || '').trim();

  if (!fbText) { showToast('⚠️ 피드백 내용을 입력해주세요.', 'error'); return; }

  let history = [];
  try { history = JSON.parse(editTarget.feedback_history || '[]'); } catch(e) {}

  const newEntry = { who:'admin', date:nowKR(), text:fbText };
  if (scoreVal) newEntry.score = scoreVal;
  history.push(newEntry);

  const payload = {
    feedback:         fbText,
    feedback_type:    fbType,
    status:           nextStatus,
    next_status:      nextStatus,
    is_urgent:        isUrgent,
    admin_id:         session?.id   || 'admin',
    admin_name:       session?.name || '관리자',
    feedback_history: JSON.stringify(history),
    unread_student:   true,
    unread_admin:     false,
  };
  if (scoreVal) payload.score = scoreVal;

  const btn = document.getElementById('fbSubmit');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...'; }

  try {
    const res = await fetch(`${API}${TABLE_ASSESS}/${editTarget.id}`, {
      method: 'PATCH', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('✅ 피드백이 전송되었습니다. 학생에게 알림이 갑니다.', 'success');
    document.getElementById('feedbackModal')?.classList.remove('open');
    await loadAssessments(false);
  } catch(e) {
    showToast(`⚠️ 전송 실패: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 피드백 전송'; }
  }
});

/* ─── 삭제 ─── */
window._deleteAssessment = window.deleteAssessment = async (id) => {
  if (!confirm('이 수행평가를 삭제하시겠습니까?')) return;
  try {
    await fetch(`${API}${TABLE_ASSESS}/${id}`, { method:'DELETE' });
    showToast('🗑️ 삭제되었습니다.', 'info');
    await loadAssessments(false);
  } catch(e) { showToast('⚠️ 삭제 실패', 'error'); }
};

/* ─── 탭 전환 (피드백 모달 내) ─── */
document.querySelectorAll('.detail-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
  });
});

/* ─── 모달 닫기 ─── */
const closeModal = (id) => document.getElementById(id)?.classList.remove('open');
document.getElementById('fbClose')?.addEventListener('click',  () => closeModal('feedbackModal'));
document.getElementById('fbCancel')?.addEventListener('click', () => closeModal('feedbackModal'));
document.getElementById('naCancel')?.addEventListener('click', () => closeModal('newAssessModal'));
/* 헤더 등록 버튼 → naSave 와 동일 동작 */
document.getElementById('naSaveHeader')?.addEventListener('click', () => {
  document.getElementById('naSave')?.click();
});
document.getElementById('feedbackModal')?.addEventListener('click', e => {
  if (e.target.id === 'feedbackModal') closeModal('feedbackModal');
});
document.getElementById('newAssessModal')?.addEventListener('click', e => {
  if (e.target.id === 'newAssessModal') closeModal('newAssessModal');
});

/* ═══════════════════════════════════════════
   🔔 실시간 알림 시스템 (30초 폴링)
   - 모든 관리자 계정에서 동시 수신 (admin_id 필터 없이 전체 조회)
   - 브라우저 알림 권한 요청 → 허용 시 Push 알림
   - 탭 타이틀 뱃지 + 인앱 토스트 항상 표시
════════════════════════════════════════════ */

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function fireNotification(title, body, assessData) {
  showToast(`🔔 ${body}`, 'info');

  if ('Notification' in window && Notification.permission === 'granted') {
    const notif = new Notification(title, {
      body,
      icon:  '../images/logo-icon.png',
      badge: '../images/logo-icon.png',
      tag:   `assess-${assessData?.id || Date.now()}`,
      requireInteraction: true,
    });
    notif.onclick = () => {
      window.focus();
      if (assessData?.id) window._openFeedbackModal(assessData.id);
      notif.close();
    };
  }

  playNotificationSound();
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function startPolling() {
  if (_pollTimer) return;
  _pollStarted = true;
  _pollTimer = setInterval(async () => {
    await loadAssessments(true);
  }, 30000);
  console.log('[poll] 실시간 알림 폴링 시작 (30초 간격)');
}

/* ─── Sidebar ─── */
const openSb  = () => {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
};
const closeSb = () => {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
};
document.getElementById('sidebarToggle')?.addEventListener('click', openSb);
document.getElementById('sidebarClose')?.addEventListener('click',  closeSb);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSb);

/* ─── Toast ─── */
function showToast(msg, type = 'info') {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
    document.body.appendChild(c);
  }
  const col = { success:'#163A33', info:'#1d4ed8', error:'#ef4444' };
  const t   = document.createElement('div');
  t.style.cssText = `background:${col[type]||col.info};color:#fff;padding:12px 22px;border-radius:999px;font-size:13.5px;font-weight:600;font-family:'Noto Sans KR',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2);opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;white-space:nowrap;max-width:90vw;`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  }));
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 350);
  }, 5000);
}

/* ─── Init ─── */
session = window._dvlAdminSession;
if (!session) return;

console.log('[admin/assessment] init 시작. session:', session?.id);

await requestNotificationPermission();
await loadStudents();
await loadAssessments(false);
startPolling();

  })(); /* end async IIFE */
} /* end _initAssessmentAdmin */

/* DOM이 이미 로드되었거나 로드될 때 실행 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initAssessmentAdmin);
} else {
  _initAssessmentAdmin();
}