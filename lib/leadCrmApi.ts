import { getSessionToken } from '../services/session';
import type {
  LeadActivity,
  LeadCrmDetail,
  LeadCrmRecord,
  LeadCrmSummary,
  LeadPipelineStage,
  LeadSourceOption,
  LeadTask,
} from '../types/lead-crm';

type QueryValue = string | number | boolean | null | undefined;

const resolveDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  if (!import.meta.env.DEV || !isLocalHost) return '';
  return import.meta.env.VITE_API_PROXY_TARGET || 'http://localhost:4000';
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveDefaultApiBaseUrl()).replace(/\/$/, '');
const API_BASE = `${API_BASE_URL}/api/leads-crm`;

function toQuery(params: Record<string, QueryValue> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

async function crmFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline) throw new Error('You are currently not connected to the internet. Please connect to the internet and try again.');
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `CRM request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function listCrmStages(params: Record<string, QueryValue> = {}) {
  return crmFetch<{ stages: LeadPipelineStage[] }>(`/stages${toQuery(params)}`);
}

export async function getCrmSummary(params: Record<string, QueryValue> = {}) {
  return crmFetch<LeadCrmSummary>(`/summary${toQuery(params)}`);
}

export async function listCrmLeads(params: Record<string, QueryValue> = {}) {
  return crmFetch<{ leads: LeadCrmRecord[]; count: number; page?: number; limit?: number; offset?: number; hasMore?: boolean }>(`${toQuery(params)}`);
}

export async function listCrmSources(params: Record<string, QueryValue> = {}) {
  return crmFetch<{ sources: LeadSourceOption[] }>(`/sources${toQuery(params)}`);
}

export async function exportCrmLeads(params: Record<string, QueryValue> = {}) {
  const token = getSessionToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}/export.csv${toQuery(params)}`, {
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || payload?.message || `CRM export failed: ${response.status}`);
  }
  return response.blob();
}

export async function getCrmLead(leadId: string, params: Record<string, QueryValue> = {}) {
  return crmFetch<LeadCrmDetail>(`/${leadId}${toQuery(params)}`);
}

export async function updateCrmLead(leadId: string, patch: Partial<LeadCrmRecord> & { activity_note?: string }) {
  return crmFetch<{ lead: LeadCrmRecord }>(`/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}


export async function bulkUpdateCrmLeads(leadIds: string[], patch: Partial<LeadCrmRecord> & { activity_note?: string }) {
  return crmFetch<{ leads: LeadCrmRecord[]; count: number }>(`/bulk`, {
    method: 'PATCH',
    body: JSON.stringify({ lead_ids: leadIds, patch }),
  });
}

export async function addLeadNote(leadId: string, body: string, title = 'Internal note') {
  return crmFetch<{ activity: LeadActivity }>(`/${leadId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
}

export async function addLeadTask(leadId: string, task: Partial<LeadTask> & { title: string }) {
  return crmFetch<{ task: LeadTask }>(`/${leadId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(task),
  });
}

export async function updateLeadTask(taskId: string, patch: Partial<LeadTask>) {
  return crmFetch<{ task: LeadTask }>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function refreshLeadAiScore(leadId: string) {
  return crmFetch<{ lead: LeadCrmRecord; scoring: unknown }>(`/${leadId}/ai-refresh`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
