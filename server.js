const express  = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ================================================
   Genspark DB API 프록시
   /tables/*  →  genspark.genspark.site/api/code_sandbox_light/preview/{id}/tables/*

   ★ 버그 수정: pathRewrite 에서 reqPath 에는 이미
     '/tables' 이후 부분만 들어오므로 ('/student_profiles?...')
     앞에 '/tables' 를 한 번만 붙여야 함.
     (이전 코드: `/tables${reqPath}` → `/tables/tables/...` 이중 경로 발생)
   ================================================ */
const GENSPARK_TARGET = 'https://genspark.genspark.site';
const GENSPARK_PREFIX = '/api/code_sandbox_light/preview/8913df2f-c861-4c8f-b106-521a96c99c0e';

app.use('/tables', createProxyMiddleware({
  target:       GENSPARK_TARGET,
  changeOrigin: true,
  /* req.path 예시:  /student_profiles?limit=200
     최종 목적지:    /api/.../tables/student_profiles?limit=200  */
  pathRewrite: (_path, req) => {
    // req.url 에는 /tables 이후 전체 경로+쿼리가 들어 있음
    // 예: /tables/student_profiles?limit=200  →  req.url = '/student_profiles?limit=200'
    // 단, app.use('/tables', ...) 이면 req.url 은 이미 '/tables' 제거된 상태
    const suffix = req.url; // e.g. '/student_profiles?limit=200'
    const result = `${GENSPARK_PREFIX}/tables${suffix}`;
    console.log(`[PROXY] ${req.method} /tables${suffix}  →  ${GENSPARK_TARGET}${result}`);
    return result;
  },
  on: {
    error: (err, req, res) => {
      console.error('[PROXY ERROR]', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proxy error', message: err.message });
      }
    },
  },
}));

/* ================================================
   정적 파일 서빙 (HTML, CSS, JS, images 등)
   ================================================ */
app.use(express.static(path.join(__dirname), {
  index:      'index.html',
  extensions: ['html'],
}));

/* ================================================
   SPA fallback — 매핑되지 않은 경로 → 해당 HTML or index.html
   ================================================ */
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

app.listen(PORT, () => {
  console.log(`✅ DaVinci Lab 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📡 API 프록시: /tables/* → ${GENSPARK_TARGET}${GENSPARK_PREFIX}/tables/*`);
});
