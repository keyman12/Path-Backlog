import React from 'react';
import { useQuery } from 'react-query';
import { api } from '../api';
import './Reports.css';

export default function Reports() {
  const { data, isLoading } = useQuery(
    ['reports-summary'],
    () => api.reports.summary(),
    { staleTime: 60 * 1000 }
  );

  if (isLoading) return <div className="page"><p>Loading…</p></div>;

  const total = data?.total ?? 0;
  const byPriority = data?.by_priority ?? [];
  const byProject = data?.by_project ?? [];
  const byStatus = data?.by_status ?? [];

  return (
    <div className="page reports-page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-desc">Outstanding items, priority and project breakdown.</p>
      </div>
      <div className="reports-grid">
        <section className="report-card">
          <h2 className="report-card-title">Outstanding</h2>
          <p className="report-card-value">{total}</p>
          <p className="report-card-label">open / in progress items</p>
        </section>
        <section className="report-card">
          <h2 className="report-card-title">By priority</h2>
          <ul className="report-list">
            {byPriority.map(({ priority, count }) => (
              <li key={priority}>
                <span className="report-list-label">{priority}</span>
                <span className="report-list-value">{count}</span>
              </li>
            ))}
            {byPriority.length === 0 && <li className="report-list-empty">No data</li>}
          </ul>
        </section>
        <section className="report-card">
          <h2 className="report-card-title">By project</h2>
          <ul className="report-list">
            {byProject.map(({ id, name, count }) => (
              <li key={id}>
                <span className="report-list-label">{name}</span>
                <span className="report-list-value">{count}</span>
              </li>
            ))}
            {byProject.length === 0 && <li className="report-list-empty">No data</li>}
          </ul>
        </section>
        <section className="report-card">
          <h2 className="report-card-title">By status</h2>
          <ul className="report-list">
            {byStatus.map(({ status, count }) => (
              <li key={status}>
                <span className="report-list-label">{status || '—'}</span>
                <span className="report-list-value">{count}</span>
              </li>
            ))}
            {byStatus.length === 0 && <li className="report-list-empty">No data</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
