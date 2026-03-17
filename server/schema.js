const defaultProjects = ['Dashboard', 'Boarding', 'Invoicing', 'Emulator', 'Path SDK', 'MCP Server'];

function runSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subfolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS backlog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      subfolder_id INTEGER REFERENCES subfolders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'Later',
      status TEXT NOT NULL DEFAULT 'open',
      progress INTEGER NOT NULL DEFAULT 0,
      color_label TEXT,
      due_date TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_backlog_project ON backlog_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_backlog_status ON backlog_items(status);
    CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog_items(priority);
    CREATE TABLE IF NOT EXISTS work_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backlog_item_id INTEGER NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_tickets_item ON work_tickets(backlog_item_id);
  `);
}

const PROJECT_COLOR_PALETTE = [
  '#297D2D', '#FF5252', '#2196F3', '#FF9800', '#9C27B0',
  '#00BCD4', '#795548', '#607D8B', '#E91E63', '#4CAF50'
];

function seedProjects(db) {
  const count = db.prepare('SELECT COUNT(*) as n FROM projects').get();
  if (count.n > 0) return;
  const insert = db.prepare('INSERT INTO projects (name, sort_order, color) VALUES (?, ?, ?)');
  defaultProjects.forEach((name, i) => insert.run(name, i, PROJECT_COLOR_PALETTE[i % PROJECT_COLOR_PALETTE.length]));
}

function ensureProjectColorColumn(db) {
  const cols = db.prepare('PRAGMA table_info(projects)').all();
  const hasColor = cols.some((c) => c.name === 'color');
  if (!hasColor) {
    db.exec('ALTER TABLE projects ADD COLUMN color TEXT');
  }
  const projects = db.prepare('SELECT id, color FROM projects ORDER BY id').all();
  const update = db.prepare('UPDATE projects SET color = ? WHERE id = ?');
  projects.forEach((p, i) => {
    if (p.color == null || p.color === '') {
      update.run(PROJECT_COLOR_PALETTE[i % PROJECT_COLOR_PALETTE.length], p.id);
    }
  });
}

module.exports = { runSchema, seedProjects, ensureProjectColorColumn, defaultProjects, PROJECT_COLOR_PALETTE };
