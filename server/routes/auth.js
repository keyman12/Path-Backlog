const express = require('express');
const { authenticate, createUser, updateUser, resetUserPassword, requireAuth, requireAdmin } = require('../auth');
const db = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = user;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout error' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, display_name, role, created_at FROM users ORDER BY username'
  ).all();
  res.json({ users });
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, display_name, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  const user = createUser(username, password, display_name, role || 'member');
  res.status(201).json({ user });
});

router.patch('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id < 0) return res.status(400).json({ error: 'Cannot edit recovery user' });
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const { username, display_name, role } = req.body || {};
  if (username !== undefined) {
    const other = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
    if (other) return res.status(409).json({ error: 'Username already exists' });
  }
  const user = updateUser(id, { username, display_name, role });
  if (!user) return res.status(400).json({ error: 'Cannot update user' });
  res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, created_at: user.created_at } });
});

router.post('/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id < 0) return res.status(400).json({ error: 'Cannot reset recovery user password' });
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: 'new_password required (min 6 characters)' });
  resetUserPassword(id, new_password);
  res.json({ ok: true });
});

module.exports = router;
