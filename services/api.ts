import {
  AgentConfig,
  BusinessProfile,
  BusinessSettingsProfile,
  ChatMessage,
  ChatbotConfig,
  DashboardData,
  FAQ,
  Lead,
  LeadMedia,
  LeadQuote,
  FrontDeskSettings,
  FrontDeskKpis,
  ChatConversation,
  ChatInboxMessage,
  ChatInboxMedia,
  LeadOutreachSchedule,
  KnowledgeBase,
  KnowledgeSource,
  Organization,
  User,
  UserRole,
  WorkspaceSettings,
  WorkspaceBootstrap,
} from '../types';
import { humanizeApiError } from '../lib/apiErrors';
import { getSessionToken } from './session';
import { resolveApiBaseUrl } from '../utils/runtimeUrls';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AutoTopUpStatus {
  enabled: boolean;
  thresholdUsd: number;
  amountUsd: number;
  monthlyCapUsd: number;
  pausedReason: string | null;
  lastError: string | null;
  lastChargedAt: string | null;
  available: boolean;
  hasCard: boolean;
  card: { id: string; brand: string; last4: string } | null;
  minimumTopUpUsd: number;
  spentThisMonthUsd: number;
  remainingThisMonthUsd: number;
  month: string;
}

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

const API_BASE_URL = resolveApiBaseUrl();

/** Shared so other clients cannot resolve a different base and 405 silently. */
export const apiBaseUrl = API_BASE_URL;

export type OperatorReference = { source: string; url: string | null };
export type OperatorPendingAction = {
  id: string;
  type: "send_emails" | "reschedule_appointment";
  summary: string;
  expiresAt: string;
  recipients?: Array<{ name: string; to: string; subject: string; body: string }>;
  appointment?: string;
  oldTime?: string;
  newTime?: string;
  business?: string;
  agentName?: string;
};
export type OperatorChatResult = {
  reply: string;
  pendingActions: OperatorPendingAction[];
  references?: OperatorReference[];
};
export type OperatorActionResult = {
  success: boolean;
  partial?: boolean;
  message?: string;
  sent?: number;
  total?: number;
  localTime?: string;
  results?: Array<{ name: string; sent: boolean; message?: string }>;
};

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

    // Explanatory fallback instead of a bare status code. See lib/apiErrors.ts.
    const message =
      errorPayload?.error?.message ||
      humanizeApiError({ status: response.status, code: errorPayload?.error?.code });
    if (auth && response.status === 401) notifyAuthExpired(message);

    /*
     * The activation gate is enforced server-side, so any gated action can
     * come back 402 TOP_UP_REQUIRED. Announcing it here means one modal
     * mounted in the shell covers every gated action — buying a number,
     * putting a chatbot live, and anything gated later — without each page
     * having to catch and render its own version.
     */
    if (errorPayload?.error?.code === 'CARD_REQUIRED') {
      window.dispatchEvent(
        new CustomEvent('agently:card-required', {
          detail: { message },
        }),
      );
    }

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

/**
 * A completed authentication. Only ever produced by verify-email,
 * verify-login-otp, accept-invitation and change-password — never by
 * /login or /register, which now stop at a challenge.
 */
export type AuthSession = {
  token: string;
  user: User;
  session: {
    id: string;
    absoluteExpiresAt: string;
    idleTimeoutSeconds: number;
    absoluteTimeoutSeconds: number;
  };
  emailVerified?: boolean;
  mustSetPassword?: boolean;
};

/**
 * The half-authenticated state between a correct password (or a fresh signup)
 * and the emailed code. `pendingToken` is NOT a session: the API refuses it
 * everywhere except the verify and resend endpoints.
 */
export type AuthChallenge = {
  /** Exactly one of these is true, and it decides which endpoint verifies it. */
  otpRequired?: boolean;
  verificationRequired?: boolean;
  pendingToken: string;
  email: string;
  expiresInSeconds: number;
  message?: string;
};

export type AuthConfig = {
  providers: string[];
  passwordMinLength: number;
  signupRequiresEmailVerification: boolean;
  loginRequiresEmailOtp: boolean;
  magicLinkSignInEnabled: boolean;
  emailVerifyCodeTtlSeconds: number;
  loginOtpTtlSeconds: number;
  codeLength: number;
  maxCodeAttempts: number;
  resendCooldownSeconds: number;
  sessionIdleTimeoutSeconds: number;
  sessionAbsoluteTimeoutSeconds: number;
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

// ---------------------------------------------------------------------------
// Calendar connections (one row per CONNECTED ACCOUNT)
// ---------------------------------------------------------------------------
/*
 * One Agently login can run several businesses, each with its own Google (or
 * Calendly) account, so calendar_integrations is one row per connected
 * ACCOUNT -- not one row per provider. Two fields carry that:
 *
 *   label             the tenant-facing name of the connection ("Nutra
 *                     Wellness"). Defaults to the provider account's display
 *                     name or email on connect; renameable.
 *   is_booking_default  the ONE connection the voice agent books INTO. At most
 *                     one true per organization (a partial unique index in
 *                     Postgres enforces it, not this client).
 *
 * AVAILABILITY merges across every connection -- a slot is offered only when
 * the owner is free on all of them. BOOKING writes only to the
 * is_booking_default connection. Both of those are server behaviour; this
 * client only reads and labels the result.
 */

export type CalendarProvider = 'google' | 'calendly';

export type CalendarConnectionStatus =
  | 'connected'
  | 'needs_reconnect'
  | 'disconnected'
  | 'error';

export interface CalendarBookingSettings {
  slotMinutes?: number;
  windowDays?: number;
  workingHours?: Record<string, Array<[string, string]>>;
  sendUpdates?: 'all' | 'none';
}

export interface CalendarConnection {
  id: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  /** Tenant-facing name. Null on rows written before the label column. */
  label: string | null;
  is_booking_default: boolean;
  provider_user_id: string | null;
  provider_user_email: string | null;
  provider_user_name: string | null;
  calendar_id: string | null;
  event_type_uri: string | null;
  event_type_name: string | null;
  scopes: string | null;
  timezone: string | null;
  last_error: string | null;
  connected_at: string;
  updated_at: string;
  booking_settings: CalendarBookingSettings | null;
}

export type EmailPurpose = 'follow_up' | 'meeting_invite' | 'reschedule' | 'send_link' | 'custom';

export interface GmailConnection {
  id: string;
  provider: 'gmail';
  label: string | null;
  provider_user_email: string | null;
  status: 'connected' | 'needs_reconnect' | 'disconnected';
  last_error: string | null;
  is_default: boolean;
  automations: { booking_confirmation?: boolean };
  connected_at: string;
  updated_at: string;
}

export interface IntegrationsStatus {
  encryptionConfigured: boolean;
  encryptionHelp: string | null;
  googleConfigured: boolean;
  calendlyConfigured: boolean;
  connections: CalendarConnection[];
}

export type AppointmentStatus =
  | 'booked'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'completed';

/**
 * The connection facts the server exposes outside /status: a whitelist,
 * because the underlying rows carry token ciphertext. Note the casing — these
 * summaries are camelCase while /status returns the raw snake_case row, so the
 * two are deliberately separate types rather than one with optional fields.
 */
export interface CalendarConnectionSummary {
  id: string;
  provider: CalendarProvider;
  /** Never blank: the server falls back to the account email, then the provider. */
  label: string;
  email: string | null;
  status: CalendarConnectionStatus;
  isBookingDefault: boolean;
}

/**
 * One appointment in the merged feed: the appointment row as stored, plus the
 * connection fields the server joins on, so a single list can say which
 * business each booking belongs to.
 *
 * connectionId is null for an appointment whose connection has since been
 * removed — appointments.integration_id is ON DELETE SET NULL, so history
 * survives a disconnect and the view has to render it unlabelled.
 */
export interface MergedBooking {
  id: string;
  integration_id: string | null;
  provider: CalendarProvider;
  title: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  attendee_phone: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: AppointmentStatus;
  cancel_url: string | null;
  reschedule_url: string | null;
  created_at: string;
  connectionId: string | null;
  connectionLabel: string | null;
  connectionEmail: string | null;
  isBookingDefault: boolean;
}

export interface MergedBookingsResponse {
  bookings: MergedBooking[];
  /** Every connection in the org, so the view can offer a per-account filter. */
  connections: CalendarConnectionSummary[];
  /** Rows matching the filter before `limit` was applied. */
  total: number;
}

export const api = {
  /** Public. Which sign-in methods the backend actually offers right now. */
  async getAuthConfig() {
    return request<AuthConfig>('/api/auth/config', { auth: false });
  },

  /**
   * Step 1 of signing in. A correct password does NOT produce a session — it
   * produces a challenge. The session is issued by verifyLoginOtp.
   */
  async login(email: string, password: string) {
    return request<AuthChallenge>('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password, client: 'web' },
    });
  },

  /**
   * Step 1 of signing up. Creates the user, organization and owner membership,
   * then stops at email verification.
   */
  async register(payload: { name: string; companyName: string; email: string; password: string }) {
    return request<AuthChallenge>('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: { ...payload, client: 'web' },
    });
  },

  /** Step 2 of signing up. Proves mailbox ownership and returns the session. */
  async verifyEmail(pendingToken: string, code: string) {
    return request<AuthSession>('/api/auth/verify-email', {
      method: 'POST',
      auth: false,
      body: { pendingToken, code, client: 'web' },
    });
  },

  /** Step 2 of signing in. Returns the session. */
  async verifyLoginOtp(pendingToken: string, code: string) {
    return request<AuthSession>('/api/auth/verify-login-otp', {
      method: 'POST',
      auth: false,
      body: { pendingToken, code, client: 'web' },
    });
  },

  /**
   * Send another code. The backend reads the purpose out of the pending token,
   * so there is one endpoint for both flows and no way to ask for the wrong
   * kind of code. Returns a REFRESHED pendingToken which the caller must store
   * in place of the old one.
   */
  async resendAuthCode(pendingToken: string) {
    return request<{
      sent: boolean;
      pendingToken: string;
      email: string;
      expiresInSeconds: number;
      resendCooldownSeconds: number;
    }>('/api/auth/resend-code', {
      method: 'POST',
      auth: false,
      body: { pendingToken },
    });
  },

  /**
   * Accept a team invitation. Replaces the removed magic-link verifier, and
   * unlike it can only ever resolve a user an admin already created.
   */
  async acceptInvitation(token: string) {
    return request<AuthSession>('/api/auth/accept-invitation', {
      method: 'POST',
      auth: false,
      body: { token, client: 'web' },
    });
  },

  async logout() {
    return request<{ success: boolean; sessionRevoked: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  /** Ends every session for this account, on every device. */
  async logoutEverywhere() {
    return request<{ success: boolean; allSessionsRevoked: boolean }>('/api/auth/logout-all', {
      method: 'POST',
    });
  },

  async listSessions() {
    return request<{ sessions: Array<{id:string;client:string;user_agent:string|null;request_ip:string|null;created_at:string;last_seen_at:string;absolute_expires_at:string;current:boolean}>;policy:{idleSeconds:number;absoluteSeconds:number;maxConcurrentSessions:number} }>('/api/auth/sessions');
  },
  async revokeSession(sessionId:string) {
    return request<{success:boolean;currentSessionRevoked:boolean}>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'});
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

  async operatorChat(payload: {
    agentId: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    return request<OperatorChatResult>('/api/operator/chat', {
      method: 'POST',
      body: payload,
    });
  },

  async operatorWorkspace(agentId: string, path: string, method: "GET" | "POST" | "PUT" = 'GET', body?: Record<string, unknown>) {
    return request<any>(`/api/operator/workspace/${encodeURIComponent(agentId)}/${path}`, { method, ...(body ? { body } : {}) });
  },

  async listCrmLeads(filters: Record<string, string>) {
    return request<{leads: import('../types/lead-crm').LeadCrmRecord[]; count: number; hasMore: boolean}>(`/api/leads-crm?${new URLSearchParams(filters)}`);
  },
  async leadQualification(id: string) {
    return request<{lead: import('../types/lead-crm').LeadCrmRecord; assessment: {body: string; metadata: {score?: number; confidence?: number; evidence?: string[]}; occurred_at: string} | null}>(`/api/leads-crm/${encodeURIComponent(id)}/qualification`);
  },
  async leadCrmDetail(id: string, activityPage = 1, taskPage = 1) {
    const query = new URLSearchParams({activity_limit: '10', activity_offset: String((activityPage - 1) * 10), task_limit: '10', task_offset: String((taskPage - 1) * 10)});
    return request<import('../types/lead-crm').LeadCrmDetail>(`/api/leads-crm/${encodeURIComponent(id)}?${query}`);
  },
  async addLeadNote(id: string, body: string) {
    return request<{activity: import('../types/lead-crm').LeadActivity}>(`/api/leads-crm/${encodeURIComponent(id)}/notes`, {method: 'POST', body: {body}});
  },
  async completeLeadTask(id: string) {
    return request<{task: import('../types/lead-crm').LeadTask}>(`/api/leads-crm/tasks/${encodeURIComponent(id)}`, {method: 'PATCH', body: {status: 'done'}});
  },
  async updateCrmLead(id: string, body: Record<string, unknown>) {
    return request<{lead: import('../types/lead-crm').LeadCrmRecord}>(`/api/leads-crm/${encodeURIComponent(id)}`, {method: 'PATCH', body});
  },

  async confirmOperatorAction(id: string) {
    return request<OperatorActionResult>(`/api/operator/actions/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: {},
    });
  },

  async retryOperatorAction(id: string) {
    return request<{success:boolean;pendingAction:OperatorPendingAction}>(`/api/operator/actions/${encodeURIComponent(id)}/retry`,{method:'POST',body:{}});
  },
  async cancelOperatorAction(id: string) {
    return request<{ success: boolean }>(`/api/operator/actions/${encodeURIComponent(id)}/cancel`, {
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

  async listLeadMedia(id: string) {
    return request<{ media: LeadMedia[] }>(`/api/leads/${id}/media`);
  },

  async deleteLeadMedia(leadId: string, mediaId: string) {
    return request<{ success: boolean }>(`/api/leads/${leadId}/media/${mediaId}`, { method: 'DELETE' });
  },

  // ── Front Desk: quotes, price list, chat inbox ──
  async getFrontDeskSettings() {
    return request<{ settings: FrontDeskSettings; models?: { reply: string; assessment: string } }>('/api/frontdesk/settings');
  },
  async saveFrontDeskSettings(patch: Partial<FrontDeskSettings>) {
    return request<{ settings: FrontDeskSettings }>('/api/frontdesk/settings', { method: 'PUT', body: patch });
  },
  async getFrontDeskKpis(days = 30) {
    return request<FrontDeskKpis>(`/api/frontdesk/kpis?days=${days}`);
  },
  async listQuotes(params: { status?: string; leadId?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.leadId) qs.set('leadId', params.leadId);
    return request<{ quotes: LeadQuote[] }>(`/api/frontdesk/quotes${qs.toString() ? `?${qs}` : ''}`);
  },
  async updateQuoteLines(id: string, lines: { code: string; qty: number }[]) {
    return request<{ quote: LeadQuote }>(`/api/frontdesk/quotes/${id}`, { method: 'PATCH', body: { lines } });
  },
  async approveQuote(id: string) {
    return request<{ quote: LeadQuote }>(`/api/frontdesk/quotes/${id}/approve`, { method: 'POST' });
  },
  async voidQuote(id: string) {
    return request<{ quote: LeadQuote }>(`/api/frontdesk/quotes/${id}/void`, { method: 'POST' });
  },
  async listConversations(status?: string) {
    return request<{ conversations: ChatConversation[] }>(`/api/frontdesk/conversations${status ? `?status=${status}` : ''}`);
  },
  async getConversation(id: string) {
    return request<{ conversation: ChatConversation; messages: ChatInboxMessage[]; media: Record<string, ChatInboxMedia> }>(
      `/api/frontdesk/conversations/${id}`,
    );
  },
  async replyToConversation(id: string, message: string, email?: boolean) {
    return request<{ message: ChatInboxMessage; status: 'human'; delivery: string }>(`/api/frontdesk/conversations/${id}/reply`, {
      method: 'POST',
      body: { message, email },
    });
  },
  async setConversationStatus(id: string, status: 'ai' | 'human' | 'closed') {
    return request<{ conversation: ChatConversation }>(`/api/frontdesk/conversations/${id}`, {
      method: 'PATCH',
      body: { status },
    });
  },
  async deleteConversation(id: string) {
    return request<{ success: boolean }>(`/api/frontdesk/conversations/${id}`, { method: 'DELETE' });
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

  /** Owner only: end every session a member has, without removing them. */
  async signOutTeamMember(id: string) {
    return request<{ success: boolean }>(`/api/team/members/${encodeURIComponent(id)}/sign-out`, {
      method: 'POST',
    });
  },

  /** Owner only: every live signed-in device across the workspace. */
  async listTeamSessions() {
    return request<{
      sessions: Array<{
        id: string;
        userId: string;
        userName: string;
        userEmail: string;
        userRole: string;
        client: string;
        userAgent: string;
        requestIp: string;
        createdAt: string;
        lastSeenAt: string;
        current: boolean;
      }>;
    }>('/api/team/sessions');
  },

  /** Owner only: sign out one device in the workspace. */
  async revokeTeamSession(sessionId: string) {
    return request<{ success: boolean; currentSessionRevoked: boolean }>(
      `/api/team/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    );
  },

  async getBillingSummary() {
    return request('/api/billing/summary');
  },

  async createStripeWalletTopUp(amountUsd: number) {
    return request<{
      success: boolean;
      topUpId: string;
      sessionId: string;
      checkoutUrl: string;
      amountUsd: number;
      minimumTopUpUsd: number;
      expiresAt: string | null;
    }>('/api/billing/stripe/checkout-session', {
      method: 'POST',
      body: { amountUsd },
    });
  },

  /** D2 — start card collection. Saves the card; charges nothing. */
  async createCardSetupIntent() {
    return request<{
      success: boolean;
      clientSecret: string;
      setupIntentId: string;
      customerId: string;
    }>('/api/billing/stripe/setup-intent', { method: 'POST' });
  },

  async listSavedCards() {
    return request<{
      success: boolean;
      hasCardOnFile: boolean;
      cards: Array<{
        id: string;
        brand: string;
        last4: string;
        expMonth: number | null;
        expYear: number | null;
      }>;
    }>('/api/billing/stripe/payment-methods');
  },

  /**
   * D3 — one-click top-up on the saved card.
   *
   * Resolves as soon as Stripe accepts the PaymentIntent. It deliberately does
   * NOT mean the balance moved: crediting happens on the webhook, so callers
   * must refresh the wallet rather than adding the amount locally.
   */
  async chargeSavedCard(amountUsd: number, paymentMethodId?: string) {
    return request<{
      success: boolean;
      topUpId: string;
      paymentIntentId: string;
      status: string;
      amountUsd: number;
      credited: boolean;
    }>('/api/billing/stripe/charge', {
      method: 'POST',
      body: { amountUsd, paymentMethodId },
    });
  },

  /** Auto top-up with a monthly cap (card-on-file plan). */
  async getAutoTopUp() {
    return request<{ success: boolean; autoTopUp: AutoTopUpStatus }>(
      '/api/billing/stripe/auto-topup',
    );
  },

  async updateAutoTopUp(settings: {
    enabled: boolean;
    thresholdUsd: number;
    amountUsd: number;
    monthlyCapUsd: number;
  }) {
    return request<{ success: boolean; autoTopUp: AutoTopUpStatus }>(
      '/api/billing/stripe/auto-topup',
      { method: 'PUT', body: settings },
    );
  },

  async getStripeWalletTopUpStatus(sessionId: string) {
    return request<{
      success: boolean;
      topUp: {
        id: string;
        amountUsd: number;
        currency: string;
        status: string;
        credited: boolean;
        walletTransactionId: string | null;
        failureMessage: string | null;
        createdAt: string;
        creditedAt: string | null;
        updatedAt: string;
      };
    }>(`/api/billing/stripe/sessions/${encodeURIComponent(sessionId)}`);
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
    account?: {
      name?: string;
      email?: string;
    };
    businessProfile?: {
      name?: string;
      industry?: string;
      website?: string;
      location?: string;
    };
    businessProfiles?: BusinessSettingsProfile[];
    twilio?: {
      accountSid?: string;
      authToken?: string;
      validateRequests?: boolean;
      clearCredentials?: boolean;
    };
  }) {
    return request<WorkspaceSettings & { account?: User; businessProfile?: BusinessProfile; businessProfiles?: BusinessSettingsProfile[] }>('/api/settings', {
      method: 'PATCH',
      body: settings,
    });
  },

  /**
   * Changing a password revokes every session for the account, including this
   * one, so the response carries a REPLACEMENT token. The caller must store it
   * or the current tab is signed out a moment later.
   */
  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ success: boolean; message: string; otherSessionsRevoked: boolean } & AuthSession>(
      '/api/auth/change-password',
      { method: 'POST', body: { ...payload, client: 'web' } },
    );
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

  // -------------------------------------------------------------------------
  // Calendar integrations (Google Calendar + Calendly)
  // -------------------------------------------------------------------------

  /**
   * Starts the OAuth connect flow. The SPA cannot send its Authorization
   * header on a full-page navigation, so this fetches a short-lived,
   * single-purpose start token (authenticated) whose URL the page navigates to.
   */
  /** Ask to be added as a Google test user so this account can connect Gmail. */
  async requestGmailBetaAccess(googleEmail: string) {
    return request<{ requested: boolean; alreadyRequested: boolean }>('/api/email/gmail/beta-access', {
      method: 'POST',
      body: { googleEmail },
    });
  },

  async createIntegrationStartToken(provider: 'google' | 'calendly' | 'gmail') {
    // returnTo: the page to land back on after the provider's consent screen.
    // The server accepts only an in-app path and signs it into the OAuth state.
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/integrations';
    return request<{ url: string }>(`/api/integrations/${provider}/start-token`, {
      method: 'POST',
      body: { returnTo },
    });
  },

  // -------------------------------------------------------------------------
  // Gmail (send-only). Agently drafts; the tenant's Gmail delivers.
  // -------------------------------------------------------------------------

  async getGmailConnections() {
    return request<{ connections: GmailConnection[]; dailyCap: number; setupRequired?: boolean }>(
      '/api/email/gmail/connections',
    );
  },

  async setGmailDefault(id: string) {
    return request<{ connection: GmailConnection }>(`/api/email/gmail/connections/${id}/default`, { method: 'POST' });
  },

  async setGmailAutomations(id: string, automations: { booking_confirmation?: boolean }) {
    return request<{ connection: GmailConnection }>(`/api/email/gmail/connections/${id}/automations`, {
      method: 'PATCH',
      body: automations,
    });
  },

  async disconnectGmail(id: string) {
    return request<{ ok: boolean }>(`/api/email/gmail/connections/${id}`, { method: 'DELETE' });
  },

  async draftEmail(input: {
    purpose: EmailPurpose;
    leadId?: string;
    appointmentId?: string;
    link?: string;
    notes?: string;
    to?: string;
  }) {
    return request<{ subject: string; body: string; to: string; purpose: EmailPurpose }>('/api/email/gmail/draft', {
      method: 'POST',
      body: input,
    });
  },

  async sendEmail(input: {
    to: string;
    subject: string;
    body: string;
    purpose?: EmailPurpose;
    leadId?: string;
    appointmentId?: string;
    connectionId?: string;
  }) {
    return request<{ success: boolean; messageId: string | null; from: string }>('/api/email/gmail/send', {
      method: 'POST',
      body: input,
    });
  },

  /** Outbound SMS (behind the "sms" feature switch). */
  async getSmsNumbers() {
    return request<{
      numbers: Array<{ id: string; phoneNumber: string; outboundSmsStatus: string | null }>;
      vendorCostPerSegmentUsd: number;
    }>('/api/sms/numbers');
  },

  async getSmsMessages(leadId: string) {
    return request<{
      messages: Array<{ id: string; body: string; status: string; segments: number; errorCode: string | null; createdAt: string; to: string }>;
    }>(`/api/sms/messages?leadId=${encodeURIComponent(leadId)}`);
  },

  async sendSms(input: { leadId?: string; to?: string; body: string; fromNumberId?: string }) {
    return request<{
      message: { id: string; sid: string | null; status: string; from: string; to: string; segments: number };
    }>('/api/sms/send', { method: 'POST', body: input });
  },

  /**
   * Every calendar connection the organization has -- one entry per connected
   * ACCOUNT, so a tenant running three businesses from one login gets three
   * google rows. Server-side this is scoped to req.orgId; the five calendar
   * tables are RLS-enabled with zero policies and the API holds the service
   * role, so that scoping is the only thing standing between tenants.
   */
  async getIntegrationsStatus() {
    return request<IntegrationsStatus>('/api/integrations/status');
  },

  /*
   * These three routes address a provider by NAME, which predates several
   * accounts per provider. Each now takes an optional connectionId naming which
   * of that provider's accounts to read or write; omitting it falls back to the
   * provider's booking default, which is what the single-account case always
   * meant. Callers that know the connection should say so — the fallback is a
   * compatibility path, not a choice.
   */

  async getIntegrationOptions(provider: 'google' | 'calendly', connectionId?: string) {
    const suffix = connectionId
      ? `?connectionId=${encodeURIComponent(connectionId)}`
      : '';
    return request<{
      options: Array<{ id: string; name: string; primary?: boolean; slug?: string }>;
      selected: string | null;
    }>(`/api/integrations/${provider}/options${suffix}`);
  },

  async saveIntegrationSelection(
    provider: 'google' | 'calendly',
    selection: {
      calendarId?: string;
      eventTypeUri?: string;
      eventTypeName?: string;
      connectionId?: string;
    },
  ) {
    return request<{ connection: unknown }>(`/api/integrations/${provider}/selection`, {
      method: 'PUT',
      body: selection,
    });
  },

  async saveBookingSettings(
    provider: 'google' | 'calendly',
    settings: {
      slotMinutes?: number;
      windowDays?: number;
      workingHours?: Record<string, Array<[string, string]>>;
      sendUpdates?: 'all' | 'none';
      connectionId?: string;
    },
  ) {
    return request<{ connection: { booking_settings: unknown } }>(
      `/api/integrations/${provider}/booking-settings`,
      { method: 'PUT', body: settings },
    );
  },

  async getBusinessGroups() {
    return request<{
      groups: Array<{
        id: string;
        owner_label: string;
        policy: 'block' | 'flag_for_review';
        invite_code: string | null;
        invite_expires_at: string | null;
        members: Array<{ organization_id: string; name: string; joined_at: string }>;
      }>;
    }>('/api/integrations/business-groups');
  },

  async createBusinessGroup(ownerLabel?: string) {
    return request<{ group: unknown }>('/api/integrations/business-groups', {
      method: 'POST',
      body: { owner_label: ownerLabel || '' },
    });
  },

  async joinBusinessGroup(code: string) {
    return request<{ group: unknown }>('/api/integrations/business-groups/join', {
      method: 'POST',
      body: { code },
    });
  },

  async updateBusinessGroup(
    id: string,
    update: { policy?: 'block' | 'flag_for_review'; owner_label?: string; regenerate_code?: boolean },
  ) {
    return request<{ group: unknown }>(`/api/integrations/business-groups/${id}`, {
      method: 'PUT',
      body: update,
    });
  },

  async leaveBusinessGroup(id: string) {
    return request<{ left: boolean }>(`/api/integrations/business-groups/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Legacy single-account disconnect, kept for the one-connection case and
   * for callers that still hold only a provider. Prefer
   * disconnectCalendarConnection: with several accounts per provider, this one
   * cannot say WHICH of them to drop.
   */
  async disconnectIntegration(provider: 'google' | 'calendly') {
    return request<{ disconnected: boolean; provider?: string; message?: string }>(
      `/api/integrations/${provider}/disconnect`,
      { method: 'POST' },
    );
  },

  // -------------------------------------------------------------------------
  // Per-connection operations (several accounts per provider)
  // -------------------------------------------------------------------------

  /**
   * The tenant-facing connection list on its own. getIntegrationsStatus covers
   * the same ground AND the provider/encryption flags in one round trip, so
   * the Integrations page uses that; this is for callers that need only the
   * accounts, and it returns the lighter camelCase summaries.
   */
  async getCalendarConnections() {
    return request<{
      connections: Array<
        CalendarConnectionSummary & {
          name: string | null;
          calendarId: string | null;
          eventTypeName: string | null;
          timezone: string | null;
          lastError: string | null;
          connectedAt: string;
        }
      >;
      bookingDefaultId: string | null;
    }>('/api/integrations/connections');
  },

  /** Rename one connection. The label is cosmetic; it moves no tokens. */
  async renameCalendarConnection(connectionId: string, label: string) {
    return request<{ connection: CalendarConnectionSummary }>(
      `/api/integrations/connections/${encodeURIComponent(connectionId)}`,
      { method: 'PATCH', body: { label } },
    );
  },

  /**
   * Make this connection the one the voice agent books INTO. PUT, not POST: it
   * sets a value rather than creating anything, and sending it twice is the
   * same as sending it once.
   *
   * The server clears the previous default in the same write, because the
   * database allows at most one default per organization and would otherwise
   * reject it — so the response describes only the connection that WON. A
   * caller holding a list must re-read it rather than flip a flag locally.
   * Availability is unaffected either way: it always merges across every
   * connection.
   */
  async setCalendarBookingDefault(connectionId: string) {
    return request<{ connection: CalendarConnectionSummary }>(
      `/api/integrations/connections/${encodeURIComponent(connectionId)}/booking-default`,
      { method: 'PUT' },
    );
  },

  /**
   * Revoke at the provider and delete this one row. If it was the booking
   * default the server promotes another connection, so the organization is
   * never left connected but unbookable; promotedConnectionId names the
   * replacement, or is null when nothing needed promoting.
   */
  async disconnectCalendarConnection(connectionId: string) {
    return request<{
      disconnected: boolean;
      provider: CalendarProvider;
      connectionId: string;
      promotedConnectionId: string | null;
    }>(`/api/integrations/connections/${encodeURIComponent(connectionId)}/disconnect`, {
      method: 'POST',
    });
  },

  /**
   * The merged bookings feed: appointments across ALL of the organization's
   * connections, each labelled with the connection it belongs to, so the
   * tenant sees every business's day in one view instead of switching
   * accounts. `from`/`to` are ISO instants.
   *
   * `status` is matched exactly, so it takes a real appointment status and
   * nothing else — omit it to get every status. There is no "all" sentinel:
   * the server would filter for a status literally named "all" and hand back
   * an empty feed.
   */
  async getMergedBookings(range?: {
    from?: string;
    to?: string;
    status?: AppointmentStatus;
    connectionId?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (range?.from) query.set('from', range.from);
    if (range?.to) query.set('to', range.to);
    if (range?.status) query.set('status', range.status);
    if (range?.connectionId) query.set('connectionId', range.connectionId);
    if (range?.limit) query.set('limit', String(range.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<MergedBookingsResponse>(`/api/integrations/bookings${suffix}`);
  },
  async cancelBooking(id: string) {
    return request<{ success: boolean; message?: string }>(`/api/integrations/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
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
