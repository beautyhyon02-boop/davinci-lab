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
let activeWeekTab = null;
let currentCornellSlot = null;
let currentCornellNoteId = null;
let currentEditingSlot = null;  // 슬롯 편집용
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

// 다빈치랩 시간 정책
const STUDY_MIN = 70;        // 학습 70분
const REST_MIN = 10;         // 휴식 10분
const SESSION_MIN = STUDY_MIN + REST_MIN;  // 한 세션 80분
const MEAL_START = 1110;     // 18:30 (분 단위)
const MEAL_END = 1170;       // 19:30
const WEEKDAY_DEFAULT_START = 960;  // 주중 16:00
const WEEKEND_DEFAULT_START = 480;  // 주말 08:00
const DAY_END = 1480;        // 24:40 (24*60+40)

document.addEventListener('DOMContentLoaded', async () => {
  showLoading('학생 정보를 불러오는 중...');
  if (!checkSession()) { hideLoading(); return; }
  await hydrateCurrentStudentProfile();
  console.log('📌 학생(보정 후):', currentStudent);
  await loadSubjects();
  await loadExistingPlanner();
  setupEventListeners();
  hideLoading();
});

/* ════════ 세션 ════════ */
function checkSession() {
  const SESSION_KEYS = ['dvl_user', 'dvSession', 'dvl_student_session', 'dvl_session'];
  let userStr = null;
  let foundKey = null;
  
  for (const key of SESSION_KEYS) {
    const val = sessionStorage.getItem(key);
    if (val && val !== 'null' && val !== 'undefined' && val.includes('{')) {
      userStr = val; foundKey = `sessionStorage.${key}`; break;
    }
  }
  if (!userStr) {
    for (const key of SESSION_KEYS) {
      const val = localStorage.getItem(key);
      if (val && val !== 'null' && val !== 'undefined' && val.includes('{')) {
        userStr = val; foundKey = `localStorage.${key}`; break;
      }
    }
  }
  console.log('🔍 세션:', foundKey || '❌');
  
  if (!userStr) {
    showToast('로그인이 필요합니다', 'error');
    setTimeout(() => location.href = '../login.html', 1500);
    return false;
  }
  try {
    const userData = JSON.parse(userStr);
    const rawId = userData.student_id || userData.login_id || userData.username || userData.id || '';
    currentStudent = {
      student_id: rawId ? String(rawId).trim() : '',
      session_id: userData.id ?? null,
      name: userData.name || '학생',
      role: userData.role || 'student',
      school: userData.school || '',
      grade: userData.grade || '',
      grade_num: userData.gradeNum || userData.grade_num || null,
      stage: userData.stage || '1단계'
    };
    console.log('📌 학생(세션 원본):', currentStudent);
    const avatarEl = document.getElementById('studentAvatar');
    const nameEl = document.getElementById('studentNameText');
    if (avatarEl) avatarEl.textContent = currentStudent.name.charAt(0);
    if (nameEl) nameEl.textContent = currentStudent.name;
    return true;
  } catch (e) {
    console.error('세션 오류:', e);
    showToast('세션 정보 오류', 'error');
    setTimeout(() => location.href = '../login.html', 1500);
    return false;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function showPlannerCreationUI() {
  const inputCard = document.getElementById('inputCard');
  const emptyState = document.getElementById('emptyState');
  const plannerContent = document.getElementById('plannerContent');
  if (inputCard) inputCard.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  if (plannerContent) plannerContent.style.display = 'none';
}

async function hydrateCurrentStudentProfile() {
  try {
    const res = await fetch(`${API_BASE}/${TBL.students}?limit=500`);
    if (!res.ok) return;
    const data = await res.json();
    const students = data.data || data.records || data || [];

    const candidateIds = new Set([
      normalizeText(currentStudent.student_id),
      normalizeText(currentStudent.session_id),
      normalizeText(currentStudent.name)
    ].filter(Boolean));

    let matched = students.find(s => candidateIds.has(normalizeText(s.student_id)));

    if (!matched && currentStudent.session_id && /^\d+$/.test(String(currentStudent.session_id))) {
      matched = students.find(s => String(s.id) === String(currentStudent.session_id));
    }

    if (!matched && currentStudent.name) {
      const byName = students.filter(s => normalizeText(s.name) === normalizeText(currentStudent.name));
      if (byName.length === 1) matched = byName[0];
      else if (byName.length > 1) {
        matched = byName.find(s => normalizeText(s.school) === normalizeText(currentStudent.school) && normalizeText(s.grade) === normalizeText(currentStudent.grade)) || byName[0];
      }
    }

    if (matched) {
      currentStudent.student_id = normalizeText(matched.student_id);
      currentStudent.name = matched.name || currentStudent.name;
      currentStudent.school = matched.school || currentStudent.school || '';
      currentStudent.grade = matched.grade || currentStudent.grade || '';
      currentStudent.grade_num = matched.grade_num || currentStudent.grade_num || null;
      currentStudent.stage = matched.stage || currentStudent.stage || '1단계';
      console.log('✅ 학생 프로필 매칭 성공:', currentStudent);
      const avatarEl = document.getElementById('studentAvatar');
      const nameEl = document.getElementById('studentNameText');
      if (avatarEl) avatarEl.textContent = currentStudent.name.charAt(0);
      if (nameEl) nameEl.textContent = currentStudent.name;
    } else {
      console.warn('⚠️ student_profiles에서 학생 프로필을 찾지 못했습니다. 세션값으로 진행합니다.', currentStudent);
    }
  } catch (e) {
    console.warn('학생 프로필 보정 실패:', e);
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
    populateSlotEditSubjects();
  } catch (e) {
    console.error('과목 로드:', e);
    allSubjects = [
      { subject_name: '국어', emoji: '📚' },
      { subject_name: '영어', emoji: '🔤' },
      { subject_name: '수학', emoji: '📐' },
      { subject_name: '과학', emoji: '🔬' },
      { subject_name: '사회', emoji: '🌏' }
    ];
    renderSubjectChips();
    populateSlotEditSubjects();
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

function populateSlotEditSubjects() {
  const select = document.getElementById('slotEditSubject');
  if (!select) return;
  select.innerHTML = '<option value="">선택 안함</option>';
  allSubjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.subject_name;
    opt.textContent = `${s.emoji || '📖'} ${s.subject_name}`;
    select.appendChild(opt);
  });
}

function toggleSubject(chip) {
  chip.classList.toggle('selected');
  const name = chip.dataset.name;
  const idx = selectedSubjects.indexOf(name);
  if (idx >= 0) selectedSubjects.splice(idx, 1);
  else selectedSubjects.push(name);
}

/* ════════ 이벤트 리스너 ════════ */
function setupEventListeners() {
  const startEl = document.getElementById('examStartDate');
  const endEl = document.getElementById('examEndDate');
  if (startEl) startEl.addEventListener('change', updateDdayPreview);
  if (endEl) endEl.addEventListener('change', updateDdayPreview);
  
  document.querySelectorAll('.vocab-radio').forEach(radio => {
    radio.addEventListener('click', () => {
      document.querySelectorAll('.vocab-radio').forEach(r => r.classList.remove('selected'));
      radio.classList.add('selected');
      selectedVocabCount = parseInt(radio.dataset.count);
    });
  });
  
  document.querySelectorAll('.hl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
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
      showToast(`🖍️ ${getColorMeaning(color)} - 텍스트를 드래그하세요!`, 'success');
    });
  });
  
  document.addEventListener('mouseup', (e) => {
    if (!activeHighlightColor) return;
    if (e.target.closest && e.target.closest('.cornell-editable')) {
      handleTextSelection();
    }
  });
}

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
    if (parent.tagName === 'MARK' || (parent.closest && parent.closest('mark'))) {
      const mark = parent.tagName === 'MARK' ? parent : parent.closest('mark');
      const text = document.createTextNode(mark.textContent);
      mark.parentNode.replaceChild(text, mark);
      selection.removeAllRanges();
      return;
    }
    const mark = document.createElement('mark');
    mark.className = 'hl-' + activeHighlightColor;
    mark.textContent = selectedText;
    range.deleteContents();
    range.insertNode(mark);
    selection.removeAllRanges();
  } catch (e) { console.warn('형광펜 실패:', e); }
}

function getColorMeaning(color) {
  return { yellow:'🟡 노랑 (중요)', green:'🟢 초록 (자주 출제)', blue:'🔵 파랑 (공식)', purple:'🟣 보라 (헷갈림)', red:'🔴 빨강 (실수)', orange:'🟠 주황 (복습)' }[color] || color;
}

function updateHighlighterInfo(color) {
  let info = document.getElementById('highlighterInfo');
  if (!info) {
    info = document.createElement('div');
    info.id = 'highlighterInfo';
    info.className = 'highlighter-info';
    const bar = document.querySelector('.highlighter-bar');
    if (bar && bar.parentNode) bar.parentNode.insertBefore(info, bar.nextSibling);
  }
  if (color) {
    info.innerHTML = `🖍️ <strong>${getColorMeaning(color)}</strong> 활성화 · 텍스트 드래그로 색칠`;
    info.style.display = 'block';
  } else { info.style.display = 'none'; }
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
    label.textContent = `🎯 시험일: ${startDate}${endDate ? ' ~ ' + endDate : ''} · ${diffDays}일 남았어요!`;
  } else if (diffDays === 0) {
    count.textContent = 'D-DAY';
    label.textContent = '🔥 오늘이 시험일!';
  } else {
    count.textContent = `D+${Math.abs(diffDays)}`;
    label.textContent = '시험이 지났어요';
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
  
  const today = new Date(); today.setHours(0,0,0,0);
  const examDate = new Date(examStartDate);
  const ddayTotal = Math.ceil((examDate - today) / 86400000);
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
    console.error('플래너 생성:', e);
    showToast('실패: ' + e.message, 'error');
  } finally { hideLoading(); }
}

/* ════════ 5주차 분배 ════════ */
function distributeWeeks(startDate, examDate, totalDays) {
  let weekConfigs;
  if (totalDays >= 35) {
    weekConfigs = [
      { ...WEEK_DEFS[0], days: 7 }, { ...WEEK_DEFS[1], days: 7 },
      { ...WEEK_DEFS[2], days: 7 }, { ...WEEK_DEFS[3], days: 7 },
      { ...WEEK_DEFS[4], days: totalDays - 28 }
    ];
  } else if (totalDays >= 28) {
    weekConfigs = [
      { ...WEEK_DEFS[0], days: totalDays - 28 }, { ...WEEK_DEFS[1], days: 7 },
      { ...WEEK_DEFS[2], days: 7 }, { ...WEEK_DEFS[3], days: 7 }, { ...WEEK_DEFS[4], days: 7 }
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
    weekConfigs = [{ ...WEEK_DEFS[3], days: per }, { ...WEEK_DEFS[4], days: totalDays - per }];
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
    const weekEnd = new Date(currentDate); weekEnd.setDate(weekEnd.getDate() - 1);
    weeks.push({
      id: wc.id, cls: wc.cls, emoji: wc.emoji, name: wc.name, subtitle: wc.subtitle,
      start_date: formatDate(weekStart), end_date: formatDate(weekEnd),
      day_count: wc.days, day_dates: dayDates
    });
  });
  return weeks;
}

/* ════════ 일별 시간표 생성 (80분 단위) ════════ */
function generateDailyTasks(weeksData) {
  const tasks = {};
  weeksData.forEach((week, weekIdx) => {
    week.day_dates.forEach((dateStr, dayIdx) => {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const defaultStart = isWeekend ? WEEKEND_DEFAULT_START : WEEKDAY_DEFAULT_START;
      const slots = buildDaySchedule(defaultStart, week.id, weekIdx, dayIdx, isWeekend);
      tasks[dateStr] = {
        date: dateStr,
        day_of_week: ['일','월','화','수','목','금','토'][dayOfWeek],
        is_weekend: isWeekend,
        start_minutes: defaultStart,
        week_id: week.id,
        slots: slots,
        completed_slots: [],
        memo: '', mood: '',
        vocab_done: 0, vocab_total: selectedVocabCount
      };
    });
  });
  return tasks;
}

/* 🎯 핵심 알고리즘: 80분 슬롯 자동 생성 + 식사 시간 제외 + 휴식 삽입 */
function buildDaySchedule(startMinutes, weekId, weekIdx, dayIdx, isWeekend) {
  const slots = [];
  const stageRange = getStageRangeForWeek(weekId);
  const todaySubjects = selectSubjectsForDay(dayIdx);
  
  let cursor = startMinutes;
  let studyCounter = 0;  // 학습 슬롯 인덱스
  let subjIdx = 0;
  
  // 학습 횟수 결정 (주중: 4세션, 주말: 8세션)
  const targetStudySessions = isWeekend ? 8 : 4;
  let studySessionsCreated = 0;
  
  while (cursor + STUDY_MIN <= DAY_END && studySessionsCreated < targetStudySessions * 2) {
    // 1) 식사 시간(18:30~19:30) 자동 스킵
    if (cursor < MEAL_END && (cursor + STUDY_MIN) > MEAL_START) {
      // 학습이 식사 시간과 겹침 → 식사 슬롯 삽입
      if (cursor < MEAL_START) {
        // 식사 전 짧은 시간이 남은 경우 → 식사 시간까지 점프
        slots.push({
          type: 'meal',
          start_min: MEAL_START,
          end_min: MEAL_END,
          time: `${minToTime(MEAL_START)}~${minToTime(MEAL_END)}`,
          task_text: '🍱 저녁 식사 (자습 제외)',
          completed: false,
          editable: false
        });
        cursor = MEAL_END;
        continue;
      } else {
        // 식사 중간이거나 식사 종료 시간으로 점프
        cursor = MEAL_END;
        continue;
      }
    }
    
    // 2) 70분 학습 슬롯
    const studyStart = cursor;
    const studyEnd = cursor + STUDY_MIN;
    if (studyEnd > DAY_END) break;
    
    // 학습/단어/자유 결정
    let slotType, taskText, subject, stage, subjectEmoji, stageEmoji;
    
    if (studyCounter < targetStudySessions) {
      // 정규 학습 슬롯
      const subj = todaySubjects[subjIdx % todaySubjects.length];
      const stageDef = stageRange[studyCounter % stageRange.length];
      const subjData = allSubjects.find(s => s.subject_name === subj) || { emoji: '📖' };
      
      slotType = 'study';
      subject = subj;
      subjectEmoji = subjData.emoji || '📖';
      stage = stageDef.name;
      stageEmoji = stageDef.emoji;
      taskText = `${subjectEmoji} ${subj} · ${stageEmoji} ${stage} + 코넬노트`;
      
      slots.push({
        type: slotType,
        start_min: studyStart,
        end_min: studyEnd,
        time: `${minToTime(studyStart)}~${minToTime(studyEnd)}`,
        subject: subject,
        subject_emoji: subjectEmoji,
        stage: stage,
        stage_id: stageDef.id,
        stage_emoji: stageEmoji,
        task_text: taskText,
        completed: false,
        cornell_written: false,
        editable: true
      });
      
      subjIdx++;
    } else {
      // 정규 학습 끝 → 영어단어 1번 + 자유 입력으로 나머지 채움
      if (studyCounter === targetStudySessions) {
        slots.push({
          type: 'vocab',
          start_min: studyStart,
          end_min: studyEnd,
          time: `${minToTime(studyStart)}~${minToTime(studyEnd)}`,
          task_text: `🔤 영어 단어 ${selectedVocabCount}개 + 1/3/7일 복습`,
          completed: false,
          editable: true
        });
      } else {
        slots.push({
          type: 'free',
          start_min: studyStart,
          end_min: studyEnd,
          time: `${minToTime(studyStart)}~${minToTime(studyEnd)}`,
          task_text: '➕ 자유 입력 (학생이 작성)',
          user_text: '',
          completed: false,
          editable: true
        });
      }
    }
    
    studyCounter++;
    studySessionsCreated++;
    cursor = studyEnd;
    
    // 3) 10분 휴식 추가 (다음 슬롯이 식사가 아닌 경우만)
    if (cursor + REST_MIN <= DAY_END && cursor + REST_MIN + STUDY_MIN <= DAY_END) {
      const restEnd = cursor + REST_MIN;
      // 휴식 종료가 식사 시작과 겹치지 않으면 추가
      if (!(cursor < MEAL_START && restEnd > MEAL_START)) {
        slots.push({
          type: 'rest',
          start_min: cursor,
          end_min: restEnd,
          time: `${minToTime(cursor)}~${minToTime(restEnd)}`,
          task_text: '☕ 휴식 (10분)',
          completed: false,
          editable: false
        });
        cursor = restEnd;
      }
    }
  }
  
  return slots;
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

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad(h)}:${pad(m)}`;
}

function timeToMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function pad(n) { return n.toString().padStart(2, '0'); }

/* ════════ 렌더링 ════════ */
function renderWeekTabs() {
  if (!currentPlanner || !currentPlanner.weeks_data) return;
  const container = document.getElementById('weekTabs');
  container.innerHTML = '';

  if (!activeWeekTab) {
    activeWeekTab = getAutoWeekTabId();
  }

  currentPlanner.weeks_data.forEach((week) => {
    const tab = document.createElement('div');
    const isActive = activeWeekTab === week.id;
    tab.className = `week-tab ${isActive ? 'active ' + week.cls : ''}`;
    tab.innerHTML = `
      <span class="emoji">${week.emoji}</span>
      <div class="name">${week.name}</div>
      <div class="date-range">${formatShortDate(week.start_date)} ~ ${formatShortDate(week.end_date)}</div>
    `;
    tab.onclick = () => {
      activeWeekTab = week.id;
      renderWeekTabs();
      renderDayGrid();
    };
    container.appendChild(tab);
  });
}

function renderDayGrid() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return;
  const grid = document.getElementById('dayGrid');
  grid.innerHTML = '';

  const currentWeek = currentPlanner.weeks_data.find(w => w.id === activeWeekTab) || currentPlanner.weeks_data[0];
  if (!currentWeek) return;

  const todayStr = getTodayStr();
  const orderedDates = [...currentWeek.day_dates].sort((a, b) => {
    if (a === todayStr) return -1;
    if (b === todayStr) return 1;
    return a.localeCompare(b);
  });

  orderedDates.forEach((dateStr) => {
    const dayTask = currentPlanner.daily_tasks[dateStr];
    if (!dayTask) return;
    const isToday = dateStr === todayStr;
    const ddayLabel = calcDdayFromDate(dateStr);
    const card = document.createElement('div');
    card.className = `day-card ${currentWeek.cls} ${isToday ? 'today-card' : ''}`;

    const completedCount = (dayTask.completed_slots || []).length;
    const countableSlots = dayTask.slots.filter(s => s.type !== 'rest' && s.type !== 'meal');
    const totalCount = countableSlots.length;
    const pct = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;

    const startMin = dayTask.start_minutes || (dayTask.is_weekend ? WEEKEND_DEFAULT_START : WEEKDAY_DEFAULT_START);

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
        <div class="day-start-time">
          <label>🕐 시작 시간:</label>
          <input type="time" value="${minToTime(startMin)}"
                 onchange="changeDayStartTime('${dateStr}', this.value)">
          <button class="regen-btn" onclick="regenerateDaySchedule('${dateStr}')" title="새 시작시간으로 시간표 다시 생성">
            🔄 재생성
          </button>
        </div>
        ${renderTimeSlots(dateStr, dayTask.slots)}
        ${renderVocabSection(dateStr, dayTask)}
        ${renderDayMemo(dateStr, dayTask)}
      </div>
    `;
    grid.appendChild(card);
  });

  requestAnimationFrame(() => {
    document.querySelector('.day-card.today-card')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

function renderTimeSlots(dateStr, slots) {
  return slots.map((slot, idx) => {
    const isCompleted = slot.completed;
    let slotClass = 'time-slot';
    let slotInner = '';
    let actions = '';
    
    if (slot.type === 'rest') {
      slotClass += ' rest-slot';
      slotInner = `
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text">☕ 휴식 (10분)</span>
      `;
    } else if (slot.type === 'meal') {
      slotClass += ' meal-slot';
      slotInner = `
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text">🍱 저녁 식사</span>
      `;
    } else if (slot.type === 'free') {
      slotClass += ' free-slot';
      if (isCompleted) slotClass += ' completed';
      const userText = slot.user_text || '';
      const displayText = userText ? `✍️ ${escapeHtml(userText)}` : '➕ 자유 입력 (수정 버튼 클릭)';
      slotInner = `
        <input type="checkbox" ${isCompleted ? 'checked' : ''} 
               onchange="toggleSlot('${dateStr}', ${idx}, this.checked)">
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text ${userText ? '' : 'free-input-placeholder'}">${displayText}</span>
      `;
      actions = `
        <div class="slot-actions">
          <button class="slot-edit-btn" onclick="openSlotEditModal('${dateStr}', ${idx})">✏️ 수정</button>
        </div>
      `;
    } else if (slot.type === 'vocab') {
      if (isCompleted) slotClass += ' completed';
      slotInner = `
        <input type="checkbox" ${isCompleted ? 'checked' : ''} 
               onchange="toggleSlot('${dateStr}', ${idx}, this.checked)">
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text">${slot.task_text}</span>
      `;
      actions = `
        <div class="slot-actions">
          <button class="slot-edit-btn" onclick="openSlotEditModal('${dateStr}', ${idx})">✏️ 수정</button>
        </div>
      `;
    } else {
      // study
      if (isCompleted) slotClass += ' completed';
      const written = slot.cornell_written ? 'written' : '';
      const cornellLabel = slot.cornell_written ? '✓ 노트' : '📝 노트';
      slotInner = `
        <input type="checkbox" ${isCompleted ? 'checked' : ''} 
               onchange="toggleSlot('${dateStr}', ${idx}, this.checked)">
        <span class="slot-time">${slot.time}</span>
        <span class="slot-text">${slot.task_text}</span>
      `;
      actions = `
        <div class="slot-actions">
          <button class="slot-cornell-btn ${written}" onclick="openCornellModal('${dateStr}', ${idx})">${cornellLabel}</button>
          <button class="slot-edit-btn" onclick="openSlotEditModal('${dateStr}', ${idx})">✏️</button>
        </div>
      `;
    }
    
    return `<div class="${slotClass}" data-slot-key="${dateStr}_${idx}">${slotInner}${actions}</div>`;
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
        ♻️ 어제 ${total}개 · 3일전 ${total}개 · 7일전 ${total}개 누적 (Ebbinghaus)
      </div>
    </div>
  `;
}

function renderDayMemo(dateStr, dayTask) {
  const memo = dayTask.memo || '';
  const mood = dayTask.mood || '';
  const moods = ['😊','🥲','💪','😴','🔥','😅'];
  return `
    <div class="day-memo">
      <textarea placeholder="오늘의 메모를 적어주세요..." onchange="saveDayMemo('${dateStr}', this.value)">${memo}</textarea>
      <div class="mood-emoji-row">
        ${moods.map(m => `<span class="mood-emoji ${mood === m ? 'selected' : ''}" onclick="setDayMood('${dateStr}', '${m}', this)">${m}</span>`).join('')}
      </div>
    </div>
  `;
}

/* ════════ 시작 시간 변경 / 재생성 ════════ */
async function changeDayStartTime(dateStr, newTime) {
  if (!currentPlanner || !currentPlanner.daily_tasks[dateStr]) return;
  currentPlanner.daily_tasks[dateStr].start_minutes = timeToMin(newTime);
  await savePlannerData();
  showToast(`⏰ 시작 시간이 ${newTime}으로 변경되었어요! 재생성 버튼을 눌러 시간표를 새로 만드세요.`, 'success');
}

async function regenerateDaySchedule(dateStr) {
  if (!currentPlanner || !currentPlanner.daily_tasks[dateStr]) return;
  if (!confirm('이 날의 시간표를 새로 생성하시겠어요?\n(체크 표시와 메모는 유지됩니다)')) return;
  
  const dayTask = currentPlanner.daily_tasks[dateStr];
  const week = currentPlanner.weeks_data.find(w => w.id === dayTask.week_id);
  const dayIdx = week ? week.day_dates.indexOf(dateStr) : 0;
  const weekIdx = currentPlanner.weeks_data.findIndex(w => w.id === dayTask.week_id);
  
  const oldMemo = dayTask.memo;
  const oldMood = dayTask.mood;
  const oldVocabDone = dayTask.vocab_done;
  
  const newSlots = buildDaySchedule(
    dayTask.start_minutes,
    dayTask.week_id,
    weekIdx,
    dayIdx,
    dayTask.is_weekend
  );
  
  dayTask.slots = newSlots;
  dayTask.completed_slots = [];
  dayTask.memo = oldMemo;
  dayTask.mood = oldMood;
  dayTask.vocab_done = oldVocabDone;
  
  await savePlannerData();
  renderDayGrid();
  updateStats();
  showToast('🔄 시간표가 새로 생성되었습니다!', 'success');
}

/* ════════ 체크박스 / 메모 / 기분 ════════ */
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
  } catch (e) { console.error('저장:', e); showToast('저장 오류', 'error'); }
}

/* ════════ 슬롯 편집 모달 ════════ */
function openSlotEditModal(dateStr, slotIdx) {
  const dayTask = currentPlanner.daily_tasks[dateStr];
  if (!dayTask) return;
  const slot = dayTask.slots[slotIdx];
  if (!slot || !slot.editable) {
    showToast('이 슬롯은 수정할 수 없어요', 'error');
    return;
  }
  
  currentEditingSlot = { dateStr, slotIdx };
  
  document.getElementById('slotEditStartTime').value = minToTime(slot.start_min);
  document.getElementById('slotEditEndTime').value = minToTime(slot.end_min);
  document.getElementById('slotEditSubject').value = slot.subject || '';
  document.getElementById('slotEditStage').value = slot.stage || '';
  document.getElementById('slotEditCustomText').value = slot.user_text || '';
  
  document.getElementById('slotEditModal').classList.add('show');
}

function closeSlotEditModal() {
  document.getElementById('slotEditModal').classList.remove('show');
  currentEditingSlot = null;
}

async function saveSlotEdit() {
  if (!currentEditingSlot) return;
  const { dateStr, slotIdx } = currentEditingSlot;
  const dayTask = currentPlanner.daily_tasks[dateStr];
  const slot = dayTask.slots[slotIdx];
  if (!slot) return;
  
  const startTime = document.getElementById('slotEditStartTime').value;
  const endTime = document.getElementById('slotEditEndTime').value;
  const subject = document.getElementById('slotEditSubject').value;
  const stage = document.getElementById('slotEditStage').value;
  const customText = document.getElementById('slotEditCustomText').value.trim();
  
  if (!startTime || !endTime) {
    showToast('시간을 입력해주세요!', 'error');
    return;
  }
  
  const startMin = timeToMin(startTime);
  const endMin = timeToMin(endTime);
  
  if (endMin <= startMin) {
    showToast('종료 시간이 시작 시간보다 빠를 수 없어요', 'error');
    return;
  }
  
  // 식사 시간(18:30~19:30) 겹침 경고
  if (startMin < MEAL_END && endMin > MEAL_START) {
    if (!confirm('⚠️ 저녁 식사 시간(18:30~19:30)과 겹쳐요!\n그래도 저장할까요?')) return;
  }
  
  slot.start_min = startMin;
  slot.end_min = endMin;
  slot.time = `${minToTime(startMin)}~${minToTime(endMin)}`;
  
  // 과목/단계 업데이트
  if (subject) {
    const subjData = allSubjects.find(s => s.subject_name === subject) || { emoji: '📖' };
    slot.subject = subject;
    slot.subject_emoji = subjData.emoji || '📖';
  }
  if (stage) {
    const stageMap = {
      '개념이해':'💡','개념완성':'📖','인강듣기':'🎬','문제풀이':'📝',
      '유형문제':'📝','심화문제':'🔥','최종문제':'🎯','오답정리':'✍️','암기':'🧠','자유학습':'📖'
    };
    slot.stage = stage;
    slot.stage_emoji = stageMap[stage] || '📖';
  }
  
  // task_text 자동 조합
  if (customText) {
    slot.user_text = customText;
    slot.task_text = `✍️ ${customText}`;
    if (slot.type === 'free' && customText) {
      // free 슬롯에 내용이 들어가면 일반 학습처럼 보이게
    }
  } else if (slot.subject && slot.stage) {
    slot.task_text = `${slot.subject_emoji} ${slot.subject} · ${slot.stage_emoji} ${slot.stage}`;
    slot.user_text = '';
  } else if (slot.subject) {
    slot.task_text = `${slot.subject_emoji} ${slot.subject}`;
    slot.user_text = '';
  }
  
  await savePlannerData();
  closeSlotEditModal();
  renderDayGrid();
  showToast('✅ 슬롯이 수정되었습니다!', 'success');
}

async function deleteSlot() {
  if (!currentEditingSlot) return;
  if (!confirm('정말 이 슬롯을 삭제하시겠어요?')) return;
  
  const { dateStr, slotIdx } = currentEditingSlot;
  const dayTask = currentPlanner.daily_tasks[dateStr];
  dayTask.slots.splice(slotIdx, 1);
  
  // 완료 리스트도 정리
  if (dayTask.completed_slots) {
    dayTask.completed_slots = dayTask.completed_slots
      .filter(i => i !== slotIdx)
      .map(i => i > slotIdx ? i - 1 : i);
  }
  
  await savePlannerData();
  closeSlotEditModal();
  renderDayGrid();
  updateStats();
  showToast('🗑️ 슬롯이 삭제되었습니다', 'success');
}

/* ════════ 코넬노트 모달 ════════ */
function sanitizeCornellKeyPart(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9A-Za-z가-힣_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'na';
}

function ensureCornellSlotKey(dateStr, slotIdx) {
  if (!currentPlanner || !currentPlanner.daily_tasks || !currentPlanner.daily_tasks[dateStr]) return '';
  const dayTask = currentPlanner.daily_tasks[dateStr];
  if (!dayTask.slots || !dayTask.slots[slotIdx]) return '';

  const slot = dayTask.slots[slotIdx];
  if (!slot.cornell_slot_key) {
    slot.cornell_slot_key = [
      'cornell',
      sanitizeCornellKeyPart(currentPlanner.id || 'planner'),
      sanitizeCornellKeyPart(dateStr),
      `idx${slotIdx}`,
      sanitizeCornellKeyPart(slot.start_time || 'nostart'),
      sanitizeCornellKeyPart(slot.end_time || 'noend'),
      sanitizeCornellKeyPart(slot.subject || 'nosubject'),
      sanitizeCornellKeyPart(slot.stage || 'nostage')
    ].join('__');
  }
  return slot.cornell_slot_key;
}

function ensurePlannerCornellKeys() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return false;
  let changed = false;

  Object.entries(currentPlanner.daily_tasks).forEach(([dateStr, dayTask]) => {
    if (!dayTask || !Array.isArray(dayTask.slots)) return;
    dayTask.slots.forEach((slot, slotIdx) => {
      if (!slot || slot.type === 'rest' || slot.type === 'meal' || slot.type === 'free') return;
      if (!slot.cornell_slot_key) {
        ensureCornellSlotKey(dateStr, slotIdx);
        changed = true;
      }
    });
  });

  return changed;
}

function getSlotCornellStore(dateStr, slotIdx) {
  if (!currentPlanner || !currentPlanner.daily_tasks || !currentPlanner.daily_tasks[dateStr]) return null;
  const dayTask = currentPlanner.daily_tasks[dateStr];
  if (!dayTask.slots || !dayTask.slots[slotIdx]) return null;
  const slot = dayTask.slots[slotIdx];
  if (!slot.cornell_data || typeof slot.cornell_data !== 'object') {
    slot.cornell_data = {
      keywords: '',
      content: '',
      summary: '',
      updated_at: null
    };
  }
  return slot.cornell_data;
}

function applyCornellValuesToModal(note) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'TEXTAREA') el.value = val || '';
    else el.innerHTML = val || '';
  };

  setVal('cornellKeywords', note?.keywords || '');
  setVal('cornellContent', note?.content || '');
  setVal('cornellSummary', note?.summary || '');
}

function setSlotCornellState(dateStr, slotIdx, payload = {}) {
  if (!currentPlanner || !currentPlanner.daily_tasks || !currentPlanner.daily_tasks[dateStr]) return;
  const slot = currentPlanner.daily_tasks[dateStr].slots?.[slotIdx];
  if (!slot) return;

  const store = getSlotCornellStore(dateStr, slotIdx);
  store.keywords = payload.keywords || '';
  store.content = payload.content || '';
  store.summary = payload.summary || '';
  store.updated_at = payload.updated_at || new Date().toISOString();

  slot.cornell_written = !!(store.keywords || store.content || store.summary);
  slot.cornell_note_id = payload.note_id || slot.cornell_note_id || null;
  slot.cornell_slot_key = ensureCornellSlotKey(dateStr, slotIdx);
  slot.cornell_updated_at = store.updated_at;
}

function clearSlotCornellState(dateStr, slotIdx) {
  if (!currentPlanner || !currentPlanner.daily_tasks || !currentPlanner.daily_tasks[dateStr]) return;
  const slot = currentPlanner.daily_tasks[dateStr].slots?.[slotIdx];
  if (!slot) return;

  slot.cornell_data = {
    keywords: '',
    content: '',
    summary: '',
    updated_at: null
  };
  slot.cornell_written = false;
  slot.cornell_note_id = null;
  slot.cornell_updated_at = null;
  ensureCornellSlotKey(dateStr, slotIdx);
}

async function loadCornellNoteById(noteId) {
  if (!noteId) return null;
  try {
    const res = await fetch(`${API_BASE}/${TBL.notes}/${noteId}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    return data.data || data.record || data;
  } catch (e) {
    console.warn('코넬노트 단건 로드:', e);
    return null;
  }
}

async function findCornellNoteBySlot(dateStr, slotIdx, slot) {
  try {
    const slotKey = ensureCornellSlotKey(dateStr, slotIdx);
    const params = new URLSearchParams({
      student_id: currentStudent.student_id,
      planner_id: currentPlanner.id,
      slot_key: slotKey,
      limit: '10'
    });
    const res = await fetch(`${API_BASE}/${TBL.notes}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const notes = data?.data || data?.records || data || [];
    const liveNotes = Array.isArray(notes) ? notes.filter(note => !note.is_deleted) : [];
    if (liveNotes.length > 0) return pickLatestCornellNote(liveNotes);
  } catch (e) {
    console.warn('코넬노트 슬롯 조회:', e);
  }

  if (slot?.cornell_note_id) {
    const byId = await loadCornellNoteById(slot.cornell_note_id);
    if (byId && !byId.is_deleted) return byId;
  }

  return null;
}

function openCornellModal(dateStr, slotIdx) {
  currentCornellSlot = { dateStr, slotIdx };
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  ensureCornellSlotKey(dateStr, slotIdx);
  document.getElementById('cornellInfo').innerHTML = `
    <strong>📅 ${dateStr}</strong> · ${slot.subject_emoji || '📖'} ${slot.subject || ''} · ${slot.stage_emoji || ''} ${slot.stage || ''}
  `;
  const headerTitle = document.querySelector('.modal-header h3');
  if (headerTitle) headerTitle.innerHTML = '✏️ 코넬노트 작성';
  loadExistingNote(dateStr, slotIdx, slot);
  document.getElementById('cornellModal').classList.add('show');
}

async function loadExistingNote(dateStr, slotIdx, slot) {
  applyCornellValuesToModal(null);
  currentCornellNoteId = null;
  updateSaveButtonLabel(false);
  document.getElementById('cornellDeleteBtn').style.display = 'none';

  try {
    const remoteNote = await findCornellNoteBySlot(dateStr, slotIdx, slot);
    if (!remoteNote) {
      clearSlotCornellState(dateStr, slotIdx);
      savePlannerData().catch(err => console.warn('빈 코넬 상태 저장:', err));
      return;
    }

    currentCornellNoteId = remoteNote.id || null;
    applyCornellValuesToModal(remoteNote);
    setSlotCornellState(dateStr, slotIdx, {
      note_id: currentCornellNoteId,
      keywords: remoteNote.keywords || '',
      content: remoteNote.content || '',
      summary: remoteNote.summary || '',
      updated_at: remoteNote.updated_at || remoteNote.created_at || new Date().toISOString()
    });
    updateSaveButtonLabel(true);
    document.getElementById('cornellDeleteBtn').style.display = 'inline-block';
    savePlannerData().catch(err => console.warn('코넬 로컬 동기화:', err));
  } catch (e) {
    console.warn('코넬노트 로드:', e);
  }
}

function updateSaveButtonLabel(isEditMode) {
  const btn = document.querySelector('.modal-actions .btn-save');
  if (!btn) return;
  if (isEditMode) {
    btn.innerHTML = '✏️ 수정 저장';
    btn.style.background = 'linear-gradient(135deg, #F59E0B, #D97706)';
  } else {
    btn.innerHTML = '💾 코넬노트 저장';
    btn.style.background = 'linear-gradient(135deg, #4F46E5, #7C3AED)';
  }
  const headerTitle = document.querySelector('.modal-header h3');
  if (headerTitle) headerTitle.innerHTML = isEditMode ? '✏️ 코넬노트 수정' : '✏️ 코넬노트 작성';
  const info = document.getElementById('cornellInfo');
  if (info && isEditMode && !info.innerHTML.includes('수정 모드')) {
    info.innerHTML += ' <span style="background:#FEF3C7;color:#D97706;padding:2px 8px;border-radius:6px;font-weight:700;margin-left:8px;">✏️ 수정 모드</span>';
  }
}

function closeCornellModal() {
  document.getElementById('cornellModal').classList.remove('show');
  currentCornellSlot = null;
  currentCornellNoteId = null;
  document.querySelectorAll('.hl-btn').forEach(b => b.classList.remove('active'));
  activeHighlightColor = null;
  document.body.classList.remove('highlighter-active');
  updateHighlighterInfo(null);
  const headerTitle = document.querySelector('.modal-header h3');
  if (headerTitle) headerTitle.innerHTML = '✏️ 코넬노트 작성';
  const btn = document.querySelector('.modal-actions .btn-save');
  if (btn) {
    btn.innerHTML = '💾 코넬노트 저장';
    btn.style.background = 'linear-gradient(135deg, #4F46E5, #7C3AED)';
  }
  document.getElementById('cornellDeleteBtn').style.display = 'none';
}

async function saveCornellNote() {
  if (!currentCornellSlot) return;
  const { dateStr, slotIdx } = currentCornellSlot;
  const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
  const slotKey = ensureCornellSlotKey(dateStr, slotIdx);

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

  showLoading(currentCornellNoteId ? '수정 중...' : '저장 중...');

  try {
    const nowIso = new Date().toISOString();
    const hasHL = keywords.includes('<mark') || content.includes('<mark') || summary.includes('<mark');
    const baseDate = new Date(`${dateStr}T00:00:00`);
    const d1 = new Date(baseDate); d1.setDate(d1.getDate() + 1);
    const d3 = new Date(baseDate); d3.setDate(d3.getDate() + 3);
    const d7 = new Date(baseDate); d7.setDate(d7.getDate() + 7);

    const commonPayload = {
      student_id: currentStudent.student_id,
      planner_id: currentPlanner.id,
      slot_key: slotKey,
      study_date: dateStr,
      slot_index: slotIdx,
      slot_start_time: slot.start_time || '',
      slot_end_time: slot.end_time || '',
      subject: slot.subject || '',
      unit: '',
      stage: slot.stage || '',
      note_type: 'study',
      keywords,
      content,
      summary,
      highlights: { has_highlighter: hasHL },
      image_urls: [],
      review_date_1: formatDate(d1),
      review_date_3: formatDate(d3),
      review_date_7: formatDate(d7),
      reviewed_1: false,
      reviewed_3: false,
      reviewed_7: false,
      is_mastered: false,
      is_deleted: false,
      updated_at: nowIso
    };

    let noteId = currentCornellNoteId;
    if (!noteId) {
      const existingNote = await findCornellNoteBySlot(dateStr, slotIdx, slot);
      if (existingNote?.id) noteId = existingNote.id;
    }

    if (noteId) {
      const res = await fetch(`${API_BASE}/${TBL.notes}/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commonPayload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '수정 실패');
      }
      currentCornellNoteId = noteId;
      showToast('✏️ 코넬노트가 수정되었습니다!', 'success');
    } else {
      const res = await fetch(`${API_BASE}/${TBL.notes}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...commonPayload, created_at: nowIso })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '저장 실패');
      }
      const saved = await res.json();
      currentCornellNoteId = saved.id || saved.data?.id || null;
      showToast('💾 코넬노트가 저장되었습니다!', 'success');
    }

    setSlotCornellState(dateStr, slotIdx, {
      note_id: currentCornellNoteId,
      keywords,
      content,
      summary,
      updated_at: nowIso
    });
    await savePlannerData();
    closeCornellModal();
    renderDayGrid();
  } catch (e) {
    console.error('코넬노트:', e);
    showToast('실패: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteCornellNote() {
  if (!currentCornellSlot) return;
  if (!confirm('정말 이 코넬노트를 삭제하시겠어요?\n(복습 일정도 함께 사라집니다)')) return;

  showLoading('삭제 중...');
  try {
    const { dateStr, slotIdx } = currentCornellSlot;
    const slot = currentPlanner.daily_tasks[dateStr].slots[slotIdx];
    let noteId = currentCornellNoteId;

    if (!noteId) {
      const existingNote = await findCornellNoteBySlot(dateStr, slotIdx, slot);
      if (existingNote?.id) noteId = existingNote.id;
    }

    if (noteId) {
      const res = await fetch(`${API_BASE}/${TBL.notes}/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_deleted: true, updated_at: new Date().toISOString() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '삭제 실패');
      }
    }

    clearSlotCornellState(dateStr, slotIdx);
    await savePlannerData();

    showToast('🗑️ 코넬노트가 삭제되었습니다', 'success');
    closeCornellModal();
    renderDayGrid();
  } catch (e) {
    console.error('삭제:', e);
    showToast('삭제 실패: ' + e.message, 'error');
  } finally { hideLoading(); }
}

/* ════════ 통계 / 기존 플래너 ════════ */
function updateStats() {
  if (!currentPlanner || !currentPlanner.daily_tasks) return;
  let total = 0, done = 0;
  Object.values(currentPlanner.daily_tasks).forEach(day => {
    const countable = day.slots.filter(s => s.type !== 'rest' && s.type !== 'meal');
    total += countable.length;
    done += (day.completed_slots || []).filter(idx => {
      const slot = day.slots[idx];
      return slot && slot.type !== 'rest' && slot.type !== 'meal';
    }).length;
  });
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPct').textContent = pct + '%';
  document.getElementById('statPctLabel').textContent = pct + '%';
  document.getElementById('overallFill').style.width = pct + '%';
}

async function loadExistingPlanner() {
  try {
    showPlannerCreationUI();

    if (!currentStudent || !currentStudent.student_id) {
      console.warn('⚠️ 학생 식별값이 없어 기존 플래너를 조회하지 않습니다.');
      return;
    }

    const studentId = normalizeText(currentStudent.student_id);
    const url = `${API_BASE}/${TBL.planners}?student_id=eq.${encodeURIComponent(studentId)}&status=eq.active&limit=20&sort=created_at.desc`;
    console.log('📘 플래너 조회 student_id:', studentId, url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('플래너 조회 실패 상태코드:', res.status);
      showPlannerCreationUI();
      return;
    }

    const data = await res.json();
    const myPlanners = data.data || data.records || data || [];

    if (myPlanners.length === 0) {
      console.log('🆕 현재 학생의 기존 active 플래너가 없습니다. 새 플래너 생성 화면을 표시합니다.', currentStudent.student_id);
      currentPlanner = null;
      showPlannerCreationUI();
      return;
    }

    const p = myPlanners[0];
    if (typeof p.weeks_data === 'string') p.weeks_data = JSON.parse(p.weeks_data);
    if (typeof p.daily_tasks === 'string') p.daily_tasks = JSON.parse(p.daily_tasks);
    if (typeof p.subjects === 'string') p.subjects = JSON.parse(p.subjects);

    currentPlanner = p;
    const cornellKeysPatched = ensurePlannerCornellKeys();
    const examEnd = new Date(p.exam_end_date);
    const today = new Date();

    if (examEnd >= today) {
      document.getElementById('inputCard').style.display = 'none';
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('plannerContent').style.display = 'block';
      renderWeekTabs();
      renderDayGrid();
      updateStats();
    } else {
      currentPlanner = null;
      showPlannerCreationUI();
    }

    if (cornellKeysPatched) {
      savePlannerData().catch(err => console.warn('코넬 슬롯 키 저장:', err));
    }
  } catch (e) {
    console.warn('기존 플래너 로드:', e);
    showPlannerCreationUI();
  }
}

/* ════════ 헬퍼 ════════ */
function getTodayStr() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDate(today);
}

function getAutoWeekTabId() {
  if (!currentPlanner || !Array.isArray(currentPlanner.weeks_data) || currentPlanner.weeks_data.length === 0) {
    return 'pre';
  }

  const todayStr = getTodayStr();
  const currentWeek = currentPlanner.weeks_data.find(
    week => todayStr >= week.start_date && todayStr <= week.end_date
  );
  if (currentWeek) return currentWeek.id;

  const upcomingWeek = currentPlanner.weeks_data.find(week => todayStr < week.start_date);
  if (upcomingWeek) return upcomingWeek.id;

  return currentPlanner.weeks_data[currentPlanner.weeks_data.length - 1].id;
}

function formatDate(d) {
  if (typeof d === 'string') return d.split('T')[0];
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}`;
}
function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]})`;
}
function calcDdayFromDate(dateStr) {
  if (!currentPlanner) return '';
  const examDate = new Date(currentPlanner.exam_start_date);
  const target = new Date(dateStr);
  const diff = Math.ceil((examDate - target) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'D-DAY';
  return `D+${Math.abs(diff)}`;
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function showLoading(text) {
  const o = document.getElementById('loadingOverlay');
  const t = document.getElementById('loadingText');
  if (t) t.textContent = text || '로딩 중...';
  if (o) o.classList.add('show');
}
function hideLoading() {
  const o = document.getElementById('loadingOverlay');
  if (o) o.classList.remove('show');
}
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 2500);
}
