/* ════════════════════════════════════════════════════════
   🎯 다빈치랩 시험 플래너 v2 - JavaScript (안정 버전)
   작성일: 2026-05-12
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

let currentStudent = null;
let currentPlanner = null;
let allSubjects = [];
let selectedSubjects = [];
let selectedVocabCount = 20;
let activeWeekTab = 'pre';
let currentCornellSlot = null;
let activeHighlightColor = null;

const STAGES = [
  { id: 1, name: '개념이해', emoji: '💡', color: '#10B981' },
  { id: 2, name: '개념완성', emoji: '📖', color: '#3B82F6' },
  { id: 3, name: '유형문제', emoji: '📝', color: '#8B5CF6' },
  { id: 4, name: '심화문제', emoji: '🔥', color: '#F59E0B' },
  { id: 5, name: '최종문제', emoji: '🎯', color: '#EF4444' }
];

const WEEK_DEFS = [
  { id: 'pre', cls: 'pre', emoji: '🌱', name: 'PRE주차', subtitle: '플래너 적응 & 범위 파악' },
  { id: 'w1', cls: 'w1', emoji: '📘', name: '1주차', subtitle: '전체 범위 1회독' },
  { id: 'w2', cls: 'w2', emoji: '📕', name: '2주차', subtitle: '약점 보완 & 심화' },
  { id: 'w3', cls: 'w3', emoji: '📙', name: '3주차', subtitle: '실전 문제 풀이' },
  { id: 'w4', cls: 'w4', emoji: '🔥', name: '4주차', subtitle: '최종 점검 & 시험' }
];

/* ════════ 초기화 ════════ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading('학생 정보를 불러오는 중...');
  if (!checkSession()) { hideLoading(); return; }
  await loadSubjects();
  await loadExistingPlanner();
  setupEventListeners();
  hideLoading();
});

/* ════════ 세션 확인 ════════ */
function checkSession() {
  const SESSION_KEYS = ['dvl_user', 'dvSession', 'dvl_student_session', 'dvl_session'];
  let userStr = null;
  let foundKey = null;
  
  for (const key of SESSION_KEYS) {
    const val = sessionStorage.getItem(key);
    if (val && val !== 'null' && val !== 'undefined' && val.includes('{')) {
      userStr = val;
      foundKey = `sessionStorage.${key}`;
      break;
    }
  }
  
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

/* ════════ 과목 로드 ════════ */
async function loadSubjects() {
  try {
    const grade = (currentStudent.grade || '').toString();
    const schoolType = grade.includes('중') ? '중학교' : '고등학교';
    
    const res = await fetch(`${API_BASE}/${TBL.subjects}?limit=100`);
    if (!res.ok) throw new Error('과목 로드 실패');
    
    const data = await res.json();
    const all = data.data || data.records || data || [];
    allSubjects = all.filter(s => s.school_type === schoolType && s.is_active !== false);
    
    renderSubjectChips();
  } catch (e) {
    console.error('과목 로드 오류:', e);
    showToast('과목 정보를 불러오지 못했어요', 'error');
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
  allSubjects.forEach((subj) => {
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
  if (idx >= 0) selectedSubjects.splice(idx, 1);
  else selectedSubjects.push(name);
}

/* ════════ 이벤트 리스너 (한 번에 정리) ════════ */
function setupEventListeners() {
  // D-day 자동 계산
  const startEl = document.getElementById('examStartDate');
  const endEl = document.getElementById('examEndDate');
  if (startEl) startEl.addEventListener('change', updateDdayPreview);
  if (endEl) endEl.addEventListener('change', updateDdayPreview);
  
  // 단어 갯수 라디오
  document.querySelectorAll('.vocab-radio').forEach(radio => {
    radio.addEventListener('click', () => {
      document.querySelectorAll('.vocab-radio').forEach(r => r.classList.remove('selected'));
      radio.classList.add('selected');
      selectedVocabCount = parseInt(radio.dataset.count);
    });
  });
  
  // 🖍️ 형광펜 버튼 - 진짜 형광펜처럼!
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
      
      document.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeHighlightColor = color;
      document.body.classList.add('highlighter-active');
      
      updateHighlighterInfo(color);
      showToast(`🖍️ ${getColorMeaning(color)} 형광펜 - 텍스트를 드래그하세요!`, 'success');
    });
  });
  
  // 코넬노트 영역에서 텍스트 선택 시 자동 형광펜
  document.addEventListener('mouseup', (e) => {
    if (!activeHighlightColor) return;
    if (e.target.closest('.cornell-editable')) {
      handleTextSelection();
    }
  });
}

/* 🖍️ 텍스트 선택 → 형광펜 적용 */
function handleTextSelection() {
  if (!activeHighlightColor) return;
  
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  
  const range = selection.getRangeAt(0);
  const selectedText = range.toString();
  if (!selectedText.trim()) return;
  
  let parent = range.commonAncestorContainer;
  if (parent.nodeType === 3) parent = parent.parentNode;
  const editable = parent.closest && parent.closest('.cornell-editable');
  if (!editable) return;
  
  try {
    // 이미 형광펜 칠해진 부분이면 제거
    if (parent.tagName === 'MARK' || (parent.closest && parent.closest('mark'))) {
      const mark = parent.tagName === 'MARK' ? parent : parent.closest('mark');
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
      selection.removeAllRanges();
      return;
    }
    
    // 새 형광펜
    const mark = document.createElement('mark');
    mark.className = 'hl-' + activeHighlightColor;
    mark.textContent = selectedText;
    
    range.deleteContents();
    range.insertNode(mark);
    selection.removeAllRanges();
  } catch (e) {
    console.warn('형광펜 적용 실패:', e);
  }
}

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

/* ════════ D-day 미리보기 ════════ */
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
  } else if (diffDays === 0) {
    count.textContent = 'D-DAY';
    label.textContent = '🔥 오늘이 시험일입니다!';
  } else {
    count.textContent = `D+${Math.abs(diffDays)}`;
    label.textContent = '시험이 이미 지났어요. 회고를 작성해보세요.';
  }
  preview.classList.add('show');
}

/* ════════ 플래너 생성 ════════ */
async function createPlanner() {
  const examType = document.getElementById('examType').value;
  const semester = document.getElementById('semester').value;
  const examStartDate = document.getElementById('examStartDate').value;
  const examEndDate = document.getElementById('examEndDate').value || examStartDate;
  const goal = document.getElementById('goalInput').value;
  
  if (!examStartDate) { showToast('시험 시작일을 입력해주세요!', 'error'); return; }
  if (selectedSubjects.length === 0) { showToast('시험 과목을 1개 이상 선택해주세요!', 'error'); return; }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(examStartDate);
  const ddayTotal = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  
  if (ddayTotal < 1) { showToast('시험일은 내일 이후로 설정해주세요!', 'error'); return; }
  
  showLoading('플래너를 생성하는 중... ✨');
  
  try {
    const weeksData = distributeWeeks(today, examDate, ddayTotal);
    const dailyTasks = generateDailyTasks(weeksData);
    
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
    
    document.getElementById('inputCard').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('plannerContent').style.display = 'block';
    
    renderWeekTabs();
    renderDayGrid();
    updateStats();
    
    window.scrollTo({ top: document.querySelector('.main').offsetTop - 80, behavior: 'smooth' });
  } catch (e) {
    console.error('플래너 생성 오류:', e);
    showToast('플래너 생성 실패: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ════════ 5주차 분배 ════════ */
function distributeWeeks(startDate, examDate, totalDays) {
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
    weekConfigs = [{ ...WEEK_DEFS[4], days: totalDays }];
  }
  
  const weeks = [];
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

/* ════════ 일별 시간표 생성 ════════ */
function generateDailyTasks(weeksData) {
  const tasks = {};
  weeksData.forEach((week, weekIdx) => {
    week.day_dates.forEach((dateStr, dayIdx) => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const slots = generateTimeSlots(isWeekend);
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
  const startHour = isWeekend ? 8 : 16;
  const endHour = 24;
  const endMin = 40;
  
  let h = startHour;
  let m = 0;
  
  while (h < endHour || (h === endHour && m <= endMin)) {
    const endH = m === 30 ? h + 1 : h;
    const endM = m === 30 ? 0 : 30;
    
    if (endH > endHour || (endH === endHour && endM > endMin)) {
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
  const stageRange = getStageRangeForWeek(weekId);
  const assignedSlots = [];
  const studySlotCount = isWeekend ? 8 : 4;
  const todaySubjects = selectSubjectsForDay(dayIdx);
  
  let slotIdx = 0;
  let subjIdx = 0;
  
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
  
  if (slotIdx < slots.length) {
    assignedSlots.push({
      ...slots[slotIdx],
      task_text: `🔤 영어 단어 ${selectedVocabCount}개 + 1/3/7일 복습`,
      type: 'vocab',
      completed: false
    });
    slotIdx++;
  }
  
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
  switch (weekId) {
    case 'pre': return [STAGES[0]];
    case 'w1': return [STAGES[0], STAGES[1]];
    case 'w2': return [STAGES[1], STAGES[2]];
    case 'w3': return [STAGES[2], STAGES[3]];
    case 'w4': return [STAGES[3], STAGES[4]];
    default: return STAGES;
  }
}

function selectSubjectsForDay(dayIdx) {
  const n = selectedSubjects.length;
  if (n === 0) return ['국어'];
  if (n <= 2) return selectedSubjects;
  const start = (dayIdx * 2) % n;
  return [selectedSubjects[start], selectedSubjects[(start + 1) % n]];
}

/* ════════ 렌더링 ════════ */
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
    let slotTextHtml = '';
    
    if (slot.type === 'study') {
      // 학습 슬롯: 코넬노트 버튼
      const written = slot.cornell_written ? 'written' : '';
      const label = slot.cornell_written ? '✓ 작성' : '📝 작성';
      actionBtn = `<button class="cornell-btn ${written}" onclick="openCornellModal('${dateStr}', ${idx})">${label}</button>`;
      slotTextHtml = `<span class="slot-text">${slot.task_text}</span>`;
    } else if (slot.type === 'vocab') {
      // 영어 단어 슬롯
      slotTextHtml = `<span class="slot-text">${slot.task_text}</span>`;
    } else if (slot.type === 'free') {
      // 🆓 자유 입력 슬롯 - 학생이 입력 가능!
      const userText = slot.user_text || '';
      const isEdited = !!userText;
      
      if (isEdited) {
        // 이미 입력한 내용 표시 (클릭 시 다시 편집 가능)
        slotTextHtml = `
          <span class="slot-text free-input-text" 
                onclick="editFreeSlot('${dateStr}', ${idx})" 
                title="클릭해서 수정">
            ✍️ ${escapeHtml(userText)}
          </span>
          <button class="free-clear-btn" 
                  onclick="clearFreeSlot('${dateStr}', ${idx})" 
                  title="삭제">🗑️</button>
        `;
      } else {
        // 빈 슬롯: 클릭하면 입력 박스로 변환
        slotTextHtml = `
          <span class="slot-text free-input-placeholder" 
                onclick="editFreeSlot('${dateStr}', ${idx})">
            ➕ 자유 입력 (클릭해서 작성하기)
          </span>
        `;
      }
    }
    
    return `
      <div class="time-slot ${isCompleted ? 'completed' : ''} ${slot.type === 'free' ? 'free-slot' : ''}" 
           data-slot-key="${slotKey}">
        <input type="checkbox" ${isCompleted ? 'checked' : ''} 
               onchange="toggleSlot('${dateStr}', ${idx}, this.checked)">
        <span class="slot-time">${slot.time}</span>
        ${slotTextHtml}
        ${actionBtn}
      </div>
    `;
  }).join('');
}

/* 🆓 자유 입력 슬롯 - 편집 모드 진입 */
function editFreeSlot(dateStr, slotIdx) {
  const dayTask = currentPlanner.daily_tasks[dateStr];
  if (!dayTask) return;
  const slot = dayTask.slots[slotIdx];
  if (!slot) return;
  
  const currentText = slot.user_text || '';
  
  // DOM 직접 조작 - 해당 슬롯을 입력 모드로 변경
  const slotEl = document.querySelector(`[data-slot-key="${dateStr}_${slotIdx}"]`);
  if (!slotEl) return;
  
  const textEl = slotEl.querySelector('.slot-text');
  if (!textEl) return;
  
  // 입력 박스로 교체
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'free-input-edit';
  input.value = currentText;
  input.placeholder = '예: 국어 작품 분석, 수학 오답 정리, 영어 듣기 등';
  input.maxLength = 100;
  
  textEl.replaceWith(input);
  input.focus();
  input.select();
  
  // Enter 키 또는 포커스 잃을 때 저장
  const saveAndExit = async () => {
    const newText = input.value.trim();
    slot.user_text = newText;
    
    // task_text도 함께 업데이트 (저장된 데이터 일관성)
    if (newText) {
      slot.task_text = `✍️ ${newText}`;
    } else {
      slot.task_text = '➕ 자유 입력 (학생이 작성)';
    }
    
    await savePlannerData();
    renderDayGrid();
    
    if (newText) {
      showToast('✍️ 저장되었습니다!', 'success');
    }
  };
  
  input.addEventListener('blur', saveAndExit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur(); // blur 이벤트가 저장 처리
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = currentText; // 원복
      input.blur();
    }
  });
}

/* 🗑️ 자유 입력 슬롯 - 내용 삭제 */
async function clearFreeSlot(dateStr, slotIdx) {
  const dayTask = currentPlanner.daily_tasks[dateStr];
  if (!dayTask) return;
  const slot = dayTask.slots[slotIdx];
  if (!slot) return;
  
  if (!confirm('이 슬롯의 내용을 지울까요?')) return;
  
  slot.user_text = '';
  slot.task_text = '➕ 자유 입력 (학생이 작성)';
  slot.completed = false;
  
  // 완료 목록에서도 제거
  if (dayTask.completed_slots) {
    const idx = dayTask.completed_slots.indexOf(slotIdx);
    if (idx >= 0) dayTask.completed_slots.splice(idx, 1);
  }
  
  await savePlannerData();
  renderDayGrid();
  updateStats();
  showToast('🗑️ 삭제되었습니다', 'success');
}

/* HTML 이스케이프 (XSS 방지) */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

/* ════════ 슬롯/메모/기분 저장 ════════ */
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

/* ════════ 코넬노트 모달 ════════ */
function openCornellModal(dateStr, slotIdx) {
  currentCornellSlot = { dateStr, slotIdx };
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  
  document.getElementById('cornellInfo').innerHTML = `
    <strong>📅 ${dateStr}</strong> · ${slot.subject_emoji} ${slot.subject} · ${slot.stage_emoji} ${slot.stage}
  `;
  
  loadExistingNote(dateStr, slotIdx, slot);
  document.getElementById('cornellModal').classList.add('show');
}

async function loadExistingNote(dateStr, slotIdx, slot) {
  // contenteditable 또는 textarea 모두 지원
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'TEXTAREA') el.value = val;
    else el.innerHTML = val;
  };
  
  setVal('cornellKeywords', '');
  setVal('cornellContent', '');
  setVal('cornellSummary', '');
  
  try {
    const url = `${API_BASE}/${TBL.notes}?student_id=${currentStudent.student_id}&subject=${encodeURIComponent(slot.subject)}&stage=${encodeURIComponent(slot.stage)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const notes = data.data || data.records || data || [];
    if (notes.length > 0) {
      const n = notes[0];
      setVal('cornellKeywords', n.keywords || '');
      setVal('cornellContent', n.content || '');
      setVal('cornellSummary', n.summary || '');
    }
  } catch (e) {
    console.warn('기존 노트 로드 실패:', e);
  }
}

function closeCornellModal() {
  document.getElementById('cornellModal').classList.remove('show');
  currentCornellSlot = null;
  document.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('active'));
  activeHighlightColor = null;
  document.body.classList.remove('highlighter-active');
  updateHighlighterInfo(null);
}

async function saveCornellNote() {
  if (!currentCornellSlot) return;
  const { dateStr, slotIdx } = currentCornellSlot;
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  
  // contenteditable 또는 textarea 모두 지원
  const getVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return '';
    return el.tagName === 'TEXTAREA' ? el.value.trim() : el.innerHTML.trim();
  };
  const getText = (id) => {
    const el = document.getElementById(id);
    if (!el) return '';
    return el.tagName === 'TEXTAREA' ? el.value.trim() : el.textContent.trim();
  };
  
  const keywords = getVal('cornellKeywords');
  const content = getVal('cornellContent');
  const summary = getVal('cornellSummary');
  
  if (!getText('cornellKeywords') && !getText('cornellContent')) {
    showToast('키워드나 학습 내용 중 하나는 입력해주세요!', 'error');
    return;
  }
  
  showLoading('코넬노트를 저장하는 중...');
  
  try {
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
      highlights: { has_highlighter: keywords.includes('<mark') || content.includes('<mark') || summary.includes('<mark') },
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

/* ════════ 통계 ════════ */
function updateStats() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return;
  let total = 0, done = 0;
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

/* ════════ 기존 플래너 로드 ════════ */
async function loadExistingPlanner() {
  try {
    const url = `${API_BASE}/${TBL.planners}?student_id=${currentStudent.student_id}&status=active&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const planners = data.data || data.records || data || [];
    
    if (planners.length > 0) {
      const p = planners[planners.length - 1];
      if (typeof p.weeks_data === 'string') p.weeks_data = JSON.parse(p.weeks_data);
      if (typeof p.daily_tasks === 'string') p.daily_tasks = JSON.parse(p.daily_tasks);
      if (typeof p.subjects === 'string') p.subjects = JSON.parse(p.subjects);
      currentPlanner = p;
      
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

/* ════════ 헬퍼 ════════ */
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
  const overlay = document.getElementById('loadingOverlay');
  const txt = document.getElementById('loadingText');
  if (txt) txt.textContent = text || '로딩 중...';
  if (overlay) overlay.classList.add('show');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('show');
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}
