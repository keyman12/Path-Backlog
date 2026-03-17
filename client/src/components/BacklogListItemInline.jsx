import React, { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { api } from '../api';
import { getDueDateStatus } from '../utils/dateAlerts';
import './BacklogListItemInline.css';

const PRIORITIES = ['Now', 'Soon', 'Later'];
const PRIORITY_COLORS = { Now: '#FF5252', Soon: '#FFD4D0', Later: '#97DF9A' };

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateInput(str) {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function BacklogListItemInline({
  item,
  isExpanded,
  onEditClick,
  onUpdated,
  dragHandle,
  sortableRef,
  showProject,
  projectColor
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: item.title,
    description: item.description ?? '',
    priority: item.priority ?? 'Later',
    progress: item.progress ?? 0,
    due_date: item.due_date ? formatDateInput(item.due_date) : ''
  });

  const updateMutation = useMutation(
    (body) => api.backlog.update(item.id, body),
    {
      onSuccess: (updatedItem) => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.(updatedItem);
        onEditClick(null);
      }
    }
  );

  const completeMutation = useMutation(
    () => api.backlog.update(item.id, { status: 'completed' }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
        onEditClick(null);
      }
    }
  );

  const reopenMutation = useMutation(
    () => api.backlog.reopen(item.id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
      }
    }
  );

  const deleteMutation = useMutation(
    () => api.backlog.delete(item.id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
        onEditClick(null);
      }
    }
  );

  const handleOpenEdit = () => {
    setForm({
      title: item.title,
      description: item.description ?? '',
      priority: item.priority ?? 'Later',
      progress: item.progress ?? 0,
      due_date: item.due_date ? formatDateInput(item.due_date) : ''
    });
    onEditClick(item.id);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateMutation.mutate({
      ...form,
      due_date: form.due_date || null
    });
  };

  const handleCancel = () => {
    onEditClick(null);
  };

  const isCompleted = item.status === 'completed';

  const isDirty =
    form.title !== (item.title ?? '') ||
    (form.description ?? '') !== (item.description ?? '') ||
    form.priority !== (item.priority ?? 'Later') ||
    Number(form.progress) !== Number(item.progress ?? 0) ||
    (form.due_date || '') !== (item.due_date ? formatDateInput(item.due_date) : '');

  const handleEl = dragHandle ?? (
    <span className="inline-item-drag-handle inline-item-drag-handle-static" aria-hidden>⋮⋮</span>
  );

  return (
    <div
      ref={sortableRef}
      className={`inline-item ${isExpanded ? 'inline-item-expanded' : ''}`}
    >
      {handleEl}
      <div
        className="inline-item-bordered"
        style={{ borderLeftColor: (projectColor || item.project_color || PRIORITY_COLORS[item.priority]) || 'transparent' }}
      >
        <div className="inline-item-row">
          <div className="inline-item-main" onClick={() => !isExpanded && onEditClick && onEditClick(item.id)}>
            <span className="inline-item-title">{item.title}</span>
            {isCompleted ? (
              <span className="inline-item-priority priority-completed">Completed</span>
            ) : (
              <span className={`inline-item-priority priority-${(item.priority || 'later').toLowerCase()}`}>
                {item.priority || 'Later'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="inline-item-edit-btn"
            onClick={(e) => { e.stopPropagation(); isExpanded ? handleCancel() : handleOpenEdit(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={isExpanded ? 'Close' : 'Edit'}
          >
            {isExpanded ? (
              <span className="inline-item-edit-close" aria-hidden>✕</span>
            ) : (
              <img src="/pencil-edit.png" alt="" aria-hidden />
            )}
          </button>
        </div>
        {item.description && !isExpanded && (
          <div className="inline-item-description">{item.description}</div>
        )}
        {!isExpanded && (
          <div className="inline-item-meta">
            <span className="inline-item-meta-left">
              {showProject && item.project_name && (
                <span
                  className="inline-item-project"
                  style={{ color: (projectColor || item.project_color) || 'var(--path-grey-700)' }}
                >
                  {item.subfolder_name ? `${item.project_name}/${item.subfolder_name}` : item.project_name}
                </span>
              )}
              {item.due_date && (
                <span className="inline-item-date">{formatDate(item.due_date)}</span>
              )}
              {item.progress != null && item.progress > 0 && (
                <span className="inline-item-progress">{item.progress}%</span>
              )}
            </span>
            <span className="inline-item-meta-right">
              {item.due_date && getDueDateStatus(item.due_date) === 'overdue' && (
                <span className="inline-item-due-alert due-overdue">Overdue</span>
              )}
              {item.due_date && getDueDateStatus(item.due_date) === 'due_soon' && (
                <span className="inline-item-due-alert due-soon">Due soon</span>
              )}
            </span>
          </div>
        )}

        {isExpanded && (
        <form className="inline-item-form" onSubmit={handleSave}>
          <label className="inline-form-label">
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="inline-form-input"
              required
            />
          </label>
          <label className="inline-form-label">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="inline-form-textarea"
              rows={3}
            />
          </label>
          <div className="inline-form-row inline-form-row-actions-align">
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="inline-form-select inline-form-priority-select"
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label className="inline-form-label">
              Due date
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="inline-form-input small"
              />
            </label>
            <label className="inline-form-label">
              Progress %
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) || 0 }))}
                className="inline-form-input small"
              />
            </label>
          </div>
          <div className="inline-form-actions">
            <button
              type="submit"
              className={`btn btn-secondary btn-sm ${isDirty ? 'btn-save-dirty' : ''}`}
              disabled={updateMutation.isLoading}
            >
              Save
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
              Cancel
            </button>
            {isCompleted ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isLoading}
              >
                Re-open
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isLoading}
              >
                Mark complete
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => window.confirm('Delete this item?') && deleteMutation.mutate()}
              disabled={deleteMutation.isLoading}
            >
              Delete
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
