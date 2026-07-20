import {
  AgentConfig,
  BusinessProfile,
  ChatMessage,
  ChatbotConfig,
  DashboardData,
  FAQ,
  Lead,
  LeadOutreachSchedule,
  KnowledgeBase,
  KnowledgeSource,
  Organization,
  User,
  UserRole,
  WorkspaceSettings,
  WorkspaceBootstrap,
} from '../types';
import { getSessionToken } from './session';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  status: number;
  details: unknown;
  code: string;
  retryable: boolean;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details ?? null;
    const record = details && typeof details === 'object' && !Array.isArray(details)
      ? details as Record<string, unknown>
      : {};
    this.code = String(record.code || '');
    this.retryable = record.retryable === true;
  }
}

const resolveDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  if (!import.meta.env.DEV || !isLocalHost) return '';
  return import.meta.env.VITE_API_PROXY_TARGET || 'http://localhost:4000';
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveDefaultApiBaseUrl()).replace(/\/$/, '');

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

export const NETWORK_OFFLINE_MESSAGE = 'You are currently not connected to the internet. Please connect to the internet and try again.';
export const REQUEST_TIMEOUT_MESSAGE = 'Agently could not reach its data service in time. Your session is still valid; please retry.';

const REQUEST_TIMEOUT_MS = Math.max(5000, Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000));

const notifyAuthExpired = (message: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('agently:auth-expired', {
    detail: { message },
  }));
};

const emitWalletRefresh = (payload?: unknown) => {
  if (typeof window === 'undefined') return;
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, any>
    : {};
  const candidates = [
    record.walletBalanceUsd,
    record.balanceUsd,
    record.billing?.walletBalanceUsd,
    record.wallet?.balanceUsd,
  ];
  const balanceUsd = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value));
  window.dispatchEvent(new CustomEvent('agently:wallet-refresh', {
    detail: Number.isFinite(balanceUsd) ? { balanceUsd } : {},
  }));
};

const isNetworkError = (error: unknown) => {
  const message = String((error as { message?: unknown })?.message || error || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('internet') ||
    message.includes('offline')
  );
};

const request = async <T>(path: string, options: {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
  responseType?: 'json' | 'blob' | 'text';
} = {}): Promise<T> => {
  const {
    method = 'GET',
    body,
    auth = true,
    responseType = 'json',
  } = options;

  const headers = new Headers();
  if (body != null) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getSessionToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new ApiError(REQUEST_TIMEOUT_MESSAGE, 0, error);
    }
    if (isNetworkError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new ApiError(NETWORK_OFFLINE_MESSAGE, 0, error);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorPayload: { error?: { message?: string; details?: unknown; code?: string; retryable?: boolean } } | null = null;

    try {
      errorPayload = await response.json() as { error?: { message?: string; details?: unknown; code?: string; retryable?: boolean } };
    } catch {
      errorPayload = null;
    }

    const message = errorPayload?.error?.message || `Request failed with status ${response.status}`;
    if (auth && response.status === 401) notifyAuthExpired(message);

    throw new ApiError(
      message,
      response.status,
      errorPayload?.error || null,
    );
  }

  if (responseType === 'blob') {
    return await response.blob() as T;
  }

  if (responseType === 'text') {
    return await response.text() as T;
  }

  if (response.status === 204) {
    if (auth && method !== 'GET') emitWalletRefresh();
    return null as T;
  }

  const payload = await response.json() as T;
  if (auth && method !== 'GET') emitWalletRefresh(payload);
  return payload;
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

type AuthResponse = {
  token: string;
  user: User;
  organization?: Organization;
};

type MagicLinkResponse = {
  message: string;
  email: string;
  magicLinkToken: string;
  verifyEndpoint: string;
  magicLinkUrl?: string | null;
};

type PasswordResetRequestResponse = {
  message: string;
  email: string;
  resetUrl?: string | null;
};

type MessengerResponse = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  conversation: ChatMessage[];
};

type LeadExportDownload = Promise<void>;

export const api = {
  async login(email: string, password: string) {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
  },

  async register(payload: { name: string; companyName: string; email: string; password: string }) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: payload,
    });
  },

  async sendMagicLink(email: string) {
    return request<MagicLinkResponse>('/api/auth/magic-link', {
      method: 'POST',
      auth: false,
      body: { email },
    });
  },

  async verifyMagicLink(token: string) {
    return request<AuthResponse>('/api/auth/magic-link/verify', {
      method: 'POST',
      auth: false,
      body: { token },
    });
  },

  async requestPasswordReset(email: string) {
    return request<PasswordResetRequestResponse>('/api/auth/password-reset/request', {
      method: 'POST',
      auth: false,
      body: { email },
    });
  },

  async confirmPasswordReset(token: string, password: string) {
    return request<{ success: boolean; message: string }>('/api/auth/password-reset/confirm', {
      method: 'POST',
      auth: false,
      body: { token, password },
    });
  },

  async logout() {
    return request<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async bootstrap() {
    return request<WorkspaceBootstrap>('/api/bootstrap');
  },

  async listKnowledgeBases() {
    const response = await request<{ knowledgeBases: KnowledgeBase[] }>('/api/knowledge-bases');
    return response.knowledgeBases;
  },

  async searchKnowledgeBase(id: string, query = "", limit = 12) {
    return request<{
      query: string;
      knowledgeBaseId: string;
      chunks: Array<Record<string, unknown>>;
      faqs: FAQ[];
      stats: { chunks: number; faqs: number };
    }>(`/api/knowledge-bases/${id}/search`, {
      method: 'POST',
      body: { query, limit },
    });
  },

  async listKnowledgeBaseFaqs(id: string) {
    return request<{
      knowledgeBaseId: string;
      faqs: FAQ[];
      manualFaqs: FAQ[];
    }>(`/api/knowledge-bases/${id}/faqs`);
  },

  async replaceKnowledgeBaseFaqs(
    id: string,
    faqs: FAQ[],
    options: { chatbotId?: string; voiceAgentId?: string } = {},
  ) {
    return request<{
      success: boolean;
      knowledgeBaseId: string;
      faqs: FAQ[];
      manualFaqs: FAQ[];
    }>(`/api/knowledge-bases/${id}/faqs`, {
      method: 'PUT',
      body: {
        faqs,
        chatbotId: options.chatbotId,
        chatbot_id: options.chatbotId,
        voiceAgentId: options.voiceAgentId,
        voice_agent_id: options.voiceAgentId,
      },
    });
  },

  async createKnowledgeBase(payload: {
    name?: string;
    businessName?: string;
    website: string;
    description?: string;
    industry?: string;
    isPrimary?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    const response = await request<{ knowledgeBase: KnowledgeBase }>('/api/knowledge-bases', {
      method: 'POST',
      body: payload,
    });
    return response.knowledgeBase;
  },

  async updateKnowledgeBase(id: string, updates: Partial<KnowledgeBase> & { website?: string }) {
    const response = await request<{ knowledgeBase: KnowledgeBase }>(`/api/knowledge-bases/${id}`, {
      method: 'PATCH',
      body: updates,
    });
    return response.knowledgeBase;
  },

  async getKnowledgeBaseDeleteCheck(id: string) {
    return request<{
      knowledgeBase: KnowledgeBase;
      canDelete: boolean;
      blockerCount: number;
      blockers: {
        voiceAgents: Array<{ id: string; name: string; type?: string; assignmentType?: string }>;
        chatbots: Array<{ id: string; name: string; type?: string; assignmentType?: string }>;
      };
      cleanup: { sources: number; chunks: number; products: number; faqs: number };
    }>(`/api/knowledge-bases/${id}/delete-check`);
  },

  async deleteKnowledgeBase(id: string) {
    return request<{
      success: boolean;
      deletedId?: string;
      cleanup?: { sources: number; chunks: number; products: number; faqs: number };
      replacementPrimaryKnowledgeBaseId?: string | null;
    }>(`/api/knowledge-bases/${id}`, {
      method: 'DELETE',
    });
  },

  async addKnowledgeSource(knowledgeBaseId: string, payload: {
    url: string;
    title?: string;
    isPrimary?: boolean;
  }) {
    const response = await request<{ source: KnowledgeSource }>(`/api/knowledge-bases/${knowledgeBaseId}/sources`, {
      method: 'POST',
      body: payload,
    });
    return response.source;
  },

  async updateKnowledgeSource(knowledgeBaseId: string, sourceId: string, updates: {
    url?: string;
    title?: string;
    isPrimary?: boolean;
    scrapeStatus?: string;
    metadata?: Record<string, unknown>;
  }) {
    const response = await request<{ source: KnowledgeSource }>(`/api/knowledge-bases/${knowledgeBaseId}/sources/${sourceId}`, {
      method: 'PATCH',
      body: updates,
    });
    return response.source;
  },

  async deleteKnowledgeSource(knowledgeBaseId: string, sourceId: string) {
    return request<{ success: boolean }>(`/api/knowledge-bases/${knowledgeBaseId}/sources/${sourceId}`, {
      method: 'DELETE',
    });
  },

  async syncKnowledgeSource(
    knowledgeBaseId: string,
    sourceId: string,
    options: { background?: boolean } = {},
  ) {
    return request<{
      success: boolean;
      accepted?: boolean;
      background?: boolean;
      message?: string;
      chunksStored?: number;
      pagesScraped?: number;
      pagesDiscovered?: number;
      productsFound?: number;
      productsStored?: number;
      scrapeReport?: Record<string, unknown> | null;
      strategy?: string;
      source: KnowledgeSource;
    }>(`/api/knowledge-bases/${knowledgeBaseId}/sources/${sourceId}/sync`, {
      method: 'POST',
      body: options,
    });
  },

  async assignVoiceAgentKnowledgeBase(knowledgeBaseId: string, voiceAgentId: string) {
    return request<{ success: boolean; knowledgeBase: KnowledgeBase }>(`/api/knowledge-bases/${knowledgeBaseId}/voice-agents/${voiceAgentId}`, {
      method: 'PUT',
      body: {},
    });
  },

  async assignChatbotKnowledgeBase(knowledgeBaseId: string, chatbotId: string) {
    return request<{ success: boolean; knowledgeBase: KnowledgeBase }>(`/api/knowledge-bases/${knowledgeBaseId}/chatbots/${chatbotId}`, {
      method: 'PUT',
      body: {},
    });
  },

  async generateOnboardingFaqs(website: string) {
    const response = await request<{ website: string; faqs: FAQ[] }>('/api/onboarding/faqs', {
      method: 'POST',
      body: { website },
    });
    return response.faqs;
  },

  async completeOnboarding(profile: BusinessProfile, agent: AgentConfig) {
    return request<Organization>('/api/onboarding/complete', {
      method: 'POST',
      body: { profile, agent },
    });
  },

  async updateAgent(updates: Partial<AgentConfig>) {
    return request<AgentConfig>('/api/agent', {
      method: 'PATCH',
      body: updates,
    });
  },

  async listVoiceAgents() {
    // GET /api/voice-agents — returns the fresh agent list straight from the DB.
    // Used by the Leads page dropdown so newly-created agents appear without a full reload.
    return request<AgentConfig[]>('/api/voice-agents');
  },

  async createVoiceAgent(payload: Partial<AgentConfig> = {}) {
    return request<AgentConfig>('/api/voice-agents', {
      method: 'POST',
      body: {
        ...payload,
        isActive: true,
        is_active: true,
      },
    });
  },

  async updateVoiceAgent(id: string, updates: Partial<AgentConfig>) {
    return request<AgentConfig>(`/api/voice-agents/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async activateVoiceAgent(id: string) {
    return request<AgentConfig>(`/api/voice-agents/${id}/activate`, {
      method: 'POST',
      body: {},
    });
  },

  async deleteVoiceAgent(id: string) {
    return request<{ success: boolean }>(`/api/voice-agents/${id}`, {
      method: 'DELETE',
    });
  },

  async createFaq(question: string, answer: string, voiceAgentId?: string, knowledgeBaseId?: string) {
    return request<FAQ>('/api/agent/faqs', {
      method: 'POST',
      body: {
        question,
        answer,
        voiceAgentId,
        voice_agent_id: voiceAgentId,
        knowledgeBaseId,
        knowledge_base_id: knowledgeBaseId,
      },
    });
  },

  async updateFaq(id: string, updates: Partial<FAQ>, voiceAgentId?: string, knowledgeBaseId?: string) {
    return request<FAQ>(`/api/agent/faqs/${id}`, {
      method: 'PATCH',
      body: {
        ...updates,
        voiceAgentId,
        voice_agent_id: voiceAgentId,
        knowledgeBaseId,
        knowledge_base_id: knowledgeBaseId,
      },
    });
  },

  async removeFaq(id: string, voiceAgentId?: string, knowledgeBaseId?: string) {
    const params = new URLSearchParams();
    if (voiceAgentId) params.set('voiceAgentId', voiceAgentId);
    if (knowledgeBaseId) params.set('knowledgeBaseId', knowledgeBaseId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ success: boolean }>(`/api/agent/faqs/${id}${suffix}`, {
      method: 'DELETE',
    });
  },

  async syncFaqs(website?: string, voiceAgentId?: string, knowledgeBaseId?: string) {
    const response = await request<{ website: string; faqs: FAQ[] }>('/api/agent/faqs/sync', {
      method: 'POST',
      body: {
        website,
        voiceAgentId,
        voice_agent_id: voiceAgentId,
        knowledgeBaseId,
        knowledge_base_id: knowledgeBaseId,
      },
    });
    return response.faqs;
  },

  // ==================== NEW METHOD ====================
  async importChatbotWebsite(chatbotId: string, website: string) {
    return request<{ success: boolean; faqs: any[]; chunksStored: number; strategy: string; message: string }>(
      `/api/chatbots/${chatbotId}/import-website`,
      { method: 'POST', body: { website } }
    );
  },

  async importVoiceAgentKnowledge(agentId: string, website: string) {
    return request<{ success: boolean; chunksStored: number; strategy: string; message: string }>(
      `/api/voice-agents/${agentId}/import-knowledge`,
      { method: 'POST', body: { website } }
    );
  },
  // ====================================================

  async restartAgent() {
    return request<{ success: boolean; message: string; restartedAt: string }>('/api/agent/restart', {
      method: 'POST',
      body: {},
    });
  },

  async createChatbot(payload: Partial<ChatbotConfig> = {}) {
    return request<ChatbotConfig>('/api/chatbots', {
      method: 'POST',
      body: payload,
    });
  },

  async updateChatbot(id: string, updates: Partial<ChatbotConfig>) {
    return request<ChatbotConfig>(`/api/chatbots/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async activateChatbot(id: string) {
    return request<ChatbotConfig>(`/api/chatbots/${id}/activate`, {
      method: 'POST',
      body: {},
    });
  },

  async deleteChatbot(id: string) {
    return request<{ success: boolean }>(`/api/chatbots/${id}`, {
      method: 'DELETE',
    });
  },

  async getChatbotEmbed(id: string) {
    return request<{ chatbot: ChatbotConfig; script: string }>(`/api/chatbots/${id}/embed`);
  },

  async sendMessengerMessage(message: string, chatbotId?: string) {
    return request<MessengerResponse>('/api/messenger/messages', {
      method: 'POST',
      body: chatbotId ? { message, chatbotId } : { message },
    });
  },

  async resetMessenger(chatbotId?: string) {
    return request<{ success: boolean; conversation: ChatMessage[] }>('/api/messenger/messages', {
      method: 'DELETE',
      body: chatbotId ? { chatbotId } : {},
    });
  },

  async simulateCall(payload: {
    transcript: string;
    duration: number;
    outcome?: string;
    callerName?: string;
    callerPhone?: string;
    lead?: Partial<Lead>;
  }) {
    return request<{ call: unknown; lead?: Lead | null }>('/api/calls/simulate', {
      method: 'POST',
      body: payload,
    });
  },

  async getTestAgentStatus() {
    return request<any>('/api/test-agent/status');
  },

  async updateTestAgentConfig(payload: Record<string, unknown>) {
    return request<any>('/api/test-agent/config', {
      method: 'PATCH',
      body: payload,
    });
  },

  async callNowWithTestAgent(payload: Record<string, unknown>) {
    return request<any>('/api/test-agent/call-now', {
      method: 'POST',
      body: payload,
    });
  },

  async scheduleTestAgentCall(payload: Record<string, unknown>) {
    return request<any>('/api/test-agent/schedule', {
      method: 'POST',
      body: payload,
    });
  },

  async listTestAgentEvents() {
    return request<any>('/api/test-agent/events');
  },

  async updateLead(id: string, updates: Partial<Lead>) {
    return request<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async listLeads(params: { page?: number; limit?: number; search?: string; status?: string; source?: string; tag?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        qs.set(key, String(value));
      }
    });
    const query = qs.toString();
    return request<{
      success?: boolean;
      leads: Lead[];
      page?: number;
      limit?: number;
      total?: number;
      metrics?: {
        total?: number;
        new?: number;
        contacted?: number;
        closed?: number;
        callLeads?: number;
        chatbotLeads?: number;
        manualLeads?: number;
        converted?: number;
        conversionRate?: number;
      };
    }>(`/api/leads${query ? `?${query}` : ''}`);
  },

  async createLead(payload: Pick<Lead, 'name' | 'email' | 'phone' | 'reason'> & { status?: Lead['status']; tags?: string[]; voiceAgentId?: string; assignmentContext?: string }) {
    return request<Lead>('/api/leads', {
      method: 'POST',
      body: payload,
    });
  },

  async exportLeadsCsv(): LeadExportDownload {
    const blob = await request<Blob>('/api/leads/export.csv', {
      responseType: 'blob',
    });
    triggerDownload(blob, 'agently-leads.csv');
  },

  async importLeadsCsv(csv: string) {
    return request<{ success: boolean; imported: number; total: number }>('/api/leads/import-csv', {
      method: 'POST',
      body: { csv },
    });
  },

  async bulkTagLeads(ids: string[], tags: string[], action: 'add' | 'remove' | 'set' = 'add') {
    return request<{ success: boolean; leads: Lead[] }>('/api/leads/bulk/tags', {
      method: 'PATCH',
      body: { ids, tags, action },
    });
  },

  async bulkAssignLeadAgent(ids: string[], voiceAgentId: string) {
    return request<{ success: boolean; updated: number; leads: Lead[] }>('/api/leads/bulk/assign-agent', {
      method: 'PATCH',
      body: { ids, voiceAgentId },
    });
  },

  async assignLeadAgentByTag(tag: string, voiceAgentId: string) {
    return request<{ success: boolean; updated: number; leads: Lead[] }>('/api/leads/bulk/assign-agent-by-tag', {
      method: 'PATCH',
      body: { tag, voiceAgentId },
    });
  },

  async listLeadSchedules() {
    return request<{ schedules: LeadOutreachSchedule[] }>('/api/leads/schedules');
  },

  async createLeadSchedule(payload: {
    name?: string;
    targetType: 'lead' | 'tag';
    leadIds?: string[];
    tag?: string;
    voiceAgentId: string;
    windows: { weekdays: string[]; time: string }[];
    timezone?: string;
    extraContext?: string;
    syncExistingLeads?: boolean;
  }) {
    return request<{ schedules: LeadOutreachSchedule[] }>('/api/leads/schedules', {
      method: 'POST',
      body: payload,
    });
  },

  async updateLeadSchedule(id: string, updates: Partial<LeadOutreachSchedule>) {
    return request<{ schedule: LeadOutreachSchedule }>(`/api/leads/schedules/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async deleteLeadSchedule(id: string) {
    return request<{ success: boolean }>(`/api/leads/schedules/${id}`, {
      method: 'DELETE',
    });
  },

  async listOutreachSchedules() {
    const response = await request<{ schedules?: unknown[]; data?: unknown[]; results?: unknown[]; items?: unknown[] }>('/api/outreach/schedules');
    const raw = response.schedules || response.data || response.results || response.items || [];
    return { schedules: Array.isArray(raw) ? raw : [] };
  },

  async updateOutreachSchedule(id: string, updates: Record<string, unknown>) {
    return request<{ schedule?: unknown; success?: boolean }>(`/api/outreach/schedules/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async deleteOutreachSchedule(id: string) {
    try {
      return await request<{ success: boolean }>(`/api/outreach/schedules/${id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      return request<{ success: boolean }>(`/api/call-schedules/${id}`, {
        method: 'DELETE',
      });
    }
  },

  async deleteLead(id: string) {
    return request<{ success: boolean }>(`/api/leads/${id}`, { method: 'DELETE' });
  },

  async bulkDeleteLeads(ids: string[]) {
    return request<{ success: boolean; deleted: number }>('/api/leads/bulk', {
      method: 'DELETE',
      body: { ids },
    });
  },


  async getTeamMembers() {
    return request('/api/team/members');
  },

  async updateTeamMemberRole(id: string, role: Extract<UserRole, 'Admin' | 'Viewer'>) {
    return request<{ member: User }>(`/api/team/members/${id}/role`, {
      method: 'PATCH',
      body: { role },
    });
  },
  async inviteMember(email: string, role: Extract<UserRole, 'Admin' | 'Viewer'>, name?: string) {
    return request<{ member: User }>(
      '/api/team/invitations',
      { method: 'POST', body: { email, role, name } },
    );
  },

  async removeMember(id: string) {
    return request<{ success: boolean }>(`/api/team/members/${id}`, {
      method: 'DELETE',
    });
  },

  async getBillingSummary() {
    return request('/api/billing/summary');
  },

  async demoTopUpWallet(amountUsd = 30) {
    return request('/api/billing/wallet/demo-top-up', {
      method: 'POST',
      body: { amountUsd },
    });
  },

  async updatePlan(plan: Extract<Organization['subscription']['plan'], 'Starter' | 'Pro'>) {
    return request<Organization['subscription']>('/api/billing/plan', {
      method: 'PATCH',
      body: { plan },
    });
  },

  async cancelPlan() {
    return request<Organization['subscription']>('/api/billing/cancel', {
      method: 'POST',
      body: {},
    });
  },

  async downloadInvoice(invoiceId: string) {
    const blob = await request<Blob>(`/api/billing/invoices/${invoiceId}/download`, {
      responseType: 'blob',
    });
    triggerDownload(blob, `${invoiceId}.txt`);
  },

  async downloadCallReport(callId: string) {
    const blob = await request<Blob>(`/api/calls/${callId}/report`, {
      responseType: 'blob',
    });
    triggerDownload(blob, `${callId}-report.txt`);
  },

  async getSettings() {
    return request<WorkspaceSettings>('/api/settings');
  },

  async updateSettings(settings: {
    timezone?: string;
    phoneNumber?: string;
    twilio?: {
      accountSid?: string;
      authToken?: string;
      validateRequests?: boolean;
      clearCredentials?: boolean;
    };
  }) {
    return request<WorkspaceSettings>('/api/settings', {
      method: 'PATCH',
      body: settings,
    });
  },


  async requestOrganizationDeletion(payload: { organizationName: string; acknowledgeNoRefund: boolean }) {
    return request<{ success: boolean; deletionRequested: boolean; scheduledDeletionAt: string }>(
      '/api/organization/delete-request',
      { method: 'POST', body: payload },
    );
  },

  async submitContact(payload: { name: string; email: string; subject: string; message: string }) {
    return request<{ success: boolean; message: string }>('/api/contact', {
      method: 'POST',
      auth: false,
      body: payload,
    });
  },

  async submitContactSales(payload: { name: string; email: string; companyName: string; expectedVolume?: string; message?: string }) {
    return request<{ success: boolean; message: string }>('/api/contact-sales', {
      method: 'POST',
      body: payload,
    });
  },
};
// ─────────────────────────────────────────────────────────────
// Twilio Phone Number Management  (appended)
// ─────────────────────────────────────────────────────────────
export const twilioApi = {
  async listCountries() {
    return request<{ countries: import('../types').PhoneCountry[] }>(
      '/api/twilio/numbers/countries',
    );
  },

  async searchNumbers(params: {
    country: string;
    type?: string;
    areaCode?: string;
    contains?: string;
    limit?: number;
  }) {
    return request<{ numbers: import('../types').AvailablePhoneNumber[] }>(
      '/api/twilio/numbers/search',
      {
        method: 'POST',
        body: {
          country: params.country,
          type: params.type || 'Local',
          areaCode: params.areaCode || undefined,
          contains: params.contains || undefined,
          limit: params.limit || undefined,
          requiresVoice: true,
          requiresSms: false,
          showAdvancedRestrictedNumbers: false,
        },
      },
    );
  },

  async listOwned() {
    return request<{ numbers: import('../types').OwnedPhoneNumber[] }>(
      '/api/twilio/numbers/owned',
    );
  },

  async purchaseNumber(phoneNumber: string, voiceAgentId?: string) {
    return request<{
      success: boolean;
      phoneNumber: string;
      phoneSid: string;
      agentId: string;
    }>('/api/twilio/numbers/purchase', {
      method: 'POST',
      body: { phoneNumber, voiceAgentId },
    });
  },

  async assignNumber(
    phoneSid: string,
    phoneNumber: string,
    voiceAgentId?: string,
  ) {
    return request('/api/twilio/numbers/assign', {
      method: 'POST',
      body: { phoneSid, phoneNumber, voiceAgentId },
    });
  },

  async releaseNumber(sid: string) {
    return request(`/api/twilio/numbers/${encodeURIComponent(sid)}`, {
      method: 'DELETE',
    });
  },

  async getBilling() {
    return request<{ billing: import('../types').TwilioBilling }>(
      '/api/twilio/billing',
    );
  },

  async makeCall(toPhone: string, voiceAgentId?: string) {
    return request<{ success: boolean; callSid: string; status: string }>(
      '/api/twilio/outbound',
      { method: 'POST', body: { toPhone, voiceAgentId } },
    );
  },

  async verifyNumberStart(
    phoneNumber: string,
    voiceAgentId?: string,
    retryAttempt = 1,
  ) {
    return request<{
      callSid: string;
      validationCode: string;
      phoneNumber: string;
      attempt: number;
      instructions: string;
    }>('/api/twilio/numbers/verify-start', {
      method: 'POST',
      body: { phoneNumber, voiceAgentId, retryAttempt },
    });
  },

  async verifyNumberStatus(callSid: string) {
    return request<{
      status: string;
      phoneNumber: string;
      callSid: string;
      attempts: number;
      agentId: string | null;
      canReceiveInbound: boolean;
      message: string | null;
    }>(`/api/twilio/numbers/verify-status?callSid=${encodeURIComponent(callSid)}`);
  },

  async verifyNumberSmsStart(phoneNumber: string) {
    return request<{ success: boolean; phoneNumber: string; message: string }>(
      '/api/twilio/numbers/verify-sms-start',
      { method: 'POST', body: { phoneNumber } },
    );
  },

  async verifyNumberSmsConfirm(
    phoneNumber: string,
    otp: string,
    voiceAgentId?: string,
  ) {
    return request<{
      success: boolean;
      phoneNumber: string;
      agentId: string | null;
      canReceiveInbound: boolean;
      message: string;
    }>('/api/twilio/numbers/verify-sms-confirm', {
      method: 'POST',
      body: { phoneNumber, otp, voiceAgentId },
    });
  },
};
