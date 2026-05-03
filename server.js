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

// 모든 테이블 공통 조회 (Codex의 검색 필터링 및 데이터 제한 기능 통합)
app.get('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const { search, limit } = req.query;

  try {
    const colRes = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      [tableName]
    );
    const columns = colRes.rows.map(r => r.column_name);

    if (columns.length === 0) return res.status(404).json({ success: false, error: 'Table not found' });

    let sql = `SELECT * FROM ${tableName}`;
    const params = [];

    // 검색 로직: student_id 또는 name 컬럼이 있을 때만 안전하게 검색
    if (search) {
      const searchCol = columns.includes('student_id') ? 'student_id' : (columns.includes('name') ? 'name' : null);
      if (searchCol) {
        params.push(`%${search}%`);
        sql += ` WHERE ${searchCol}::text ILIKE $1`;
      }
    }

    // 데이터 호출 제한 (안전벨트 기능)
    const safeLimit = Math.max(1, Math.min(parseInt(limit) || 500, 2000));
    sql += ` ORDER BY id DESC LIMIT ${safeLimit}`;

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 모든 테이블 공통 저장
app.post('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const fields = Object.keys(req.body);
  const values = Object.values(req.body);
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const result = await pool.query(sql, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 정적 파일 서빙 및 SPA 라우팅
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`🚀 다빈치랩 통합 복구 서버 가동 중! (Port: ${PORT})`));
