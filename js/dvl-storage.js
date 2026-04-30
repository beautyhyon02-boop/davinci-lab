/* ================================================================
   DaVinci Lab – 데이터 저장 API 모듈 (dvl-storage.js)
   역할: localStorage(빠른 캐시) + REST API(서버 영구 저장) 동시 사용
   
   사용법:
     DvlStorage.save(studentId, section, value)  → 저장
     DvlStorage.load(studentId, section)          → 불러오기
     DvlStorage.loadAll(studentId)                → 전체 불러오기
   ================================================================ */

const DvlStorage = (function () {
  'use strict';

  const TABLE = 'student_records';

  /* ── localStorage 키 생성 ── */
  function lsKey(studentId, section) {
    return `dvl_record_${studentId}_${section}`;
  }

  /* ── localStorage에서 읽기 ── */
  function lsGet(studentId, section) {
    return localStorage.getItem(lsKey(studentId, section));
  }

  /* ── localStorage에 쓰기 ── */
  function lsSet(studentId, section, value) {
    try {
      localStorage.setItem(lsKey(studentId, section), value);
    } catch (e) {
      console.warn('[DvlStorage] localStorage 저장 실패:', e);
    }
  }

  /* ── REST API: 해당 학생+섹션 레코드 검색 ── */
  async function apiFind(studentId, section) {
    try {
      const res = await fetch(
        `tables/${TABLE}?search=${encodeURIComponent(studentId)}&limit=200`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const rows = data.data || [];
      return rows.find(r => r.student_id === studentId && r.section === section) || null;
    } catch (e) {
      return null;
    }
  }

  /* ── REST API: 학생 전체 레코드 불러오기 ── */
  async function apiFindAll(studentId) {
    try {
      const res = await fetch(
        `tables/${TABLE}?search=${encodeURIComponent(studentId)}&limit=500`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).filter(r => r.student_id === studentId);
    } catch (e) {
      return [];
    }
  }

  /* ── REST API: 저장 (없으면 POST, 있으면 PUT) ── */
  async function apiSave(studentId, section, value, updatedBy) {
    try {
      const existing = await apiFind(studentId, section);
      const body = {
        student_id: studentId,
        section:    section,
        value:      typeof value === 'string' ? value : JSON.stringify(value),
        updated_by: updatedBy || studentId,
      };

      let res;
      if (existing) {
        res = await fetch(`tables/${TABLE}/${existing.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
      } else {
        res = await fetch(`tables/${TABLE}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
      }
      return res.ok;
    } catch (e) {
      console.warn('[DvlStorage] API 저장 실패 (localStorage만 사용):', e);
      return false;
    }
  }

  /* ================================================================
     공개 API
  ================================================================ */

  /**
   * 저장: localStorage에 즉시 저장 + 서버에 비동기 저장
   * @param {string} studentId  - 학생 계정 ID (예: 's001')
   * @param {string} section    - 섹션 키 (예: 'r1_name', 'awards', 'behavior_g1')
   * @param {*}      value      - 저장할 값 (문자열 또는 객체/배열)
   * @param {string} updatedBy  - 수정자 ID (기본: studentId)
   * @returns {Promise<boolean>} 서버 저장 성공 여부
   */
  async function save(studentId, section, value, updatedBy) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    /* 1. localStorage 즉시 저장 (오프라인 대비) */
    lsSet(studentId, section, strValue);
    /* 2. 서버 비동기 저장 */
    return apiSave(studentId, section, strValue, updatedBy);
  }

  /**
   * 불러오기: 서버 우선 → 실패 시 localStorage 폴백
   * @param {string} studentId
   * @param {string} section
   * @returns {Promise<string|null>}
   */
  async function load(studentId, section) {
    try {
      const row = await apiFind(studentId, section);
      if (row && row.value !== undefined && row.value !== null) {
        /* 서버 데이터를 localStorage에도 동기화 */
        lsSet(studentId, section, row.value);
        return row.value;
      }
    } catch (e) { /* 서버 실패 시 폴백 */ }
    return lsGet(studentId, section);
  }

  /**
   * 전체 불러오기: 서버에서 학생의 모든 레코드를 한 번에 받아서
   * localStorage를 업데이트하고 Map으로 반환
   * @param {string} studentId
   * @returns {Promise<Map<string, string>>} section → value 맵
   */
  async function loadAll(studentId) {
    const map = new Map();
    try {
      const rows = await apiFindAll(studentId);
      rows.forEach(r => {
        if (r.section && r.value !== undefined) {
          lsSet(studentId, r.section, r.value); /* localStorage 동기화 */
          map.set(r.section, r.value);
        }
      });
    } catch (e) { /* 서버 실패 무시 */ }
    return map;
  }

  /**
   * localStorage에서만 즉시 읽기 (동기, API 없이 빠름)
   */
  function loadLocal(studentId, section) {
    return lsGet(studentId, section);
  }

  /**
   * 여러 섹션을 한 번에 저장 (배치)
   * @param {string} studentId
   * @param {Object} sectionMap  - { section: value, ... }
   */
  async function saveMany(studentId, sectionMap, updatedBy) {
    const promises = Object.entries(sectionMap).map(([section, value]) =>
      save(studentId, section, value, updatedBy)
    );
    const results = await Promise.allSettled(promises);
    return results.every(r => r.status === 'fulfilled' && r.value === true);
  }

  return { save, load, loadAll, loadLocal, saveMany };
})();

/* 전역 등록 */
window.DvlStorage = DvlStorage;
