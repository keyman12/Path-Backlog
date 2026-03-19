import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { api } from '../api';
import { getDueDateStatus } from '../utils/dateAlerts';
import './BacklogListItemInline.css';

const PRIORITIES = ['Now', 'Soon', 'Later'];
const PRIORITY_COLORS = { Now: '#FF5252', Soon: '#FFD4D0', Later: '#97DF9A' };

const EFFORT_OPTIONS = [
  { value: '', label: '—' },
  { value: '0.5', label: '0.5 day' },
  { value: '1', label: '1 day' },
  { value: '1.5', label: '1.5 days' },
  { value: '2', label: '2 days' },
  { value: '2.5', label: '2.5 days' },
  { value: '3', label: '3 days' },
  { value: '3.5', label: '3.5 days' },
  { value: '4', label: '4 days' },
  { value: '4.5', label: '4.5 days' },
  { value: '5', label: '5 days' },
  { value: '6', label: '6 days' },
  { value: '7', label: '7 days' },
  { value: '8', label: '8 days' },
  { value: '9', label: '9 days' },
  { value: '10', label: '10 days' }
];

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
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const { data: projectsData } = useQuery('projects', api.projects.list, { staleTime: 60 * 1000 });
  const projects = projectsData?.projects ?? [];
  const otherProjects = projects.filter((p) => Number(p.id) !== Number(item.project_id));

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [categoryDropdownOpen]);

  const [form, setForm] = useState({
    title: item.title,
    description: item.description ?? '',
    priority: item.priority ?? 'Later',
    progress: item.progress ?? 0,
    due_date: item.due_date ? formatDateInput(item.due_date) : '',
    effort_days: item.effort_days != null ? String(item.effort_days) : ''
  });

  const updateMutation = useMutation(
    (body) => api.backlog.update(item.id, body),
    {
      onSuccess: (updatedItem) => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.(updatedItem);
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

  const moveToProjectMutation = useMutation(
    (projectId) => api.backlog.update(item.id, { project_id: projectId }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
        onUpdated?.();
        setCategoryDropdownOpen(false);
      }
    }
  );

  const saveDebounceRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;

  const buildPayload = (overrides = {}) => {
    const f = formRef.current;
    return {
      title: (overrides.title !== undefined ? overrides.title : f.title) ?? '',
      description: (overrides.description !== undefined ? overrides.description : f.description) ?? '',
      priority: (overrides.priority !== undefined ? overrides.priority : f.priority) ?? 'Later',
      progress: (overrides.progress !== undefined ? overrides.progress : f.progress) ?? 0,
      due_date: (overrides.due_date !== undefined ? overrides.due_date : f.due_date) || null,
      effort_days: (() => { const v = overrides.effort_days !== undefined ? overrides.effort_days : f.effort_days; return v === '' ? null : (parseFloat(v) || null); })()
    };
  };

  const saveNow = (payload) => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    updateMutation.mutate(payload);
  };

  const scheduleSave = () => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => saveNow(buildPayload()), 500);
  };

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isExpanded || !item) return;
    setForm({
      title: item.title,
      description: item.description ?? '',
      priority: item.priority ?? 'Later',
      progress: item.progress ?? 0,
      due_date: item.due_date ? formatDateInput(item.due_date) : '',
      effort_days: item.effort_days != null ? String(item.effort_days) : ''
    });
  }, [isExpanded, item?.id, item?.updated_at]);

  const handleOpenEdit = () => {
    setForm({
      title: item.title,
      description: item.description ?? '',
      priority: item.priority ?? 'Later',
      progress: item.progress ?? 0,
      due_date: item.due_date ? formatDateInput(item.due_date) : '',
      effort_days: item.effort_days != null ? String(item.effort_days) : ''
    });
    onEditClick(item.id);
  };

  const handleClose = () => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveNow(buildPayload());
    onEditClick(null);
  };

  const isCompleted = item.status === 'completed';

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
          <div className="inline-item-main" onClick={() => { if (isExpanded) handleClose(); else onEditClick?.(item.id); }}>
            <span className="inline-item-title">{item.title}</span>
          </div>
          <span className="inline-item-row-markers">
            {!isCompleted && item.due_date && getDueDateStatus(item.due_date) === 'overdue' && (
              <span className="inline-item-due-alert due-overdue">Overdue</span>
            )}
            {!isCompleted && item.due_date && getDueDateStatus(item.due_date) === 'due_soon' && (
              <span className="inline-item-due-alert due-soon">Due soon</span>
            )}
            {isCompleted ? (
              <span className="inline-item-priority priority-completed">Completed</span>
            ) : (
              <span className={`inline-item-priority priority-${(item.priority || 'later').toLowerCase()}`}>
                {item.priority === 'Soon' ? 'Next' : (item.priority || 'Later')}
              </span>
            )}
          </span>
          <button
            type="button"
            className="inline-item-edit-btn"
            onClick={(e) => { e.stopPropagation(); isExpanded ? handleClose() : handleOpenEdit(); }}
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
                <span className="inline-item-project-wrap" ref={categoryDropdownRef}>
                  <button
                    type="button"
                    className="inline-item-project inline-item-project-btn"
                    style={{ color: (projectColor || item.project_color) || 'var(--path-grey-700)' }}
                    onClick={() => setCategoryDropdownOpen((o) => !o)}
                    aria-expanded={categoryDropdownOpen}
                    aria-haspopup="listbox"
                    aria-label={`Category: ${item.project_name}. Click to re-assign.`}
                  >
                    {item.subfolder_name ? `${item.project_name}/${item.subfolder_name}` : item.project_name}
                  </button>
                  {categoryDropdownOpen && otherProjects.length > 0 && (
                    <ul className="inline-item-project-dropdown" role="listbox">
                      {otherProjects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="inline-item-project-option"
                            onClick={() => moveToProjectMutation.mutate(p.id)}
                            disabled={moveToProjectMutation.isLoading}
                            role="option"
                          >
                            <span className="inline-item-project-option-swatch" style={{ background: p.color || '#297D2D' }} />
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              )}
              {item.due_date && (
                <span className="inline-item-date">{formatDate(item.due_date)}</span>
              )}
              {item.progress != null && item.progress > 0 && (
                <span className="inline-item-progress">{item.progress}%</span>
              )}
              {item.effort_days != null && item.effort_days > 0 && (
                <span className="inline-item-effort">{item.effort_days % 1 === 0 ? `${Math.round(item.effort_days)}d` : `${item.effort_days}d`}</span>
              )}
            </span>
          </div>
        )}

        {isExpanded && (
        <div className="inline-item-form">
          <label className="inline-form-label">
            Title
            <input
              type="text"
              value={form.title}
              onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); scheduleSave(); }}
              className="inline-form-input"
              required
            />
          </label>
          <label className="inline-form-label">
            Description
            <textarea
              value={form.description}
              onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); scheduleSave(); }}
              className="inline-form-textarea"
              rows={3}
            />
          </label>
          <div className="inline-form-row inline-form-row-actions-align">
            <label className="inline-form-label">
              Priority
              <select
                value={form.priority}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, priority: v }));
                  saveNow(buildPayload({ priority: v }));
                }}
                className="inline-form-select inline-form-priority-select"
                aria-label="Priority"
              >
{PRIORITIES.map((p) => (
                <option key={p} value={p}>{p === 'Soon' ? 'Next' : p}</option>
              ))}
              </select>
            </label>
            <label className="inline-form-label">
              Due date
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, due_date: v }));
                  saveNow(buildPayload({ due_date: v }));
                }}
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
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setForm((f) => ({ ...f, progress: v }));
                  saveNow(buildPayload({ progress: v }));
                }}
                className="inline-form-input small"
              />
            </label>
            <label className="inline-form-label">
              Effort (days)
              <input
                type="number"
                min={0}
                step="any"
                list={`effort-datalist-${item.id}`}
                value={form.effort_days}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, effort_days: v }));
                  saveNow(buildPayload({ effort_days: v }));
                }}
                className="inline-form-input small"
                placeholder="—"
                aria-label="Effort in days"
              />
              <datalist id={`effort-datalist-${item.id}`}>
                {EFFORT_OPTIONS.filter((opt) => opt.value !== '').map((opt) => (
                  <option key={opt.value} value={opt.value} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="inline-form-actions">
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
          {updateMutation.isLoading && <p className="inline-form-saving" aria-live="polite">Saving…</p>}
        </div>
        )}
      </div>
    </div>
  );
}
