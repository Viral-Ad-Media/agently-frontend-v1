
export enum CallOutcome {
  LEAD_CAPTURED = 'Lead Captured',
  APPOINTMENT_BOOKED = 'Appointment Booked',
  FAQ_ANSWERED = 'FAQ Answered',
  ESCALATED = 'Escalated',
  VOICEMAIL = 'Voicemail'
}

export type UserRole = 'Owner' | 'Admin' | 'Viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  pdfUrl: string;
}

export interface Subscription {
  plan: 'Starter' | 'Pro' | 'None';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd: string;
  usage: {
    calls: number;
    minutes: number;
    callLimit: number;
    minuteLimit: number;
  };
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  reason: string;
  createdAt: string;
  status: 'new' | 'contacted' | 'closed';
}

export interface CallRecord {
  id: string;
  callerName: string;
  callerPhone: string;
  duration: number;
  timestamp: string;
  outcome: CallOutcome;
  summary: string;
  transcript: { speaker: 'Agent' | 'Caller'; text: string }[];
  recordingUrl?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

// Updated to use Twilio ConversationRelay voice options
export type AgentVoice =
  | 'Rachel'    // ElevenLabs – female, calm
  | 'Domi'      // ElevenLabs – female, strong
  | 'Bella'     // ElevenLabs – female, soft
  | 'Josh'      // ElevenLabs – male, deep
  | 'Arnold'    // ElevenLabs – male, crisp
  | 'Wavenet-F' // Google – female
  | 'Wavenet-D' // Google – male
  | 'Polly-Joanna'  // Amazon – female
  | 'Polly-Matthew'; // Amazon – male

export interface AgentConfig {
  id: string;
  name: string;
  direction: 'inbound' | 'outbound';
  twilioPhoneNumber: string;
  twilioPhoneSid: string;
  voice: AgentVoice;
  language: 'English' | 'Spanish' | 'French' | 'German' | 'Portuguese' | 'Italian';
  greeting: string;
  tone: 'Professional' | 'Friendly' | 'Empathetic';
  businessHours: string;
  faqs: FAQ[];
  escalationPhone: string;
  voicemailFallback: boolean;
  dataCaptureFields: string[];
  isActive: boolean;
  webhookUrl?: string;
  escalationWorkingHoursStart?: string;
  escalationWorkingHoursEnd?: string;
  rules: {
    autoBook: boolean;
    autoEscalate: boolean;
    captureAllLeads: boolean;
  };
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  isoCountry: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  addressRequired: string;
}

export interface OwnedPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  voiceUrl: string;
  dateCreated: string;
  capabilities: { voice: boolean; sms: boolean };
}

export interface PhoneCountry {
  country: string;
  countryName: string;
  hasLocal: boolean;
  hasTollFree: boolean;
  hasMobile: boolean;
}

export interface TwilioBilling {
  periodStart: string;
  voice: { count: string; minutes: string; cost: string; currency: string };
  sms: { count: string; cost: string; currency: string };
}

export interface ChatbotConfig {
  id: string;
  name: string;
  voiceAgentId: string;
  faqs: FAQ[];
  headerTitle: string;
  welcomeMessage: string;
  placeholder: string;
  launcherLabel: string;
  accentColor: string;
  position: 'left' | 'right';
  avatarLabel: string;
  customPrompt: string;
  suggestedPrompts: string[];
  embedScript: string;
  widgetScriptUrl: string;
}

export interface BusinessProfile {
  name: string;
  industry: string;
  website: string;
  location: string;
  onboarded: boolean;
  timezone: string;
}

export interface TwilioSettings {
  webhookBaseUrl: string;
}

export interface WorkspaceSettings {
  timezone: string;
  phoneNumber: string;
  twilio: TwilioSettings;
}

export interface Organization {
  id: string;
  profile: BusinessProfile;
  activeVoiceAgentId: string;
  voiceAgents: AgentConfig[];
  agent: AgentConfig;
  activeChatbotId: string;
  chatbots: ChatbotConfig[];
  subscription: Subscription;
  phoneNumber: string;
  settings: WorkspaceSettings;
  members: User[];
  invoices: Invoice[];
}

export interface DashboardData {
  stats: {
    totalCalls: number;
    leadsCaptured: number;
    missedCalls: number;
    avgDurationMinutes: number;
  };
  weeklyFlow: {
    name: string;
    calls: number;
    leads: number;
  }[];
  outcomeBreakdown: {
    label: string;
    count: number;
    color: string;
  }[];
  recentCalls: CallRecord[];
  recentLeads: Lead[];
  usage: Subscription['usage'];
  agentStatus: {
    online: boolean;
    agentName: string;
    phoneNumber: string;
    direction: 'inbound' | 'outbound';
  };
}
export interface AgentStats {
  agentId: string;
  agentName: string;
  totalCalls: number;
  leadsCaptured: number;
  missedCalls: number;
  avgDurationMinutes: number;
  weeklyFlow: { name: string; calls: number; leads: number }[];
  outcomeBreakdown: { label: string; count: number; color: string }[];
}

export interface WorkspaceBootstrap {
  user: User;
  organization: Organization;
  leads: Lead[];
  calls: CallRecord[];
  conversation: ChatMessage[];
  dashboard: DashboardData;
   agentStats?: AgentStats[];
}
