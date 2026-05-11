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
  updatedAt?: string;
  status: 'new' | 'contacted' | 'closed';
  source?: string;
  tags?: string[];
  voiceAgentId?: string;
  assignmentContext?: string;
}

export interface LeadOutreachWindow {
  weekdays: string[];
  time: string;
}

export interface LeadOutreachSchedule {
  id: string;
  name: string;
  targetType: 'lead' | 'tag';
  leadId?: string;
  tag?: string;
  voiceAgentId: string;
  windows: LeadOutreachWindow[];
  timezone: string;
  extraContext: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallRecord {
  id: string;
  callerName: string;
  callerPhone: string;
  duration: number;
  timestamp: string;
  outcome: CallOutcome;
  summary: string;
  transcript: { speaker: string; text: string }[];
  recordingUrl?: string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  voice_agent_id?: string;
  organization_id?: string;
  recording_available?: boolean;
  recording_status?: string;
  from?: string;
  to?: string;
  lead?: { id: string; name: string; phone?: string; email?: string } | null;
}

export type NotificationType =
  | 'call_completed'
  | 'call_failed'
  | 'message_captured'
  | 'lead_requested_follow_up'
  | 'unanswered_question_captured'
  | 'transfer_requested'
  | 'opt_out_requested'
  | 'recording_ready'
  | 'transcript_ready'
  | 'schedule_completed'
  | 'schedule_failed'
  | string;

export interface TenantNotification {
  id: string;
  organization_id: string;
  type: NotificationType;
  title?: string;
  message?: string;
  body?: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  updated_at?: string;
  related_call_id?: string | null;
  related_lead_id?: string | null;
  related_schedule_id?: string | null;
  related_agent_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type OutreachScheduleType =
  | 'one_time'
  | 'one_time_batch'
  | 'recurring_monthly'
  | 'custom_rule';

export type OutreachBatchMode =
  | 'all_recipients_each_time'
  | 'spread_recipients_across_times';

export type VoicemailBehavior = 'hangup' | 'leave_voicemail' | 'skip';

export interface DirectRecipient {
  name: string;
  phone: string;
}

export interface OutreachScheduleLimits {
  maxConcurrentCalls?: number;
  maxOutboundCallsPerMinute?: number;
  maxDailyOutboundCalls?: number;
  maxCallsPerDay?: number;
}

export interface OutreachScheduleRepeat {
  frequency: 'monthly' | 'weekly' | 'daily';
  interval?: number;
  count?: number;
}

export interface OutreachScheduleWeeklyRule {
  daysOfWeek: string[];
  times: string[];
}

export interface OutreachScheduleConfig {
  dateRange?: { startDate: string; endDate: string };
  weeklyRules?: OutreachScheduleWeeklyRule[];
  batchMode?: OutreachBatchMode;
}

export interface OutreachSchedule {
  id: string;
  organization_id?: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
  schedule_type: OutreachScheduleType;
  voice_agent_id?: string;
  from_number?: string;
  direct_recipients?: DirectRecipient[];
  lead_ids?: string[];
  call_purpose?: string;
  custom_instructions?: string;
  timezone?: string;
  start_local_date?: string;
  start_time?: string;
  start_times?: string[];
  batch_mode?: OutreachBatchMode;
  repeat?: OutreachScheduleRepeat;
  schedule_config?: OutreachScheduleConfig;
  max_attempts_per_lead?: number;
  retry_delay_minutes?: number;
  voicemail_behavior?: VoicemailBehavior;
  limits?: OutreachScheduleLimits;
  created_at: string;
  updated_at?: string;
  stats?: {
    totalRuns?: number;
    completed?: number;
    failed?: number;
    pending?: number;
    nextRunAt?: string | null;
  };
}

export interface OutreachSchedulePreview {
  timezone: string;
  scheduleType: OutreachScheduleType;
  recipientCount: number;
  totalRuns: number;
  preview: Array<{ scheduledFor: string; recipient?: { name: string; phone: string } }>;
  warnings?: string[];
}

export interface CreateOutreachSchedulePayload {
  name: string;
  voiceAgentId: string;
  fromNumber: string;
  directRecipients?: DirectRecipient[];
  leadIds?: string[];
  callPurpose?: string;
  customInstructions?: string;
  scheduleType: OutreachScheduleType;
  startLocalDate?: string;
  startTime?: string;
  startTimes?: string[];
  batchMode?: OutreachBatchMode;
  timezone: string;
  maxAttemptsPerLead?: number;
  retryDelayMinutes?: number;
  voicemailBehavior?: VoicemailBehavior;
  status?: string;
  limits?: OutreachScheduleLimits;
  repeat?: OutreachScheduleRepeat;
  monthEndBehavior?: string;
  scheduleConfig?: OutreachScheduleConfig;
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

export type AgentVoice =
  | 'Rachel'
  | 'Domi'
  | 'Bella'
  | 'Josh'
  | 'Arnold'
  | 'Wavenet-F'
  | 'Wavenet-D'
  | 'Polly-Joanna'
  | 'Polly-Matthew';

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
  chatVoice?: string;
  chatLanguages?: string[];
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
  weeklyFlow: { name: string; calls: number; leads: number }[];
  outcomeBreakdown: { label: string; count: number; color: string }[];
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
}
