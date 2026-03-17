const bcrypt = require('bcryptjs');
const db = require('./db');

const RECOVERY_USER = process.env.RECOVERY_USER || 'recovery';
const RECOVERY_PASSWORD = process.env.RECOVERY_PASSWORD || '';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function authenticate(username, password) {
  if (RECOVERY_PASSWORD && username === RECOVERY_USER && password === RECOVERY_PASSWORD) {
    return { id: -1, username: RECOVERY_USER, display_name: 'Recovery', role: 'admin' };
  }
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    role: user.role
  };
}

function createUser(username, password, displayName, role = 'member') {
  const hash = hashPassword(password);
  const id = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, displayName || username, role).lastInsertRowid;
  return { id, username, display_name: displayName || username, role };
}

function updateUser(id, { username, display_name, role }) {
  if (id < 0) return null;
  const updates = [];
  const params = [];
  if (username !== undefined) { updates.push('username = ?'); params.push(username); }
  if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name || null); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (updates.length === 0) return db.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(id);
  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(id);
}

function resetUserPassword(id, newPassword) {
  if (id < 0) return null;
  const hash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  return true;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

module.exports = {
  hashPassword,
  verifyPassword,
  findUserByUsername,
  authenticate,
  createUser,
  updateUser,
  resetUserPassword,
  requireAuth,
  requireAdmin
};
