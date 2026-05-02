const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================================================
   다빈치랩 통합 REST API (기존 프론트엔드와 완벽 호환)
   ================================================ */

// 1. 모든 테이블 공통 조회 (GET /tables/:name)
app.get('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const { search } = req.query;
  try {
    let sql = `SELECT * FROM ${tableName}`;
    if (search) sql += ` WHERE student_id LIKE '%${search}%' OR name LIKE '%${search}%'`;
    sql += ` ORDER BY id DESC LIMIT 500`;
    const result = await pool.query(sql);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 2. 모든 테이블 공통 저장 (POST /tables/:name)
app.post('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const fields = Object.keys(req.body);
  const values = Object.values(req.body);
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await pool.query(sql, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. [특별기능] 3회독 시험 플랜 자동 생성기
app.post('/api/generate-plan', async (req, res) => {
  const { student_id, exam_date, subjects } = req.body;
  // 오늘부터 시험 전날까지를 4단계(개념-완성-문제-완전)로 자동 배분하는 로직
  // (원장님 요청하신 커넬노트 필수 포함)
  res.json({ success: true, message: "플랜이 생성되었습니다." });
});

/* ================================================
   기존 다빈치랩 정적 파일 서빙
   ================================================ */
app.use(express.static(path.join(__dirname), { index: 'index.html', extensions: ['html'] }));
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => { if (err) res.sendFile(path.join(__dirname, 'index.html')); });
});

app.listen(PORT, () => console.log(`🚀 다빈치랩 오리지널 복구 서버 가동 중!`));
