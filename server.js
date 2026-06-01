const path = require('path');
const fs = require('fs');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[server] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function parseEqId(value) {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const str = String(raw).trim();
  const match = str.match(/^eq\.(.+)$/);
  return match ? match[1] : str || null;
}

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilterValue(rawValue) {
  const value = getSingleQueryValue(rawValue);
  if (value == null) return { op: 'eq', value: null };

  const str = String(value).trim();
  const match = str.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/);
  if (!match) return { op: 'eq', value: str };

  return { op: match[1], value: match[2] };
}

function applyQueryFilters(query, rawFilters = {}) {
  for (const [field, rawValue] of Object.entries(rawFilters)) {
    if (!field) continue;
    if (field.startsWith('_')) continue;
    if (['limit', 'sort', 'select', 'offset', 'page'].includes(field)) continue;
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;

    const { op, value } = parseFilterValue(rawValue);

    switch (op) {
      case 'eq':
        query = query.eq(field, value);
        break;
      case 'neq':
        query = query.neq(field, value);
        break;
      case 'gt':
        query = query.gt(field, value);
        break;
      case 'gte':
        query = query.gte(field, value);
        break;
      case 'lt':
        query = query.lt(field, value);
        break;
      case 'lte':
        query = query.lte(field, value);
        break;
      case 'like':
        query = query.like(field, value);
        break;
      case 'ilike':
        query = query.ilike(field, value);
        break;
      case 'in': {
        const items = String(value)
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
        query = query.in(field, items);
        break;
      }
      case 'is': {
        const lowered = String(value).toLowerCase();
        if (lowered === 'null') query = query.is(field, null);
        else if (lowered === 'true') query = query.is(field, true);
        else if (lowered === 'false') query = query.is(field, false);
        else query = query.is(field, value);
        break;
      }
      default:
        query = query.eq(field, value);
        break;
    }
  }

  return query;
}

function normalizeSelect(select) {
  const value = getSingleQueryValue(select);
  if (!value || String(value).trim() === '') return '*';
  return String(value).trim();
}

app.get('/api/health', async (_req, res) => {
  try {
    const { error } = await supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ ok: true, service: 'davinci-lab-server', supabase: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.all('/tables/:table', async (req, res) => {
  const table = req.params.table;

  try {
    if (req.method === 'GET') {
      const {
        limit: rawLimit = '1000',
        sort,
        select,
        offset: rawOffset = '0',
        page,
        ...rawFilters
      } = req.query;

      const filters = Object.fromEntries(
        Object.entries(rawFilters).filter(([key, value]) => {
          if (!key) return false;
          if (key.startsWith('_')) return false;
          if (value === undefined || value === null || value === '') return false;
          return true;
        })
      );

      const limit = Math.min(Math.max(parseInt(getSingleQueryValue(rawLimit), 10) || 1000, 1), 1000);
      const pageNum = Math.max(parseInt(getSingleQueryValue(page), 10) || 1, 1);
      const offset = Math.max(parseInt(getSingleQueryValue(rawOffset), 10) || ((pageNum - 1) * limit), 0);

      let query = supabase
        .from(table)
        .select(normalizeSelect(select), { count: 'exact' });

      query = applyQueryFilters(query, filters);

      const sortValue = getSingleQueryValue(sort);
      if (sortValue) {
        const [column, direction = 'asc'] = String(sortValue).split('.');
        query = query.order(column, { ascending: direction !== 'desc' });
      } else {
        query = query.order('id', { ascending: false });
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return res.json({
        data: data || [],
        total: count ?? (data || []).length,
        limit,
        offset
      });
    }

    if (req.method === 'POST') {
      const payload = req.body;
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const id = parseEqId(req.query.id);
      if (!id) {
        return res.status(400).json({ error: 'PATCH/PUT requires ?id=eq.{id}' });
      }

      const { data, error } = await supabase
        .from(table)
        .update(req.body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ data });
    }

    if (req.method === 'DELETE') {
      const id = parseEqId(req.query.id);
      if (!id) {
        return res.status(400).json({ error: 'DELETE requires ?id=eq.{id}' });
      }

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(`[server] /tables/${table} error:`, error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

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
        .select()
        .single();

      if (error) throw error;
      return res.json({ data });
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
  } catch (error) {
    console.error(`[server] /tables/${table}/${id} error:`, error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

const publicRoot = process.cwd();
app.use(express.static(publicRoot, { index: 'index.html' }));

app.get('*', (req, res) => {
  const requested = path.join(publicRoot, req.path);
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    return res.sendFile(requested);
  }
  return res.sendFile(path.join(publicRoot, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] DaVinci Lab Server running on http://localhost:${PORT}`);
  console.log(`[server] Tables API: http://localhost:${PORT}/tables/:table`);
  console.log(`[server] Health: http://localhost:${PORT}/api/health`);
});
