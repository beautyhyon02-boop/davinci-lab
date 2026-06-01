/* ================================================================
   DaVinci Lab Server (v2.1 - Supabase 연동 + query string PATCH 지원)
   ----------------------------------------------------------------
   /tables/{테이블명}              GET, POST
   /tables/{테이블명}?id=eq.{id}   PATCH, PUT, DELETE  ← 신규 추가
   /tables/{테이블명}/{id}          GET, PATCH, DELETE
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
   query string에서 id=eq.{숫자} 파싱 헬퍼
   예: ?id=eq.4  →  4
   ---------------------------------------------------------------- */
function parseEqId(raw) {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  const match = value.trim().match(/^eq\.(\d+)$/);
  return match ? Number(match[1]) : null;
}

/* ----------------------------------------------------------------
   /tables API — Supabase 프록시
   기존 코드가 /tables/{테이블} 형식으로 호출하므로 호환 유지
   ---------------------------------------------------------------- */

// 목록 조회 / 신규 생성 / query string id 기반 수정·삭제
app.all('/tables/:table', async (req, res) => {
  const table = req.params.table;

  try {
    /* ---- GET: 목록 조회 ---- */
    if (req.method === 'GET') {
      const limit = parseInt(req.query.limit) || 1000;
      const sort = req.query.sort; // 예: created_at.desc
      let query = supabase.from(table).select('*');

      if (sort) {
        const [col, dir] = sort.split('.');
        query = query.order(col || 'created_at', { ascending: dir !== 'desc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ data, total: data.length });
    }

    /* ---- POST: 신규 생성 ---- */
    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from(table)
        .insert(req.body)
        .select();
      if (error) throw error;
      return res.json(data[0] || data);
    }

    /* ---- PATCH / PUT: query string ?id=eq.{id} 방식 수정 ---- */
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = parseEqId(req.query.id);
      if (!id) {
        return res.status(400).json({
          error: 'PATCH requires ?id=eq.{number} query string'
        });
      }

      const { data, error } = await supabase
        .from(table)
        .update(req.body)
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || !data.length) {
        return res.status(404).json({ error: 'Record not found' });
      }
      return res.json(data[0]);
    }

    /* ---- DELETE: query string ?id=eq.{id} 방식 삭제 ---- */
    if (req.method === 'DELETE') {
      const id = parseEqId(req.query.id);
      if (!id) {
        return res.status(400).json({
          error: 'DELETE requires ?id=eq.{number} query string'
        });
      }

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error(`[${req.method} /tables/${table}]`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 단일 항목 조회/수정/삭제 (/tables/:table/:id 경로 방식)
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
