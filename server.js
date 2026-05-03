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
  const { search, limit } = req.query;

  try {
    // 테이블/컬럼 존재 확인
    const columnRes = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );

    if (!columnRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: `table not found: ${tableName}`
      });
    }

    const columns = columnRes.rows.map((r) => r.column_name);
    const params = [];
    const where = [];

    // search가 있을 때, 실제 존재하는 컬럼만 검색 대상으로 사용
    if (search) {
      const searchableColumns = ['student_id', 'name', 'student_name']
        .filter((c) => columns.includes(c));

      if (searchableColumns.length) {
        params.push(`%${search}%`);
        const p = `$${params.length}`;
        where.push(`(${searchableColumns.map((c) => `${c}::text ILIKE ${p}`).join(' OR ')})`);
      }
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 2000));
    params.push(safeLimit);

    let sql = `SELECT * FROM ${tableName}`;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY id DESC LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. [특별기능] 3회독 시험 플랜 자동 생성기 (현재 템플릿)
app.post('/api/generate-plan', async (req, res) => {
  const { student_id, exam_date, subjects } = req.body;
  // 필요시 서버 기반 자동 플랜 생성 로직 구현
  res.json({ success: true, message: "플랜이 생성되었습니다." });
});

/* ================================================
   기존 다빈치랩 정적 파일 서빙
   ================================================ */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

app.listen(PORT, () => {
  console.log(`🚀 다빈치랩 오리지널 복구 서버 가동 중! (PORT: ${PORT})`);
});
