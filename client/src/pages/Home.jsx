import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { api } from '../api';
import { getGanttSettings } from '../utils/ganttSettings';
import ConsolidatedBacklogListInline from '../components/ConsolidatedBacklogListInline';
import GanttChart from '../components/GanttChart';
import './Home.css';

const HOME_VIEW_KEY = 'path-home-view';
const HOME_VIEW_OPTIONS = [
  { value: 'list', label: 'List view' },
  { value: 'list-and-gantt', label: 'List and Gantt' },
  { value: 'gantt', label: 'Gantt only' }
];

function getStoredHomeView() {
  try {
    const v = localStorage.getItem(HOME_VIEW_KEY);
    return ['list', 'list-and-gantt', 'gantt'].includes(v) ? v : 'list';
  } catch {
    return 'list';
  }
}

export default function Home() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [homeView, setHomeView] = useState(getStoredHomeView);

  const setHomeViewAndStore = (v) => {
    setHomeView(v);
    try {
      localStorage.setItem(HOME_VIEW_KEY, v);
    } catch {}
  };

  const queryParams = useMemo(() => {
    const p = {};
    if (searchParams.get('include_completed') === 'true') p.include_completed = 'true';
    const due = searchParams.get('due');
    if (due) p.due = due;
    const completed = searchParams.get('completed');
    if (completed) p.completed = completed;
    const projectIds = searchParams.get('project_ids');
    if (projectIds != null && String(projectIds).trim()) p.project_ids = String(projectIds).trim();
    return p;
  }, [searchParams]);
  const queryString = useMemo(() => new URLSearchParams(queryParams).toString(), [queryParams]);
  const { data, isLoading } = useQuery(
    ['backlog-consolidated', queryString],
    () => api.backlog.consolidatedQueryString(queryString),
    { staleTime: 20 * 1000, refetchOnWindowFocus: false }
  );
  const items = data?.items || [];

  const ganttSettings = useMemo(() => getGanttSettings(), []);
  const showList = homeView === 'list' || homeView === 'list-and-gantt';
  const showGantt = homeView === 'list-and-gantt' || homeView === 'gantt';

  return (
    <div className="page home-page">
      <div className="page-header home-page-header">
        <div className="page-header-text">
          <h1 className="page-title">All items</h1>
          <p className="page-desc">Consolidated view across all projects. Drag to change priority; click a row or edit icon to expand and edit.</p>
        </div>
        <div className="home-view-select-wrap">
          <label htmlFor="home-view-select" className="home-view-select-label">View</label>
          <select
            id="home-view-select"
            value={homeView}
            onChange={(e) => setHomeViewAndStore(e.target.value)}
            className="home-view-select"
            aria-label="Home view"
          >
            {HOME_VIEW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className={`home-content ${showList && showGantt ? 'home-content-dual' : showList ? 'single-pane' : 'home-content-gantt-only'}`}>
        {isLoading ? (
          <p className="pane-loading">Loading…</p>
        ) : (
          <>
            {showList && (
              <div className="home-list-pane">
                <ConsolidatedBacklogListInline
                  items={items}
                  expandedId={expandedId}
                  onEditClick={setExpandedId}
                  onUpdated={() => queryClient.invalidateQueries({ predicate: (q) => q.queryKey?.[0] === 'backlog-consolidated' })}
                />
              </div>
            )}
            {showGantt && (
              <div className="home-gantt-pane">
                <GanttChart
                  items={items}
                  manDaysPerWeek={ganttSettings.manDaysPerWeek}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
