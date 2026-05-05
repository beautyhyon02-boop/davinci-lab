/* ================================================================
   DaVinci Lab Server (v2.0 - Supabase 연동)
   ----------------------------------------------------------------
   /tables/{테이블명}            GET, POST
   /tables/{테이블명}/{id}       GET, PATCH, DELETE
   환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
   ================================================================ */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ----------------------------------------------------------------
   Supabase 클라이언트 초기화
   서버에서는 SERVICE_KEY 사용 (모든 권한)
   ---------------------------------------------------------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_KEY 확인 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('✅ Supabase 연결 준비 완료');

/* ----------------------------------------------------------------
   JSON 바디 파서
   ---------------------------------------------------------------- */
app.use(express.json({ limit: '10mb' }));

/* ----------------------------------------------------------------
   /tables API — Supabase 프록시
   기존 코드가 /tables/{테이블} 형식으로 호출하므로 호환 유지
   ---------------------------------------------------------------- */

// 목록 조회 또는 신규 생성
app.all('/tables/:table', async (req, res) => {
  const table = req.params.table;
  try {
    if (req.method === 'GET') {
      const limit = parseInt(req.query.limit) || 1000;
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return res.json({ data, total: data.length });
    }

    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from(table)
        .insert(req.body)
        .select();
      if (error) throw error;
      return res.json(data[0] || data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(`[${req.method} /tables/${table}]`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 단일 항목 조회/수정/삭제
app.all('/tables/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return res.json(data);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const { data, error } = await supabase
        .from(table)
        .update(req.body)
        .eq('id', id)
        .select();
      if (error) throw error;
      return res.json(data[0] || data);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(`[${req.method} /tables/${table}/${id}]`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ----------------------------------------------------------------
   상태 점검 — Railway 배포 후 작동 확인용
   ---------------------------------------------------------------- */
app.get('/api/health', async (req, res) => {
  try {
    const { error } = await supabase
      .from('student_profiles')
      .select('id')
      .limit(1);
    res.json({
      status: 'ok',
      supabase: error ? 'error' : 'connected',
      message: error ? error.message : 'Supabase 정상 연결',
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/* ----------------------------------------------------------------
   정적 파일 서빙 (HTML, CSS, JS, images)
   ---------------------------------------------------------------- */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html']
}));

/* ----------------------------------------------------------------
   SPA fallback
   ---------------------------------------------------------------- */
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

/* ----------------------------------------------------------------
   서버 시작
   ---------------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ DaVinci Lab 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📡 API: /tables/* → Supabase`);
  console.log(`🔍 상태 점검: /api/health`);
});
