/**
 * Time-sensitive due date alerts: overdue, due soon (e.g. within 7 days).
 */
const DUE_SOON_DAYS = 7;

export function getDueDateStatus(dueDateStr) {
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((d - today) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= DUE_SOON_DAYS) return 'due_soon';
  return null;
}
