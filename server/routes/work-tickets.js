const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/item/:backlogItemId', (req, res) => {
  const backlogItemId = Number(req.params.backlogItemId);
  const list = db.prepare(
    'SELECT * FROM work_tickets WHERE backlog_item_id = ? ORDER BY id'
  ).all(backlogItemId);
  res.json({ work_tickets: list });
});

router.post('/', (req, res) => {
  const { backlog_item_id, content } = req.body || {};
  if (!backlog_item_id || content === undefined) {
    return res.status(400).json({ error: 'backlog_item_id and content required' });
  }
  const bid = Number(backlog_item_id);
  const item = db.prepare('SELECT id FROM backlog_items WHERE id = ?').get(bid);
  if (!item) return res.status(404).json({ error: 'Backlog item not found' });
  const id = db.prepare(
    'INSERT INTO work_tickets (backlog_item_id, content) VALUES (?, ?)'
  ).run(bid, String(content)).lastInsertRowid;
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(id);
  res.status(201).json(ticket);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { content } = req.body || {};
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  if (content !== undefined) {
    db.prepare('UPDATE work_tickets SET content = ?, updated_at = datetime(\'now\') WHERE id = ?').run(String(content), id);
  }
  const updated = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM work_tickets WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
