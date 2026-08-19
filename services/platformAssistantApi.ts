import { resolveApiBaseUrl } from '../utils/runtimeUrls';
import { getSessionToken } from './session';

/**
 * agently/services/platformAssistantApi.ts   <-- NEW FILE
 *
 * Client for Agently's own in-app support assistant.
 *
 * Deliberately separate from services/api.ts: that client throws ApiError and
 * dispatches `agently:auth-expired` on a 401, which would sign the user out of
 * their workspace because a support chat request failed. The assistant is
 * ancillary — if it breaks it should fail quietly on its own, never take the
 * dashboard session with it.
 */

const API_BASE_URL = resolveApiBaseUrl();

export type AssistantConfig = {
  enabled: boolean;
  name: string;
  headerTitle: string;
  welcomeMessage: string;
  placeholder: string;
  accentColor: string;
  position: 'left' | 'right';
  suggestedPrompts: string[];
  supportEmail: string;
};

export type AssistantMessage = {
  role: 'user' | 'assistant';
  text: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; response?: string }
      | null;
    // The chat route answers 429 and 503 with a usable `response` string so the
    // panel can show a real sentence instead of an error state.
    if (payload?.response) return payload as T;
    throw new Error(
      payload?.error?.message || `Request failed (${response.status})`,
    );
  }

  return (await response.json()) as T;
}

export type SupportAttachment = {
  path: string;
  mime: string;
  bytes: number;
};

/** Matches the server and the bucket's own limits. */
export const MAX_SUPPORT_ATTACHMENTS = 2;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME = ['image/png', 'image/jpeg', 'image/webp'];

export const platformAssistantApi = {
  async config(): Promise<AssistantConfig> {
    return request<AssistantConfig>('/api/platform-assistant/config');
  },

  async chat(
    message: string,
    history: AssistantMessage[],
  ): Promise<{ response: string; degraded?: boolean; supportEmail?: string }> {
    return request('/api/platform-assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history: history.slice(-10) }),
    });
  },

  async escalate(payload: {
    subject?: string;
    body: string;
    contactName?: string;
    contactEmail?: string;
    history: AssistantMessage[];
    attachments?: SupportAttachment[];
  }): Promise<{ success: boolean; message: string; requestId: string }> {
    return request('/api/platform-assistant/escalate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Uploads one screenshot straight to storage.
   *
   * The API only mints a short-lived signed URL — the image bytes go directly
   * from the browser to the private bucket and never through our server. The
   * returned descriptor is what gets attached to the support request.
   */
  async uploadScreenshot(file: File): Promise<SupportAttachment> {
    const signed = await request<{
      path: string;
      mime: string;
      bytes: number;
      uploadUrl: string;
      token: string;
    }>('/api/platform-assistant/attachments/upload-url', {
      method: 'POST',
      body: JSON.stringify({ mime: file.type, bytes: file.size }),
    });

    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error('The screenshot could not be uploaded. Please try again.');
    }

    return {
      path: signed.path,
      mime: signed.mime,
      bytes: signed.bytes,
    };
  },
};
