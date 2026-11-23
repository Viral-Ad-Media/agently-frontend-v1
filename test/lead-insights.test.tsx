import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LeadInsights from '../components/LeadInsights';
import { api } from '../services/api';
import type { Lead } from '../types';

vi.mock('../services/api', () => ({api: {
  leadQualification: vi.fn(), leadCrmDetail: vi.fn(), updateCrmLead: vi.fn(), addLeadNote: vi.fn(), completeLeadTask: vi.fn(),
}}));
const lead: Lead = {id: 'lead-a', name: 'Ada', email: 'ada@example.test', phone: '', reason: 'Consultation', status: 'contacted', createdAt: '2026-10-12T10:00:00Z', aiScore: 50, crmMetadata: {notes: ['Earlier customer note']}};
const record = {id: 'lead-a', crm_stage: 'contacted', ai_score: 50, lead_temperature: 'warm'};
const detail = {lead: record, activities: [], tasks: [], activityCount: 0, taskCount: 0};
const onChanged = vi.fn().mockResolvedValue(undefined);
const mount = (item = lead) => <MemoryRouter><LeadInsights key={item.id} lead={item} onChanged={onChanged}/></MemoryRouter>;
beforeEach(() => {
  vi.mocked(api.leadQualification).mockReset().mockResolvedValue({lead: record, assessment: null});
  vi.mocked(api.leadCrmDetail).mockReset().mockResolvedValue(detail);
  vi.mocked(api.updateCrmLead).mockReset().mockResolvedValue({lead: record});
  vi.mocked(api.addLeadNote).mockReset().mockResolvedValue({activity: {id: 'note', lead_id: lead.id, activity_type: 'manual_note', title: 'Internal note', occurred_at: '2026-10-12T10:00:00Z'}});
  vi.mocked(api.completeLeadTask).mockReset();
  onChanged.mockClear();
});

describe('Lead progress', () => {
  it('does not present a default score as a call assessment and preserves old notes', async () => {
    render(mount());
    expect(await screen.findByText('No call assessment yet')).toBeInTheDocument();
    expect(screen.getByText(/It is not proof of AI qualification/)).toBeInTheDocument();
    expect(screen.getByText('Earlier customer note')).toBeInTheDocument();
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
  });

  it('shows transcript evidence and records an owner review without changing the stage', async () => {
    vi.mocked(api.leadQualification).mockResolvedValue({lead: {...record, needs_human_review: true, human_review_reason: 'Confirm service area'}, assessment: {body: 'Interested decision maker.', occurred_at: '2026-10-12T10:00:00Z', metadata: {score: 86, confidence: 0.9, evidence: ['Caller needs help next week.']}}});
    render(mount());
    expect(await screen.findByText('Caller needs help next week.')).toBeInTheDocument();
    expect(screen.getByText('90% confidence')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Mark reviewed'}));
    await screen.findByText('Review recorded.');
    expect(api.updateCrmLead).toHaveBeenCalledWith('lead-a', {needs_human_review: false, human_review_reason: null, activity_note: 'Owner reviewed the lead qualification.'});
  });

  it('saves a follow-up with the entered local time and adds a note to the real timeline', async () => {
    render(mount());
    await screen.findByText('No call assessment yet');
    fireEvent.change(screen.getByRole('textbox', {name: 'Follow-up action'}), {target: {value: 'Confirm the package'}});
    fireEvent.change(screen.getByLabelText('Follow-up date and time'), {target: {value: '2026-10-14T10:30'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save follow-up'}));
    await screen.findByText('Follow-up saved. No email has been sent.');
    expect(api.updateCrmLead).toHaveBeenCalledWith('lead-a', {next_action: 'Confirm the package', next_action_due_at: new Date('2026-10-14T10:30').toISOString(), activity_note: 'Follow-up planned: Confirm the package'});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Save follow-up'})).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox', {name: 'Internal note'}), {target: {value: 'Owner called the customer'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save note'}));
    await screen.findByText('Note added to activity.');
    expect(api.addLeadNote).toHaveBeenCalledWith('lead-a', 'Owner called the customer');
    expect(screen.getByRole('textbox', {name: 'Internal note'})).toHaveValue('');
  });

  it('pages through recorded history and keeps errors distinct from an empty history', async () => {
    vi.mocked(api.leadCrmDetail).mockResolvedValue({...detail, activityCount: 11, activities: [{id: 'activity', lead_id: lead.id, activity_type: 'call', title: 'Call completed', occurred_at: '2026-10-12T10:00:00Z'}]});
    render(mount());
    await screen.findByText('Call completed');
    vi.mocked(api.leadCrmDetail).mockRejectedValueOnce(new Error('Temporary connection error'));
    fireEvent.click(within(screen.getByRole('navigation', {name: 'Activity pages'})).getByRole('button', {name: 'Next'}));
    expect(await screen.findByText(/Activity could not load/)).toBeInTheDocument();
    expect(screen.queryByText(/No recorded activity yet/)).not.toBeInTheDocument();
    expect(api.leadCrmDetail).toHaveBeenLastCalledWith('lead-a', 2, 1);
  });

  it('ignores an old lead response after switching leads', async () => {
    let finish: (value: Awaited<ReturnType<typeof api.leadQualification>>) => void = () => {};
    vi.mocked(api.leadQualification).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const {rerender} = render(mount());
    rerender(mount({...lead, id: 'lead-b', name: 'Ben'}));
    await screen.findByText('No call assessment yet');
    finish({lead: record, assessment: {body: 'Wrong person assessment', metadata: {}, occurred_at: '2026-10-12T10:00:00Z'}});
    await waitFor(() => expect(api.leadQualification).toHaveBeenCalledWith('lead-b'));
    expect(screen.queryByText('Wrong person assessment')).not.toBeInTheDocument();
  });
});
