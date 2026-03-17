import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { api } from '../api';
import './HomeFilters.css';

const DUE_OPTIONS = [
  { value: '', label: 'Any due date' },
  { value: 'next_week', label: 'Next 7 days' },
  { value: 'next_2_weeks', label: 'Next 2 weeks' },
  { value: 'next_month', label: 'Next month' },
  { value: 'exact', label: 'Exact date…' }
];

const COMPLETED_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'this_week', label: 'Completed this week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'last_month', label: 'Last month' }
];

export default function HomeFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [exactDue, setExactDue] = useState(searchParams.get('due')?.match(/^\d{4}-\d{2}-\d{2}$/) ? searchParams.get('due') : '');
  const panelRef = useRef(null);

  const { data } = useQuery('projects', api.projects.list, { staleTime: 60 * 1000 });
  const projects = data?.projects || [];

  const includeCompleted = searchParams.get('include_completed') === 'true';
  const due = searchParams.get('due') || '';
  const dueIsExact = due && /^\d{4}-\d{2}-\d{2}$/.test(due);
  const showExactDue = due === 'exact' || dueIsExact;
  const completed = searchParams.get('completed') || 'any';
  const projectIdsParam = searchParams.get('project_ids') || '';
  const selectedProjectIds = projectIdsParam
    ? projectIdsParam.split(',').map((id) => parseInt(String(id).trim(), 10)).filter((n) => !Number.isNaN(n))
    : [];

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });
    setSearchParams(next, { replace: true });
  };

  const handleIncludeCompleted = (e) => {
    updateParams({ include_completed: e.target.checked ? 'true' : '' });
  };

  const handleDue = (e) => {
    const v = e.target.value;
    if (v === 'exact') {
      updateParams({ due: 'exact' });
      return;
    }
    updateParams({ due: v });
    if (v !== 'exact') setExactDue('');
  };

  const handleExactDueChange = (e) => {
    const v = e.target.value;
    setExactDue(v);
    updateParams({ due: v || '' });
  };

  const handleCompleted = (e) => {
    updateParams({ completed: e.target.value });
  };

  const toggleProject = (projectId) => {
    const id = Number(projectId);
    if (Number.isNaN(id)) return;
    const next = selectedProjectIds.includes(id)
      ? selectedProjectIds.filter((x) => x !== id)
      : [...selectedProjectIds, id];
    updateParams({ project_ids: next.length ? next.join(',') : '' });
  };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [open]);

  const activeCount = [
    includeCompleted ? 1 : 0,
    due && due !== 'exact' ? 1 : 0,
    includeCompleted && completed !== 'any' ? 1 : 0,
    selectedProjectIds.length
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="home-filters" ref={panelRef}>
      <button
        type="button"
        className="home-filters-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Filters
        {activeCount > 0 && <span className="home-filters-badge">{activeCount}</span>}
      </button>
      {open && (
        <div className="home-filters-panel">
          <div className="home-filters-section">
            <label className="home-filters-check">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={handleIncludeCompleted}
              />
              <span>Show completed items</span>
            </label>
            <p className="home-filters-hint">Show completed and open items together</p>
          </div>

          <div className="home-filters-section">
            <label className="home-filters-label">Due date</label>
            <select value={showExactDue ? 'exact' : due} onChange={handleDue} className="home-filters-select">
              {DUE_OPTIONS.map((opt) => (
                <option key={opt.value || 'any'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {showExactDue && (
              <input
                type="date"
                value={exactDue || (dueIsExact ? due : '')}
                onChange={handleExactDueChange}
                className="home-filters-input"
              />
            )}
          </div>

          {includeCompleted && (
            <div className="home-filters-section">
              <label className="home-filters-label">Completed date</label>
              <select value={completed} onChange={handleCompleted} className="home-filters-select">
                {COMPLETED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="home-filters-section">
            <label className="home-filters-label">Project (category)</label>
            <div className="home-filters-projects">
              {projects.map((p) => (
                <label key={p.id} className="home-filters-check home-filters-check-inline">
                <input
                  type="checkbox"
                  checked={selectedProjectIds.includes(Number(p.id))}
                  onChange={() => toggleProject(p.id)}
                />
                  <span>{p.name}</span>
                </label>
              ))}
              {projects.length === 0 && <span className="home-filters-empty">No projects</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
