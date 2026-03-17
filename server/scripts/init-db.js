/**
 * Initialize SQLite schema and seed default projects.
 * Run: node scripts/init-db.js
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { runSchema, seedProjects } = require('../schema');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'backlog.sqlite');
if (!process.env.DATABASE_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const db = new Database(dbPath);
runSchema(db);
seedProjects(db);
console.log('Database initialized at', dbPath);
db.close();
