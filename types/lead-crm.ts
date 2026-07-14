export type LeadCrmStageKey =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_set'
  | 'proposal_sent'
  | 'won'
  | 'lost';

export type LeadTemperature = 'hot' | 'warm' | 'cold' | 'unqualified';

export interface LeadCrmRecord {
  id: string;
  workspace_id?: string | null;
  organization_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  source_detail?: string | null;
  crm_stage: LeadCrmStageKey | string;
  lead_temperature: LeadTemperature | string;
  ai_score: number;
  ai_summary?: string | null;
  ai_intent?: string | null;
  ai_confidence?: number | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
  estimated_value_cents?: number | null;
  currency?: string | null;
  owner_user_id?: string | null;
  needs_human_review?: boolean | null;
  human_review_reason?: string | null;
  lost_reason?: string | null;
  last_activity_at?: string | null;
  last_contacted_at?: string | null;
  appointment_at?: string | null;
  crm_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface LeadPipelineStage {
  id: string;
  key: LeadCrmStageKey | string;
  label: string;
  sort_order: number;
  is_won?: boolean;
  is_lost?: boolean;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: string;
  title: string;
  body?: string | null;
  channel?: string | null;
  direction?: string | null;
  provider?: string | null;
  provider_event_id?: string | null;
  call_id?: string | null;
  chatbot_id?: string | null;
  voice_agent_id?: string | null;
  created_by?: string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at: string;
  created_at?: string | null;
}

export interface LeadTask {
  id: string;
  lead_id: string;
  title: string;
  description?: string | null;
  task_type: string;
  priority: string;
  status: string;
  assigned_to?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LeadCrmSummary {
  totalLeads: number;
  hotLeads: number;
  overdueFollowUps: number;
  needsHumanReview: number;
  duplicateContacts?: number;
  estimatedPipelineValueCents: number;
  byStage: Record<string, number>;
  byTemperature: Record<string, number>;
  bySource?: Record<string, number>;
}

export interface LeadSourceOption {
  source: string;
  count: number;
}

export interface LeadCrmDetail {
  lead: LeadCrmRecord;
  activities: LeadActivity[];
  tasks: LeadTask[];
  activityCount?: number;
  taskCount?: number;
  activityLimit?: number;
  activityOffset?: number;
  taskLimit?: number;
  taskOffset?: number;
}
