import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { api } from '../api';
import ConsolidatedBacklogListInline from '../components/ConsolidatedBacklogListInline';
import './Home.css';

export default function Home() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
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

  return (
    <div className="page home-page">
      <div className="page-header">
        <h1 className="page-title">All items</h1>
        <p className="page-desc">Consolidated view across all projects. Drag to change priority; click a row or edit icon to expand and edit.</p>
      </div>
      <div className="home-content single-pane">
        {isLoading ? (
          <p className="pane-loading">Loading…</p>
        ) : (
          <ConsolidatedBacklogListInline
            items={items}
            expandedId={expandedId}
            onEditClick={setExpandedId}
            onUpdated={() => queryClient.invalidateQueries({ predicate: (q) => q.queryKey?.[0] === 'backlog-consolidated' })}
          />
        )}
      </div>
    </div>
  );
}
