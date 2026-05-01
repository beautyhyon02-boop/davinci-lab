   } catch(e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/', async (req, res) => {
    try {
      const data = { ...req.body, created_at: new Date(), updated_at: new Date() };
      const keys = Object.keys(data);
      const vals = Object.values(data);
      const r = await pool.query(
        `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,
        vals
      );
      res.status(201).json(r.rows[0]);
    } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
  });
  router.patch('/:id', async (req, res) => {
    try {
      const data = { ...req.body, updated_at: new Date() };
      const keys = Object.keys(data);
      const vals = [...Object.values(data), req.params.id];
      const r = await pool.query(
        `UPDATE ${tableName} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${vals.length} RETURNING *`,
        vals
      );
      res.json(r.rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${tableName} WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  return router;
}

['student_profiles','parent_profiles','admin_accounts','attendance',
 'assessments','notices','notice_reads','consultations','consult_requests',
 'grades_school','grades_mock','exam_planners','planner_tasks',
 'exam_schedules','student_records'].forEach(t => {
  app.use('/tables/' + t, tableRouter(t));
});

app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, req.path), err => {
    if (err) res.sendFile(path.join(__dirname, 'index.html'));
  });
});

initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ 서버 실행: http://localhost:${PORT}`));
}).catch(console.error);
