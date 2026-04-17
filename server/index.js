require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const db = require('./db');

const { runSchema, seedProjects, ensureProjectColorColumn, ensureEffortDaysColumn, ensureEmailConfigTable } = require('./schema');
try {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!tableCheck) runSchema(db);
  seedProjects(db);
  ensureProjectColorColumn(db);
  ensureEffortDaysColumn(db);
  ensureEmailConfigTable(db);
} catch (e) {
  console.error('DB init check failed:', e.message);
  process.exit(1);
}
const authRoutes = require('./routes/auth');
const projectsRoutes = require('./routes/projects');
const subfoldersRoutes = require('./routes/subfolders');
const backlogRoutes = require('./routes/backlog');
const workTicketsRoutes = require('./routes/work-tickets');
const reportsRoutes = require('./routes/reports');
const emailConfigRoutes = require('./routes/email-config');

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env.COOKIE_SECURE !== 'false' && isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/subfolders', subfoldersRoutes);
app.use('/api/backlog', backlogRoutes);
app.use('/api/work-tickets', workTicketsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/email-config', emailConfigRoutes);

if (isProduction) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDist, 'index.html'));
      }
    });
  }
}

app.listen(PORT, () => {
  console.log(`Path Backlog API listening on port ${PORT}`);

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    cron.schedule('* * * * *', () => {
      const { sendWorkListEmail } = require('./email-service');
      const row = db.prepare('SELECT recipients, content_type, send_time, last_sent_at FROM email_config WHERE id = 1').get();
      if (!row) return;
      let recipients = [];
      try { recipients = JSON.parse(row.recipients || '[]'); } catch (_) {}
      if (recipients.length === 0) return;
      const now = new Date();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const sendTime = (row.send_time || '09:00').trim();
      if (nowHHMM !== sendTime) return;
      const lastSent = row.last_sent_at ? new Date(row.last_sent_at) : null;
      const today = now.toISOString().slice(0, 10);
      if (lastSent && lastSent.toISOString().slice(0, 10) === today) return;
      sendWorkListEmail(recipients, row.content_type || 'next_best_actions')
        .then(() => {
          db.prepare('UPDATE email_config SET last_sent_at = datetime(\'now\') WHERE id = 1').run();
        })
        .catch((err) => console.error('Daily email send failed:', err.message));
    });
  }
});
