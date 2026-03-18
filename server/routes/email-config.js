const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { sendWorkListEmail } = require('../email-service');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

function getConfig() {
  const row = db.prepare('SELECT recipients, content_type, send_time, updated_at FROM email_config WHERE id = 1').get();
  if (!row) return { recipients: [], content_type: 'next_best_actions', send_time: '09:00', updated_at: null };
  let recipients = [];
  try {
    recipients = JSON.parse(row.recipients || '[]');
  } catch (_) {}
  return {
    recipients,
    content_type: row.content_type || 'next_best_actions',
    send_time: row.send_time || '09:00',
    updated_at: row.updated_at
  };
}

router.get('/', (req, res) => {
  try {
    res.json(getConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/', (req, res) => {
  const { recipients, content_type, send_time } = req.body || {};
  const validTypes = ['next_best_actions', 'now_only', 'now_and_soon'];
  const type = validTypes.includes(content_type) ? content_type : 'next_best_actions';
  const time = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(String(send_time).trim()) ? String(send_time).trim() : '09:00';
  let list = Array.isArray(recipients) ? recipients : [];
  list = list.map((r) => (typeof r === 'string' ? { email: r, name: null } : { email: r.email || '', name: r.name || null })).filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
  try {
    db.prepare('UPDATE email_config SET recipients = ?, content_type = ?, send_time = ?, updated_at = datetime(\'now\') WHERE id = 1').run(
      JSON.stringify(list),
      type,
      time
    );
    res.json(getConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/send-now', async (req, res) => {
  const config = getConfig();
  if (!config.recipients.length) {
    return res.status(400).json({ error: 'No recipients configured' });
  }
  try {
    const results = await sendWorkListEmail(config.recipients, config.content_type);
    res.json({ sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
