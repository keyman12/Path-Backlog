const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', (req, res) => {
  const includeCompleted = req.query.include_completed === 'true' || req.query.include_completed === '1';
  const statusFilter = includeCompleted ? '' : " AND (status IS NULL OR status != 'completed')";

  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM backlog_items WHERE 1=1 ${statusFilter}
  `).get();

  const byPriority = db.prepare(`
    SELECT priority, COUNT(*) AS count
    FROM backlog_items WHERE 1=1 ${statusFilter}
    GROUP BY priority
    ORDER BY CASE priority WHEN 'Now' THEN 0 WHEN 'Soon' THEN 1 ELSE 2 END
  `).all();

  const joinFilter = includeCompleted ? '' : " AND (bi.status IS NULL OR bi.status != 'completed')";
  const byProject = db.prepare(`
    SELECT p.id, p.name, COUNT(bi.id) AS count
    FROM projects p
    LEFT JOIN backlog_items bi ON bi.project_id = p.id ${joinFilter}
    GROUP BY p.id
    ORDER BY p.sort_order, p.id
  `).all();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM backlog_items WHERE 1=1
    GROUP BY status
  `).all();

  res.json({
    total: total.n,
    by_priority: byPriority,
    by_project: byProject,
    by_status: byStatus
  });
});

module.exports = router;
