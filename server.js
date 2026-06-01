/* ================================================================
   DaVinci Lab Server (v2.2 - Supabase 연동 + GET query filter 지원)
   ----------------------------------------------------------------
   /tables/{테이블명}                              GET, POST
   /tables/{테이블명}?id=eq.{id}                   PATCH, PUT, DELETE
   /tables/{테이블명}?student_id=eq.seeun...       GET 필터 지원
   /tables/{테이블명}/{id}                         GET, PATCH, DELETE

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
   공통 유틸
   ---------------------------------------------------------------- */

// query value를 문자열 1개로 정리
function getSingleQueryValue(raw) {
  if (raw === undefined || raw === null) return '';
  return Array.isArray(raw) ? String(raw[0]).trim() : String(raw).trim();
}

// ?id=eq.4 / ?id=eq.seeun 같은 형태 파싱
function parseEqValue(raw) {
  const value = getSingleQueryValue(raw);
  if (!value) return null;

  const match = value.match(/^eq\.(.+)$/);
  return match ? match[1] : null;
}

/* ----------------------------------------------------------------
   GET /tables/:table 용 query string 필터 적용 헬퍼

   지원 예시:
   ?student_id=eq.seeun
   ?status=eq.active
   ?created_at=gte.2026-06-01
   ?name=like.%세은%
   ?name=ilike.%세은%
   ?id=in.1,2,3
   ?deleted_at=is.null
   ---------------------------------------------------------------- */
function applyQueryFilters(query, filters = {}) {
  for (const [key, raw] of Object.entries(filters)) {
    const value = getSingleQueryValue(raw);
    if (!value) continue;

    const dotIndex = value.indexOf('.');

    // op.value 형식이 아니면 기본 eq 처리
    if (dotIndex === -1) {
      query = query.eq(key, value);
      continue;
    }

    const op = value.slice(0, dotIndex);
    const operand = value.slice(dotIndex + 1);

    switch (op) {
      case 'eq':
        query = query.eq(key, operand);
        break;

      case 'neq':
        query = query.neq(key, operand);
        break;

      case 'gt':
        query = query.gt(key, operand);
        break;

      case 'gte':
        query = query.gte(key, operand);
        break;

      case 'lt':
        query = query.lt(key, operand);
        break;

      case 'lte':
        query = query.lte(key, operand);
        break;

      case 'like':
        query = query.like(key, operand);
        break;

      case 'ilike':
        query = query.ilike(key, operand);
        break;

      case 'in': {
        const values = operand
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
        query = query.in(key, values);
        break;
      }

      case 'is':
        query = query.is(key, operand === 'null' ? null : operand);
        break;

      default:
        // 알 수 없는 형식이면 안전하게 원문 eq 처리
        query = query.eq(key, value);
        break;
    }
  }

  return query;
}

/* ----------------------------------------------------------------
   /tables API — Supabase 프록시
   기존 코드가 /tables/{테이블} 형식으로 호출하므로 호환 유지
   ---------------------------------------------------------------- */

// 목록 조회 / 신규 생성 / query string id 기반 수정·삭제
app.all('/tables/:table', async (req, res) => {
  const table = req.params.table;

  try {
    /* ---- GET: 목록 조회 + query filter 지원 ---- */
    if (req.method === 'GET') {
      const {
        limit: rawLimit = '1000',
        sort,
        ...filters
      } = req.query;

      const limit = Math.min(parseInt(rawLimit, 10) || 1000, 1000);

      let query = supabase.from(table).select('*');

      // 1) query string 필터 적용
      query = applyQueryFilters(query, filters);

      // 2) 정렬 적용
      if (sort) {
        const sortValue = getSingleQueryValue(sort);
        const [col, dir] = sortValue.split('.');

        query = query.order(col || 'created_at', {
          ascending: dir !== 'desc'
        });
      } else {
        // created_at 컬럼이 있는 테이블 기준 기본 정렬
        query = query.order('created_at', { ascending: false });
      }

      // 3) limit 적용
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      return res.json({
        data,
        total: data.length
      });
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
      const id = parseEqValue(req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'PATCH requires ?id=eq.{value} query string'
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
      const id = parseEqValue(req.query.id);

      if (!id) {
        return res.status(400).json({
          error: 'DELETE requires ?id=eq.{value} query string'
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

      if (!data || !data.length) {
        return res.status(404).json({ error: 'Record not found' });
      }

      return res.json(data[0]);
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

    return res.json({
      status: 'ok',
      supabase: error ? 'error' : 'connected',
      message: error ? error.message : 'Supabase 정상 연결',
      time: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
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
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
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
