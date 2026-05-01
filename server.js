const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_profiles (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50) UNIQUE,
        name VARCHAR(100), school VARCHAR(100), grade VARCHAR(20),
        grade_num INTEGER DEFAULT 0, class_num INTEGER DEFAULT 0,
        student_num INTEGER DEFAULT 0, stage VARCHAR(50),
        consulting BOOLEAN DEFAULT false, status VARCHAR(20) DEFAULT 'pending',
        password VARCHAR(255), parent_phone VARCHAR(20), memo TEXT,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS admin_accounts (
        id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE,
        password VARCHAR(255), name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'admin', title VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS parent_profiles (
        id SERIAL PRIMARY KEY, parent_id VARCHAR(50) UNIQUE,
        name VARCHAR(100), phone VARCHAR(20), password VARCHAR(255),
        child_ids TEXT[], created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), date DATE,
        status VARCHAR(20) DEFAULT 'present', check_in TIME, check_out TIME,
        memo TEXT, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), student_name VARCHAR(100),
        subject VARCHAR(100), type VARCHAR(50), deadline DATE,
        status VARCHAR(20) DEFAULT 'pending', content TEXT, image_url TEXT,
        feedback TEXT, feedback_checklist JSONB,
        unread_admin BOOLEAN DEFAULT true, admin_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS notices (
        id SERIAL PRIMARY KEY, title VARCHAR(200), content TEXT,
        category VARCHAR(50), is_pinned BOOLEAN DEFAULT false,
        is_important BOOLEAN DEFAULT false, target_role VARCHAR(20) DEFAULT 'all',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS notice_reads (
        id SERIAL PRIMARY KEY, notice_id INTEGER, user_id VARCHAR(50),
        read_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), date DATE, time TIME,
        content TEXT, status VARCHAR(20) DEFAULT 'pending', result TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS consult_requests (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), student_name VARCHAR(100),
        requested_date DATE, requested_time VARCHAR(50), content TEXT,
        status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS grades_school (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), year INTEGER,
        semester INTEGER, subject VARCHAR(100), units INTEGER,
        score DECIMAL, grade VARCHAR(10), grade_num INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS grades_mock (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), date DATE,
        korean INTEGER, math INTEGER, english INTEGER,
        science INTEGER, social INTEGER,
        korean_pct DECIMAL, math_pct DECIMAL, english_pct DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS exam_planners (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50),
        student_name VARCHAR(100),
        exam_type VARCHAR(50),
        exam_date DATE,
        exam_start_date DATE,
        exam_end_date DATE,
        exam_days INTEGER DEFAULT 0,
        plan_start_date DATE,
        title VARCHAR(200),
        subjects JSONB,
        schedule JSONB DEFAULT '{}',
        scope JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT '진행중',
        created_by VARCHAR(50),
        year VARCHAR(10),
        semester VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS planner_tasks (
        id SERIAL PRIMARY KEY, planner_id INTEGER, student_id VARCHAR(50),
        date DATE, subject VARCHAR(100), task_content TEXT,
        is_done BOOLEAN DEFAULT false, student_memo TEXT, admin_comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS exam_schedules (
        id SERIAL PRIMARY KEY, title VARCHAR(200), date DATE,
        subject VARCHAR(100), scope TEXT, grade VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS student_records (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50),
        section VARCHAR(50), content TEXT, updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS student_logs (
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), student_name VARCHAR(100),
        type VARCHAR(50), duration INTEGER, date DATE, memo TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS study_recommendations (
        id SERIAL PRIMARY KEY,
        tier INTEGER, tier_name VARCHAR(100),
        score_min INTEGER, score_max INTEGER,
        subject VARCHAR(50), platform VARCHAR(200),
        lecture VARCHAR(300), textbook VARCHAR(500), strategy TEXT,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO admin_accounts (username, password, name, role, title)
      VALUES ('admin', 'dvlAdmin!', '원장', 'admin', '원장')
      ON CONFLICT (username) DO NOTHING;
    `);

    // 기존 exam_planners 테이블에 누락된 컬럼 추가 (이미 있으면 무시)
    const alterCols = [
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS student_name VARCHAR(100)",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS exam_type VARCHAR(50)",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS exam_start_date DATE",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS exam_end_date DATE",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS exam_days INTEGER DEFAULT 0",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS plan_start_date DATE",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '{}'",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS scope JSONB DEFAULT '{}'",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT '진행중'",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS created_by VARCHAR(50)",
      "ALTER TABLE exam_planners ADD COLUMN IF NOT EXISTS year VARCHAR(10)",
    ];
    for (const sql of alterCols) {
      await client.query(sql);
    }

    // 추천 인강/문제집 초기 데이터
    const recCnt = await client.query('SELECT COUNT(*) FROM study_recommendations');
    if (parseInt(recCnt.rows[0].count) === 0) {
      const recs = [
        [1,'기초 확립형',0,59,'국어','EBS 중학','EBS 중학 (강송연)','빠작 중학 국어 첫 문법','교과서 지문 소리 내어 읽기 및 어휘 암기'],
        [1,'기초 확립형',0,59,'영어','EBS 중학','EBS 중학 (정승익)','능률 VOCA 중등 필수, Grammar Inside Starter','하루 단어 20개, 기초 문법 용어 익히기'],
        [1,'기초 확립형',0,59,'수학','밀크T/EBS','밀크T (전수진), EBS (이지연)','수력충전, 개념쎈','연산 반복 및 교과서 예제 무한 복습'],
        [1,'기초 확립형',0,59,'과학','EBS 중학','EBS (김청해)','체크체크 과학','용어 정의와 그림/도표 위주 암기'],
        [1,'기초 확립형',0,59,'사회','EBS 중학','EBS (강현태)','한끝 사회/역사','역사 흐름(스토리) 위주 시청'],
        [2,'취약 보완형',60,69,'국어','강남인강/온리원','온리원 (김지연)','빠작 비문학 독해 1단계','문단별 핵심 문장 찾기 연습'],
        [2,'취약 보완형',60,69,'영어','강남인강','강남인강 (정승익)','Grammar Inside Level 1','문장 구조 분석(끊어 읽기) 시작'],
        [2,'취약 보완형',60,69,'수학','강남인강','강남인강 (개념원리 강의)','개념원리, 라이트쎈','틀린 문제의 개념 역추적 학습'],
        [2,'취약 보완형',60,69,'과학','온리원','온리원 (안현정)','오투 과학','오투 기본 문제 및 실험 영상 반복 시청'],
        [2,'취약 보완형',60,69,'사회','강남인강','강남인강 (임진우)','완자 사회/역사','단원별 핵심 키워드 마인드맵 작성'],
        [3,'실전 응용형',70,79,'국어','엠베스트','엠베스트 (유현진 - 기본)','빠작 문학 독해, 체크체크','문제 선택지에서 근거 지문 찾기'],
        [3,'실전 응용형',70,79,'영어','엠베스트','엠베스트 (박영아 - 기본)','중학영문법 3800제 1~2권','3800제 반복 풀이로 문법 체득'],
        [3,'실전 응용형',70,79,'수학','엠베스트','엠베스트 (이지연)','RPM, 쎈 (B단계 위주)','유형별 문제 풀이법 암기 및 적용'],
        [3,'실전 응용형',70,79,'과학','엠베스트','엠베스트 (장풍 - 내신)','오투 과학, 완자 기출 PICK','암기법 활용 및 기출 유형 정복'],
        [3,'실전 응용형',70,79,'사회','엠베스트','엠베스트 (박경아)','체크체크 사회/역사','교과서 날개 내용 및 사료 꼼꼼히 보기'],
        [4,'상위권 도약형',80,89,'국어','엠베스트','엠베스트 (유현진 - 심화)','중학 매3비, 빠작 고난도','낯선 지문 분석력 키우기'],
        [4,'상위권 도약형',80,89,'영어','엠베스트','엠베스트 (박영아 - 심화)','3800제 3권, 천일문 중등','구문 분석 및 고난도 문법 적용'],
        [4,'상위권 도약형',80,89,'수학','엠베스트','엠베스트 (민정범 - 쎈)','쎈 (C단계 포함), 일품','오답 노트를 통한 약점 보완'],
        [4,'상위권 도약형',80,89,'과학','엠베스트','엠베스트 (장풍 - 심화)','오투, 하이탑 (기초)','원리 이해를 통한 추론 문제 연습'],
        [4,'상위권 도약형',80,89,'사회','엠베스트','엠베스트 (곽주현)','완자 기출 PICK, 서술형 대비서','고난도 사료 해석 및 서술형 문장 연습'],
        [5,'최상위 유지형',90,100,'국어','엠베스트','엠베스트 (유현진 - 수능형)','예비 고등 매3 시리즈','고등 수능 기초 지문 도전'],
        [5,'최상위 유지형',90,100,'영어','엠베스트','엠베스트 (박영아 - 고등연계)','천일문 기본, 자이스토리','고등 모의고사 1등급 수준 독해 연습'],
        [5,'최상위 유지형',90,100,'수학','엠베스트','엠베스트 (민정범 - 심화)','블랙라벨, 에이급 수학','고난도 심화 문제 해결 및 선행 병행'],
        [5,'최상위 유지형',90,100,'과학','엠베스트','엠베스트 (장풍 - 하이탑)','하이탑, 고등 통합과학 기초','심화 과학 원리 정립 및 올림피아드 기초'],
        [5,'최상위 유지형',90,100,'사회','엠베스트','엠베스트 (곽주현 - 한국사)','한능검 교재, 심화 기출','한능검 1급 도전'],
      ];
      for (const [tier,tname,smin,smax,subj,plat,lec,tb,strat] of recs) {
        await client.query(
          'INSERT INTO study_recommendations (tier,tier_name,score_min,score_max,subject,platform,lecture,textbook,strategy) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [tier,tname,smin,smax,subj,plat,lec,tb,strat]
        );
      }
      console.log('추천 데이터 25건 삽입 완료');
    }
    console.log('DB 초기화 완료');
  } finally {
    client.release();
  }
}

const RESERVED_PARAMS = new Set(['limit','page','offset','_t','search','sort','order','_','cb','v','ver']);

function tableRouter(tableName) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const { limit = 300, page = 1, search, ...filters } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const values = [];
      const conditions = [];

      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        values.push(s);
        conditions.push(`(name ILIKE $${values.length} OR student_id ILIKE $${values.length} OR id::text ILIKE $${values.length})`);
      }

      for (const [k, v] of Object.entries(filters)) {
        if (RESERVED_PARAMS.has(k)) continue;
        values.push(v);
        conditions.push(`${k} = $${values.length}`);
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      values.push(parseInt(limit));
      values.push(offset);
      const result = await pool.query(
        `SELECT * FROM ${tableName} ${where} ORDER BY id DESC LIMIT $${values.length-1} OFFSET $${values.length}`,
        values
      );
      const cnt = await pool.query(`SELECT COUNT(*) FROM ${tableName} ${where}`, values.slice(0,-2));
      res.json({ data: result.rows, total: parseInt(cnt.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
    } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
  });
  router.get('/:id', async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM ${tableName} WHERE id=$1`, [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(r.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/', async (req, res) => {
    try {
      const data = { ...req.body, created_at: new Date() };
      if (!data.updated_at && ['student_profiles','parent_profiles'].includes(tableName)) {
        data.updated_at = new Date();
      }
      const keys = Object.keys(data);
      const vals = Object.values(data).map(v =>
        (v !== null && typeof v === 'object' && !(v instanceof Date)) ? JSON.stringify(v) : v
      );
      const r = await pool.query(
        `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,
        vals
      );
      res.status(201).json(r.rows[0]);
    } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
  });
  router.patch('/:id', async (req, res) => {
    try {
      const data = { ...req.body, updated_at: new Date() };
      const keys = Object.keys(data);
      const vals = [...Object.values(data).map(v =>
        (v !== null && typeof v === 'object' && !(v instanceof Date)) ? JSON.stringify(v) : v
      ), req.params.id];
      const r = await pool.query(
        `UPDATE ${tableName} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      res.json(r.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${tableName} WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  return router;
}

['student_profiles','parent_profiles','admin_accounts','attendance',
 'assessments','notices','notice_reads','consultations','consult_requests',
 'grades_school','grades_mock','exam_planners','planner_tasks',
 'exam_schedules','student_records','student_logs','study_recommendations'].forEach(t => {
  app.use('/tables/' + t, tableRouter(t));
});

app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, req.path), err => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ 서버 실행: http://localhost:${PORT}`));
}).catch(console.error);
