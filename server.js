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

// 1. 모든 테이블 공통 조회 (검색 및 제한 기능)
app.get('/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  const { search, limit } = req.query;
  try {
    const colRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = $1", [tableName]);
    const columns = colRes.rows.map(r => r.column_name);
    if (columns.length === 0) return res.status(404).json({ success: false, error: 'Table not found' });

    let sql = `SELECT * FROM ${tableName}`;
    const params = [];
    if (search) {
      const searchCol = columns.includes('student_id') ? 'student_id' : (columns.includes('name') ? 'name' : (columns.includes('student_name') ? 'student_name' : null));
      if (searchCol) {
        params.push(`%${search}%`);
        sql += ` WHERE ${searchCol}::text ILIKE $1`;
      }
    }
    sql += ` ORDER BY id DESC LIMIT ${Math.min(parseInt(limit) || 500, 2000)}`;
    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 2. 모든 테이블 공통 저장
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

// 3. ★ 핵심: 모든 테이블 공통 삭제 (이 부분이 추가되어야 삭제가 됩니다!)
app.delete('/tables/:tableName/:id', async (req, res) => {
  const { tableName, id } = req.params;
  try {
    const sql = `DELETE FROM ${tableName} WHERE id = $1`;
    await pool.query(sql, [id]);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`🚀 다빈치랩 서버 가동 중!`));
