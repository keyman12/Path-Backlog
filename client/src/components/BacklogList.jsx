import React from 'react';
import { getDueDateStatus } from '../utils/dateAlerts';
import './BacklogList.css';

const PRIORITY_COLORS = { Now: 'var(--path-primary)', Soon: 'var(--path-primary-light-1)', Later: 'var(--path-grey-500)' };

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BacklogList({ items, selectedId, onSelect, showProject }) {
  return (
    <ul className="backlog-list">
      {items.length === 0 && (
        <li className="backlog-list-empty">No items</li>
      )}
      {items.map((item) => (
        <li
          key={item.id}
          className={`backlog-list-item ${selectedId === item.id ? 'backlog-list-item-selected' : ''}`}
          onClick={() => onSelect(item.id)}
          style={{ borderLeftColor: item.color_label || PRIORITY_COLORS[item.priority] || 'transparent' }}
        >
          <div className="backlog-list-item-row">
            <span className="backlog-list-item-title">{item.title}</span>
            <span className={`backlog-list-item-priority priority-${(item.priority || '').toLowerCase()}`}>
              {item.priority === 'Soon' ? 'Next' : (item.priority || 'Later')}
            </span>
          </div>
          {item.description && (
            <div className="backlog-list-item-description">{item.description}</div>
          )}
          <div className="backlog-list-item-meta">
            {showProject && item.project_name && (
              <span className="backlog-list-item-project">{item.project_name}</span>
            )}
            {item.due_date && (
              <>
                <span className="backlog-list-item-date">{formatDate(item.due_date)}</span>
                {getDueDateStatus(item.due_date) === 'overdue' && (
                  <span className="backlog-list-item-due-alert due-overdue">Overdue</span>
                )}
                {getDueDateStatus(item.due_date) === 'due_soon' && (
                  <span className="backlog-list-item-due-alert due-soon">Due soon</span>
                )}
              </>
            )}
            {item.progress != null && item.progress > 0 && (
              <span className="backlog-list-item-progress">{item.progress}%</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
