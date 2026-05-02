const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON 데이터를 주고받기 위한 설정
app.use(express.json());

/* ================================================
   PostgreSQL 데이터베이스 연결 설정
   (Railway에 세팅한 DATABASE_URL을 자동으로 가져옵니다)
   ================================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 배포 환경에서 SSL 연결이 필요한 경우를 위한 안전장치
  ssl: {
    rejectUnauthorized: false
  }
});

// DB 연결 테스트 API
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ 
      success: true, 
      message: '✅ 다빈치랩 DB 창고 연결 성공!', 
      time: result.rows[0].current_time 
    });
  } catch (error) {
    console.error('DB 연결 오류:', error);
    res.status(500).json({ success: false, error: 'DB 창고 연결 실패', details: error.message });
  }
});

/* ================================================
   정적 파일 서빙 (HTML, CSS, JS, images 등)
   ================================================ */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

/* ================================================
   SPA fallback — 없는 경로는 index.html 반환
   ================================================ */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' });
  }
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ DaVinci Lab 서버 실행 중: 포트 ${PORT}`);
});
