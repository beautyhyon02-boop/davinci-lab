/* ════════════════════════════════════════════════════════
   🎯 다빈치랩 시험 플래너 v2 - JavaScript
   작성일: 2026-05-11
   목표: 23명 학생을 위한 자동 배분 플래너
   ════════════════════════════════════════════════════════ */

const API_BASE = '/tables';
const TBL = {
  planners: 'exam_planners',
  schedules: 'daily_schedules',
  notes: 'cornell_notes',
  vocab: 'vocabulary_master',
  vocabProgress: 'vocabulary_progress',
  subjects: 'subject_master',
  students: 'student_profiles'
};

/* ════════════════════════════════════════════════════════
   📦 전역 상태
   ════════════════════════════════════════════════════════ */
let currentStudent = null;
let currentPlanner = null;
let allSubjects = [];
let selectedSubjects = [];
let selectedVocabCount = 20;
let activeWeekTab = 'pre';
let currentCornellSlot = null;
let activeHighlightColor = 'yellow';

/* 5단계 학습법 정의 */
const STAGES = [
  { id: 1, name: '개념이해', emoji: '💡', color: '#10B981' },
  { id: 2, name: '개념완성', emoji: '📖', color: '#3B82F6' },
  { id: 3, name: '유형문제', emoji: '📝', color: '#8B5CF6' },
  { id: 4, name: '심화문제', emoji: '🔥', color: '#F59E0B' },
  { id: 5, name: '최종문제', emoji: '🎯', color: '#EF4444' }
];

/* 주차 정의 */
const WEEK_DEFS = [
  { id: 'pre', cls: 'pre', emoji: '🌱', name: 'PRE주차', subtitle: '플래너 적응 & 범위 파악' },
  { id: 'w1', cls: 'w1', emoji: '📘', name: '1주차', subtitle: '전체 범위 1회독' },
  { id: 'w2', cls: 'w2', emoji: '📕', name: '2주차', subtitle: '약점 보완 & 심화' },
  { id: 'w3', cls: 'w3', emoji: '📙', name: '3주차', subtitle: '실전 문제 풀이' },
  { id: 'w4', cls: 'w4', emoji: '🔥', name: '4주차', subtitle: '최종 점검 & 시험' }
];

/* ════════════════════════════════════════════════════════
   🚀 초기화
   ════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading('학생 정보를 불러오는 중...');
  
  // 1. 세션 확인
  if (!checkSession()) {
    hideLoading();
    return;
  }
  
  // 2. 과목 마스터 로드
  await loadSubjects();
  
  // 3. 기존 플래너 있는지 확인
  await loadExistingPlanner();
  
  // 4. 이벤트 리스너 설정
  setupEventListeners();
  
  hideLoading();
});

/* ════════════════════════════════════════════════════════
   🔐 세션 확인
   ════════════════════════════════════════════════════════ */
function checkSession() {
  // 🎯 다빈치랩 정확한 세션 키 사용 (진단 완료)
  // 우선순위: dvl_user > dvSession > dvl_student_session > dvl_session
  const SESSION_KEYS = ['dvl_user', 'dvSession', 'dvl_student_session', 'dvl_session'];
  
  let userStr = null;
  let foundKey = null;
  
  // sessionStorage 먼저 시도
  for (const key of SESSION_KEYS) {
    const val = sessionStorage.getItem(key);
    if (val && val !== 'null' && val !== 'undefined' && val.includes('{')) {
      userStr = val;
      foundKey = `sessionStorage.${key}`;
      break;
    }
  }
  
  // 없으면 localStorage 시도
  if (!userStr) {
    for (const key of SESSION_KEYS) {
      const val = localStorage.getItem(key);
      if (val && val !== 'null' && val !== 'undefined' && val.includes('{')) {
        userStr = val;
        foundKey = `localStorage.${key}`;
        break;
      }
    }
  }
  
  console.log('🔍 세션 검색:', foundKey || '❌ 없음');
  
  if (!userStr) {
    showToast('로그인이 필요합니다', 'error');
    setTimeout(() => location.href = '../login.html', 1500);
    return false;
  }
  
  try {
    const userData = JSON.parse(userStr);
    console.log('✅ 학생 정보:', userData);
    
    // 다빈치랩 표준 매핑
    currentStudent = {
      student_id: userData.id || userData.student_id || 'seeyou',
      name: userData.name || '학생',
      role: userData.role || 'student',
      school: userData.school || '',
      grade: userData.grade || '',
      grade_num: userData.gradeNum || userData.grade_num || null,
      stage: userData.stage || '1단계'
    };
    
    console.log('📌 매핑된 학생:', currentStudent);
    
    // role 차단 완화 - student가 아니어도 통과 (관리자도 대신 볼 수 있게)
    
    // 상단 표시
    const name = currentStudent.name;
    const avatarEl = document.getElementById('studentAvatar');
    const nameEl = document.getElementById('studentNameText');
    if (avatarEl) avatarEl.textContent = name.charAt(0);
    if (nameEl) nameEl.textContent = name;
    
    return true;
  } catch (e) {
    console.error('❌ 세션 파싱 오류:', e);
    showToast('세션 정보가 잘못되었어요', 'error');
    setTimeout(() => location.href = '../login.html', 1500);
    return false;
  }
}

/* ════════════════════════════════════════════════════════
   📚 과목 마스터 로드
   ════════════════════════════════════════════════════════ */
async function loadSubjects() {
  try {
    // 학생 학년에 따라 학교 타입 결정
    const grade = (currentStudent.grade || '').toString();
    const schoolType = grade.includes('중') ? '중학교' : '고등학교';
    
    const res = await fetch(`${API_BASE}/${TBL.subjects}?limit=100`);
    if (!res.ok) throw new Error('과목 로드 실패');
    
    const data = await res.json();
    const all = data.data || data.records || data || [];
    
    // 학교 타입별 필터링
    allSubjects = all.filter(s => s.school_type === schoolType && s.is_active !== false);
    
    // 화면에 Chip 렌더링
    renderSubjectChips();
    
  } catch (e) {
    console.error('과목 로드 오류:', e);
    showToast('과목 정보를 불러오지 못했어요', 'error');
    
    // 폴백: 기본 과목
    allSubjects = [
      { subject_name: '국어', emoji: '📚' },
      { subject_name: '영어', emoji: '🔤' },
      { subject_name: '수학', emoji: '📐' },
      { subject_name: '과학', emoji: '🔬' },
      { subject_name: '사회', emoji: '🌏' }
    ];
    renderSubjectChips();
  }
}

function renderSubjectChips() {
  const container = document.getElementById('subjectChips');
  container.innerHTML = '';
  
  allSubjects.forEach((subj, idx) => {
    const chip = document.createElement('div');
    chip.className = 'subject-chip';
    chip.dataset.name = subj.subject_name;
    chip.dataset.emoji = subj.emoji || '📖';
    chip.innerHTML = `<span class="emoji">${subj.emoji || '📖'}</span><span>${subj.subject_name}</span>`;
    chip.onclick = () => toggleSubject(chip);
    container.appendChild(chip);
  });
}

function toggleSubject(chip) {
  chip.classList.toggle('selected');
  const name = chip.dataset.name;
  const idx = selectedSubjects.indexOf(name);
  if (idx >= 0) {
    selectedSubjects.splice(idx, 1);
  } else {
    selectedSubjects.push(name);
  }
}

/* ════════════════════════════════════════════════════════
   ⏰ D-day 자동 계산 (실시간)
   ════════════════════════════════════════════════════════ */
function setupEventListeners() {
  // 시험 시작일 입력 시 D-day 계산
  document.getElementById('examStartDate').addEventListener('change', updateDdayPreview);
  document.getElementById('examEndDate').addEventListener('change', updateDdayPreview);
  
  // 단어 갯수 라디오
  document.querySelectorAll('.vocab-radio').forEach(radio => {
    radio.addEventListener('click', () => {
      document.querySelectorAll('.vocab-radio').forEach(r => r.classList.remove('selected'));
      radio.classList.add('selected');
      selectedVocabCount = parseInt(radio.dataset.count);
    });
  });
  
   // 🖍️ 진짜 형광펜 - 드래그한 부분만 칠하기
  document.querySelectorAll('.hl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      
      // 같은 색 다시 클릭 → 비활성화
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        activeHighlightColor = null;
        document.body.classList.remove('highlighter-active');
        updateHighlighterInfo(null);
        return;
      }
      
      // 다른 색 선택
      document.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeHighlightColor = color;
      document.body.classList.add('highlighter-active');
      
      updateHighlighterInfo(color);
      showToast(`🖍️ ${getColorMeaning(color)} 형광펜 - 텍스트를 드래그하세요!`, 'success');
    });
  });
  
  // 코넬노트 영역에서 텍스트 선택 시 자동으로 형광펜 적용
  setTimeout(() => {
    document.querySelectorAll('.cornell-editable').forEach(area => {
      area.addEventListener('mouseup', handleTextSelection);
      area.addEventListener('keyup', (e) => {
        // Shift+화살표로 선택 시에도 동작
        if (e.shiftKey) handleTextSelection();
      });
    });
  }, 100);
}

/* 🖍️ 텍스트 선택 → 형광펜 적용 (핵심 로직!) */
function handleTextSelection() {
  if (!activeHighlightColor) return; // 형광펜 미선택 시 무시
  
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return; // 선택된 텍스트 없음
  
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  if (!selectedText.trim()) return;
  
  // 선택된 영역이 cornell-editable 안에 있는지 확인
  let parent = range.commonAncestorContainer;
  if (parent.nodeType === 3) parent = parent.parentNode; // 텍스트노드면 부모로
  const editable = parent.closest('.cornell-editable');
  if (!editable) return;
  
  try {
    // 이미 형광펜이 칠해진 부분인지 확인 (다시 클릭 시 제거)
    if (parent.tagName === 'MARK' || parent.closest('mark')) {
      const mark = parent.tagName === 'MARK' ? parent : parent.closest('mark');
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
      selection.removeAllRanges();
      return;
    }
    
    // 새로 형광펜 칠하기
    const mark = document.createElement('mark');
    mark.className = 'hl-' + activeHighlightColor;
    mark.textContent = selectedText;
    
    range.deleteContents();
    range.insertNode(mark);
    
    // 선택 해제
    selection.removeAllRanges();
  } catch (e) {
    console.warn('형광펜 적용 실패:', e);
  }
}

/* 형광펜 의미 설명 */
function getColorMeaning(color) {
  const meanings = {
    yellow: '🟡 노랑 (중요)',
    green: '🟢 초록 (자주 나오는 유형)',
    blue: '🔵 파랑 (공식)',
    purple: '🟣 보라 (헷갈리는)',
    red: '🔴 빨강 (실수)',
    orange: '🟠 주황 (복습 필요)'
  };
  return meanings[color] || color;
}

/* 형광펜 정보 영역 업데이트 */
function updateHighlighterInfo(color) {
  let info = document.getElementById('highlighterInfo');
  if (!info) {
    info = document.createElement('div');
    info.id = 'highlighterInfo';
    info.className = 'highlighter-info';
    const bar = document.querySelector('.highlighter-bar');
    if (bar && bar.parentNode) {
      bar.parentNode.insertBefore(info, bar.nextSibling);
    }
  }
  if (color) {
    info.innerHTML = `🖍️ <strong>${getColorMeaning(color)}</strong> 형광펜 활성화 · 텍스트를 마우스로 <strong>드래그</strong>하면 그 부분만 칠해집니다!`;
    info.style.display = 'block';
  } else {
    info.style.display = 'none';
  }
}

  if (color) {
    info.innerHTML = `현재 형광펜: <strong>${getColorMeaning(color)}</strong> · 텍스트박스 배경에 색이 표시됩니다`;
    info.style.display = 'block';
  } else {
    info.style.display = 'none';
  }
}


function updateDdayPreview() {
  const startDate = document.getElementById('examStartDate').value;
  const endDate = document.getElementById('examEndDate').value;
  if (!startDate) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(startDate);
  const diffDays = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  
  const preview = document.getElementById('ddayPreview');
  const count = document.getElementById('ddayCount');
  const label = document.getElementById('ddayLabel');
  
  if (diffDays > 0) {
    count.textContent = `D-${diffDays}`;
    label.textContent = `🎯 시험일: ${startDate}${endDate ? ' ~ ' + endDate : ''} · 오늘부터 ${diffDays}일 남았어요!`;
    preview.classList.add('show');
  } else if (diffDays === 0) {
    count.textContent = 'D-DAY';
    label.textContent = '🔥 오늘이 시험일입니다!';
    preview.classList.add('show');
  } else {
    count.textContent = `D+${Math.abs(diffDays)}`;
    label.textContent = '시험이 이미 지났어요. 회고를 작성해보세요.';
    preview.classList.add('show');
  }
}

/* ════════════════════════════════════════════════════════
   🧠 플래너 자동 생성 (핵심 로직)
   ════════════════════════════════════════════════════════ */
async function createPlanner() {
  // 1. 입력 검증
  const examType = document.getElementById('examType').value;
  const semester = document.getElementById('semester').value;
  const examStartDate = document.getElementById('examStartDate').value;
  const examEndDate = document.getElementById('examEndDate').value || examStartDate;
  const goal = document.getElementById('goalInput').value;
  
  if (!examStartDate) {
    showToast('시험 시작일을 입력해주세요!', 'error');
    return;
  }
  if (selectedSubjects.length === 0) {
    showToast('시험 과목을 1개 이상 선택해주세요!', 'error');
    return;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(examStartDate);
  const ddayTotal = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  
  if (ddayTotal < 1) {
    showToast('시험일은 내일 이후로 설정해주세요!', 'error');
    return;
  }
  
  showLoading('플래너를 생성하는 중... ✨');
  
  try {
    // 2. 5주차로 균등 분배 (D-day 기반)
    const weeksData = distributeWeeks(today, examDate, ddayTotal);
    
    // 3. 일별 시간표 자동 생성
    const dailyTasks = generateDailyTasks(weeksData);
    
    // 4. DB에 저장할 데이터
    const plannerData = {
      student_id: currentStudent.student_id,
      student_name: currentStudent.name,
      school: currentStudent.school || '',
      grade: currentStudent.grade || '',
      
      exam_type: examType,
      exam_start_date: examStartDate,
      exam_end_date: examEndDate,
      exam_days: Math.ceil((new Date(examEndDate) - new Date(examStartDate)) / 86400000) + 1,
      school_year: new Date().getFullYear().toString(),
      semester: semester,
      
      dday_total: ddayTotal,
      plan_start_date: formatDate(today),
      
      subjects: selectedSubjects,
      subject_priorities: {},
      
      exam_timetable: {},
      timetable_announced: false,
      
      weeks_data: weeksData,
      daily_tasks: dailyTasks,
      
      status: 'active',
      goal: goal
    };
    
    // 5. Supabase에 저장
    const res = await fetch(`${API_BASE}/${TBL.planners}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plannerData)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '플래너 저장 실패');
    }
    
    const saved = await res.json();
    currentPlanner = saved.data || saved;
    
    showToast('🎉 플래너가 생성되었습니다!', 'success');
    
    // 6. 화면에 표시
    document.getElementById('inputCard').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('plannerContent').style.display = 'block';
    
    renderWeekTabs();
    renderDayGrid();
    updateStats();
    
    // 페이지 위로 스크롤
    window.scrollTo({ top: document.querySelector('.main').offsetTop - 80, behavior: 'smooth' });
    
  } catch (e) {
    console.error('플래너 생성 오류:', e);
    showToast('플래너 생성 실패: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ════════════════════════════════════════════════════════
   📅 5주차 자동 분배
   ════════════════════════════════════════════════════════ */
function distributeWeeks(startDate, examDate, totalDays) {
  // D-day가 35일 이상이면 5주차 모두 사용
  // 28~34일: PRE 짧게, W1~W4 정상
  // 21~27일: PRE 생략, W1~W4 사용
  // 14~20일: W2~W4만 사용
  // 7~13일: W3~W4
  // 1~6일: W4만
  
  const weeks = [];
  let weekConfigs;
  
  if (totalDays >= 35) {
    weekConfigs = [
      { ...WEEK_DEFS[0], days: 7 },
      { ...WEEK_DEFS[1], days: 7 },
      { ...WEEK_DEFS[2], days: 7 },
      { ...WEEK_DEFS[3], days: 7 },
      { ...WEEK_DEFS[4], days: totalDays - 28 }
    ];
  } else if (totalDays >= 28) {
    weekConfigs = [
      { ...WEEK_DEFS[0], days: totalDays - 28 },
      { ...WEEK_DEFS[1], days: 7 },
      { ...WEEK_DEFS[2], days: 7 },
      { ...WEEK_DEFS[3], days: 7 },
      { ...WEEK_DEFS[4], days: 7 }
    ];
    if (weekConfigs[0].days <= 0) weekConfigs.shift();
  } else if (totalDays >= 21) {
    const per = Math.floor(totalDays / 4);
    const extra = totalDays - per * 4;
    weekConfigs = [
      { ...WEEK_DEFS[1], days: per + (extra > 0 ? 1 : 0) },
      { ...WEEK_DEFS[2], days: per + (extra > 1 ? 1 : 0) },
      { ...WEEK_DEFS[3], days: per + (extra > 2 ? 1 : 0) },
      { ...WEEK_DEFS[4], days: per }
    ];
  } else if (totalDays >= 14) {
    const per = Math.floor(totalDays / 3);
    const extra = totalDays - per * 3;
    weekConfigs = [
      { ...WEEK_DEFS[2], days: per + (extra > 0 ? 1 : 0) },
      { ...WEEK_DEFS[3], days: per + (extra > 1 ? 1 : 0) },
      { ...WEEK_DEFS[4], days: per }
    ];
  } else if (totalDays >= 7) {
    const per = Math.floor(totalDays / 2);
    weekConfigs = [
      { ...WEEK_DEFS[3], days: per },
      { ...WEEK_DEFS[4], days: totalDays - per }
    ];
  } else {
    weekConfigs = [
      { ...WEEK_DEFS[4], days: totalDays }
    ];
  }
  
  // 날짜 채우기
  let currentDate = new Date(startDate);
  weekConfigs.forEach(wc => {
    const weekStart = new Date(currentDate);
    const dayDates = [];
    for (let i = 0; i < wc.days; i++) {
      dayDates.push(formatDate(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() - 1);
    
    weeks.push({
      id: wc.id,
      cls: wc.cls,
      emoji: wc.emoji,
      name: wc.name,
      subtitle: wc.subtitle,
      start_date: formatDate(weekStart),
      end_date: formatDate(weekEnd),
      day_count: wc.days,
      day_dates: dayDates
    });
  });
  
  return weeks;
}

/* ════════════════════════════════════════════════════════
   🕐 일별 시간표 자동 생성 (30분 단위)
   ════════════════════════════════════════════════════════ */
function generateDailyTasks(weeksData) {
  const tasks = {};
  
  weeksData.forEach((week, weekIdx) => {
    week.day_dates.forEach((dateStr, dayIdx) => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay(); // 0=일, 6=토
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      // 시간 슬롯 생성
      const slots = generateTimeSlots(isWeekend);
      
      // 5단계 학습법으로 과목 배분
      const subjectAssignments = assignSubjectsToSlots(slots, week.id, weekIdx, dayIdx, isWeekend);
      
      tasks[dateStr] = {
        date: dateStr,
        day_of_week: ['일','월','화','수','목','금','토'][dayOfWeek],
        is_weekend: isWeekend,
        week_id: week.id,
        slots: subjectAssignments,
        completed_slots: [],
        memo: '',
        mood: '',
        vocab_done: 0,
        vocab_total: selectedVocabCount
      };
    });
  });
  
  return tasks;
}

function generateTimeSlots(isWeekend) {
  const slots = [];
  // 주중: 16:00 ~ 24:40 / 주말: 08:00 ~ 24:40
  const startHour = isWeekend ? 8 : 16;
  const endHour = 24;
  const endMin = 40;
  
  let h = startHour;
  let m = 0;
  
  while (h < endHour || (h === endHour && m <= endMin)) {
    const endH = m === 30 ? h + 1 : h;
    const endM = m === 30 ? 0 : 30;
    
    if (endH > endHour || (endH === endHour && endM > endMin)) {
      // 마지막 슬롯
      slots.push({
        time: `${pad(h)}:${pad(m)}~${pad(endHour)}:${pad(endMin)}`,
        start: `${pad(h)}:${pad(m)}`,
        end: `${pad(endHour)}:${pad(endMin)}`
      });
      break;
    }
    
    slots.push({
      time: `${pad(h)}:${pad(m)}~${pad(endH)}:${pad(endM)}`,
      start: `${pad(h)}:${pad(m)}`,
      end: `${pad(endH)}:${pad(endM)}`
    });
    
    if (m === 0) { m = 30; } else { m = 0; h++; }
  }
  
  return slots;
}

function pad(n) { return n.toString().padStart(2, '0'); }

function assignSubjectsToSlots(slots, weekId, weekIdx, dayIdx, isWeekend) {
  // 기본 전략:
  // - 주차별로 학습 단계가 달라짐 (PRE: 1단계 위주, W1: 1~2, W2: 2~3, W3: 3~4, W4: 4~5)
  // - 매일 필수 2과목 + 영어 단어
  // - 나머지 슬롯은 [자유 입력]
  
  const stageRange = getStageRangeForWeek(weekId);
  const assignedSlots = [];
  
  // 매일 필수 학습 슬롯 (앞 4개)
  const studySlotCount = isWeekend ? 8 : 4; // 주말은 더 많이
  const todaySubjects = selectSubjectsForDay(dayIdx);
  
  let slotIdx = 0;
  let subjIdx = 0;
  
  // 첫 2~4 슬롯: 5단계 학습 + 코넬노트
  for (let i = 0; i < studySlotCount && slotIdx < slots.length; i++) {
    const subj = todaySubjects[subjIdx % todaySubjects.length];
    const stage = stageRange[i % stageRange.length];
    const subjData = allSubjects.find(s => s.subject_name === subj) || { emoji: '📖' };
    
    assignedSlots.push({
      ...slots[slotIdx],
      subject: subj,
      subject_emoji: subjData.emoji || '📖',
      stage: stage.name,
      stage_id: stage.id,
      stage_emoji: stage.emoji,
      task_text: `${subjData.emoji} ${subj} · ${stage.emoji} ${stage.name} + 코넬노트`,
      type: 'study',
      completed: false,
      cornell_written: false
    });
    
    slotIdx++;
    subjIdx++;
  }
  
  // 영어 단어 슬롯 (1개)
  if (slotIdx < slots.length) {
    assignedSlots.push({
      ...slots[slotIdx],
      task_text: `🔤 영어 단어 ${selectedVocabCount}개 + 1/3/7일 복습`,
      type: 'vocab',
      completed: false
    });
    slotIdx++;
  }
  
  // 나머지 슬롯: 자유 입력
  while (slotIdx < slots.length) {
    assignedSlots.push({
      ...slots[slotIdx],
      task_text: '➕ 자유 입력 (학생이 작성)',
      type: 'free',
      completed: false
    });
    slotIdx++;
  }
  
  return assignedSlots;
}

function getStageRangeForWeek(weekId) {
  // 주차별 5단계 학습법 배분
  switch (weekId) {
    case 'pre': return [STAGES[0]]; // 1단계만
    case 'w1': return [STAGES[0], STAGES[1]]; // 1~2단계
    case 'w2': return [STAGES[1], STAGES[2]]; // 2~3단계
    case 'w3': return [STAGES[2], STAGES[3]]; // 3~4단계
    case 'w4': return [STAGES[3], STAGES[4]]; // 4~5단계
    default: return STAGES;
  }
}

function selectSubjectsForDay(dayIdx) {
  // 매일 다른 과목 조합 (순환)
  const n = selectedSubjects.length;
  if (n === 0) return ['국어'];
  if (n <= 2) return selectedSubjects;
  
  // 2개씩 순환
  const start = (dayIdx * 2) % n;
  return [
    selectedSubjects[start],
    selectedSubjects[(start + 1) % n]
  ];
}

/* ════════════════════════════════════════════════════════
   🎨 화면 렌더링
   ════════════════════════════════════════════════════════ */
function renderWeekTabs() {
  if (!currentPlanner || !currentPlanner.weeks_data) return;
  
  const container = document.getElementById('weekTabs');
  container.innerHTML = '';
  
  currentPlanner.weeks_data.forEach((week, idx) => {
    const tab = document.createElement('div');
    tab.className = `week-tab ${idx === 0 ? 'active ' + week.cls : ''}`;
    tab.dataset.weekId = week.id;
    tab.innerHTML = `
      <span class="emoji">${week.emoji}</span>
      <div class="name">${week.name}</div>
      <div class="date-range">${formatShortDate(week.start_date)} ~ ${formatShortDate(week.end_date)}</div>
    `;
    tab.onclick = () => {
      activeWeekTab = week.id;
      document.querySelectorAll('.week-tab').forEach(t => {
        t.classList.remove('active', 'pre', 'w1', 'w2', 'w3', 'w4');
      });
      tab.classList.add('active', week.cls);
      renderDayGrid();
    };
    container.appendChild(tab);
    
    if (idx === 0) activeWeekTab = week.id;
  });
}

function renderDayGrid() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return;
  
  const grid = document.getElementById('dayGrid');
  grid.innerHTML = '';
  
  const currentWeek = currentPlanner.weeks_data.find(w => w.id === activeWeekTab);
  if (!currentWeek) return;
  
  const todayStr = formatDate(new Date());
  
  currentWeek.day_dates.forEach((dateStr, dayIdx) => {
    const dayTask = currentPlanner.daily_tasks[dateStr];
    if (!dayTask) return;
    
    const isToday = dateStr === todayStr;
    const ddayLabel = calcDdayFromDate(dateStr);
    
    const card = document.createElement('div');
    card.className = `day-card ${currentWeek.cls} ${isToday ? 'today-card' : ''}`;
    card.dataset.date = dateStr;
    
    const completedCount = (dayTask.completed_slots || []).length;
    const totalCount = dayTask.slots.length;
    const pct = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;
    
    card.innerHTML = `
      <div class="day-header">
        <div class="day-num">${ddayLabel}</div>
        <div class="day-info">
          <div class="day-title">${currentWeek.emoji} ${dayTask.day_of_week}요일 ${dayTask.is_weekend ? '🌞' : '📚'}</div>
          <div class="real-date">${formatLongDate(dateStr)}</div>
        </div>
      </div>
      <div class="day-progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <div class="day-body">
        ${renderTimeSlots(dateStr, dayTask.slots)}
        ${renderVocabSection(dateStr, dayTask)}
        ${renderDayMemo(dateStr, dayTask)}
      </div>
    `;
    
    grid.appendChild(card);
  });
}

function renderTimeSlots(dateStr, slots) {
  return slots.map((slot, idx) => {
    const isCompleted = slot.completed;
    const slotKey = `${dateStr}_${idx}`;
    
    let actionBtn = '';
    if (slot.type === 'study') {
      const written = slot.cornell_written ? 'written' : '';
      const label = slot.cornell_written ? '✓ 작성' : '📝 작성';
      actionBtn = `<button class="cornell-btn ${written}" onclick="openCornellModal('${dateStr}', ${idx})">${label}</button>`;
    }
    
    return `
      <div class="time-slot ${isCompleted ? 'completed' : ''}" data-slot-key="${slotKey}">
        <input type="checkbox" ${isCompleted ? 'checked' : ''} onchange="toggleSlot('${dateStr}', ${idx}, this.checked)">
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text">${slot.task_text}</span>
        ${actionBtn}
      </div>
    `;
  }).join('');
}

function renderVocabSection(dateStr, dayTask) {
  const total = dayTask.vocab_total || selectedVocabCount;
  const done = dayTask.vocab_done || 0;
  
  return `
    <div class="vocab-section">
      <div class="vocab-header">
        <div class="title">🔤 오늘의 영어 단어</div>
        <div class="count">${done} / ${total}</div>
      </div>
      <div class="vocab-review-info">
        ♻️ 어제 ${total}개 · 3일전 ${total}개 · 7일전 ${total}개 누적 복습 (Ebbinghaus 시스템)
      </div>
    </div>
  `;
}

function renderDayMemo(dateStr, dayTask) {
  const memo = dayTask.memo || '';
  const mood = dayTask.mood || '';
  const moods = ['😊', '🥲', '💪', '😴', '🔥', '😅'];
  
  return `
    <div class="day-memo">
      <textarea placeholder="오늘의 메모를 적어주세요..." onchange="saveDayMemo('${dateStr}', this.value)">${memo}</textarea>
      <div class="mood-emoji-row">
        ${moods.map(m => `
          <span class="mood-emoji ${mood === m ? 'selected' : ''}" onclick="setDayMood('${dateStr}', '${m}', this)">${m}</span>
        `).join('')}
      </div>
    </div>
  `;
}

/* ════════════════════════════════════════════════════════
   ✅ 슬롯 체크 / 메모 / 기분 저장
   ════════════════════════════════════════════════════════ */
async function toggleSlot(dateStr, slotIdx, checked) {
  if (!currentPlanner || !currentPlanner.daily_tasks[dateStr]) return;
  
  const dayTask = currentPlanner.daily_tasks[dateStr];
  dayTask.slots[slotIdx].completed = checked;
  
  if (!dayTask.completed_slots) dayTask.completed_slots = [];
  const idx = dayTask.completed_slots.indexOf(slotIdx);
  if (checked && idx < 0) dayTask.completed_slots.push(slotIdx);
  if (!checked && idx >= 0) dayTask.completed_slots.splice(idx, 1);
  
  await savePlannerData();
  renderDayGrid();
  updateStats();
}

async function saveDayMemo(dateStr, memo) {
  if (!currentPlanner || !currentPlanner.daily_tasks[dateStr]) return;
  currentPlanner.daily_tasks[dateStr].memo = memo;
  await savePlannerData();
}

async function setDayMood(dateStr, mood, elem) {
  if (!currentPlanner || !currentPlanner.daily_tasks[dateStr]) return;
  currentPlanner.daily_tasks[dateStr].mood = mood;
  
  elem.parentElement.querySelectorAll('.mood-emoji').forEach(e => e.classList.remove('selected'));
  elem.classList.add('selected');
  
  await savePlannerData();
}

/* ════════════════════════════════════════════════════════
   💾 플래너 데이터 저장 (DB 업데이트)
   ════════════════════════════════════════════════════════ */
async function savePlannerData() {
  if (!currentPlanner || !currentPlanner.id) return;
  
  try {
    const res = await fetch(`${API_BASE}/${TBL.planners}/${currentPlanner.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daily_tasks: currentPlanner.daily_tasks,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) throw new Error('저장 실패');
  } catch (e) {
    console.error('저장 오류:', e);
    showToast('저장 중 오류가 발생했어요', 'error');
  }
}

/* ════════════════════════════════════════════════════════
   ✏️ 코넬노트 모달
   ════════════════════════════════════════════════════════ */
function openCornellModal(dateStr, slotIdx) {
  currentCornellSlot = { dateStr, slotIdx };
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  
  document.getElementById('cornellInfo').innerHTML = `
    <strong>📅 ${dateStr}</strong> · ${slot.subject_emoji} ${slot.subject} · ${slot.stage_emoji} ${slot.stage}
  `;
  
  // 기존 노트가 있으면 불러오기
  loadExistingNote(dateStr, slotIdx, slot);
  
  document.getElementById('cornellModal').classList.add('show');
}

async function loadExistingNote(dateStr, slotIdx, slot) {
  document.getElementById('cornellKeywords').value = '';
  document.getElementById('cornellContent').value = '';
  document.getElementById('cornellSummary').value = '';
  
  try {
    const url = `${API_BASE}/${TBL.notes}?student_id=${currentStudent.student_id}&subject=${encodeURIComponent(slot.subject)}&stage=${encodeURIComponent(slot.stage)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    
    const data = await res.json();
    const notes = data.data || data.records || data || [];
    
    if (notes.length > 0) {
      const n = notes[0];
      document.getElementById('cornellKeywords').value = n.keywords || '';
      document.getElementById('cornellContent').value = n.content || '';
      document.getElementById('cornellSummary').value = n.summary || '';
    }
  } catch (e) {
    console.warn('기존 노트 로드 실패:', e);
  }
}

function closeCornellModal() {
  document.getElementById('cornellModal').classList.remove('show');
  currentCornellSlot = null;
  
  // 형광펜 초기화
  document.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('active'));
  activeHighlightColor = null;
  applyHighlightToCornell(null);
  updateHighlighterInfo(null);
}


async function saveCornellNote() {
  if (!currentCornellSlot) return;
  
  const { dateStr, slotIdx } = currentCornellSlot;
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  
   // contenteditable div는 innerHTML로 읽기 (형광펜 마크 포함)
  const keywordsEl = document.getElementById('cornellKeywords');
  const contentEl = document.getElementById('cornellContent');
  const summaryEl = document.getElementById('cornellSummary');
  
  const keywords = keywordsEl.innerHTML.trim();
  const content = contentEl.innerHTML.trim();
  const summary = summaryEl.innerHTML.trim();
  
  // 빈 div는 빈 문자열로
  const keywordsText = keywordsEl.textContent.trim();
  const contentText = contentEl.textContent.trim();

  
   if (!keywordsText && !contentText) {
    showToast('키워드나 학습 내용 중 하나는 입력해주세요!', 'error');
    return;
  }

  
  showLoading('코넬노트를 저장하는 중...');
  
  try {
    // 1/3/7일 복습 날짜 계산
    const today = new Date();
    const d1 = new Date(today); d1.setDate(d1.getDate() + 1);
    const d3 = new Date(today); d3.setDate(d3.getDate() + 3);
    const d7 = new Date(today); d7.setDate(d7.getDate() + 7);
    
    const noteData = {
      student_id: currentStudent.student_id,
      planner_id: currentPlanner.id,
      subject: slot.subject,
      unit: '',
      stage: slot.stage,
      note_type: 'study',
      keywords: keywords,
      content: content,
      summary: summary,
            highlights: { 
        active_color: activeHighlightColor || null,
        keywords_color: document.getElementById('cornellKeywords').classList.contains('hl-' + activeHighlightColor) ? activeHighlightColor : null,
        content_color: document.getElementById('cornellContent').classList.contains('hl-' + activeHighlightColor) ? activeHighlightColor : null,
        summary_color: document.getElementById('cornellSummary').classList.contains('hl-' + activeHighlightColor) ? activeHighlightColor : null
      },

      image_urls: [],
      review_date_1: formatDate(d1),
      review_date_3: formatDate(d3),
      review_date_7: formatDate(d7),
      reviewed_1: false,
      reviewed_3: false,
      reviewed_7: false,
      is_mastered: false
    };
    
    const res = await fetch(`${API_BASE}/${TBL.notes}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noteData)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '코넬노트 저장 실패');
    }
    
    // 슬롯 상태 업데이트
    slot.cornell_written = true;
    await savePlannerData();
    
    showToast('✏️ 코넬노트가 저장되었습니다!', 'success');
    closeCornellModal();
    renderDayGrid();
    
  } catch (e) {
    console.error('코넬노트 저장 오류:', e);
    showToast('저장 실패: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ════════════════════════════════════════════════════════
   📊 통계 계산
   ════════════════════════════════════════════════════════ */
function updateStats() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return;
  
  let total = 0;
  let done = 0;
  
  Object.values(currentPlanner.daily_tasks).forEach(day => {
    total += day.slots.length;
    done += (day.completed_slots || []).length;
  });
  
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPct').textContent = pct + '%';
  document.getElementById('statPctLabel').textContent = pct + '%';
  document.getElementById('overallFill').style.width = pct + '%';
}

/* ════════════════════════════════════════════════════════
   📥 기존 플래너 로드
   ════════════════════════════════════════════════════════ */
async function loadExistingPlanner() {
  try {
    const url = `${API_BASE}/${TBL.planners}?student_id=${currentStudent.student_id}&status=active&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    
    const data = await res.json();
    const planners = data.data || data.records || data || [];
    
    if (planners.length > 0) {
      // 최신 플래너 로드
      const p = planners[planners.length - 1];
      
      // JSONB 필드가 문자열이면 파싱
      if (typeof p.weeks_data === 'string') p.weeks_data = JSON.parse(p.weeks_data);
      if (typeof p.daily_tasks === 'string') p.daily_tasks = JSON.parse(p.daily_tasks);
      if (typeof p.subjects === 'string') p.subjects = JSON.parse(p.subjects);
      
      currentPlanner = p;
      
      // 시험일이 이미 지난 경우는 새로 만들도록 함
      const examEnd = new Date(p.exam_end_date);
      const today = new Date();
      if (examEnd >= today) {
        document.getElementById('inputCard').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('plannerContent').style.display = 'block';
        
        renderWeekTabs();
        renderDayGrid();
        updateStats();
      }
    }
  } catch (e) {
    console.warn('기존 플래너 로드 실패:', e);
  }
}

/* ════════════════════════════════════════════════════════
   🛠️ 헬퍼 함수
   ════════════════════════════════════════════════════════ */
function formatDate(d) {
  if (typeof d === 'string') return d.split('T')[0];
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function calcDdayFromDate(dateStr) {
  if (!currentPlanner) return '';
  const examDate = new Date(currentPlanner.exam_start_date);
  const target = new Date(dateStr);
  const diff = Math.ceil((examDate - target) / (1000 * 60 * 60 * 24));
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'D-DAY';
  return `D+${Math.abs(diff)}`;
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || '로딩 중...';
  document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}
