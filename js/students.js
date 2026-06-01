(() => {
  'use strict';

  if (window.__DAVINCI_ADMIN_STUDENTS_BOOTED__) {
    console.log('[students] duplicate boot prevented');
    return;
  }
  window.__DAVINCI_ADMIN_STUDENTS_BOOTED__ = true;

  const API_BASE = '/tables';
  const STUDENT_ENDPOINT = `${API_BASE}/student_profiles`;
  const REFRESH_REPAINT_MS = [250, 800, 1800];

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#studentForm'),
    submitBtn: $('#submitBtn'),
    refreshBtn: $('#refreshBtn'),
    formStatus: $('#formStatus'),
    approvalStatus: $('#approvalStatus'),
    rows: $('#studentRows'),
    pendingRows: $('#pendingRows'),
    countTotal: $('#countTotal'),
    countActive: $('#countActive'),
    countPending: $('#countPending'),
    countRejected: $('#countRejected'),
    pendingSection: $('#pendingSection')
  };

  let submitting = false;
  let loading = false;
  let studentsCache = [];
  let actingIds = new Set();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizePhone(value) {
    return String(value || '').trim().replace(/[^0-9-]/g, '');
  }

  function showBox(el, type, message) {
    if (!el) return;
    el.className = `status-box show ${type}`;
    el.textContent = message;
  }

  function clearBox(el) {
    if (!el) return;
    el.className = 'status-box';
    el.textContent = '';
  }

  function parseJsonMaybe(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch (_) {
      return null;
    }
  }

  async function parseErrorResponse(res) {
    const text = await res.text();
    const json = parseJsonMaybe(text);
    return json?.message || json?.error || json?.details || text || `HTTP ${res.status}`;
  }

  function normalizeStudent(raw) {
    const name = raw?.name || raw?.student_name || '';
    const school = raw?.school || raw?.school_name || '';
    const grade = raw?.grade || raw?.year || '';
    const approvalStatus = String(raw?.approval_status || '').toLowerCase();
    const statusRaw = String(raw?.status || '').toLowerCase();
    let visibleStatus = statusRaw;

    if (!visibleStatus) {
      if (approvalStatus === 'pending') visibleStatus = 'pending';
      else if (approvalStatus === 'approved') visibleStatus = 'active';
      else if (approvalStatus === 'rejected') visibleStatus = 'rejected';
    }

    if (!visibleStatus && raw?.approved === true) visibleStatus = 'active';
    if (!visibleStatus) visibleStatus = 'pending';

    return {
      ...raw,
      id: raw?.id,
      name,
      school,
      grade,
      status: visibleStatus,
      approval_status: approvalStatus || (visibleStatus === 'active' ? 'approved' : visibleStatus),
      approved: raw?.approved === true || visibleStatus === 'active'
    };
  }

  function buildCreatePayload() {
    const formData = new FormData(els.form);
    const initialStatus = String(formData.get('status') || 'pending').trim().toLowerCase();
    const approved = initialStatus === 'active';
    const memo = String(formData.get('memo') || '').trim();

    const payload = {
      name: String(formData.get('student_name') || '').trim(),
      student_id: String(formData.get('student_id') || '').trim(),
      password: String(formData.get('password') || '').trim(),
      grade: String(formData.get('year') || '').trim(),
      school: String(formData.get('school') || '').trim(),
      parent_phone: normalizePhone(formData.get('parent_phone')),
      status: initialStatus,
      approved,
      approval_status: approved ? 'approved' : 'pending',
      approved_at: approved ? nowIso() : null,
      rejected_at: null,
      memo,
      notes: memo,
      registered_at: nowIso(),
      updated_at: nowIso()
    };

    if (!payload.name) throw new Error('학생 이름을 입력해 주세요.');
    if (!payload.student_id) throw new Error('학생 아이디를 입력해 주세요.');
    if (!payload.password) throw new Error('비밀번호를 입력해 주세요.');
    if (!payload.grade) throw new Error('학년을 선택해 주세요.');
    if (!payload.school) throw new Error('학교명을 입력해 주세요.');

    ['parent_phone', 'memo', 'notes'].forEach((key) => {
      if (!payload[key]) delete payload[key];
    });

    return payload;
  }

  async function fetchStudents() {
    const url = `${STUDENT_ENDPOINT}?limit=200&sort=created_at.desc`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    const data = await res.json();
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    return list.map(normalizeStudent);
  }

  async function createStudent(payload) {
    const res = await fetch(STUDENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    return parseJsonMaybe(await res.text()) || { ok: true };
  }

  async function patchStudent(id, payload) {
    const url = `${STUDENT_ENDPOINT}?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    return parseJsonMaybe(await res.text()) || { ok: true };
  }

  function setCounts(students) {
    const total = students.length;
    const active = students.filter((s) => s.status === 'active').length;
    const pending = students.filter((s) => s.status === 'pending').length;
    const rejected = students.filter((s) => s.status === 'rejected').length;

    els.countTotal && (els.countTotal.textContent = String(total));
    els.countActive && (els.countActive.textContent = String(active));
    els.countPending && (els.countPending.textContent = String(pending));
    els.countRejected && (els.countRejected.textContent = String(rejected));
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function renderPendingRows(students) {
    if (!els.pendingRows) return;
    const pendingStudents = students.filter((s) => s.status === 'pending');

    if (!pendingStudents.length) {
      els.pendingRows.innerHTML = '<tr><td colspan="6" class="empty">승인 대기 학생이 없습니다.</td></tr>';
      return;
    }

    els.pendingRows.innerHTML = pendingStudents.map((s) => {
      const busy = actingIds.has(String(s.id));
      return `
        <tr>
          <td>${escapeHtml(s.name || '-')}</td>
          <td>${escapeHtml(s.student_id || '-')}</td>
          <td>${escapeHtml(s.school || '-')}</td>
          <td>${escapeHtml(s.grade || '-')}</td>
          <td><span class="pill pending">pending</span></td>
          <td>
            <div class="inline-actions">
              <button type="button" class="btn-sm btn-ok" data-action="approve" data-id="${escapeHtml(s.id)}" ${busy ? 'disabled' : ''}>승인</button>
              <button type="button" class="btn-sm btn-danger" data-action="reject" data-id="${escapeHtml(s.id)}" ${busy ? 'disabled' : ''}>반려</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderStudentRows(students) {
    if (!els.rows) return;
    if (!students.length) {
      els.rows.innerHTML = '<tr><td colspan="8" class="empty">등록된 학생이 없습니다.</td></tr>';
      return;
    }

    els.rows.innerHTML = students.map((s) => {
      const busy = actingIds.has(String(s.id));
      const showApprove = s.status === 'pending';
      const showRestore = s.status === 'rejected';
      const pillClass = s.status === 'pending' ? 'pending' : (s.status === 'rejected' ? 'rejected' : 'active');

      return `
        <tr>
          <td>${escapeHtml(s.name || '-')}</td>
          <td>${escapeHtml(s.student_id || '-')}</td>
          <td>${escapeHtml(s.school || '-')}</td>
          <td>${escapeHtml(s.grade || '-')}</td>
          <td><span class="pill ${pillClass}">${escapeHtml(s.status || '-')}</span></td>
          <td>${escapeHtml(s.approval_status || '-')}</td>
          <td>${formatDate(s.created_at || s.registered_at)}</td>
          <td>
            <div class="inline-actions">
              ${showApprove ? `<button type="button" class="btn-sm btn-ok" data-action="approve" data-id="${escapeHtml(s.id)}" ${busy ? 'disabled' : ''}>승인</button>` : ''}
              ${showApprove ? `<button type="button" class="btn-sm btn-danger" data-action="reject" data-id="${escapeHtml(s.id)}" ${busy ? 'disabled' : ''}>반려</button>` : ''}
              ${showRestore ? `<button type="button" class="btn-sm btn-primary" data-action="restore" data-id="${escapeHtml(s.id)}" ${busy ? 'disabled' : ''}>대기로 복구</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderAll(students) {
    studentsCache = students.slice();
    setCounts(studentsCache);
    renderPendingRows(studentsCache);
    renderStudentRows(studentsCache);
  }

  function forceRepaintIfNeeded() {
    if (!studentsCache.length) return;
    const pendingText = els.pendingRows?.textContent || '';
    const allText = els.rows?.textContent || '';
    if (pendingText.includes('불러오는 중') || allText.includes('불러오는 중')) {
      console.log('[students] force repaint from cache');
      renderAll(studentsCache);
    }
  }

  function scheduleRepaints() {
    REFRESH_REPAINT_MS.forEach((ms) => {
      window.setTimeout(forceRepaintIfNeeded, ms);
    });
  }

  function setLoadingRows() {
    if (els.pendingRows) els.pendingRows.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중...</td></tr>';
    if (els.rows) els.rows.innerHTML = '<tr><td colspan="8" class="empty">불러오는 중...</td></tr>';
  }

  async function refreshStudents(options = {}) {
    if (loading && !options.force) return;
    loading = true;
    if (options.showLoading !== false) setLoadingRows();

    try {
      const students = await fetchStudents();
      renderAll(students);
      scheduleRepaints();
    } catch (err) {
      console.error('[students] refresh failed:', err);
      const message = escapeHtml(err.message || String(err));
      if (els.pendingRows) els.pendingRows.innerHTML = `<tr><td colspan="6" class="empty">목록 로딩 실패: ${message}</td></tr>`;
      if (els.rows) els.rows.innerHTML = `<tr><td colspan="8" class="empty">목록 로딩 실패: ${message}</td></tr>`;
      showBox(els.approvalStatus, 'err', `목록 로딩 실패: ${err.message || String(err)}`);
    } finally {
      loading = false;
    }
  }

  function buildApprovalPayload(action) {
    const base = { updated_at: nowIso() };
    if (action === 'approve') {
      return {
        ...base,
        status: 'active',
        approved: true,
        approval_status: 'approved',
        approved_at: nowIso(),
        rejected_at: null
      };
    }
    if (action === 'reject') {
      return {
        ...base,
        status: 'rejected',
        approved: false,
        approval_status: 'rejected',
        rejected_at: nowIso()
      };
    }
    return {
      ...base,
      status: 'pending',
      approved: false,
      approval_status: 'pending',
      approved_at: null,
      rejected_at: null
    };
  }

  function getStudentById(id) {
    return studentsCache.find((s) => String(s.id) === String(id));
  }

  async function handleRowAction(action, id) {
    const student = getStudentById(id);
    if (!student) {
      showBox(els.approvalStatus, 'err', '대상 학생 정보를 찾지 못했습니다. 목록을 새로고침해 주세요.');
      return;
    }

    const label = action === 'approve' ? '승인' : (action === 'reject' ? '반려' : '대기로 복구');

    try {
      actingIds.add(String(id));
      renderAll(studentsCache);
      showBox(els.approvalStatus, 'info', `${student.name || student.student_id || '학생'} ${label} 처리 중...`);
      await patchStudent(id, buildApprovalPayload(action));
      await refreshStudents({ force: true, showLoading: false });
      showBox(els.approvalStatus, 'ok', `${student.name || student.student_id || '학생'} ${label} 완료`);
    } catch (err) {
      console.error('[students] action failed:', err);
      showBox(els.approvalStatus, 'err', `${label} 실패: ${err.message || String(err)}`);
      renderAll(studentsCache);
    } finally {
      actingIds.delete(String(id));
      renderAll(studentsCache);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    clearBox(els.formStatus);

    try {
      submitting = true;
      if (els.submitBtn) {
        els.submitBtn.disabled = true;
        els.submitBtn.textContent = '등록 중...';
      }
      const payload = buildCreatePayload();
      await createStudent(payload);
      els.form?.reset();
      const statusEl = $('#status');
      if (statusEl) statusEl.value = 'pending';
      showBox(els.formStatus, 'ok', '학생 등록이 완료되었습니다. pending 학생은 아래 승인 대기 학생 표에서 바로 승인할 수 있습니다.');
      await refreshStudents({ force: true, showLoading: false });
    } catch (err) {
      console.error('[students] create failed:', err);
      showBox(els.formStatus, 'err', `학생 등록 실패: ${err.message || String(err)}`);
    } finally {
      submitting = false;
      if (els.submitBtn) {
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = '학생 등록';
      }
    }
  }

  function onTableClick(event) {
    const btn = event.target.closest('button[data-action][data-id]');
    if (!btn) return;
    handleRowAction(btn.dataset.action, btn.dataset.id);
  }

  function highlightPendingSectionIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('filter') === 'pending' && els.pendingSection) {
      els.pendingSection.classList.add('highlight');
      window.setTimeout(() => els.pendingSection.classList.remove('highlight'), 2500);
      els.pendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function bindEvents() {
    els.form?.addEventListener('submit', onSubmit);
    els.refreshBtn?.addEventListener('click', () => refreshStudents({ force: true }));
    els.pendingRows?.addEventListener('click', onTableClick);
    els.rows?.addEventListener('click', onTableClick);
  }

  async function boot() {
    bindEvents();
    highlightPendingSectionIfNeeded();
    await refreshStudents({ force: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
