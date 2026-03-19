import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuth } from '../App';
import { api } from '../api';
import { getGanttSettings, saveGanttSettings, GANTT_DEFAULTS } from '../utils/ganttSettings';
import './Settings.css';

const PRIMARY_BTN_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '8px',
  fontFamily: 'inherit',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  transition: 'background 0.15s ease',
  height: '42px',
  padding: '0 16px',
  color: 'white',
};

function PrimaryBtn({ children, className = '', disabled = false, ...props }) {
  const [hovered, setHovered] = useState(false);
  const bg = hovered && !disabled ? '#3B9F40' : '#297D2D';
  const smStyle = className.includes('btn-sm') ? { height: '34px', padding: '0 12px', fontSize: '13px' } : {};
  return (
    <button
      {...props}
      disabled={disabled}
      style={{ ...PRIMARY_BTN_BASE, ...smStyle, background: bg, opacity: disabled ? 0.6 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function GanttSettingsForm() {
  const [settings, setSettings] = useState(getGanttSettings);

  const handleManDaysChange = (e) => {
    const v = parseFloat(e.target.value);
    const next = { ...settings, manDaysPerWeek: Number.isNaN(v) || v <= 0 ? GANTT_DEFAULTS.manDaysPerWeek : Math.max(0.5, v) };
    setSettings(next);
    saveGanttSettings(next);
  };

  const handleScaleChange = (e) => {
    const v = e.target.value;
    if (!['days', 'weeks', 'months'].includes(v)) return;
    const next = { ...settings, defaultTimeScale: v };
    setSettings(next);
    saveGanttSettings(next);
  };

  return (
    <div className="settings-form-grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 480 }}>
      <div className="settings-form-field">
        <label className="settings-label">Man-days per week</label>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={settings.manDaysPerWeek}
          onChange={handleManDaysChange}
          className="settings-input"
          aria-description="Available resource per week (e.g. 10 = 2 people full-time)"
        />
      </div>
      <div className="settings-form-field">
        <label className="settings-label">Default time scale</label>
        <select value={settings.defaultTimeScale} onChange={handleScaleChange} className="settings-select">
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
        </select>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [newSubfolderName, setNewSubfolderName] = useState('');

  const { data: projectsData } = useQuery('projects', api.projects.list);
  const projects = projectsData?.projects || [];

  const { data: subfoldersData } = useQuery(
    ['subfolders', selectedProjectId],
    () => api.subfolders.list(selectedProjectId),
    { enabled: !!selectedProjectId }
  );
  const subfolders = subfoldersData?.subfolders || [];

  const createProjectMutation = useMutation(api.projects.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('projects');
      setNewProjectName('');
    }
  });

  const createSubfolderMutation = useMutation(api.subfolders.create, {
    onSuccess: () => {
      queryClient.invalidateQueries(['subfolders', selectedProjectId]);
      setNewSubfolderName('');
    }
  });

  const [editingSubfolder, setEditingSubfolder] = useState(null);
  const updateSubfolderMutation = useMutation(
    ({ id, name }) => api.subfolders.update(id, { name }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['subfolders', selectedProjectId]);
        queryClient.invalidateQueries('backlog');
        queryClient.invalidateQueries('backlog-consolidated');
        setEditingSubfolder(null);
      }
    }
  );
  const deleteSubfolderMutation = useMutation(api.subfolders.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries(['subfolders', selectedProjectId]);
      queryClient.invalidateQueries('backlog');
      queryClient.invalidateQueries('backlog-consolidated');
    }
  });

  const [localColors, setLocalColors] = useState({});
  const updateProjectColorMutation = useMutation(
    ({ id, color }) => api.projects.update(id, { color }),
    {
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries('projects');
        queryClient.invalidateQueries(['backlog-consolidated']);
        setLocalColors((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  );
  const colorDebounceRef = useRef({});
  const handleProjectColorChange = useCallback((projectId, color) => {
    setLocalColors((prev) => ({ ...prev, [projectId]: color }));
    if (colorDebounceRef.current[projectId]) clearTimeout(colorDebounceRef.current[projectId]);
    colorDebounceRef.current[projectId] = setTimeout(() => {
      delete colorDebounceRef.current[projectId];
      updateProjectColorMutation.mutate({ id: projectId, color });
    }, 400);
  }, [updateProjectColorMutation]);
  const displayColor = useCallback((p) => localColors[p.id] ?? p.color ?? '#297D2D', [localColors]);

  const [editingProject, setEditingProject] = useState(null);
  const updateProjectNameMutation = useMutation(
    ({ id, name }) => api.projects.update(id, { name }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('projects');
        queryClient.invalidateQueries('backlog');
        queryClient.invalidateQueries('backlog-consolidated');
        setEditingProject(null);
      }
    }
  );
  const deleteProjectMutation = useMutation(api.projects.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('projects');
      queryClient.invalidateQueries(['subfolders', selectedProjectId]);
      queryClient.invalidateQueries('backlog');
      queryClient.invalidateQueries('backlog-consolidated');
    }
  });

  const isAdmin = user?.role === 'admin';

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-desc">Manage categories, sub-folders and users.</p>
      </div>

      <div className="settings-sections">
        {/* ── Categories ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" aria-hidden>🗂️</div>
            <div className="settings-section-heading">
              <h2 className="settings-section-title">Categories</h2>
              <p className="settings-section-desc">Add backlog categories and pick a colour for each. The colour appears on every item in that category.</p>
            </div>
          </div>
          <div className="settings-section-body">
            <form
              className="settings-form-inline"
              onSubmit={(e) => {
                e.preventDefault();
                if (newProjectName.trim()) createProjectMutation.mutate({ name: newProjectName.trim() });
              }}
            >
              <input
                type="text"
                placeholder="New category name…"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="settings-input"
              />
              <PrimaryBtn type="submit" disabled={!newProjectName.trim() || createProjectMutation.isLoading}>
                Add category
              </PrimaryBtn>
            </form>

            {projects.length > 0 && (
              <>
                <hr className="settings-divider" />
                <ul className="settings-colour-list">
                  {projects.map((p) => (
                    <li key={p.id} className="settings-colour-row settings-colour-row-with-actions">
                      <span className="settings-colour-swatch" style={{ background: displayColor(p) }} />
                      {editingProject?.id === p.id ? (
                        <div className="settings-colour-rename">
                          <input
                            type="text"
                            className="settings-input settings-colour-rename-input"
                            value={editingProject.name}
                            onChange={(e) => setEditingProject((prev) => prev ? { ...prev, name: e.target.value } : null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingProject.name.trim()) {
                                updateProjectNameMutation.mutate({ id: p.id, name: editingProject.name.trim() });
                              }
                              if (e.key === 'Escape') setEditingProject(null);
                            }}
                            autoFocus
                          />
                          <PrimaryBtn
                            type="button"
                            className="btn-sm"
                            disabled={!editingProject.name.trim() || updateProjectNameMutation.isLoading}
                            onClick={() => editingProject.name.trim() && updateProjectNameMutation.mutate({ id: p.id, name: editingProject.name.trim() })}
                          >
                            Save
                          </PrimaryBtn>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingProject(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="settings-colour-name">{p.name}</span>
                      )}
                      <input
                        type="color"
                        value={displayColor(p)}
                        onChange={(e) => handleProjectColorChange(p.id, e.target.value)}
                        className="settings-colour-picker"
                        aria-label={`Colour for ${p.name}`}
                      />
                      {editingProject?.id !== p.id && (
                        <div className="settings-colour-row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingProject({ id: p.id, name: p.name })}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (window.confirm(`Delete category "${p.name}"? Sub-folders will be removed. You can only delete if all items are re-assigned to other categories.`)) {
                                deleteProjectMutation.mutate(p.id);
                              }
                            }}
                            disabled={deleteProjectMutation.isLoading}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {deleteProjectMutation.isError && deleteProjectMutation.variables === p.id && (
                        <span className="settings-error settings-colour-delete-error">
                          {deleteProjectMutation.error?.data?.error || deleteProjectMutation.error?.message}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {projects.length === 0 && (
              <p className="settings-list-empty">No categories yet — add one above.</p>
            )}
          </div>
        </section>

        {/* ── Sub-folders ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" aria-hidden>📁</div>
            <div className="settings-section-heading">
              <h2 className="settings-section-title">Sub-folders</h2>
              <p className="settings-section-desc">Organise items inside a category with sub-tabs. Select a category first, then add a sub-folder.</p>
            </div>
          </div>
          <div className="settings-section-body">
            <div className="settings-form-inline">
              <select
                value={selectedProjectId ?? ''}
                onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                className="settings-select"
              >
                <option value="">Select category…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="New sub-folder name…"
                value={newSubfolderName}
                onChange={(e) => setNewSubfolderName(e.target.value)}
                className="settings-input"
                disabled={!selectedProjectId}
              />
              <PrimaryBtn
                type="button"
                disabled={!selectedProjectId || !newSubfolderName.trim() || createSubfolderMutation.isLoading}
                onClick={() => {
                  if (selectedProjectId && newSubfolderName.trim()) {
                    createSubfolderMutation.mutate({ project_id: selectedProjectId, name: newSubfolderName.trim() });
                  }
                }}
              >
                Add sub-folder
              </PrimaryBtn>
            </div>

            {selectedProjectId && (
              <ul className="settings-list settings-list-subfolders">
                {subfolders.map((sf) => (
                  <li key={sf.id} className="settings-list-item settings-list-item-with-actions">
                    {editingSubfolder?.id === sf.id ? (
                      <div className="settings-subfolder-edit">
                        <input
                          type="text"
                          className="settings-input settings-subfolder-edit-input"
                          value={editingSubfolder.name}
                          onChange={(e) => setEditingSubfolder((s) => s ? { ...s, name: e.target.value } : null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (editingSubfolder.name.trim()) updateSubfolderMutation.mutate({ id: sf.id, name: editingSubfolder.name.trim() });
                            }
                            if (e.key === 'Escape') setEditingSubfolder(null);
                          }}
                          autoFocus
                        />
                        <PrimaryBtn
                          type="button"
                          className="btn-sm"
                          disabled={!editingSubfolder.name.trim() || updateSubfolderMutation.isLoading}
                          onClick={() => editingSubfolder.name.trim() && updateSubfolderMutation.mutate({ id: sf.id, name: editingSubfolder.name.trim() })}
                        >
                          Save
                        </PrimaryBtn>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingSubfolder(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="settings-list-item-label">{sf.name}</span>
                        <div className="settings-list-item-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingSubfolder({ id: sf.id, name: sf.name })}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (window.confirm(`Delete sub-folder "${sf.name}"? You can only delete if all items are re-assigned.`)) {
                                deleteSubfolderMutation.mutate(sf.id);
                              }
                            }}
                            disabled={deleteSubfolderMutation.isLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                    {deleteSubfolderMutation.isError && deleteSubfolderMutation.variables === sf.id && (
                      <span className="settings-error settings-list-item-error">
                        {deleteSubfolderMutation.error?.data?.error || deleteSubfolderMutation.error?.message}
                      </span>
                    )}
                  </li>
                ))}
                {subfolders.length === 0 && <li className="settings-list-empty">No sub-folders yet.</li>}
              </ul>
            )}
          </div>
        </section>

        {/* ── Gantt settings ── */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon" aria-hidden>📊</div>
            <div className="settings-section-heading">
              <h2 className="settings-section-title">Gantt settings</h2>
              <p className="settings-section-desc">Configure the Gantt chart: how many man-days per week are available for scheduling, and the default time scale (days, weeks, or months). You can also change the scale from the chart.</p>
            </div>
          </div>
          <div className="settings-section-body">
            <GanttSettingsForm />
          </div>
        </section>

        {/* ── Email (admin only) ── */}
        {isAdmin && (
          <section className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon" aria-hidden>✉️</div>
              <div className="settings-section-heading">
                <h2 className="settings-section-title">Daily work list email</h2>
                <p className="settings-section-desc">Send the day's work list to a list of recipients at a set time. Choose what to include: next best actions (Now + due in 48h + 75%+ complete), Now only, or Now & Next.</p>
              </div>
            </div>
            <div className="settings-section-body">
              <EmailConfigPanel />
            </div>
          </section>
        )}

        {/* ── Users (admin only) ── */}
        {isAdmin && (
          <section className="settings-section">
            <div className="settings-section-header">
              <div className="settings-section-icon" aria-hidden>👥</div>
              <div className="settings-section-heading">
                <h2 className="settings-section-title">Users with access</h2>
                <p className="settings-section-desc">Manage who can log in to the platform. Create new users, edit their details, or reset passwords.</p>
              </div>
            </div>
            <div className="settings-section-body">
              <UserCreateForm onSuccess={() => queryClient.invalidateQueries('users')} />
              <hr className="settings-divider" />
              <UsersTable />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const EMAIL_CONTENT_OPTIONS = [
  { value: 'next_best_actions', label: 'Next best actions (Now + due in 48h + 75%+ complete)' },
  { value: 'now_only', label: 'Now only' },
  { value: 'now_and_soon', label: 'Now & Next' }
];

function EmailConfigPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery('email-config', api.emailConfig.get, { staleTime: 30 * 1000 });
  const [recipients, setRecipients] = useState([]);
  const [contentType, setContentType] = useState('next_best_actions');
  const [sendTime, setSendTime] = useState('09:00');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  React.useEffect(() => {
    if (!config) return;
    setRecipients(Array.isArray(config.recipients) ? config.recipients.map((r) => ({ email: r.email || '', name: r.name || '' })) : []);
    setContentType(config.content_type || 'next_best_actions');
    setSendTime(config.send_time || '09:00');
  }, [config]);

  const updateMutation = useMutation(api.emailConfig.update, {
    onSuccess: () => queryClient.invalidateQueries('email-config')
  });
  const sendNowMutation = useMutation(api.emailConfig.sendNow, {
    onSuccess: () => queryClient.invalidateQueries('email-config')
  });

  const handleSave = (e) => {
    e.preventDefault();
    updateMutation.mutate({ recipients, content_type: contentType, send_time: sendTime });
  };

  const handleSendNow = () => {
    updateMutation.mutate(
      { recipients, content_type: contentType, send_time: sendTime },
      {
        onSuccess: () => {
          sendNowMutation.mutate();
        }
      }
    );
  };

  const addRecipient = () => {
    const email = (newEmail || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setRecipients((prev) => [...prev, { email, name: (newName || '').trim() || null }]);
    setNewEmail('');
    setNewName('');
  };

  const removeRecipient = (index) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) return <p className="settings-loading">Loading email config…</p>;

  return (
    <>
      <div className="settings-form-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <div className="settings-form-field">
          <label className="settings-label">Content to send</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="settings-select">
            {EMAIL_CONTENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-form-field">
          <label className="settings-label">Send time (daily)</label>
          <input
            type="time"
            value={sendTime}
            onChange={(e) => setSendTime(e.target.value)}
            className="settings-input"
          />
        </div>
        <div className="settings-form-field" style={{ alignSelf: 'end' }}>
          <PrimaryBtn type="button" onClick={(e) => { e.preventDefault(); handleSave(e); }} disabled={updateMutation.isLoading}>
            Save config
          </PrimaryBtn>
        </div>
      </div>

      <div className="settings-form-field" style={{ marginTop: 'var(--space-4)' }}>
        <label className="settings-label">Recipients</label>
        <div className="settings-form-inline" style={{ marginBottom: 'var(--space-2)' }}>
          <input
            type="email"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="settings-input"
            style={{ maxWidth: 220 }}
          />
          <input
            type="text"
            placeholder="Name (optional, for greeting)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="settings-input"
            style={{ maxWidth: 180 }}
          />
          <PrimaryBtn type="button" onClick={addRecipient}>Add</PrimaryBtn>
        </div>
        <ul className="settings-list settings-list-subfolders">
          {recipients.map((r, i) => (
            <li key={i} className="settings-list-item settings-list-item-with-actions">
              <span className="settings-list-item-label">{r.name ? `${r.name} <${r.email}>` : r.email}</span>
              <div className="settings-list-item-actions">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRecipient(i)}>Remove</button>
              </div>
            </li>
          ))}
          {recipients.length === 0 && <li className="settings-list-empty">No recipients. Add emails above and save.</li>}
        </ul>
      </div>

      <hr className="settings-divider" />

      <div className="settings-form-field">
        <PrimaryBtn
          type="button"
          onClick={handleSendNow}
          disabled={recipients.length === 0 || updateMutation.isLoading || sendNowMutation.isLoading}
        >
          {updateMutation.isLoading || sendNowMutation.isLoading ? 'Sending…' : 'Send now'}
        </PrimaryBtn>
        {sendNowMutation.isSuccess && (
          <span className="settings-success" style={{ marginLeft: 'var(--space-2)' }}>
            Sent to {sendNowMutation.data?.sent ?? 0} recipient(s).
          </span>
        )}
        {sendNowMutation.isError && (
          <span className="settings-error" style={{ marginLeft: 'var(--space-2)' }}>
            {sendNowMutation.error?.data?.error || sendNowMutation.error?.message}
          </span>
        )}
      </div>
    </>
  );
}

function UserCreateForm({ onSuccess }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('member');

  const createMutation = useMutation(
    (body) => api.auth.createUser(body),
    {
      onSuccess: () => {
        setUsername('');
        setPassword('');
        setDisplayName('');
        setRole('member');
        queryClient.invalidateQueries('users');
        onSuccess?.();
      }
    }
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (username.trim() && password) {
          createMutation.mutate({ username: username.trim(), password, display_name: displayName.trim() || undefined, role });
        }
      }}
    >
      <div className="settings-form-grid">
        <div className="settings-form-field">
          <label className="settings-label">Username</label>
          <input
            type="text"
            placeholder="e.g. jsmith"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="settings-input"
            required
          />
        </div>
        <div className="settings-form-field">
          <label className="settings-label">Password</label>
          <input
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="settings-input"
            required
            minLength={6}
          />
        </div>
        <div className="settings-form-field">
          <label className="settings-label">Display name</label>
          <input
            type="text"
            placeholder="e.g. Jane Smith"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="settings-input"
          />
        </div>
        <div className="settings-form-field">
          <label className="settings-label">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="settings-select">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="settings-form-field settings-form-field--span2">
          <PrimaryBtn type="submit" disabled={!username.trim() || !password || createMutation.isLoading}>
            Create user
          </PrimaryBtn>
          {createMutation.isError && (
            <span className="settings-error">{createMutation.error?.data?.error || createMutation.error.message}</span>
          )}
        </div>
      </div>
    </form>
  );
}

function UsersTable() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery('users', api.auth.listUsers);
  const users = data?.users || [];
  const [editUser, setEditUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);

  if (isLoading) return <p className="settings-loading">Loading users…</p>;
  if (users.length === 0) return <p className="settings-list-empty">No users yet. Create one above.</p>;

  return (
    <>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Created</th>
              <th className="settings-table-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="settings-user-cell">
                    <div className="settings-user-avatar">{getInitials(u.display_name || u.username)}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.display_name || u.username}</div>
                      {u.display_name && <div style={{ fontSize: 12, color: 'var(--path-grey-600)' }}>{u.username}</div>}
                    </div>
                  </div>
                </td>
                <td><span className={`settings-role settings-role-${u.role}`}>{u.role}</span></td>
                <td style={{ color: 'var(--path-grey-600)', fontSize: 13 }}>{formatDate(u.created_at)}</td>
                <td className="settings-table-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditUser(u)}>Edit</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResetUser(u)}>Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { queryClient.invalidateQueries('users'); setEditUser(null); }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => setResetUser(null)}
        />
      )}
    </>
  );
}

function EditUserModal({ user, onClose, onSaved }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [role, setRole] = useState(user?.role ?? 'member');

  const updateMutation = useMutation(
    (body) => api.auth.updateUser(user.id, body),
    { onSuccess: onSaved }
  );

  return (
    <div className="settings-modal-backdrop" onClick={onClose} role="presentation">
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">Edit user</h3>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate({ username: username.trim(), display_name: displayName.trim() || undefined, role });
          }}
        >
          <div className="settings-modal-body">
            <div className="settings-form-field">
              <label className="settings-label">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="settings-input"
                required
              />
            </div>
            <div className="settings-form-field">
              <label className="settings-label">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="settings-input"
                placeholder="Optional"
              />
            </div>
            <div className="settings-form-field">
              <label className="settings-label">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="settings-select">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {updateMutation.isError && (
              <span className="settings-error">{updateMutation.error?.data?.error || updateMutation.error.message}</span>
            )}
          </div>
          <div className="settings-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <PrimaryBtn type="submit" disabled={updateMutation.isLoading}>Save changes</PrimaryBtn>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const resetMutation = useMutation(
    () => api.auth.resetUserPassword(user.id, password),
    { onSuccess: onDone }
  );

  const valid = password.length >= 6 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="settings-modal-backdrop" onClick={onClose} role="presentation">
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">Reset password</h3>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="settings-modal-desc">Set a new password for <strong>{user?.display_name || user?.username}</strong>.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) resetMutation.mutate();
          }}
        >
          <div className="settings-modal-body">
            <div className="settings-form-field">
              <label className="settings-label">New password (min 6 characters)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="settings-input"
                placeholder="New password"
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            <div className="settings-form-field">
              <label className="settings-label">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="settings-input"
                placeholder="Confirm"
                autoComplete="new-password"
                style={mismatch ? { borderColor: 'var(--path-secondary)' } : {}}
              />
              {mismatch && <span className="settings-error">Passwords don't match</span>}
            </div>
            {resetMutation.isError && (
              <span className="settings-error">{resetMutation.error?.data?.error || resetMutation.error.message}</span>
            )}
          </div>
          <div className="settings-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <PrimaryBtn type="submit" disabled={!valid || resetMutation.isLoading}>Reset password</PrimaryBtn>
          </div>
        </form>
      </div>
    </div>
  );
}
