import {
  AgentConfig,
  BusinessProfile,
  ChatMessage,
  ChatbotConfig,
  DashboardData,
  FAQ,
  Lead,
  LeadOutreachSchedule,
  Organization,
  User,
  UserRole,
  WorkspaceSettings,
  WorkspaceBootstrap,
} from '../types';
import { getSessionToken } from './session';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details ?? null;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

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

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorPayload: { error?: { message?: string; details?: unknown } } | null = null;

    try {
      errorPayload = await response.json() as { error?: { message?: string; details?: unknown } };
    } catch {
      errorPayload = null;
    }

    throw new ApiError(
      errorPayload?.error?.message || `Request failed with status ${response.status}`,
      response.status,
      errorPayload?.error?.details,
    );
  }

  if (responseType === 'blob') {
    return await response.blob() as T;
  }

  if (responseType === 'text') {
    return await response.text() as T;
  }

  if (response.status === 204) {
    return null as T;
  }

  return await response.json() as T;
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

  async logout() {
    return request<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async bootstrap() {
    return request<WorkspaceBootstrap>('/api/bootstrap');
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
      body: payload,
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

  async createFaq(question: string, answer: string) {
    return request<FAQ>('/api/agent/faqs', {
      method: 'POST',
      body: { question, answer },
    });
  },

  async updateFaq(id: string, updates: Partial<FAQ>) {
    return request<FAQ>(`/api/agent/faqs/${id}`, {
      method: 'PATCH',
      body: updates,
    });
  },

  async removeFaq(id: string) {
    return request<{ success: boolean }>(`/api/agent/faqs/${id}`, {
      method: 'DELETE',
    });
  },

  async syncFaqs(website?: string) {
    const response = await request<{ website: string; faqs: FAQ[] }>('/api/agent/faqs/sync', {
      method: 'POST',
      body: { website },
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

  async updateLead(id: string, updates: Partial<Lead>) {
    return request<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: updates,
    });
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

  async deleteLead(id: string) {
    return request<{ success: boolean }>(`/api/leads/${id}`, { method: 'DELETE' });
  },

  async bulkDeleteLeads(ids: string[]) {
    return request<{ success: boolean; deleted: number }>('/api/leads/bulk', {
      method: 'DELETE',
      body: { ids },
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
  /** List countries where Twilio supports numbers */
  async listCountries() {
    const res = await fetch(
      `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api/twilio/numbers/countries`,
      { headers: { Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}` } }
    );
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Failed');
    return (await res.json()) as { countries: import('../types').PhoneCountry[] };
  },

  /** Search available phone numbers */
  async searchNumbers(params: { country: string; type?: string; areaCode?: string; contains?: string; limit?: number }) {
    const qs = new URLSearchParams({ country: params.country, type: params.type || 'Local' });
    if (params.areaCode) qs.set('areaCode', params.areaCode);
    if (params.contains) qs.set('contains', params.contains);
    if (params.limit) qs.set('limit', String(params.limit));
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/search?${qs}`, {
      headers: { Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}` }
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Search failed');
    return (await res.json()) as { numbers: import('../types').AvailablePhoneNumber[] };
  },

  /** List numbers already owned on the master account */
  async listOwned() {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/owned`, {
      headers: { Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}` }
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Failed');
    return (await res.json()) as { numbers: import('../types').OwnedPhoneNumber[] };
  },

  /** Purchase a new number and assign to a voice agent */
  async purchaseNumber(phoneNumber: string, voiceAgentId?: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}`
      },
      body: JSON.stringify({ phoneNumber, voiceAgentId }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Purchase failed');
    return res.json() as Promise<{ success: boolean; phoneNumber: string; phoneSid: string; agentId: string }>;
  },

  /** Assign an already-owned number to a voice agent */
  async assignNumber(phoneSid: string, phoneNumber: string, voiceAgentId?: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}`
      },
      body: JSON.stringify({ phoneSid, phoneNumber, voiceAgentId }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Assign failed');
    return res.json();
  },

  /** Release a number */
  async releaseNumber(sid: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/${sid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}` }
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Release failed');
    return res.json();
  },

  /** Get Twilio billing data for this month */
  async getBilling() {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/billing`, {
      headers: { Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}` }
    });
    if (!res.ok) throw new Error('Failed to fetch billing');
    return (await res.json()) as { billing: import('../types').TwilioBilling };
  },

  /** Initiate an outbound call */
  async makeCall(toPhone: string, voiceAgentId?: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}`
      },
      body: JSON.stringify({ toPhone, voiceAgentId }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Call failed');
    return res.json() as Promise<{ success: boolean; callSid: string; status: string }>;
  },

  /** Step 1: Start verification of an existing/user-owned number via Twilio Caller ID */
  async verifyNumberStart(phoneNumber: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/verify-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}`
      },
      body: JSON.stringify({ phoneNumber }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Verification start failed');
    return res.json() as Promise<{
      validationCode: string;
      callSid: string;
      phoneNumber: string;
      instructions: string;
    }>;
  },

  /** Step 2: Confirm verification is complete and save number to the agent */
  async verifyNumberComplete(phoneNumber: string, voiceAgentId?: string) {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/api/twilio/numbers/verify-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await import('./session')).getSessionToken() || ''}`
      },
      body: JSON.stringify({ phoneNumber, voiceAgentId }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || 'Verification failed');
    return res.json() as Promise<{
      success: boolean;
      phoneNumber: string;
      callerIdSid: string;
      agentId: string | null;
      message: string;
    }>;
  },
};
