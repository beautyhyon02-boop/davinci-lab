(() => {
  'use strict';

  const API_BASE = '/tables';
  const STUDENT_ENDPOINT = `${API_BASE}/student_profiles`;

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#studentForm'),
    submitBtn: $('#submitBtn'),
    refreshBtn: $('#refreshBtn'),
    formStatus: $('#formStatus'),
    rows: $('#studentRows'),
    countTotal: $('#countTotal'),
    countActive: $('#countActive'),
    countPending: $('#countPending')
  };

  let submitting = false;

  function showStatus(type, message) {
    if (!els.formStatus) return;
    els.formStatus.className = `status show ${type}`;
    els.formStatus.textContent = message;
  }

  function clearStatus() {
    if (!els.formStatus) return;
    els.formStatus.className = 'status';
    els.formStatus.textContent = '';
  }

  function normalizePhone(value) {
    return String(value || '').trim().replace(/[^0-9-]/g, '');
  }

  function collectFormPayload() {
    const formData = new FormData(els.form);
    const payload = {
      student_name: String(formData.get('student_name') || '').trim(),
      student_id: String(formData.get('student_id') || '').trim(),
      password: String(formData.get('password') || '').trim(),
      year: String(formData.get('year') || '').trim(),
      school_name: String(formData.get('school_name') || '').trim(),
      parent_phone: normalizePhone(formData.get('parent_phone')),
      status: String(formData.get('status') || 'pending').trim(),
      notes: String(formData.get('notes') || '').trim(),
      updated_at: new Date().toISOString()
    };

    if (!payload.student_name) throw new Error('학생 이름을 입력해 주세요.');
    if (!payload.student_id) throw new Error('학생 아이디를 입력해 주세요.');
    if (!payload.password) throw new Error('비밀번호를 입력해 주세요.');
    if (!payload.year) throw new Error('학년을 선택해 주세요.');

    const optionalKeys = ['school_name', 'parent_phone', 'notes'];
    optionalKeys.forEach((key) => {
      if (!payload[key]) delete payload[key];
    });

    return payload;
  }

  async function parseErrorResponse(res) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json?.message || json?.error || json?.details || text || `HTTP ${res.status}`;
    } catch (_) {
      return text || `HTTP ${res.status}`;
    }
  }

  async function fetchStudents() {
    const url = `${STUDENT_ENDPOINT}?limit=100&sort=created_at.desc`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data || []);
  }

  function renderCounts(students) {
    const total = students.length;
    const active = students.filter((x) => String(x.status || '').toLowerCase() === 'active').length;
    const pending = students.filter((x) => String(x.status || '').toLowerCase() === 'pending').length;
    if (els.countTotal) els.countTotal.textContent = String(total);
    if (els.countActive) els.countActive.textContent = String(active);
    if (els.countPending) els.countPending.textContent = String(pending);
  }

  function renderRows(students) {
    if (!els.rows) return;
    if (!students.length) {
      els.rows.innerHTML = '<tr><td colspan="4" class="muted">등록된 학생이 없습니다.</td></tr>';
      return;
    }

    els.rows.innerHTML = students.slice(0, 20).map((s) => {
      const status = String(s.status || '').toLowerCase();
      const cls = status === 'pending' ? 'pill pending' : 'pill';
      return `
        <tr>
          <td>${escapeHtml(s.student_name || '-')}</td>
          <td>${escapeHtml(s.student_id || '-')}</td>
          <td>${escapeHtml(s.year || '-')}</td>
          <td><span class="${cls}">${escapeHtml(status || '-')}</span></td>
        </tr>
      `;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function refreshStudents() {
    try {
      const students = await fetchStudents();
      renderCounts(students);
      renderRows(students);
    } catch (err) {
      console.error('[students] refresh failed:', err);
      if (els.rows) {
        els.rows.innerHTML = `<tr><td colspan="4">목록 로딩 실패: ${escapeHtml(err.message || String(err))}</td></tr>`;
      }
    }
  }

  async function createStudent(payload) {
    const res = await fetch(STUDENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }

    const text = await res.text();
    try {
      return text ? JSON.parse(text) : { ok: true };
    } catch (_) {
      return { ok: true, raw: text };
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    clearStatus();

    try {
      const payload = collectFormPayload();
      submitting = true;
      if (els.submitBtn) {
        els.submitBtn.disabled = true;
        els.submitBtn.textContent = '등록 중...';
      }

      await createStudent(payload);
      showStatus('ok', '학생 등록이 완료되었습니다.');
      els.form.reset();
      $('#status').value = 'pending';
      await refreshStudents();
    } catch (err) {
      console.error('[students] create failed:', err);
      showStatus('err', `학생 등록 실패: ${err.message || String(err)}`);
    } finally {
      submitting = false;
      if (els.submitBtn) {
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = '학생 등록';
      }
    }
  }

  function bindEvents() {
    if (els.form) els.form.addEventListener('submit', onSubmit);
    if (els.refreshBtn) els.refreshBtn.addEventListener('click', refreshStudents);
  }

  async function boot() {
    bindEvents();
    await refreshStudents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
