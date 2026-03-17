import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuth } from '../App';
import { api } from '../api';
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
                    <li key={p.id} className="settings-colour-row">
                      <span className="settings-colour-swatch" style={{ background: displayColor(p) }} />
                      <span className="settings-colour-name">{p.name}</span>
                      <input
                        type="color"
                        value={displayColor(p)}
                        onChange={(e) => handleProjectColorChange(p.id, e.target.value)}
                        className="settings-colour-picker"
                        aria-label={`Colour for ${p.name}`}
                      />
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
                              if (window.confirm(`Delete sub-folder "${sf.name}"? Items in it will stay in the category with no sub-folder.`)) {
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
                  </li>
                ))}
                {subfolders.length === 0 && <li className="settings-list-empty">No sub-folders yet.</li>}
              </ul>
            )}
          </div>
        </section>

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
