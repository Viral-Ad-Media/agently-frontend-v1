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
  id?: string;
  provider?: string;
  displayName?: string;
  voiceId?: string;
  gender?: string | null;
  language?: string | null;
  accent?: string | null;
  modelId?: string | null;
  previewAvailable?: boolean;
};

export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  use_speaker_boost?: boolean;
};

export type OpenAiVoice = {
  id: string;
  voice_id: string;
  voiceId: string;
  name: string;
  displayName: string;
  provider: 'openai';
  modelId?: string | null;
  previewAvailable?: boolean;
};

export type AgentVoiceConfig = {
  voice_provider?: VoiceProvider;
  voice?: string | null;
  voice_id?: string | null;
  voiceId?: string | null;
  openai_voice_id?: string | null;
  openaiVoiceId?: string | null;
  elevenlabs_voice_id?: string | null;
  elevenLabsVoiceId?: string | null;
  elevenlabs_voice_name?: string | null;
  elevenLabsVoiceName?: string | null;
  voice_settings?: VoiceSettings & {
    model?: string;
    response_format?: string;
    responseFormat?: string;
    instructions?: string;
  };
};

export type TestVoicePayload = AgentVoiceConfig & {
  text: string;
  returnJson?: boolean;
  voiceId?: string;
  voice_id?: string;
  modelId?: string;
};

export type TestVoiceResult = {
  audioUrl?: string;
  blob?: Blob;
  raw?: unknown;
  provider?: string;
  voiceId?: string;
  mimeType?: string;
  audioBase64?: string;
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


const unwrapPayload = <T = unknown>(payload: unknown, keys: string[]): T => {
  if (!payload || typeof payload !== 'object') return payload as T;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key] as T;
  }
  return payload as T;
};

const normalizeElevenLabsVoice = (voice: unknown): ElevenLabsVoice | null => {
  if (!voice || typeof voice !== 'object') return null;
  const raw = voice as Record<string, unknown>;
  const voiceId = String(raw.voice_id || raw.voiceId || raw.id || '').trim();
  if (!voiceId) return null;
  const name = String(raw.name || raw.displayName || raw.display_name || voiceId).trim();
  const labels = raw.labels && typeof raw.labels === 'object' && !Array.isArray(raw.labels)
    ? raw.labels as Record<string, string>
    : undefined;

  return {
    ...(raw as Partial<ElevenLabsVoice>),
    voice_id: voiceId,
    name,
    category: typeof raw.category === 'string' ? raw.category : typeof raw.provider === 'string' ? raw.provider : undefined,
    labels,
    preview_url: typeof raw.preview_url === 'string' ? raw.preview_url : typeof raw.previewUrl === 'string' ? raw.previewUrl : undefined,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    provider: typeof raw.provider === 'string' ? raw.provider : 'elevenlabs',
    displayName: name,
    voiceId,
    gender: typeof raw.gender === 'string' ? raw.gender : null,
    language: typeof raw.language === 'string' ? raw.language : null,
    accent: typeof raw.accent === 'string' ? raw.accent : null,
    modelId: typeof raw.modelId === 'string' ? raw.modelId : typeof raw.model_id === 'string' ? raw.model_id : null,
    previewAvailable: typeof raw.previewAvailable === 'boolean' ? raw.previewAvailable : true,
  };
};

const normalizeElevenLabsVoicesResponse = (payload: unknown): { voices: ElevenLabsVoice[] } => {
  const voicesPayload = unwrapPayload<unknown>(payload, ['voices', 'data', 'items', 'results']);
  const nestedVoices = voicesPayload && typeof voicesPayload === 'object' && !Array.isArray(voicesPayload)
    ? unwrapPayload<unknown>(voicesPayload, ['voices', 'items', 'results'])
    : voicesPayload;
  const list = Array.isArray(nestedVoices) ? nestedVoices : [];
  const voices = list
    .map(normalizeElevenLabsVoice)
    .filter((voice): voice is ElevenLabsVoice => Boolean(voice));
  return { voices };
};

const normalizeOpenAiVoice = (voice: unknown): OpenAiVoice | null => {
  if (!voice || typeof voice !== 'object') return null;
  const raw = voice as Record<string, unknown>;
  const voiceId = String(raw.voice_id || raw.voiceId || raw.id || '').trim();
  if (!voiceId) return null;
  const name = String(raw.name || raw.displayName || raw.display_name || voiceId).trim();
  return {
    id: voiceId,
    voice_id: voiceId,
    voiceId,
    name,
    displayName: name,
    provider: 'openai',
    modelId: typeof raw.modelId === 'string' ? raw.modelId : typeof raw.model_id === 'string' ? raw.model_id : null,
    previewAvailable: typeof raw.previewAvailable === 'boolean' ? raw.previewAvailable : true,
  };
};

const normalizeOpenAiVoicesResponse = (payload: unknown): { voices: OpenAiVoice[] } => {
  const voicesPayload = unwrapPayload<unknown>(payload, ['voices', 'data', 'items', 'results']);
  const nestedVoices = voicesPayload && typeof voicesPayload === 'object' && !Array.isArray(voicesPayload)
    ? unwrapPayload<unknown>(voicesPayload, ['voices', 'items', 'results'])
    : voicesPayload;
  const list = Array.isArray(nestedVoices) ? nestedVoices : [];
  const voices = list
    .map(normalizeOpenAiVoice)
    .filter((voice): voice is OpenAiVoice => Boolean(voice));
  return { voices };
};

const normalizeVoiceSettings = (payload: unknown): VoiceSettings => {
  const settings = unwrapPayload<Record<string, unknown>>(payload, ['settings', 'voice_settings', 'voiceSettings']);
  const raw = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return {
    stability: typeof raw.stability === 'number' ? raw.stability : Number.isFinite(Number(raw.stability)) ? Number(raw.stability) : undefined,
    similarity_boost: typeof raw.similarity_boost === 'number'
      ? raw.similarity_boost
      : Number.isFinite(Number(raw.similarityBoost))
        ? Number(raw.similarityBoost)
        : undefined,
    style: typeof raw.style === 'number' ? raw.style : Number.isFinite(Number(raw.style)) ? Number(raw.style) : undefined,
    speed: typeof raw.speed === 'number' ? raw.speed : Number.isFinite(Number(raw.speed)) ? Number(raw.speed) : undefined,
    use_speaker_boost: typeof raw.use_speaker_boost === 'boolean'
      ? raw.use_speaker_boost
      : typeof raw.useSpeakerBoost === 'boolean'
        ? raw.useSpeakerBoost
        : undefined,
  };
};


const normalizeAgentVoiceConfig = (payload: unknown): AgentVoiceConfig => {
  const candidate = unwrapPayload<Record<string, unknown>>(payload, ['voiceConfig', 'voice_config', 'config', 'data', 'agent']);
  const raw = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const provider = String(raw.voice_provider || raw.voiceProvider || raw.provider || '').toLowerCase();
  const voiceProvider: VoiceProvider = provider === 'elevenlabs' ? 'elevenlabs' : 'openai';
  const voiceId = String(raw.voice_id || raw.voiceId || '').trim() || null;
  const openAiVoiceId = String(raw.openai_voice_id || raw.openaiVoiceId || (voiceProvider === 'openai' ? voiceId || raw.voice || '' : '')).trim() || null;
  const elevenLabsVoiceId = String(raw.elevenlabs_voice_id || raw.elevenLabsVoiceId || (voiceProvider === 'elevenlabs' ? voiceId || '' : '')).trim() || null;
  const elevenLabsVoiceName = String(raw.elevenlabs_voice_name || raw.elevenLabsVoiceName || '').trim() || null;
  const settingsRaw = raw.voice_settings || raw.voiceSettings;
  let voiceSettings: AgentVoiceConfig['voice_settings'] = {};
  if (typeof settingsRaw === 'string') {
    try {
      voiceSettings = JSON.parse(settingsRaw);
    } catch {
      voiceSettings = {};
    }
  } else if (settingsRaw && typeof settingsRaw === 'object' && !Array.isArray(settingsRaw)) {
    voiceSettings = settingsRaw as AgentVoiceConfig['voice_settings'];
  }

  return {
    voice_provider: voiceProvider,
    voice: typeof raw.voice === 'string' ? raw.voice : null,
    voice_id: voiceId,
    openai_voice_id: openAiVoiceId,
    elevenlabs_voice_id: elevenLabsVoiceId,
    elevenlabs_voice_name: elevenLabsVoiceName,
    voice_settings: voiceSettings,
  };
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const buildUrl = (path: string) => `${API_BASE_URL}${path}`;

const NETWORK_OFFLINE_MESSAGE = 'You are currently not connected to the internet. Please connect to the internet and try again.';

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
  headers.set('Cache-Control', 'no-cache');
  headers.set('Pragma', 'no-cache');
  const token = getSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
};

const request = async <T>(path: string, options: VoiceRequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, auth = true, responseType = 'json' } = options;
  const headers = auth ? authHeaders(body != null) : new Headers(body != null ? { 'Content-Type': 'application/json' } : undefined);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (error) {
    if (isNetworkError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new VoiceApiError(NETWORK_OFFLINE_MESSAGE, 0, error);
    }
    throw error;
  }

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


export type TwilioNumberRecord = {
  id?: string;
  numberId?: string;
  twilioNumberId?: string;
  sid?: string;
  phone_number?: string;
  phoneNumber?: string;
  phone_sid?: string;
  phoneSid?: string;
  account_sid?: string;
  accountSid?: string;
  organization_id?: string;
  organizationId?: string;
  orgId?: string;
  friendly_name?: string;
  friendlyName?: string;
  iso_country?: string;
  isoCountry?: string;
  number_type?: string;
  numberType?: string;
  source?: string;
  purchase_origin?: string;
  purchaseOrigin?: string;
  capabilities?: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    [key: string]: unknown;
  };
  address_requirements?: string;
  addressRequirements?: string;
  regulatory_status?: string;
  regulatoryStatus?: string;
  assigned_voice_agent_id?: string | null;
  assignedVoiceAgentId?: string | null;
  voiceAgentId?: string | null;
  assignedAgent?: { id?: string; name?: string; direction?: string; [key: string]: unknown } | null;
  assignedAgents?: Array<{ id?: string; name?: string; direction?: string; assignmentId?: string; isDefaultForAgent?: boolean; [key: string]: unknown }>;
  outboundAssignedAgents?: Array<{ id?: string; name?: string; direction?: string; assignmentId?: string; isDefaultForAgent?: boolean; [key: string]: unknown }>;
  inboundAgent?: { id?: string; name?: string; direction?: string; [key: string]: unknown } | null;
  assignmentCount?: number;
  agentId?: string | null;
  assigned_agent_status?: string | null;
  assignedAgentStatus?: string | null;
  configuration_status?: string | null;
  configurationStatus?: string | null;
  overall_status?: string | null;
  overallStatus?: string | null;
  inbound_voice_status?: string | null;
  inboundVoiceStatus?: string | null;
  outbound_voice_status?: string | null;
  outboundVoiceStatus?: string | null;
  inbound_sms_status?: string | null;
  outbound_sms_status?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type AvailableTwilioNumber = {
  phoneNumber?: string;
  phone_number?: string;
  friendlyName?: string;
  friendly_name?: string;
  locality?: string;
  region?: string;
  isoCountry?: string;
  iso_country?: string;
  capabilities?: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    [key: string]: unknown;
  };
  addressRequired?: string;
  address_required?: string;
  [key: string]: unknown;
};

export type TwilioNumbersResponse = {
  numbers: TwilioNumberRecord[];
  raw?: unknown;
};

export type AvailableTwilioNumbersResponse = {
  numbers: AvailableTwilioNumber[];
  raw?: unknown;
};

const normalizeCapabilities = (raw: unknown): TwilioNumberRecord['capabilities'] => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  return {
    ...record,
    voice: typeof record.voice === 'boolean' ? record.voice : Boolean(record.voice),
    sms: typeof record.sms === 'boolean' ? record.sms : Boolean(record.sms),
    mms: typeof record.mms === 'boolean' ? record.mms : Boolean(record.mms),
  };
};

const normalizeTwilioNumber = (value: unknown): TwilioNumberRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const phoneNumber = String(raw.phone_number || raw.phoneNumber || raw.number || '').trim();
  const id = String(raw.id || raw.numberId || raw.phone_number_id || raw.phone_sid || raw.phoneSid || raw.sid || phoneNumber || '').trim();
  if (!id && !phoneNumber) return null;
  const phoneSid = String(raw.phone_sid || raw.phoneSid || raw.sid || '').trim() || undefined;
  const organizationId = String(raw.organization_id || raw.organizationId || raw.orgId || '').trim() || undefined;
  const assigned = raw.assignedAgent && typeof raw.assignedAgent === 'object' ? raw.assignedAgent as { id?: string; name?: string; direction?: string; [key: string]: unknown } : null;
  const inboundAgent = raw.inboundAgent && typeof raw.inboundAgent === 'object' ? raw.inboundAgent as { id?: string; name?: string; direction?: string; [key: string]: unknown } : assigned;
  const normalizeAgentList = (value: unknown) => Array.isArray(value)
    ? value.filter((agent): agent is { id?: string; name?: string; direction?: string; assignmentId?: string; isDefaultForAgent?: boolean; [key: string]: unknown } => Boolean(agent && typeof agent === 'object'))
    : [];
  const assignedAgents = normalizeAgentList(raw.assignedAgents || raw.outboundAssignedAgents);
  const outboundAssignedAgents = normalizeAgentList(raw.outboundAssignedAgents || raw.assignedAgents);
  const assignedAgentId = String(raw.assigned_voice_agent_id || raw.assignedVoiceAgentId || raw.voiceAgentId || raw.agentId || assigned?.id || inboundAgent?.id || '').trim() || null;
  return {
    ...(raw as Partial<TwilioNumberRecord>),
    id: typeof raw.id === 'string' ? raw.id : id,
    numberId: id,
    sid: typeof raw.sid === 'string' ? raw.sid : phoneSid,
    phone_number: phoneNumber,
    phoneNumber,
    organization_id: organizationId,
    organizationId,
    orgId: organizationId,
    phone_sid: phoneSid,
    phoneSid,
    friendly_name: String(raw.friendly_name || raw.friendlyName || phoneNumber || '').trim(),
    friendlyName: String(raw.friendlyName || raw.friendly_name || phoneNumber || '').trim(),
    iso_country: String(raw.iso_country || raw.isoCountry || 'US').trim(),
    isoCountry: String(raw.isoCountry || raw.iso_country || 'US').trim(),
    number_type: String(raw.number_type || raw.numberType || raw.type || 'unknown').trim(),
    numberType: String(raw.numberType || raw.number_type || raw.type || 'unknown').trim(),
    capabilities: normalizeCapabilities(raw.capabilities),
    assigned_voice_agent_id: assignedAgentId,
    assignedVoiceAgentId: assignedAgentId,
    voiceAgentId: assignedAgentId,
    agentId: assignedAgentId,
    assignedAgent: assigned,
    inboundAgent,
    assignedAgents,
    outboundAssignedAgents,
    assignmentCount: Number(raw.assignmentCount || raw.assignment_count || outboundAssignedAgents.length || assignedAgents.length || 0),
    configuration_status: String(raw.configuration_status || raw.configurationStatus || '').trim() || null,
    configurationStatus: String(raw.configurationStatus || raw.configuration_status || '').trim() || null,
    overall_status: String(raw.overall_status || raw.overallStatus || raw.status || '').trim() || null,
    overallStatus: String(raw.overallStatus || raw.overall_status || raw.status || '').trim() || null,
    inbound_voice_status: String(raw.inbound_voice_status || raw.inboundVoiceStatus || '').trim() || null,
    inboundVoiceStatus: String(raw.inboundVoiceStatus || raw.inbound_voice_status || '').trim() || null,
    outbound_voice_status: String(raw.outbound_voice_status || raw.outboundVoiceStatus || '').trim() || null,
    outboundVoiceStatus: String(raw.outboundVoiceStatus || raw.outbound_voice_status || '').trim() || null,
  };
};

const normalizeAvailableTwilioNumber = (value: unknown): AvailableTwilioNumber | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const phoneNumber = String(raw.phoneNumber || raw.phone_number || raw.number || '').trim();
  if (!phoneNumber) return null;
  return {
    ...(raw as Partial<AvailableTwilioNumber>),
    phoneNumber,
    phone_number: phoneNumber,
    friendlyName: String(raw.friendlyName || raw.friendly_name || phoneNumber).trim(),
    friendly_name: String(raw.friendly_name || raw.friendlyName || phoneNumber).trim(),
    isoCountry: String(raw.isoCountry || raw.iso_country || 'US').trim(),
    iso_country: String(raw.iso_country || raw.isoCountry || 'US').trim(),
    capabilities: normalizeCapabilities(raw.capabilities),
  };
};

const normalizeTwilioNumbersResponse = (payload: unknown): TwilioNumbersResponse => {
  const numbersPayload = unwrapPayload<unknown>(payload, ['numbers', 'phoneNumbers', 'ownedNumbers', 'data', 'items', 'results']);
  const nested = numbersPayload && typeof numbersPayload === 'object' && !Array.isArray(numbersPayload)
    ? unwrapPayload<unknown>(numbersPayload, ['numbers', 'phoneNumbers', 'ownedNumbers', 'items', 'results'])
    : numbersPayload;
  const list = Array.isArray(nested) ? nested : [];
  return {
    numbers: list.map(normalizeTwilioNumber).filter((number): number is TwilioNumberRecord => Boolean(number)),
    raw: payload,
  };
};

const normalizeAvailableTwilioNumbersResponse = (payload: unknown): AvailableTwilioNumbersResponse => {
  const numbersPayload = unwrapPayload<unknown>(payload, ['numbers', 'availableNumbers', 'data', 'items', 'results']);
  const nested = numbersPayload && typeof numbersPayload === 'object' && !Array.isArray(numbersPayload)
    ? unwrapPayload<unknown>(numbersPayload, ['numbers', 'availableNumbers', 'items', 'results'])
    : numbersPayload;
  const list = Array.isArray(nested) ? nested : [];
  return {
    numbers: list.map(normalizeAvailableTwilioNumber).filter((number): number is AvailableTwilioNumber => Boolean(number)),
    raw: payload,
  };
};

const normalizeAudioResult = async (response: Response): Promise<TestVoiceResult> => {
  const contentType = response.headers.get('content-type') || '';
  const provider = response.headers.get('x-voice-provider') || undefined;
  const voiceId = response.headers.get('x-voice-id') || undefined;
  if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
    return { blob: await response.blob(), provider, voiceId };
  }

  if (contentType.includes('application/json')) {
    const raw = await response.json() as Record<string, unknown>;
    const audioUrl =
      (raw.audioUrl as string | undefined) ||
      (raw.audio_url as string | undefined) ||
      (raw.url as string | undefined) ||
      (raw.previewUrl as string | undefined) ||
      (raw.preview_url as string | undefined);
    const audioBase64 =
      (raw.audioBase64 as string | undefined) ||
      (raw.audio_base64 as string | undefined) ||
      (raw.base64 as string | undefined);
    const mimeType =
      (raw.mimeType as string | undefined) ||
      (raw.mime_type as string | undefined) ||
      (audioBase64 ? 'audio/mpeg' : undefined);
    const jsonProvider = (raw.provider as string | undefined) || provider;
    const jsonVoiceId =
      (raw.voice_id as string | undefined) ||
      (raw.voiceId as string | undefined) ||
      voiceId;
    return { audioUrl, audioBase64, mimeType, raw, provider: jsonProvider, voiceId: jsonVoiceId };
  }

  const text = await response.text();
  return { raw: text, provider, voiceId };
};

const postForAudio = async (path: string, body: unknown): Promise<TestVoiceResult> => {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (error) {
    if (isNetworkError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new VoiceApiError(NETWORK_OFFLINE_MESSAGE, 0, error);
    }
    throw error;
  }

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
    const payload = await request<unknown>('/api/elevenlabs/voices');
    return normalizeElevenLabsVoicesResponse(payload);
  },

  async getElevenLabsVoiceSettings(voiceId: string) {
    const payload = await request<unknown>(`/api/elevenlabs/voices/${encodeURIComponent(voiceId)}/settings`);
    return normalizeVoiceSettings(payload);
  },

  async getOpenAiVoices() {
    const payload = await request<unknown>('/api/voices?provider=openai');
    return normalizeOpenAiVoicesResponse(payload);
  },

  async previewVoice(payload: TestVoicePayload & { provider?: VoiceProvider; model?: string; speed?: number; instructions?: string }) {
    return postForAudio('/api/voices/preview', payload);
  },

  async getAgentVoiceConfig(agentId: string) {
    const payload = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/voice-config`);
    return normalizeAgentVoiceConfig(payload);
  },

  async updateAgentVoiceConfig(agentId: string, payload: AgentVoiceConfig) {
    const response = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/voice-config`, {
      method: 'PATCH',
      body: payload,
    });
    return normalizeAgentVoiceConfig(response);
  },

  async testElevenLabsVoice(payload: TestVoicePayload) {
    return postForAudio('/api/elevenlabs/test-voice', payload);
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
    async syncOwnedTwilioNumbers() {
      return request('/api/twilio/numbers/sync-owned', { method: 'POST', body: {} });
    },
    async getTwilioNumbers(params?: { organizationId?: string }) {
      const qs = new URLSearchParams();
      if (params?.organizationId) qs.set('organizationId', params.organizationId);
      const payload = await request<unknown>(`/api/twilio/numbers${qs.toString() ? `?${qs.toString()}` : ''}`);
      return normalizeTwilioNumbersResponse(payload);
    },
    async getOwnedTwilioNumbers() {
      const payload = await request<unknown>('/api/twilio/owned-numbers');
      return normalizeTwilioNumbersResponse(payload);
    },
    async searchAvailableTwilioNumbers(params: Record<string, string | number | boolean | undefined>) {
      // Backend primary search is POST /api/twilio/numbers/search
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
      });
      const payload = await request<unknown>(`/api/twilio/numbers/search${qs.toString() ? `?${qs.toString()}` : ''}`);
      return normalizeAvailableTwilioNumbersResponse(payload);
    },
    async purchaseTwilioNumber(payload: unknown) {
      return request<Record<string, any>>('/api/twilio/numbers/purchase', { method: 'POST', body: payload });
    },
    async assignTwilioNumberToAgent(numberId: string, payload: unknown) {
      return request<Record<string, any>>(`/api/twilio/numbers/${encodeURIComponent(numberId)}/assign-agent`, { method: 'POST', body: payload });
    },
    async updateTwilioNumber(numberId: string, payload: unknown) {
      return request(`/api/twilio/numbers/${encodeURIComponent(numberId)}`, { method: 'PATCH', body: payload });
    },
    async removeTwilioNumberAgentAssignment(numberId: string, agentId: string) {
      return request(`/api/twilio/numbers/${encodeURIComponent(numberId)}/assignments/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
    },
    // Backend DELETE /numbers/:sid uses phone_sid — caller must pass the SID
    async deleteTwilioNumber(sid: string) {
      return request(`/api/twilio/numbers/${encodeURIComponent(sid)}`, { method: 'DELETE' });
    },
  },

  // Prepared for Phase 3. Do not wire into UI in Phase 1.
  outreach: {
    previewOutreachSchedule: (payload: unknown) => request('/api/outreach/schedules/preview', { method: 'POST', body: payload }),
    createOutreachSchedule: (payload: unknown) => request('/api/outreach/schedules', { method: 'POST', body: payload }),
    getOutreachSchedules: () => request('/api/outreach/schedules'),
    getOutreachSchedule: (scheduleId: string) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`),
    updateOutreachSchedule: (scheduleId: string, payload: unknown) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`, { method: 'PATCH', body: payload }),
    cancelOutreachSchedule: (scheduleId: string, payload: unknown = {}) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}/cancel`, { method: 'POST', body: payload }),
    deleteOutreachSchedule: (scheduleId: string) => request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' })
      .catch(() => request(`/api/call-schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' })),
    runNow: (scheduleId: string) => {
      // Backend may mount this as /api/outreach/schedules/:id/run-now or /api/call-schedules/:id/run-now
      return request(`/api/outreach/schedules/${encodeURIComponent(scheduleId)}/run-now`, { method: 'POST', body: {} })
        .catch(() => request(`/api/call-schedules/${encodeURIComponent(scheduleId)}/run-now`, { method: 'POST', body: {} }));
    },
  },

  // Prepared for Phase 4. Do not wire into UI in Phase 1.
  calls: {
    createOutboundCall: (payload: unknown) => request('/api/calls/outbound', { method: 'POST', body: payload })
      .catch((error) => {
        if ((error as { status?: number })?.status === 404) {
          return request('/api/twilio/outbound', { method: 'POST', body: payload });
        }
        throw error;
      }),
    createBulkOutboundCall: (payload: unknown) => request('/api/calls/outbound/bulk', { method: 'POST', body: payload }),
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

  dashboard: {
    getMetrics: () => request('/api/dashboard/metrics'),
  },

  // Prepared for Phase 5. Do not wire into UI in Phase 1.
  notifications: {
    getNotifications: (params?: { limit?: number; page?: number; unreadOnly?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.page) qs.set('page', String(params.page));
      if (params?.unreadOnly) qs.set('unreadOnly', 'true');
      const query = qs.toString();
      return request(`/api/notifications${query ? `?${query}` : ''}`);
    },
    getUnreadNotificationCount: () => request('/api/notifications/unread-count'),
    markNotificationRead: (notificationId: string, payload: unknown = { is_read: true }) => request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', body: payload }),
    markNotificationUnread: (notificationId: string) => request(`/api/notifications/${encodeURIComponent(notificationId)}/unread`, { method: 'PATCH', body: {} }),
    markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'PATCH', body: {} }),
    bulkUpdateNotifications: (payload: { notificationIds: string[]; action: 'read' | 'unread' | 'delete' }) => request('/api/notifications/bulk', { method: 'POST', body: payload }),
    deleteNotification: (notificationId: string) => request(`/api/notifications/${encodeURIComponent(notificationId)}`, { method: 'DELETE' }),
  },
};
