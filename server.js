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
        id SERIAL PRIMARY KEY, student_id VARCHAR(50), exam_date DATE,
        title VARCHAR(200), subjects JSONB, semester VARCHAR(20),
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
      INSERT INTO admin_accounts (username, password, name, role, title)
      VALUES ('admin', 'dvlAdmin!', '원장', 'admin', '원장')
      ON CONFLICT (username) DO NOTHING;
    `);
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
      const data = { ...req.body, created_at: new Date(), updated_at: new Date() };
      const keys = Object.keys(data);
      const vals = Object.values(data);
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
      const vals = [...Object.values(data), req.params.id];
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
 'exam_schedules','student_records'].forEach(t => {
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
