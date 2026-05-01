const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================================================
   Genspark DB API 프록시
   /tables/* → Genspark preview API
   ================================================ */
const GENSPARK_API = 'https://genspark.genspark.site';
const GENSPARK_PATH = '/api/code_sandbox_light/preview/8913df2f-c861-4c8f-b106-521a96c99c0e';

app.use('/tables', createProxyMiddleware({
  target: GENSPARK_API,
  changeOrigin: true,
  pathRewrite: (reqPath) => {
    // /tables/student_profiles → /api/code_sandbox_light/preview/{id}/tables/student_profiles
    return `${GENSPARK_PATH}/tables${reqPath}`;
  },
  on: {
    proxyReq: (proxyReq, req) => {
      console.log(`[PROXY] ${req.method} /tables${req.url} → ${GENSPARK_API}${GENSPARK_PATH}/tables${req.url}`);
    },
    error: (err, req, res) => {
      console.error('[PROXY ERROR]', err.message);
      res.status(502).json({ error: 'Proxy error', message: err.message });
    }
  }
}));

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
  // /tables/* 는 이미 위 프록시에서 처리됨
  // 나머지 경로는 해당 HTML 파일 또는 index.html 반환
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ DaVinci Lab 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📡 API 프록시: /tables/* → ${GENSPARK_API}${GENSPARK_PATH}/tables/*`);
});
