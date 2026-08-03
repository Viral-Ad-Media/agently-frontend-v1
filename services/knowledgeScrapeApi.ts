/**
 * agently/services/knowledgeScrapeApi.ts   <-- NEW FILE
 * PATCH 23 — client for the new scraper flow (PATCH 21).
 */

import { getSessionToken } from './session';
import { apiBaseUrl } from './api';
import { humanizeApiError } from '../lib/apiErrors';

/**
 * NOTE ON THE TYPES BELOW
 * Every method carries an EXPLICIT return annotation and every response shape
 * is a named exported interface. The first version relied on inference through
 * a generic `call<T>()`, which some editors collapse to `{}` — producing
 * "Property 'scrapeStatus' does not exist on type '{}'" in consuming files even
 * though `tsc` itself was happy. Naming the shapes removes the ambiguity.
 */

/*
 * Reuses api.ts's resolved base rather than reading the env var again.
 *
 * This file previously did `(import.meta as any)?.env?.VITE_API_BASE_URL`.
 * Vite replaces the LITERAL string `import.meta.env.VITE_API_BASE_URL` at
 * build time; the optional-chained form is not that literal, so it was never
 * substituted and evaluated to undefined in production. The base became '' and
 * every request went to the frontend domain, where Vercel's static host
 * answers a POST with 405 - which is exactly the error you saw on
 * /api/knowledge-scrape/discover and .../monitoring.
 */
const API_BASE_URL = apiBaseUrl;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge-scrape${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getSessionToken() || ''}`,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(
      body?.error?.message ||
        humanizeApiError({ status: res.status, code: body?.error?.code }),
    );
    err.status = res.status;
    err.code = body?.error?.code;
    err.details = body?.error?.details;
    throw err;
  }
  return body as T;
}

export interface DiscoveredPage {
  id: string;
  url: string;
  title: string;
  path: string;
  depth: number;
  priorityScore: number;
  isSelected: boolean;
  scrapeStatus: 'pending' | 'queued' | 'scraping' | 'completed' | 'failed' | 'skipped';
  scrapeProgress: number;
  chunksCreated?: number;
  faqsCreated?: number;
  lastScrapedAt?: string | null;
  lastError?: string | null;
}

export interface ScrapeJob {
  id: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  jobType: string;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  progressPercent: number;
  currentPageUrl: string | null;
  estimatedUsd: number;
  consumedUsd: number;
  lastError: string | null;
}

export interface DiscoverResponse {
  discoveryId: string;
  rootUrl: string;
  domain: string;
  totalPagesFound: number;
  candidatePagesFound?: number;
  truncated?: boolean;
  maxPages?: number;
  method: string;
  estimatedFullScanUsd: number;
  onboardingMessage: string | null;
  pages: Array<{ url: string; title: string; isSelected: boolean }>;
}

export interface DiscoverySummary {
  id: string;
  rootUrl: string;
  domain: string;
  totalPagesFound: number;
}

export interface ListPagesResponse {
  discovery: DiscoverySummary;
  totalPages: number;
  selectedCount: number;
  estimatedSelectedUsd: number;
  estimatedAllUsd: number;
  creditWarning: string;
  pages: DiscoveredPage[];
}

export interface SelectionResponse {
  selectedCount: number;
  estimatedUsd: number;
}

export interface StartJobResponse {
  job: { id: string };
  estimatedUsd: number;
  message: string;
}

export interface JobStatusResponse {
  job: ScrapeJob;
  pages: DiscoveredPage[];
}

export interface ActiveJobResponse {
  job: {
    id: string;
    status: 'queued' | 'running' | 'paused';
    discoveryId: string | null;
  } | null;
}

export interface JobControlResponse {
  status: string;
  message: string;
  warning: string | null;
}

export interface ChangeEvent {
  id: string;
  url: string;
  changeType: string;
  detectedAt: string;
}

export interface ListChangesResponse {
  changes: ChangeEvent[];
  count: number;
}

export interface ResyncResponse {
  queued: number;
  jobId: string;
  message: string;
}

export interface MonitoringResponse {
  monitoring: { enabled: boolean; mode: string; intervalHours: number };
}

export const knowledgeScrapeApi = {
  discover: (payload: {
    website: string;
    knowledgeBaseId?: string | null;
    duringOnboarding?: boolean;
    maxPages?: number;
  }): Promise<DiscoverResponse> =>
    call<DiscoverResponse>('/discover', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listPages: (discoveryId: string): Promise<ListPagesResponse> =>
    call<ListPagesResponse>(`/discoveries/${discoveryId}/pages`),

  setSelection: (
    discoveryId: string,
    payload: { pageIds?: string[]; selectAll?: boolean; selectNone?: boolean },
  ): Promise<SelectionResponse> =>
    call<SelectionResponse>(`/discoveries/${discoveryId}/selection`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  startJob: (payload: {
    knowledgeBaseId: string;
    discoveryId: string;
  }): Promise<StartJobResponse> =>
    call<StartJobResponse>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getActiveJob: (knowledgeBaseId: string): Promise<ActiveJobResponse> =>
    call<ActiveJobResponse>(
      `/knowledge-bases/${knowledgeBaseId}/active-job`,
    ),

  /** Cheap tick. Returns ONLY job + page rows — never the whole KB list. */
  getJob: (jobId: string): Promise<JobStatusResponse> =>
    call<JobStatusResponse>(`/jobs/${jobId}`),

  control: (
    jobId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<JobControlResponse> =>
    call<JobControlResponse>(`/jobs/${jobId}/${action}`, { method: 'POST' }),

  listChanges: (knowledgeBaseId: string): Promise<ListChangesResponse> =>
    call<ListChangesResponse>(`/knowledge-bases/${knowledgeBaseId}/changes`),

  resyncChanges: (
    knowledgeBaseId: string,
    changeIds?: string[],
  ): Promise<ResyncResponse> =>
    call<ResyncResponse>(`/knowledge-bases/${knowledgeBaseId}/changes/resync`, {
      method: 'POST',
      body: JSON.stringify({ changeIds }),
    }),

  setMonitoring: (
    knowledgeBaseId: string,
    payload: {
      enabled?: boolean;
      mode?: 'notify_only' | 'auto_rescrape';
      intervalHours?: number;
    },
  ): Promise<MonitoringResponse> =>
    call<MonitoringResponse>(
      `/knowledge-bases/${knowledgeBaseId}/monitoring`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),
};

export default knowledgeScrapeApi;
