const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { PROJECT_COLOR_PALETTE } = require('../schema');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM projects ORDER BY sort_order, id').all();
  res.json({ projects: list });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM projects').get();
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get();
  const autoColor = PROJECT_COLOR_PALETTE[count.n % PROJECT_COLOR_PALETTE.length];
  const id = db.prepare('INSERT INTO projects (name, sort_order, color) VALUES (?, ?, ?)').run(
    String(name).trim(),
    maxOrder.next_order,
    autoColor
  ).lastInsertRowid;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, sort_order, color } = req.body || {};
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(Number(sort_order)); }
  if (color !== undefined) {
    const c = typeof color === 'string' && color.trim() ? color.trim() : null;
    updates.push('color = ?');
    params.push(c);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.json({ ok: true });
});

module.exports = router;
