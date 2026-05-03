const express = require('express');
const path = require('path');
const { Pool } = require('pg'); // Railway의 PostgreSQL을 쓰기 위한 도구

const app = express();
const PORT = process.env.PORT || 3000;

// Railway 설정창에 있던 DATABASE_URL을 자동으로 가져옵니다.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

// 데이터베이스 통신 로직 (Genspark 프록시 대신 직접 SQL 실행)
app.get('/tables/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY id DESC`);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tables/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const fields = Object.keys(req.body).join(', ');
    const values = Object.values(req.body);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `INSERT INTO ${tableName} (${fields}) VALUES (${placeholders}) RETURNING *`;
    const result = await pool.query(sql, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/tables/:tableName/:id', async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const fields = Object.keys(req.body).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = [...Object.values(req.body), id];
    
    const sql = `UPDATE ${tableName} SET ${fields} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(sql, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/tables/:tableName/:id', async (req, res) => {
  try {
    const { tableName, id } = req.params;
    await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`🚀 Railway DB 모드로 다빈치랩 가동! 포트: ${PORT}`));
