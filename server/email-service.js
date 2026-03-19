const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const db = require('./db');

const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');

/** Read PNG width/height from IHDR (bytes 16–23) so we can set explicit img dimensions and avoid stretch on mobile. */
function getPngDimensions(filePath) {
  try {
    const buf = fs.readFileSync(filePath, { start: 0, end: 24 });
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    };
  } catch {
    return null;
  }
}

function getItemsForFilter(contentType) {
  let sql = `
    SELECT bi.*, p.name AS project_name, p.color AS project_color, s.name AS subfolder_name
    FROM backlog_items bi
    JOIN projects p ON p.id = bi.project_id
    LEFT JOIN subfolders s ON s.id = bi.subfolder_id
    WHERE (bi.status IS NULL OR bi.status != 'completed')
  `;
  if (contentType === 'next_best_actions') {
    sql += ` AND (
      bi.priority = 'Now'
      OR (bi.due_date IS NOT NULL AND date(bi.due_date) >= date('now') AND date(bi.due_date) <= date('now', '+2 days'))
      OR (bi.progress >= 75)
    )`;
  } else if (contentType === 'now_only') {
    sql += " AND bi.priority = 'Now'";
  } else {
    sql += " AND bi.priority IN ('Now', 'Soon')";
  }
  sql += ` ORDER BY CASE bi.priority WHEN 'Now' THEN 0 WHEN 'Soon' THEN 1 ELSE 2 END, bi.project_id, bi.sort_order, bi.id`;
  const rows = db.prepare(sql).all();
  const projectColorsById = {};
  db.prepare('SELECT id, color FROM projects').all().forEach((p) => { projectColorsById[p.id] = p.color || null; });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description || '',
    priority: r.priority || 'Later',
    progress: r.progress ?? 0,
    due_date: r.due_date,
    project_name: r.project_name,
    project_color: r.project_color != null ? r.project_color : projectColorsById[r.project_id] ?? '#297D2D',
    subfolder_name: r.subfolder_name ?? null
  }));
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildHtml(recipientName, items, contentType, baseUrl, logoSize = null) {
  const filterParam = encodeURIComponent(contentType);
  const viewUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/?filter=${filterParam}` : '#';
  const categoryLabel = contentType === 'next_best_actions' ? 'Next best actions' : contentType === 'now_only' ? 'Now' : 'Now & Soon';
  const targetLogoHeight = 32;
  const logoStyle = logoSize
    ? `height: ${targetLogoHeight}px; width: ${Math.round((logoSize.width / logoSize.height) * targetLogoHeight)}px; max-width: 100%; display: block; border: 0;`
    : 'height: 32px; width: auto; max-width: 100%; display: block; border: 0;';

  const rows = items.map((item) => {
    const cat = item.subfolder_name ? `${item.project_name}/${item.subfolder_name}` : item.project_name;
    const meta = [item.due_date ? formatDate(item.due_date) : null, item.progress > 0 ? `${item.progress}%` : null].filter(Boolean).join(' · ');
    const priorityClass = (item.priority || 'later').toLowerCase();
    return `
      <tr>
        <td style="border-left: 4px solid ${item.project_color}; padding: 10px 12px; border-bottom: 1px solid #eee; vertical-align: top;">
          <div style="font-weight: 500; color: #212121;">${escapeHtml(item.title)}</div>
          ${item.description ? `<div style="font-size: 11px; color: #757575; margin-top: 2px;">${escapeHtml(item.description.substring(0, 120))}${item.description.length > 120 ? '…' : ''}</div>` : ''}
          <div style="font-size: 12px; color: #616161; margin-top: 8px;">
            <span style="font-weight: 500; color: ${item.project_color};">${escapeHtml(cat)}</span>
            ${meta ? ` · ${escapeHtml(meta)}` : ''}
          </div>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; vertical-align: middle; white-space: nowrap;">
          <span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ${priorityColor(item.priority)}; color: ${priorityTextColor(item.priority)};">${escapeHtml(item.priority || 'Later')}</span>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #212121; background: #f5f5f5; padding: 24px;">
  <div style="max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="padding: 24px 24px 16px; background: linear-gradient(135deg, rgba(41,125,45,0.04) 0%, transparent 100%);">
      <div style="display: inline-block;">
        <img src="cid:logo" alt="Path" style="${logoStyle}" />
      </div>
    </div>
    <div style="padding: 0 24px 24px;">
      <p style="margin: 0 0 16px;">Dear ${escapeHtml(recipientName || 'there')},</p>
      <p style="margin: 0 0 20px;">Please find the day's work list.</p>
      <p style="margin: 0 0 16px; font-size: 12px; color: #757575;">From the Path Backlog Agent!</p>
      <h2 style="margin: 0 0 12px; font-size: 16px; font-weight: 600;">${escapeHtml(categoryLabel)}</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #616161;">Item</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #616161;">Priority</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="2" style="padding: 16px; color: #757575;">No items in this list.</td></tr>'}
        </tbody>
      </table>
      <p style="margin: 20px 0 0; font-size: 13px;"><a href="${viewUrl}" style="color: #297D2D; font-weight: 600;">Open this view in Path Backlog →</a></p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function priorityColor(priority) {
  const p = (priority || 'Later').toLowerCase();
  if (p === 'now') return '#FF5252';
  if (p === 'soon') return '#FFD4D0';
  return '#97DF9A';
}

function priorityTextColor(priority) {
  const p = (priority || 'Later').toLowerCase();
  if (p === 'now') return '#fff';
  return '#212121';
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error('SMTP not configured: set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env');
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

async function sendWorkListEmail(recipients, contentType) {
  const items = getItemsForFilter(contentType);
  const baseUrl = process.env.BASE_URL || process.env.VITE_APP_URL || 'http://localhost:5173';
  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Path Backlog';

  const transport = getTransport();
  const attachments = [];
  if (fs.existsSync(LOGO_PATH)) {
    attachments.push({
      filename: 'path-logo.png',
      content: fs.readFileSync(LOGO_PATH),
      cid: 'logo'
    });
  }

  const logoSize = fs.existsSync(LOGO_PATH) ? getPngDimensions(LOGO_PATH) : null;
  const results = [];
  for (const r of recipients) {
    const to = typeof r === 'string' ? r : r.email;
    const name = typeof r === 'string' ? null : (r.name || null);
    const html = buildHtml(name || to, items, contentType, baseUrl, logoSize);
    try {
      await transport.sendMail({
        from: fromName ? `"${fromName}" <${from}>` : from,
        to,
        subject: `Path Backlog – Day's work list`,
        html,
        attachments
      });
      results.push({ email: to, ok: true });
    } catch (err) {
      results.push({ email: to, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  getItemsForFilter,
  buildHtml,
  sendWorkListEmail,
  LOGO_PATH
};
