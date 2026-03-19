const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/project/:projectId', (req, res) => {
  const projectId = Number(req.params.projectId);
  const list = db.prepare(
    'SELECT * FROM subfolders WHERE project_id = ? ORDER BY sort_order, id'
  ).all(projectId);
  res.json({ subfolders: list });
});

router.post('/', (req, res) => {
  const { project_id, name } = req.body || {};
  if (!project_id || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'project_id and name required' });
  }
  const pid = Number(project_id);
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM subfolders WHERE project_id = ?'
  ).get(pid);
  const id = db.prepare(
    'INSERT INTO subfolders (project_id, name, sort_order) VALUES (?, ?, ?)'
  ).run(pid, String(name).trim(), maxOrder.next_order).lastInsertRowid;
  const subfolder = db.prepare('SELECT * FROM subfolders WHERE id = ?').get(id);
  res.status(201).json(subfolder);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, sort_order } = req.body || {};
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(Number(sort_order)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE subfolders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const subfolder = db.prepare('SELECT * FROM subfolders WHERE id = ?').get(id);
  if (!subfolder) return res.status(404).json({ error: 'Subfolder not found' });
  res.json(subfolder);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM backlog_items WHERE subfolder_id = ?').get(id);
  if (count.n > 0) {
    return res.status(400).json({
      error: `Sub-folder has ${count.n} item(s). Re-assign them before deleting.`
    });
  }
  const r = db.prepare('DELETE FROM subfolders WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Subfolder not found' });
  res.json({ ok: true });
});

module.exports = router;
