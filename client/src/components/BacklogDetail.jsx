import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../api';
import { getDueDateStatus } from '../utils/dateAlerts';
import './BacklogDetail.css';

const PRIORITIES = ['Now', 'Soon', 'Later'];
const COLOR_PRESETS = ['#297D2D', '#FF5252', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#795548', null];

function WorkTicketAdd({ itemId, onAdded }) {
  const [content, setContent] = useState('');
  const mutation = useMutation(
    () => api.workTickets.create({ backlog_item_id: itemId, content }),
    { onSuccess: () => { setContent(''); onAdded(); } }
  );
  return (
    <form
      className="backlog-detail-ticket-add"
      onSubmit={(e) => { e.preventDefault(); if (content.trim()) mutation.mutate(); }}
    >
      <textarea
        placeholder="Add AI instruction / work ticket..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        className="backlog-detail-textarea small"
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!content.trim() || mutation.isLoading}>
        Add ticket
      </button>
    </form>
  );
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function BacklogDetail({ itemId, onClose, onUpdated }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const { data: item, isLoading } = useQuery(
    ['backlog-item', itemId],
    () => api.backlog.get(itemId),
    { enabled: !!itemId }
  );

  const updateMutation = useMutation(
    (body) => api.backlog.update(itemId, body),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog-item', itemId]);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        setEditing(false);
        onUpdated?.();
      }
    }
  );

  const completeMutation = useMutation(
    () => api.backlog.update(itemId, { status: 'completed' }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog-item', itemId]);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
      }
    }
  );

  const reopenMutation = useMutation(
    () => api.backlog.reopen(itemId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog-item', itemId]);
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
      }
    }
  );

  const deleteMutation = useMutation(
    () => api.backlog.delete(itemId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onClose?.();
        onUpdated?.();
      }
    }
  );

  const startEdit = () => {
    if (item) {
      setEditForm({
        title: item.title,
        description: item.description ?? '',
        priority: item.priority,
        progress: item.progress ?? 0,
        due_date: item.due_date ? formatDate(item.due_date) : '',
        color_label: item.color_label ?? ''
      });
      setEditing(true);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      ...editForm,
      due_date: editForm.due_date || null
    });
  };

  if (!itemId || isLoading) return <div className="backlog-detail-loading">Loading…</div>;
  if (!item) return <div className="backlog-detail-loading">Not found</div>;

  const isCompleted = item.status === 'completed';
  const workTickets = item.work_tickets || [];

  return (
    <div className="backlog-detail">
      <div className="backlog-detail-header">
        <h2 className="backlog-detail-title">
          {editing ? (
            <input
              className="backlog-detail-input title"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
            />
          ) : (
            item.title
          )}
        </h2>
        {onClose && (
          <button type="button" className="backlog-detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      <div className="backlog-detail-meta">
        <span className={`backlog-detail-priority priority-${(item.priority || 'later').toLowerCase()}`}>
          {editing ? (
            <select
              value={editForm.priority}
              onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
              className="backlog-detail-select"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p === 'Soon' ? 'Next' : p}</option>
              ))}
            </select>
          ) : (
            item.priority === 'Soon' ? 'Next' : (item.priority || 'Later')
          )}
        </span>
        {item.due_date && (
          <span className="backlog-detail-due">
            Due: {editing ? (
              <input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                className="backlog-detail-input small"
              />
            ) : (
              formatDate(item.due_date)
            )}
            {!editing && getDueDateStatus(item.due_date) === 'overdue' && (
              <span className="backlog-detail-due-alert due-overdue">Overdue</span>
            )}
            {!editing && getDueDateStatus(item.due_date) === 'due_soon' && (
              <span className="backlog-detail-due-alert due-soon">Due soon</span>
            )}
          </span>
        )}
        {editing && !item.due_date && (
          <input
            type="date"
            value={editForm.due_date}
            onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
            className="backlog-detail-input small"
            placeholder="Due date"
          />
        )}
        {item.color_label && (
          <span
            className="backlog-detail-color-swatch"
            style={{ background: item.color_label }}
            title={item.color_label}
          />
        )}
      </div>
      {editing && (
        <div className="backlog-detail-edit-row">
          <label>Color</label>
          <div className="backlog-detail-colors">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                className={`backlog-detail-color-btn ${editForm.color_label === c ? 'active' : ''}`}
                style={c ? { background: c } : {}}
                onClick={() => setEditForm((f) => ({ ...f, color_label: c || '' }))}
              />
            ))}
          </div>
        </div>
      )}
      <div className="backlog-detail-progress">
        {editing ? (
          <label>
            Progress: <input
              type="number"
              min={0}
              max={100}
              value={editForm.progress}
              onChange={(e) => setEditForm((f) => ({ ...f, progress: Number(e.target.value) || 0 }))}
              className="backlog-detail-input small"
            />
            %
          </label>
        ) : (
          item.progress != null && (
            <div className="backlog-detail-progress-bar">
              <div className="backlog-detail-progress-fill" style={{ width: `${item.progress}%` }} />
              <span>{item.progress}%</span>
            </div>
          )
        )}
      </div>
      <div className="backlog-detail-description">
        <h3>Description</h3>
        {editing ? (
          <textarea
            className="backlog-detail-textarea"
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            rows={6}
          />
        ) : (
          <p className="backlog-detail-description-text">{item.description || '—'}</p>
        )}
      </div>
      <div className="backlog-detail-tickets">
        <h3>Work tickets (AI instructions)</h3>
        <WorkTicketAdd itemId={itemId} onAdded={() => queryClient.invalidateQueries(['backlog-item', itemId])} />
        {workTickets.length === 0 && <p className="backlog-detail-empty">None</p>}
        <ul className="backlog-detail-ticket-list">
          {workTickets.map((t) => (
            <li key={t.id} className="backlog-detail-ticket">
              <pre className="backlog-detail-ticket-content">{t.content}</pre>
              <small>Updated {t.updated_at ? new Date(t.updated_at).toLocaleString() : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <div className="backlog-detail-actions">
        {editing ? (
          <>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={updateMutation.isLoading}>
              Save changes
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={startEdit}>
              Edit
            </button>
            {isCompleted ? (
              <button type="button" className="btn btn-secondary" onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isLoading}>
                Re-open
              </button>
            ) : (
              <button type="button" className="btn btn-success" onClick={() => completeMutation.mutate()} disabled={completeMutation.isLoading}>
                Mark complete
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => window.confirm('Delete this item?') && deleteMutation.mutate()}
              disabled={deleteMutation.isLoading}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
