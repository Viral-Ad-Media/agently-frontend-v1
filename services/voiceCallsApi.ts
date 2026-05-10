import { getSessionToken } from './session';

export type VoiceProvider = 'openai' | 'elevenlabs';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type VoiceRequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
  responseType?: 'json' | 'blob' | 'text';
};

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
};

export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  use_speaker_boost?: boolean;
};

export type AgentVoiceConfig = {
  voice_provider?: VoiceProvider;
  voice_id?: string;
  elevenlabs_voice_id?: string;
  elevenlabs_voice_name?: string;
  voice_settings?: VoiceSettings;
};

export type TestVoicePayload = AgentVoiceConfig & {
  text: string;
};

export type TestVoiceResult = {
  audioUrl?: string;
  blob?: Blob;
  raw?: unknown;
};

export type KnowledgeContext = {
  use_knowledge_base?: boolean;
  enabled?: boolean;
  sources?: unknown[];
  chunks?: unknown[];
  [key: string]: unknown;
};

export type PreviewVoiceContextPayload = {
  callDirection: 'inbound' | 'outbound';
  userUtterance?: string;
  callPurposeOverride?: string;
  directRecipient?: {
    name?: string;
    phone?: string;
  };
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

class VoiceApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'VoiceApiError';
    this.status = status;
    this.details = details ?? null;
  }
}

const authHeaders = (includeJson = false) => {
  const headers = new Headers();
  if (includeJson) headers.set('Content-Type', 'application/json');
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
};

const request = async <T>(path: string, options: VoiceRequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, auth = true, responseType = 'json' } = options;
  const headers = auth ? authHeaders(body != null) : new Headers(body != null ? { 'Content-Type': 'application/json' } : undefined);

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let details: unknown = null;
    try {
      const payload = await response.json() as { error?: { message?: string; details?: unknown }; message?: string };
      message = payload.error?.message || payload.message || message;
      details = payload.error?.details ?? payload;
    } catch {
      details = null;
    }
    throw new VoiceApiError(message, response.status, details);
  }

  if (response.status === 204) return null as T;
  if (responseType === 'blob') return await response.blob() as T;
  if (responseType === 'text') return await response.text() as T;
  return await response.json() as T;
};

const normalizeAudioResult = async (response: Response): Promise<TestVoiceResult> => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
    return { blob: await response.blob() };
  }

  if (contentType.includes('application/json')) {
    const raw = await response.json() as Record<string, unknown>;
    const audioUrl =
      (raw.audioUrl as string | undefined) ||
      (raw.audio_url as string | undefined) ||
      (raw.url as string | undefined) ||
      (raw.previewUrl as string | undefined) ||
      (raw.preview_url as string | undefined);
    return { audioUrl, raw };
  }

  const text = await response.text();
  return { raw: text };
};

const postForAudio = async (path: string, body: unknown): Promise<TestVoiceResult> => {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json() as { error?: { message?: string }; message?: string };
      message = payload.error?.message || payload.message || message;
    } catch {
      // Keep generic message.
    }
    throw new VoiceApiError(message, response.status);
  }

  return normalizeAudioResult(response);
};

export const voiceCallsApi = {
  async getElevenLabsVoices() {
    return request<{ voices: ElevenLabsVoice[] }>('/api/elevenlabs/voices');
  },

  async getElevenLabsVoiceSettings(voiceId: string) {
    return request<VoiceSettings>(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}/settings`);
  },

  async getAgentVoiceConfig(agentId: string) {
    return request<AgentVoiceConfig>(`/api/agents/${encodeURIComponent(agentId)}/voice-config`);
  },

  async updateAgentVoiceConfig(agentId: string, payload: AgentVoiceConfig) {
    return request<AgentVoiceConfig>(`/api/agents/${encodeURIComponent(agentId)}/voice-config`, {
      method: 'PATCH',
      body: payload,
    });
  },

  async testAgentVoice(agentId: string, payload: TestVoicePayload) {
    return postForAudio(`/api/agents/${encodeURIComponent(agentId)}/test-voice`, payload);
  },

  async getAgentKnowledgeContext(agentId: string) {
    return request<KnowledgeContext>(`/api/agents/${encodeURIComponent(agentId)}/knowledge-context`);
  },

  async updateAgentKnowledgeSettings(agentId: string, payload: { use_knowledge_base: boolean }) {
    return request<KnowledgeContext>(`/api/agents/${encodeURIComponent(agentId)}/knowledge-settings`, {
      method: 'PATCH',
      body: payload,
    });
  },

  async previewAgentVoiceContext(agentId: string, payload: PreviewVoiceContextPayload) {
    return request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/voice-context/preview`, {
      method: 'POST',
      body: payload,
    });
  },

  // Prepared for Phase 2. Do not wire into UI in Phase 1.
  phoneNumbers: {
    syncOwnedTwilioNumbers: () => request('/api/twilio/numbers/sync-owned', { method: 'POST', body: {} }),
    getTwilioNumbers: () => request('/api/twilio/numbers'),
    getOwnedTwilioNumbers: () => request('/api/twilio/owned-numbers'),
    searchAvailableTwilioNumbers: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') qs.set(key, String(value));
      });
      return request(`/api/twilio/available-numbers?${qs.toString()}`);
    },
    purchaseTwilioNumber: (payload: unknown) => request('/api/twilio/purchase-number', { method: 'POST', body: payload }),
    assignTwilioNumberToAgent: (numberId: string, payload: unknown) => request(`/api/twilio/numbers/${encodeURIComponent(numberId)}/assign-agent`, { method: 'POST', body: payload }),
    updateTwilioNumber: (numberId: string, payload: unknown) => request(`/api/twilio/numbers/${encodeURIComponent(numberId)}`, { method: 'PATCH', body: payload }),
    deleteTwilioNumber: (numberId: string) => request(`/api/twilio/numbers/${encodeURIComponent(numberId)}`, { method: 'DELETE' }),
  },

  // Prepared for Phase 3. Do not wire into UI in Phase 1.
  outreach: {
    previewOutreachSchedule: (payload: unknown) => request('/api/outreach/schedules/preview', { method: 'POST', body: payload }),
    createOutreachSchedule: (payload: unknown) => request('/api/outreach/schedules', { method: 'POST', body: payload }),
    getOutreachSchedules: () => request('/api/outreach/schedules'),
    getOutreachSchedule: (scheduleId: string) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`),
    updateOutreachSchedule: (scheduleId: string, payload: unknown) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`, { method: 'PATCH', body: payload }),
    cancelOutreachSchedule: (scheduleId: string, payload: unknown = {}) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}/cancel`, { method: 'POST', body: payload }),
    deleteOutreachSchedule: (scheduleId: string) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' }),
  },

  // Prepared for Phase 4. Do not wire into UI in Phase 1.
  calls: {
    getCalls: (params?: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value != null && value !== '') qs.set(key, String(value));
      });
      const query = qs.toString();
      return request(`/api/calls${query ? `?${query}` : ''}`);
    },
    getCall: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}`),
    getCallTranscript: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}/transcript`),
    getCallMessages: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}/messages`),
    getCallRecording: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}/recording`),
    getCallUnansweredQuestions: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}/unanswered-questions`),
    summarizeCall: (callId: string, payload: unknown = { force: true }) => request(`/api/calls/${encodeURIComponent(callId)}/summarize`, { method: 'POST', body: payload }),
    endCall: (callId: string) => request(`/api/calls/${encodeURIComponent(callId)}/end`, { method: 'POST', body: {} }),
    transferCall: (callId: string, payload: unknown) => request(`/api/calls/${encodeURIComponent(callId)}/transfer`, { method: 'POST', body: payload }),
  },

  // Prepared for Phase 5. Do not wire into UI in Phase 1.
  notifications: {
    getNotifications: () => request('/api/notifications'),
    getUnreadNotificationCount: () => request('/api/notifications/unread-count'),
    markNotificationRead: (notificationId: string, payload: unknown = { is_read: true }) => request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', body: payload }),
    markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'PATCH', body: {} }),
    deleteNotification: (notificationId: string) => request(`/api/notifications/${encodeURIComponent(notificationId)}`, { method: 'DELETE' }),
  },
};
