import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api } from '../api';
import SortableBacklogListInline from '../components/SortableBacklogListInline';
import './Project.css';

export default function Project() {
  const { projectId } = useParams();
  const pid = Number(projectId);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [subfolderId, setSubfolderId] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  const { data: projectsData } = useQuery('projects', api.projects.list);
  const project = projectsData?.projects?.find((p) => p.id === pid);

  const { data: subfoldersData } = useQuery(
    ['subfolders', pid],
    () => api.subfolders.list(pid),
    { enabled: !!pid }
  );
  const subfolders = subfoldersData?.subfolders || [];

  const { data: backlogData, isLoading } = useQuery(
    ['backlog', pid, subfolderId],
    () =>
      subfolderId == null
        ? api.backlog.consolidated({ project_ids: String(pid), include_completed: 'true' })
        : api.backlog.list({
            project_id: pid,
            subfolder_id: subfolderId,
            include_completed: 'true'
          }),
    // staleTime: 0 ensures React Query always refetches on mount, so reorders from Home are reflected
    { enabled: !!pid, staleTime: 0 }
  );
  const items = backlogData?.items || [];

  const backlogQueryKey = ['backlog', pid, subfolderId];

  const createMutation = useMutation(
    (body) => api.backlog.create({
      ...body,
      project_id: pid,
      ...(subfolderId != null ? { subfolder_id: subfolderId } : {})
    }),
    {
      onSuccess: (createdItem) => {
        setNewTitle('');
        queryClient.setQueryData(backlogQueryKey, (prev) => ({
          ...prev,
          items: prev?.items ? [createdItem, ...prev.items] : [createdItem]
        }));
        queryClient.invalidateQueries(['backlog']);
        queryClient.invalidateQueries(['backlog-consolidated']);
      }
    }
  );

  const handleAddItem = (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createMutation.mutate({ title });
  };

  return (
    <div className="page project-page">
      <div className="page-header">
        <h1 className="page-title">{project?.name || 'Project'}</h1>
        <p className="page-desc">Backlog items for this project.</p>
      </div>
      <div className="project-tabs">
        <button
          type="button"
          className={`project-tab ${!subfolderId ? 'project-tab-active' : ''}`}
          onClick={() => setSubfolderId(null)}
        >
          All
        </button>
        {subfolders.map((sf) => (
          <button
            key={sf.id}
            type="button"
            className={`project-tab ${subfolderId === sf.id ? 'project-tab-active' : ''}`}
            onClick={() => setSubfolderId(sf.id)}
          >
            {sf.name}
          </button>
        ))}
      </div>
      <div className="home-content single-pane">
        <form className="backlog-add-form" onSubmit={handleAddItem}>
          <input
            type="text"
            placeholder="Add item..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="backlog-add-input"
          />
          <button type="submit" className="btn btn-primary btn-sm backlog-add-btn" disabled={createMutation.isLoading || !newTitle.trim()}>
            Add
          </button>
        </form>
        {createMutation.isError && (
          <div className="backlog-add-error">{createMutation.error?.data?.error || createMutation.error.message}</div>
        )}
        {isLoading ? (
          <p className="pane-loading">Loading…</p>
        ) : (
          <SortableBacklogListInline
            projectId={pid}
            items={items}
            expandedId={expandedId}
            onEditClick={setExpandedId}
            projectColor={project?.color}
            onUpdated={(updatedItem) => {
              if (updatedItem) {
                queryClient.setQueryData(backlogQueryKey, (prev) => ({
                  ...prev,
                  items: prev?.items?.map((i) => (i.id === updatedItem.id ? updatedItem : i)) ?? []
                }));
              }
              queryClient.invalidateQueries(['backlog']);
            }}
          />
        )}
      </div>
    </div>
  );
}
