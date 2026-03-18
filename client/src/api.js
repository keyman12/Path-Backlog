const BASE = '';

async function request(path, options = {}) {
  const url = BASE + path;
  const isGet = (options.method || 'GET').toUpperCase() === 'GET';
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    // Avoid browser cache for GET so list/order updates are visible after reorder
    ...(isGet ? { cache: 'no-store' } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = res.ok ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  auth: {
    login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/auth/me'),
    listUsers: () => request('/api/auth/users'),
    createUser: (body) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
    updateUser: (id, body) => request(`/api/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    resetUserPassword: (id, newPassword) =>
      request(`/api/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) })
  },
  projects: {
    list: () => request('/api/projects'),
    create: (body) => request('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/projects/${id}`, { method: 'DELETE' })
  },
  subfolders: {
    list: (projectId) => request(`/api/subfolders/project/${projectId}`),
    create: (body) => request('/api/subfolders', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/api/subfolders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/subfolders/${id}`, { method: 'DELETE' })
  },
  backlog: {
    list: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/backlog' + (q ? '?' + q : ''));
    },
    consolidated: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/backlog/consolidated' + (q ? '?' + q : ''));
    },
    consolidatedQueryString: (queryString) =>
      request('/api/backlog/consolidated' + (queryString ? '?' + queryString : '')),
    get: (id) => request(`/api/backlog/${id}`),
    create: (body) => request('/api/backlog', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/api/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    reopen: (id) => request(`/api/backlog/${id}/reopen`, { method: 'POST' }),
    delete: (id) => request(`/api/backlog/${id}`, { method: 'DELETE' }),
    reorder: (projectId, itemIds, priorityChanges) =>
      request('/api/backlog/reorder', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          item_ids: itemIds,
          ...(priorityChanges && Object.keys(priorityChanges).length > 0 ? { priority_changes: priorityChanges } : {})
        })
      })
  },
  workTickets: {
    list: (backlogItemId) => request(`/api/work-tickets/item/${backlogItemId}`),
    create: (body) => request('/api/work-tickets', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/api/work-tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/work-tickets/${id}`, { method: 'DELETE' })
  },
  reports: {
    summary: (params) => {
      const q = new URLSearchParams(params).toString();
      return request('/api/reports/summary' + (q ? '?' + q : ''));
    }
  },
  emailConfig: {
    get: () => request('/api/email-config'),
    update: (body) => request('/api/email-config', { method: 'PUT', body: JSON.stringify(body) }),
    sendNow: () => request('/api/email-config/send-now', { method: 'POST' })
  }
};
