require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const db = require('./db');

const { runSchema, seedProjects, ensureProjectColorColumn } = require('./schema');
try {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!tableCheck) runSchema(db);
  seedProjects(db);
  ensureProjectColorColumn(db);
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
      secure: isProduction,
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
});
