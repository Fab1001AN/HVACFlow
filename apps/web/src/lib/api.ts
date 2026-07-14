/**
 * HVACFlow API Client
 *
 * Typed, centralized HTTP client. Reads the base URL from env.
 * Automatically attaches JWT, handles refresh, and provides
 * strongly-typed methods for every resource.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type RequestOptions = {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('hvacflow:access_token');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('hvacflow:access_token', accessToken);
  localStorage.setItem('hvacflow:refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('hvacflow:access_token');
  localStorage.removeItem('hvacflow:refresh_token');
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('hvacflow:refresh_token');
  if (!refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = await res.json();
  localStorage.setItem('hvacflow:access_token', data.accessToken);
  return data.accessToken;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const url = buildUrl(path, options?.params);
  let token = getToken();

  const makeRequest = async (authToken: string | null) =>
    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });

  let res = await makeRequest(token);

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      res = await makeRequest(newToken);
    } else {
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Authentication expired');
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(res.status, error.message ?? 'Request failed', error.details);
  }

  // Handle empty responses (204 No Content)
  if (res.status === 204) return undefined as T;

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Typed API methods ────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),

  // ─── Auth ────────────────────────────────────────────────────────────────
  auth: {
    login: (email: string, password: string) =>
      api.post<{ tokens: { accessToken: string; refreshToken: string }; user: any }>('/auth/login', { email, password }),
    me: () => api.get<any>('/auth/me'),
    logout: () => api.post('/auth/logout'),
  },

  // ─── Configuration ───────────────────────────────────────────────────────
  departments: {
    list: (params?: { isActive?: boolean }) => api.get<any[]>('/departments', { params }),
    get: (id: string) => api.get<any>(`/departments/${id}`),
    create: (body: any) => api.post<any>('/departments', body),
    update: (id: string, body: any) => api.patch<any>(`/departments/${id}`, body),
    reorder: (items: Array<{ id: string; sortOrder: number }>) =>
      api.patch<any[]>('/departments/reorder', { items }),
    delete: (id: string) => api.delete(`/departments/${id}`),
  },

  priorityLevels: {
    list: (params?: { isActive?: boolean }) => api.get<any[]>('/priority-levels', { params }),
    get: (id: string) => api.get<any>(`/priority-levels/${id}`),
    create: (body: any) => api.post<any>('/priority-levels', body),
    update: (id: string, body: any) => api.patch<any>(`/priority-levels/${id}`, body),
    reorder: (items: Array<{ id: string; sortOrder: number }>) =>
      api.patch<any[]>('/priority-levels/reorder', { items }),
    delete: (id: string) => api.delete(`/priority-levels/${id}`),
  },

  processDefinitions: {
    list: (params?: { departmentId?: string; isActive?: boolean }) =>
      api.get<any[]>('/process-definitions', { params }),
    get: (id: string) => api.get<any>(`/process-definitions/${id}`),
    create: (body: any) => api.post<any>('/process-definitions', body),
    update: (id: string, body: any) => api.patch<any>(`/process-definitions/${id}`, body),
    delete: (id: string) => api.delete(`/process-definitions/${id}`),
  },

  processRoutes: {
    list: (params: { unitTypeId?: string; partTypeId?: string }) =>
      api.get<any[]>('/process-routes', { params }),
    create: (body: any) => api.post<any>('/process-routes', body),
    update: (id: string, body: any) => api.patch<any>(`/process-routes/${id}`, body),
    reorder: (items: Array<{ id: string; sequenceOrder: number }>) =>
      api.patch('/process-routes/reorder', { items }),
    delete: (id: string) => api.delete(`/process-routes/${id}`),
  },

  unitTypes: {
    list: (params?: { isActive?: boolean }) => api.get<any[]>('/unit-types', { params }),
    get: (id: string) => api.get<any>(`/unit-types/${id}`),
    create: (body: any) => api.post<any>('/unit-types', body),
    update: (id: string, body: any) => api.patch<any>(`/unit-types/${id}`, body),
    getComposition: (unitTypeId: string) =>
      api.get<any[]>(`/unit-types/${unitTypeId}/composition`),
    addComposition: (unitTypeId: string, body: any) =>
      api.post<any>(`/unit-types/${unitTypeId}/composition`, body),
    updateComposition: (id: string, body: any) =>
      api.patch<any>(`/unit-types/composition/${id}`, body),
    deleteComposition: (id: string) => api.delete(`/unit-types/composition/${id}`),
  },

  partTypes: {
    list: (params?: { isActive?: boolean }) => api.get<any[]>('/part-types', { params }),
    get: (id: string) => api.get<any>(`/part-types/${id}`),
    create: (body: any) => api.post<any>('/part-types', body),
    update: (id: string, body: any) => api.patch<any>(`/part-types/${id}`, body),
  },

  machines: {
    list: (params?: { departmentId?: string; isActive?: boolean }) =>
      api.get<any[]>('/machines', { params }),
    create: (body: any) => api.post<any>('/machines', body),
    update: (id: string, body: any) => api.patch<any>(`/machines/${id}`, body),
    delete: (id: string) => api.delete(`/machines/${id}`),
  },

  checklists: {
    list: (params?: { processDefinitionId?: string }) =>
      api.get<any[]>('/checklist-templates', { params }),
    get: (id: string) => api.get<any>(`/checklist-templates/${id}`),
    create: (body: any) => api.post<any>('/checklist-templates', body),
    update: (id: string, body: any) => api.patch<any>(`/checklist-templates/${id}`, body),
    addItem: (templateId: string, body: any) =>
      api.post<any>(`/checklist-templates/${templateId}/items`, body),
    updateItem: (itemId: string, body: any) =>
      api.patch<any>(`/checklist-items/${itemId}`, body),
    deleteItem: (itemId: string) => api.delete(`/checklist-items/${itemId}`),
  },

  // ─── Hierarchy ───────────────────────────────────────────────────────────
  customers: {
    list: (params?: { search?: string; page?: number; pageSize?: number }) =>
      api.get<any>('/customers', { params }),
    get: (id: string) => api.get<any>(`/customers/${id}`),
    create: (body: any) => api.post<any>('/customers', body),
    update: (id: string, body: any) => api.patch<any>(`/customers/${id}`, body),
    delete: (id: string) => api.delete(`/customers/${id}`),
  },

  projects: {
    listByCustomer: (customerId: string, params?: any) =>
      api.get<any>(`/customers/${customerId}/projects`, { params }),
    get: (id: string) => api.get<any>(`/projects/${id}`),
    create: (customerId: string, body: any) =>
      api.post<any>(`/customers/${customerId}/projects`, body),
    update: (id: string, body: any) => api.patch<any>(`/projects/${id}`, body),
  },

  orders: {
    listByProject: (projectId: string, params?: any) =>
      api.get<any>(`/projects/${projectId}/orders`, { params }),
    get: (id: string) => api.get<any>(`/orders/${id}`),
    create: (projectId: string, body: any) =>
      api.post<any>(`/projects/${projectId}/orders`, body),
    update: (id: string, body: any) => api.patch<any>(`/orders/${id}`, body),
    confirm: (id: string) => api.post(`/orders/${id}/confirm`),
    cancel: (id: string) => api.post(`/orders/${id}/cancel`),
  },

  units: {
    list: (params?: any) => api.get<any>('/units', { params }),
    calendar: (params?: { from?: string; to?: string }) => api.get<any[]>('/units/calendar', { params }),
    directorSummary: () => api.get<any>('/units/director-summary'),
    listByOrder: (orderId: string, params?: any) =>
      api.get<any>(`/orders/${orderId}/units`, { params }),
    get: (id: string) => api.get<any>(`/units/${id}`),
    createDirect: (body: any) => api.post<any>('/units', body),
    create: (orderId: string, body: any) =>
      api.post<any>(`/orders/${orderId}/units`, body),
    update: (id: string, body: any) => api.patch<any>(`/units/${id}`, body),
    move: (id: string, body: { plannedStartDate: string; priorityPosition: number }) =>
      api.patch<any>(`/units/${id}/move`, body),
    addComment: (id: string, body: { message: string; isDelay?: boolean }) =>
      api.post<any>(`/units/${id}/comments`, body),
    getAllTasks: (id: string) => api.get<any[]>(`/units/${id}/tasks`),
  },

  parts: {
    listByUnit: (unitId: string, params?: any) =>
      api.get<any>(`/units/${unitId}/parts`, { params }),
    get: (id: string) => api.get<any>(`/parts/${id}`),
    create: (unitId: string, body: any) =>
      api.post<any>(`/units/${unitId}/parts`, body),
    update: (id: string, body: any) => api.patch<any>(`/parts/${id}`, body),
  },

  // ─── Production Tasks ────────────────────────────────────────────────────
  tasks: {
    list: (params?: any) => api.get<any>('/production-tasks', { params }),
    get: (id: string) => api.get<any>(`/production-tasks/${id}`),
    update: (id: string, body: any) => api.patch<any>(`/production-tasks/${id}`, body),
    start: (id: string, body?: any) => api.post<any>(`/production-tasks/${id}/start`, body ?? {}),
    complete: (id: string, body?: any) => api.post<any>(`/production-tasks/${id}/complete`, body ?? {}),
    verify: (id: string, body?: any) => api.post<any>(`/production-tasks/${id}/verify`, body ?? {}),
    hold: (id: string, note: string) => api.post<any>(`/production-tasks/${id}/hold`, { note }),
    resume: (id: string) => api.post<any>(`/production-tasks/${id}/resume`, {}),
    reject: (id: string, note: string) => api.post<any>(`/production-tasks/${id}/reject`, { note }),
    getHistory: (id: string) => api.get<any[]>(`/production-tasks/${id}/history`),
    toggleChecklist: (id: string, responseId: string, isChecked: boolean) =>
      api.patch<any>(`/production-tasks/${id}/checklist/${responseId}`, { isChecked }),
  },

  // ─── Mission Control ─────────────────────────────────────────────────────
  missionControl: {
    board: (params?: any) => api.get<any>('/mission-control/board', { params }),
    summary: () => api.get<any>('/mission-control/summary'),
  },

  // ─── Users & Roles ────────────────────────────────────────────────────────
  users: {
    list: (params?: any) => api.get<any[]>('/users', { params }),
    get: (id: string) => api.get<any>(`/users/${id}`),
    create: (body: any) => api.post<any>('/users', body),
    update: (id: string, body: any) => api.patch<any>(`/users/${id}`, body),
    setRoles: (id: string, roleIds: string[]) =>
      api.patch<any>(`/users/${id}/roles`, { roleIds }),
    setDepartments: (id: string, departments: any[]) =>
      api.patch<any>(`/users/${id}/departments`, { departments }),
    resetPassword: (id: string, newPassword: string) =>
      api.post(`/users/${id}/reset-password`, { newPassword }),
  },

  roles: {
    list: () => api.get<any[]>('/roles'),
    get: (id: string) => api.get<any>(`/roles/${id}`),
    create: (body: any) => api.post<any>('/roles', body),
    update: (id: string, body: any) => api.patch<any>(`/roles/${id}`, body),
    setPermissions: (id: string, permissionIds: string[]) =>
      api.patch<any>(`/roles/${id}/permissions`, { permissionIds }),
    delete: (id: string) => api.delete(`/roles/${id}`),
  },

  permissions: {
    list: () => api.get<any[]>('/permissions'),
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: {
    getPreferences: () => api.get<any>('/dashboard/preferences'),
    updatePreferences: (body: any) => api.patch<any>('/dashboard/preferences', body),
  },

  // ─── Reports ─────────────────────────────────────────────────────────────
  reports: {
    unitAuditTrail: (unitId: string) => api.get<any[]>(`/units/${unitId}/audit-trail`),
    partAuditTrail: (partId: string) => api.get<any[]>(`/parts/${partId}/audit-trail`),
  },
};
