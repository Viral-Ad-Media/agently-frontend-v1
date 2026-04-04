import {
  AgentConfig,
  BusinessProfile,
  ChatMessage,
  ChatbotConfig,
  DashboardData,
  FAQ,
  Lead,
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

  async createLead(payload: Pick<Lead, 'name' | 'email' | 'phone' | 'reason'> & { status?: Lead['status'] }) {
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

  async inviteMember(email: string, role: Extract<UserRole, 'Admin' | 'Viewer'>) {
    return request<{ member: User }>(
      '/api/team/invitations',
      {
        method: 'POST',
        body: { email, role },
      },
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