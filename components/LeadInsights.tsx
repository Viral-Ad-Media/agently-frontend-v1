import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Lead } from '../types';
import type { LeadCrmDetail } from '../types/lead-crm';

type Qualification = Awaited<ReturnType<typeof api.leadQualification>>;
const button = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800';
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Could not load this information. Please try again.';
const dateLabel = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date unavailable';
function localInput(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Pager({page, count, label, onChange, disabled}: {page: number; count: number; label: string; onChange: (page: number) => void; disabled: boolean}) {
  if (count <= 10) return null;
  return <nav aria-label={`${label} pages`} className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
    <button className={button} disabled={disabled || page === 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} of {Math.ceil(count / 10)}</span>
    <button className={button} disabled={disabled || page * 10 >= count} onClick={() => onChange(page + 1)}>Next</button>
  </nav>;
}

/** Evidence and actual outcomes stay distinct from the lead's current score and planned work. */
export default function LeadInsights({lead, onChanged}: {lead: Lead; onChanged: () => Promise<void>}) {
  const [qualification, setQualification] = useState<Qualification | null>(null);
  const [detail, setDetail] = useState<LeadCrmDetail | null>(null);
  const [qualificationError, setQualificationError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [action, setAction] = useState(lead.nextAction || '');
  const [due, setDue] = useState(localInput(lead.nextActionDueAt));
  const mounted = useRef(true);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);

  useEffect(() => {
    let active = true;
    setQualificationError('');
    api.leadQualification(lead.id).then(value => {
      if (!active) return;
      setQualification(value);
      setAction(value.lead.next_action || '');
      setDue(localInput(value.lead.next_action_due_at));
    }).catch(e => {if (active) setQualificationError(friendlyError(e));});
    return () => {active = false;};
  }, [lead.id, revision]);

  useEffect(() => {
    let active = true;
    setLoading(true); setDetailError('');
    api.leadCrmDetail(lead.id, activityPage, taskPage).then(value => {
      if (active) setDetail(value);
    }).catch(e => {if (active) setDetailError(friendlyError(e));})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [lead.id, activityPage, taskPage, revision]);

  async function save(work: () => Promise<unknown>, message: string, clearNote = false) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await work();
      if (!mounted.current) return;
      if (clearNote) setNote('');
      setNotice(message); setActivityPage(1); setRevision(v => v + 1);
      try {await onChanged();} catch {if (mounted.current) setError('Saved, but the lead list could not refresh. Reopen it to see the latest details.');}
    } catch (e) {if (mounted.current) setError(friendlyError(e));}
    finally {if (mounted.current) setBusy(false);}
  }
  const assessment = qualification?.assessment;
  const current = qualification?.lead;
  const needsReview = current ? current.needs_human_review : lead.needsHumanReview;
  const reviewReason = current ? current.human_review_reason : lead.humanReviewReason;
  const evidence = Array.isArray(assessment?.metadata?.evidence) ? assessment.metadata.evidence.filter(item => typeof item === 'string') : [];
  const confidence = assessment?.metadata?.confidence;
  const legacyNotes = Array.isArray(lead.crmMetadata?.notes) ? lead.crmMetadata.notes.filter((n): n is string => typeof n === 'string') : [];

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold text-slate-900">Lead progress</h3>
      <button className={button} disabled={busy || loading} onClick={() => {setNotice(''); setRevision(v => v + 1);}}>Refresh activity</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section aria-label="Qualification evidence" className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Why this lead qualified</h3>
      {qualificationError ? <p role="alert" className="mt-2 text-sm text-red-700">Qualification could not load: {qualificationError}</p> : !qualification ? <p role="status" className="mt-2 text-sm text-slate-500">Loading qualification…</p> : assessment ? <>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-blue-50 px-2 py-1 text-sm font-bold text-blue-800">{assessment.metadata?.score ?? '—'}/100 at assessment</span>
          {typeof confidence === 'number' && <span className="text-xs text-slate-500">{Math.round(confidence * 100)}% confidence</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">Call assessment · {dateLabel(assessment.occurred_at)}</p>
        {assessment.body && <p className="mt-3 text-sm leading-relaxed text-slate-700">{assessment.body}</p>}
        {evidence.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">{evidence.map((fact, i) => <li key={i}>{fact}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No supporting evidence was saved for this assessment.</p>}
        <p className="mt-3 text-xs text-slate-500">An assessment recommends a next step. Confirmed bookings and sent emails appear in activity.</p>
      </> : <div className="mt-3 text-sm text-slate-600">
        <p className="font-semibold">No call assessment yet</p>
        <p className="mt-1">The current score{current?.ai_score != null ? ` (${current.ai_score}/100)` : ''} may come from activity signals or a manual update. It is not proof of AI qualification.</p>
        <p className="mt-2 text-xs">Assign a qualification playbook to the agent, then complete a customer call linked to this lead.</p>
      </div>}
      {needsReview && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Owner review needed</p><p className="mt-1">{reviewReason || 'Check the call and qualification evidence before proceeding.'}</p>
        <button className={`${button} mt-3`} disabled={busy || !qualification || !!qualificationError} onClick={() => void save(() => api.updateCrmLead(lead.id, {needs_human_review: false, human_review_reason: null, activity_note: 'Owner reviewed the lead qualification.'}), 'Review recorded.')}>Mark reviewed</button>
      </div>}
    </section>

    <section aria-label="Next step" className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">What happens next</h3>
      <label className="mt-3 block text-xs font-semibold text-slate-600">Follow-up action<textarea aria-label="Follow-up action" rows={2} className={`${field} mt-1`} value={action} disabled={busy || !qualification || !!qualificationError} onChange={e => setAction(e.target.value)} placeholder="For example, confirm the package they are interested in"/></label>
      <label className="mt-3 block text-xs font-semibold text-slate-600">Follow-up date and time<input aria-label="Follow-up date and time" type="datetime-local" className={`${field} mt-1`} value={due} disabled={busy || !qualification || !!qualificationError} onChange={e => setDue(e.target.value)}/></label>
      <p className="mt-1 text-xs text-slate-500">Time shown in {timezone}. Stored as an exact time.</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">Saving a follow-up does not send an email or book an appointment. An active nurture rule can prepare or send an email when this lead meets its conditions.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy || !qualification || !!qualificationError || (!!due && (!action.trim() || !Number.isFinite(Date.parse(due))))} onClick={() => void save(() => api.updateCrmLead(lead.id, {next_action: action.trim() || null, next_action_due_at: due ? new Date(due).toISOString() : null, activity_note: action.trim() ? `Follow-up planned: ${action.trim()}` : 'Follow-up cleared.'}), 'Follow-up saved. No email has been sent.')}>Save follow-up</button>
        <Link className="text-xs font-semibold text-blue-700 underline" to="/operator">Manage agent automations</Link>
      </div>
    </section>

    <section aria-label="Activity history" className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">What has happened</h3>
      <p className="mt-1 text-xs text-slate-500">Recorded calls, assessments, updates and notes · times in {timezone}</p>
      {detailError ? <p role="alert" className="mt-3 text-sm text-red-700">Activity could not load: {detailError}</p> : loading ? <p role="status" className="mt-3 text-sm text-slate-500">Loading activity…</p> : !detail?.activities.length ? <p className="mt-3 text-sm text-slate-500">No recorded activity yet. An empty history does not confirm whether an email or appointment exists.</p> : <ol className="mt-4 space-y-4 border-l border-slate-200 pl-4">
        {detail.activities.map(item => <li key={item.id} className="relative break-words">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-400"/>
          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
          <p className="mt-1 text-xs text-slate-400">{dateLabel(item.occurred_at)}{item.channel ? ` · ${item.channel}` : ''}</p>
          {item.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.body}</p>}
        </li>)}
      </ol>}
      <Pager page={activityPage} count={detail?.activityCount || 0} label="Activity" onChange={setActivityPage} disabled={loading || busy}/>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <label className="text-xs font-semibold text-slate-600">Internal note<textarea aria-label="Internal note" value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${field} mt-1`} placeholder="Add context for your team…"/></label>
        <button className={`${button} mt-2`} disabled={busy || !note.trim()} onClick={() => void save(() => api.addLeadNote(lead.id, note.trim()), 'Note added to activity.', true)}>Save note</button>
      </div>
      {legacyNotes.length > 0 && <details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Earlier notes ({legacyNotes.length})</summary>{legacyNotes.map((text, i) => <p key={i} className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{text}</p>)}</details>}
    </section>
    {!!detail?.tasks.length && !detailError && <section aria-label="Lead tasks" className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Tasks</h3>
      {detail.tasks.map(task => <div key={task.id} className="mt-3 flex items-start justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        <div><p className="font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.status}{task.due_at ? ` · ${dateLabel(task.due_at)}` : ''}</p></div>
        {!['done', 'cancelled'].includes(task.status) && <button className={button} disabled={busy || loading} onClick={() => void save(() => api.completeLeadTask(task.id), 'Task completed.')}>Mark done</button>}
      </div>)}
      <Pager page={taskPage} count={detail.taskCount || 0} label="Tasks" onChange={setTaskPage} disabled={loading || busy}/>
    </section>}
  </div>;
}
