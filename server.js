const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ================================================
   PostgreSQL 데이터베이스 연결 설정
   ================================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 1. DB 연결 테스트 API
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ success: true, message: '✅ 다빈치랩 DB 창고 연결 성공!', time: result.rows[0].current_time });
  } catch (error) {
    console.error('DB 연결 오류:', error);
    res.status(500).json({ success: false, error: 'DB 창고 연결 실패', details: error.message });
  }
});

// 2. 맞춤형 인강 추천 데이터 불러오기 API (⭐ 새로 추가된 배달부!)
app.get('/api/recommendations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM study_recommendations ORDER BY id ASC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('데이터 조회 오류:', error);
    res.status(500).json({ success: false, error: '추천 데이터를 불러오지 못했습니다.' });
  }
});

/* ================================================
   정적 파일 서빙 및 SPA 라우팅
   ================================================ */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

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
  console.log(`✅Soyeon님, 정말 대단하십니다! 👏 국어, 영어, 수학, 과학, 사회/역사까지 모든 과목의 핵심 데이터가 다빈치랩 전용 창고에 완벽하게 적재되었습니다. 이제 가장 어렵고 뼈대가 되는 백엔드 공사는 사실상 100% 끝났습니다.

창고(DB)에 귀중한 물건(데이터)을 가득 채웠으니, 이제 이 물건을 원장님과 학생들의 눈에 보이는 화면(프론트엔드)으로 꺼내다 줄 **'배달부(API)'**만 고용하면 됩니다.

### 🚚 추천 데이터를 꺼내올 '배달부(API)' 만들기

GitHub으로 가셔서 `server.js` 파일의 내용을 아래 코드로 **전체 교체**해 주세요.
(기존 코드에 추천 데이터를 가져오는 `/api/recommendations` 라는 배달부 코드가 추가되었습니다.)
```javascript
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* ================================================
   PostgreSQL 데이터베이스 연결 설정
   ================================================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 1. DB 연결 테스트 API
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ success: true, message: '✅ 다빈치랩 DB 창고 연결 성공!', time: result.rows[0].current_time });
  } catch (error) {
    console.error('DB 연결 오류:', error);
    res.status(500).json({ success: false, error: 'DB 창고 연결 실패', details: error.message });
  }
});

// 2. 맞춤형 인강 추천 데이터 불러오기 API (⭐ 새로 추가된 배달부!)
app.get('/api/recommendations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM study_recommendations ORDER BY id ASC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('데이터 조회 오류:', error);
    res.status(500).json({ success: false, error: '추천 데이터를 불러오지 못했습니다.' });
  }
});

/* ================================================
   정적 파일 서빙 및 SPA 라우팅
   ================================================ */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

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
