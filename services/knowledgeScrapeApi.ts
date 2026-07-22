/**
 * agently/services/knowledgeScrapeApi.ts   <-- NEW FILE
 * PATCH 23 — client for the new scraper flow (PATCH 21).
 */

import { getSessionToken } from './session';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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
    const err: any = new Error(body?.error?.message || 'Request failed.');
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

export const knowledgeScrapeApi = {
  discover: (payload: {
    website: string;
    knowledgeBaseId?: string | null;
    duringOnboarding?: boolean;
    maxPages?: number;
  }) =>
    call<{
      discoveryId: string;
      rootUrl: string;
      domain: string;
      totalPagesFound: number;
      method: string;
      estimatedFullScanUsd: number;
      onboardingMessage: string | null;
      pages: Array<{ url: string; title: string; isSelected: boolean }>;
    }>('/discover', { method: 'POST', body: JSON.stringify(payload) }),

  listPages: (discoveryId: string) =>
    call<{
      discovery: { id: string; rootUrl: string; domain: string; totalPagesFound: number };
      totalPages: number;
      selectedCount: number;
      estimatedSelectedUsd: number;
      estimatedAllUsd: number;
      creditWarning: string;
      pages: DiscoveredPage[];
    }>(`/discoveries/${discoveryId}/pages`),

  setSelection: (
    discoveryId: string,
    payload: { pageIds?: string[]; selectAll?: boolean; selectNone?: boolean },
  ) =>
    call<{ selectedCount: number; estimatedUsd: number }>(
      `/discoveries/${discoveryId}/selection`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),

  startJob: (payload: { knowledgeBaseId: string; discoveryId: string }) =>
    call<{ job: { id: string }; estimatedUsd: number; message: string }>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** Cheap tick. Returns ONLY job + page rows — never the whole KB list. */
  getJob: (jobId: string) =>
    call<{ job: ScrapeJob; pages: DiscoveredPage[] }>(`/jobs/${jobId}`),

  control: (jobId: string, action: 'pause' | 'resume' | 'cancel') =>
    call<{ status: string; message: string; warning: string | null }>(
      `/jobs/${jobId}/${action}`,
      { method: 'POST' },
    ),

  listChanges: (knowledgeBaseId: string) =>
    call<{ changes: Array<{ id: string; url: string; changeType: string; detectedAt: string }>; count: number }>(
      `/knowledge-bases/${knowledgeBaseId}/changes`,
    ),

  resyncChanges: (knowledgeBaseId: string, changeIds?: string[]) =>
    call<{ queued: number; jobId: string; message: string }>(
      `/knowledge-bases/${knowledgeBaseId}/changes/resync`,
      { method: 'POST', body: JSON.stringify({ changeIds }) },
    ),

  setMonitoring: (
    knowledgeBaseId: string,
    payload: { enabled?: boolean; mode?: 'notify_only' | 'auto_rescrape'; intervalHours?: number },
  ) =>
    call<{ monitoring: { enabled: boolean; mode: string; intervalHours: number } }>(
      `/knowledge-bases/${knowledgeBaseId}/monitoring`,
      { method: 'PUT', body: JSON.stringify(payload) },
    ),
};

export default knowledgeScrapeApi;
