const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['Now', 'Soon', 'Later'];
const STATUSES = ['open', 'in_progress', 'completed'];

function parseEffortDays(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  if (Number.isNaN(n) || n < 0) return null;
  const half = Math.round(n * 2) / 2;
  return half;
}

function rowToItem(row) {
  return {
    id: row.id,
    project_id: row.project_id,
    subfolder_id: row.subfolder_id,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    effort_days: row.effort_days != null ? row.effort_days : null,
    color_label: row.color_label,
    due_date: row.due_date,
    sort_order: row.sort_order,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by
  };
}

// List by project (optional: subfolder, status filter)
router.get('/', (req, res) => {
  const { project_id, subfolder_id, status, include_completed } = req.query;
  let sql = `
    SELECT bi.*, p.name AS project_name, p.color AS project_color, s.name AS subfolder_name
    FROM backlog_items bi
    JOIN projects p ON p.id = bi.project_id
    LEFT JOIN subfolders s ON s.id = bi.subfolder_id
    WHERE 1=1
  `;
  const params = [];
  if (project_id != null) { sql += ' AND bi.project_id = ?'; params.push(Number(project_id)); }
  if (subfolder_id != null) { sql += ' AND bi.subfolder_id = ?'; params.push(Number(subfolder_id)); }
  if (status != null) { sql += ' AND bi.status = ?'; params.push(status); }
  if (include_completed !== 'true' && include_completed !== '1') {
    sql += " AND (bi.status IS NULL OR bi.status != 'completed')";
  }
  sql += ' ORDER BY CASE bi.priority WHEN \'Now\' THEN 0 WHEN \'Soon\' THEN 1 ELSE 2 END, bi.sort_order, bi.id';
  const rows = db.prepare(sql).all(...params);
  res.json({
    items: rows.map((r) => ({
      ...rowToItem(r),
      project_name: r.project_name,
      project_color: r.project_color ?? null,
      subfolder_name: r.subfolder_name ?? null
    }))
  });
});

// Consolidated: all items (or non-completed) with project name.
// Query params: include_completed, due (exact YYYY-MM-DD | next_week | next_2_weeks | next_month),
// completed (this_week | last_week | last_month | any), project_ids (comma-separated ids).
router.get('/consolidated', (req, res) => {
  const { include_completed, due, completed: completedFilter, project_ids: projectIdsRaw, project_id: singleProjectId, filter: listFilter } = req.query;
  let sql = `
    SELECT bi.*, p.name AS project_name, p.color AS project_color, s.name AS subfolder_name
    FROM backlog_items bi
    JOIN projects p ON p.id = bi.project_id
    LEFT JOIN subfolders s ON s.id = bi.subfolder_id
  `;
  const conditions = [];
  const params = [];

  if (listFilter === 'next_best_actions' || listFilter === 'now_only' || listFilter === 'now_and_soon') {
    conditions.push("(bi.status IS NULL OR bi.status != 'completed')");
    if (listFilter === 'next_best_actions') {
      conditions.push(`(
        bi.priority = 'Now'
        OR (bi.due_date IS NOT NULL AND date(bi.due_date) >= date('now') AND date(bi.due_date) <= date('now', '+2 days'))
        OR (bi.progress >= 75)
      )`);
    } else if (listFilter === 'now_only') {
      conditions.push("bi.priority = 'Now'");
    } else {
      conditions.push("bi.priority IN ('Now', 'Soon')");
    }
  } else if (include_completed !== 'true' && include_completed !== '1') {
    conditions.push("(bi.status IS NULL OR bi.status != 'completed')");
  }
  let projectIdsParam = '';
  if (Array.isArray(projectIdsRaw)) {
    projectIdsParam = projectIdsRaw.map((id) => Number(id)).filter((n) => !Number.isNaN(n)).join(',');
  } else if (projectIdsRaw != null && String(projectIdsRaw).trim()) {
    projectIdsParam = String(projectIdsRaw).trim();
  }
  if (singleProjectId != null && String(singleProjectId).trim()) {
    const one = parseInt(String(singleProjectId).trim(), 10);
    if (!Number.isNaN(one)) projectIdsParam = projectIdsParam ? `${projectIdsParam},${one}` : String(one);
  }
  if (projectIdsParam) {
    const ids = projectIdsParam.split(',').map((id) => parseInt(String(id).trim(), 10)).filter((n) => !Number.isNaN(n));
    if (ids.length > 0) {
      conditions.push(`bi.project_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (!listFilter && due && due !== '' && due !== 'exact') {
    conditions.push('bi.due_date IS NOT NULL');
    if (due === 'next_week') {
      conditions.push("(date(bi.due_date) >= date('now') AND date(bi.due_date) <= date('now', '+7 days'))");
    } else if (due === 'next_2_weeks') {
      conditions.push("(date(bi.due_date) >= date('now') AND date(bi.due_date) <= date('now', '+14 days'))");
    } else if (due === 'next_month') {
      conditions.push("(date(bi.due_date) >= date('now') AND date(bi.due_date) <= date('now', '+1 month'))");
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      conditions.push('date(bi.due_date) = ?');
      params.push(due);
    }
  }
  if (!listFilter && completedFilter && completedFilter !== 'any' && (include_completed === 'true' || include_completed === '1')) {
    if (completedFilter === 'this_week') {
      conditions.push("date(bi.completed_at) >= date('now', '-7 days')");
    } else if (completedFilter === 'last_week') {
      conditions.push("date(bi.completed_at) >= date('now', '-14 days') AND date(bi.completed_at) < date('now', '-7 days')");
    } else if (completedFilter === 'last_month') {
      conditions.push("date(bi.completed_at) >= date('now', '-30 days') AND date(bi.completed_at) < date('now', '-14 days')");
    }
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ` ORDER BY CASE WHEN bi.status = 'completed' THEN 1 ELSE 0 END, CASE bi.priority WHEN 'Now' THEN 0 WHEN 'Soon' THEN 1 ELSE 2 END, bi.project_id, bi.sort_order, bi.id`;
  const rows = db.prepare(sql).all(...params);
  const projectColorsById = {};
  db.prepare('SELECT id, color FROM projects').all().forEach((p) => { projectColorsById[p.id] = p.color || null; });
  res.json({
    items: rows.map((r) => ({
      ...rowToItem(r),
      project_name: r.project_name,
      project_color: r.project_color != null ? r.project_color : projectColorsById[r.project_id] ?? null,
      subfolder_name: r.subfolder_name ?? null
    }))
  });
});

// Single item with work tickets
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const tickets = db.prepare('SELECT * FROM work_tickets WHERE backlog_item_id = ? ORDER BY id').all(id);
  res.json({ ...rowToItem(item), work_tickets: tickets });
});

router.post('/', (req, res) => {
  const {
    project_id, subfolder_id, title, description, priority, status, progress,
    effort_days, color_label, due_date, sort_order
  } = req.body || {};
  if (!project_id || !title || !String(title).trim()) {
    return res.status(400).json({ error: 'project_id and title required' });
  }
  const priorityVal = PRIORITIES.includes(priority) ? priority : 'Later';
  const statusVal = STATUSES.includes(status) ? status : 'open';
  const progressVal = Math.min(100, Math.max(0, Number(progress) || 0));
  const effortDaysVal = parseEffortDays(effort_days);
  const nextOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM backlog_items WHERE project_id = ? AND (status IS NULL OR status != ?)'
  ).get(Number(project_id), 'completed');
  const order = sort_order != null ? Number(sort_order) : nextOrder.n;
  const subfolderVal = (subfolder_id != null && subfolder_id !== '') ? Number(subfolder_id) : null;
  if (subfolderVal !== null && isNaN(subfolderVal)) throw new Error('Invalid subfolder_id');

  const id = db.prepare(`
    INSERT INTO backlog_items (
      project_id, subfolder_id, title, description, priority, status, progress,
      effort_days, color_label, due_date, sort_order, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(project_id),
    subfolderVal,
    String(title).trim(),
    description != null ? String(description) : '',
    priorityVal,
    statusVal,
    progressVal,
    effortDaysVal,
    color_label != null ? String(color_label) : null,
    due_date || null,
    order,
    req.session.user.id > 0 ? req.session.user.id : null
  ).lastInsertRowid;
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  res.status(201).json(rowToItem(item));
});

// Bulk reorder (POST to avoid any conflict with PATCH /:id)
router.post('/reorder', (req, res) => {
  const { project_id, item_ids, priority_changes } = req.body || {};
  if (!project_id || !Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: 'project_id and item_ids array required' });
  }
  const pid = Number(project_id);
  if (priority_changes && typeof priority_changes === 'object') {
    const priorityStmt = db.prepare(
      'UPDATE backlog_items SET priority = ?, updated_at = datetime(\'now\') WHERE id = ? AND project_id = ?'
    );
    for (const [idStr, priority] of Object.entries(priority_changes)) {
      if (PRIORITIES.includes(priority)) {
        priorityStmt.run(priority, Number(idStr), pid);
      }
    }
  }
  const stmt = db.prepare(
    'UPDATE backlog_items SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ? AND project_id = ?'
  );
  item_ids.forEach((id, index) => {
    stmt.run(index, Number(id), pid);
  });
  const items = db
    .prepare(
      "SELECT * FROM backlog_items WHERE project_id = ? AND (status IS NULL OR status != 'completed') ORDER BY CASE priority WHEN 'Now' THEN 0 WHEN 'Soon' THEN 1 ELSE 2 END, sort_order, id"
    )
    .all(pid);
  res.json({ items: items.map(rowToItem) });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const allowed = [
    'subfolder_id', 'title', 'description', 'priority', 'status', 'progress',
    'effort_days', 'color_label', 'due_date', 'sort_order'
  ];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (key === 'priority' && !PRIORITIES.includes(req.body[key])) continue;
    if (key === 'status' && !STATUSES.includes(req.body[key])) continue;
    if (key === 'progress') {
      const v = Math.min(100, Math.max(0, Number(req.body[key]) || 0));
      updates.push('progress = ?'); params.push(v);
      continue;
    }
    if (key === 'effort_days') {
      const v = req.body[key] == null || req.body[key] === '' ? null : parseEffortDays(req.body[key]);
      updates.push('effort_days = ?'); params.push(v);
      continue;
    }
    updates.push(`${key} = ?`);
    params.push(req.body[key] == null ? null : req.body[key]);
  }
  if (req.body.status === 'completed') {
    updates.push('completed_at = datetime(\'now\')');
  }
  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE backlog_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const updated = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  res.json(rowToItem(updated));
});

// Reopen completed item
router.post('/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE backlog_items SET status = 'open', completed_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
  const updated = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id);
  res.json(rowToItem(updated));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM backlog_items WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
