'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function getTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const access = localStorage.getItem('accessToken');
  const refresh = localStorage.getItem('refreshToken');
  if (!access || !refresh) return null;
  return { accessToken: access, refreshToken: refresh };
}

function setTokens(tokens: Tokens) {
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = await res.json();
    setTokens(data);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (tokens) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && tokens) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      headers['Authorization'] = `Bearer ${newAccess}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  return res;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  const tokens = getTokens();
  if (tokens) {
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.accessToken}`,
      },
    }).catch(() => {});
  }
  clearTokens();
}

export function getUser(): { id: string; email: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isAuthenticated(): boolean {
  return !!getTokens();
}

// ─── ERP API helpers ─────────────────────────────────────────

export const workflowApi = {
  enter: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/enter`, { method: 'POST' }),
  get: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}`),
  getTimeline: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/timeline`),
  updateStage: (tenderId: string, stage: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    }),
  reject: (tenderId: string, rejectionReason: string, failedAtStage: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason, failedAtStage }),
    }),
  summary: () => apiFetch('/workflow/summary'),
  list: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params || {}).toString();
    return apiFetch(`/workflow/tenders?${qs}`);
  },
};

export const stageApi = {
  assign: (tenderId: string, stage: string, assignedUserId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/stages/${stage}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ assignedUserId }),
    }),
  updateStatus: (tenderId: string, stage: string, status: string, completionNote?: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/stages/${stage}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, completionNote }),
    }),
  getStages: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/stages`),
  myAssignments: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params || {}).toString();
    return apiFetch(`/workflow/my-assignments?${qs}`);
  },
};

export const notesApi = {
  add: (tenderId: string, noteText: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ noteText }),
    }),
  list: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/notes`),
};

export const activityApi = {
  tender: (tenderId: string) =>
    apiFetch(`/workflow/tenders/${tenderId}/activity`),
  me: () => apiFetch('/activity/me'),
  user: (userId: string) => apiFetch(`/activity/users/${userId}`),
  all: (page?: number) => apiFetch(`/activity/all?page=${page || 1}`),
};

export const dashboardApi = {
  me: () => apiFetch('/dashboard/me'),
  activityFeed: (scope: 'my' | 'all', limit?: number) =>
    apiFetch(`/dashboard/activity?scope=${scope}&limit=${limit || 20}`),
  adminOverview: () => apiFetch('/dashboard/admin/overview'),
  adminExtras: () => apiFetch('/dashboard/admin/extras'),
  adminUser: (userId: string) => apiFetch(`/dashboard/admin/users/${userId}`),
};

export const productivityApi = {
  me: (days?: number) => apiFetch(`/productivity/me?days=${days || 30}`),
  user: (userId: string, days?: number) =>
    apiFetch(`/productivity/users/${userId}?days=${days || 30}`),
  leaderboard: (days?: number) =>
    apiFetch(`/productivity/leaderboard?days=${days || 7}`),
  rules: () => apiFetch('/productivity/rules'),
  updateRule: (id: string, scoreValue: number, isActive: boolean) =>
    apiFetch(`/productivity/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scoreValue, isActive }),
    }),
};

export const reportingApi = {
  run: (reportType: string) =>
    apiFetch('/reports/run', {
      method: 'POST',
      body: JSON.stringify({ reportType }),
    }),
  runs: (page?: number) => apiFetch(`/reports/runs?page=${page || 1}`),
  runDetail: (id: string) => apiFetch(`/reports/runs/${id}`),
  subscriptions: () => apiFetch('/reports/subscriptions'),
  addSubscription: (reportType: string, recipientEmail: string) =>
    apiFetch('/reports/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ reportType, recipientEmail }),
    }),
  removeSubscription: (id: string) =>
    apiFetch(`/reports/subscriptions/${id}`, { method: 'DELETE' }),
};

// ─── Users & Profiles API ────────────────────────────────────

export const usersApi = {
  list: () => apiFetch('/auth/admin/users'),
  toggleActive: (userId: string) =>
    apiFetch(`/auth/admin/users/${userId}/toggle-active`, { method: 'POST' }),
  getProfile: (userId: string) =>
    apiFetch(`/auth/admin/users/${userId}/profile`),
  updateProfile: (userId: string, data: { fullName?: string; designation?: string; teamName?: string }) =>
    apiFetch(`/auth/admin/users/${userId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getMyProfile: () => apiFetch('/auth/profile/me'),
  updateMyProfile: (data: { fullName?: string; designation?: string; teamName?: string }) =>
    apiFetch('/auth/profile/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export { API_URL };