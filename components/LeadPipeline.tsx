import React, {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../services/api';
import type {LeadCrmRecord} from '../types/lead-crm';
import AppModal from './AppModal';

const stages = [['new','New'],['contacted','Contacted'],['qualified','Qualified'],['appointment_set','Appointment set'],['proposal_sent','Proposal sent'],['won','Won'],['lost','Lost']];
const field = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
const button = `${field} font-semibold disabled:opacity-50 hover:border-amber-400`;
type Page = {leads: LeadCrmRecord[]; count: number; hasMore: boolean};
type Detail = Awaited<ReturnType<typeof api.leadQualification>>;

export default function LeadPipeline({mode,agents,onChanged}:{mode:'hot'|'pipeline';agents:{id:string;name:string}[];onChanged:()=>void}) {
  const [agent,setAgent]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState('');
  const [pages,setPages]=useState<Record<string,Page>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [detail,setDetail]=useState<Detail|null>(null),[selectedId,setSelectedId]=useState('');
  const [action,setAction]=useState(''),[due,setDue]=useState('');
  const generation=useRef(0),detailRequest=useRef(0);
  const filters={voice_agent_id:agent,search:query,sort:'priority',limit:'20'};
  const keys=mode==='hot' ? ['hot'] : stages.map(s=>s[0]);
  const fetchPage=(key:string,offset=0)=>api.listCrmLeads({...filters,offset:String(offset),...(key==='hot' ? {temperature:'hot',active_only:'true'} : {stage:key})});
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    const request=++generation.current;setPages({});setLoading(true);setError('');setDetail(null);setSelectedId('');detailRequest.current++;
    Promise.all(keys.map(async key=>[key,await fetchPage(key)] as const)).then(results=>{if(request===generation.current)setPages(Object.fromEntries(results));})
      .catch(e=>{if(request===generation.current)setError(e.message);}).finally(()=>{if(request===generation.current)setLoading(false);});
    return()=>{generation.current++;};
  },[mode,agent,query,revision]);
  async function loadMore(key:string) {
    const request=generation.current;setBusy(true);setError('');
    try {const page=await fetchPage(key,pages[key].leads.length);if(request===generation.current)setPages(p=>({...p,[key]:{...page,leads:[...p[key].leads,...page.leads]}}));}
    catch(e){if(request===generation.current)setError((e as Error).message);}finally{setBusy(false);}
  }
  async function inspect(id:string) {
    const request=++detailRequest.current;setSelectedId(id);setDetail(null);setError('');
    try {const value=await api.leadQualification(id);if(request===detailRequest.current){setDetail(value);setAction(value.lead.next_action || '');setDue(value.lead.next_action_due_at?.slice(0,10) || '');}}
    catch(e){if(request===detailRequest.current){setError((e as Error).message);setSelectedId('');}}
  }
  async function update(id:string,patch:Record<string,unknown>) {
    setBusy(true);setError('');
    try {await api.updateCrmLead(id,patch);onChanged();setRevision(v=>v+1);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const card=(lead:LeadCrmRecord)=><article key={lead.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <button className="text-left font-bold text-slate-900 hover:underline" onClick={()=>void inspect(lead.id)}>{lead.name || 'Unnamed lead'}</button>
    <p className="text-xs text-slate-500">{lead.email || lead.phone || 'No contact saved'}</p>
    <p className="text-sm font-semibold">{lead.ai_score ?? 0}/100 · {lead.lead_temperature || 'Unscored'}{lead.ai_confidence!=null ? ` · ${Math.round(Number(lead.ai_confidence)*100)}% confidence` : ''}</p>
    {lead.needs_human_review && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Review needed: {lead.human_review_reason || 'Check the qualification evidence.'}</p>}
    <p className="text-sm text-slate-600">{lead.ai_summary || 'No assessment yet.'}</p>
    <p className="text-xs text-slate-600">Next: {lead.next_action || 'Choose a follow-up'}{lead.next_action_due_at ? ` · ${new Date(lead.next_action_due_at).toLocaleDateString()}` : ''}</p>
    <label className="block text-xs text-slate-500">Stage<select aria-label={`Stage for ${lead.name || 'Unnamed lead'}`} className={`${field} mt-1 w-full`} disabled={busy} value={lead.crm_stage || 'new'} onChange={e=>void update(lead.id,{crm_stage:e.target.value})}>{stages.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <button className="text-xs font-semibold text-amber-800 underline" onClick={()=>void inspect(lead.id)}>Evidence & follow-up</button>
  </article>;
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2"><select aria-label="Filter by agent" value={agent} disabled={busy} onChange={e=>setAgent(e.target.value)} className={field}><option value="">All agents</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><input aria-label="Search pipeline" placeholder="Search leads…" value={search} onChange={e=>setSearch(e.target.value)} className={`${field} flex-1`}/><button disabled={loading || busy} className={button} onClick={()=>setRevision(v=>v+1)}>Refresh</button></div>
    <p className="text-sm text-slate-500">{mode==='hot' ? 'Hot leads, highest score first. Won and lost leads are excluded. Open a lead to see the evidence behind its assessment.' : 'Move leads between your existing CRM stages. Changing a stage records progress; it does not book or cancel an appointment.'}</p>
    <p className="text-xs text-slate-500">For email follow-ups, open your agent from the navbar and choose Automations → Lead nurture follow-up.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p role="status">Loading leads…</p> : <div className={mode==='pipeline' ? 'flex gap-4 overflow-x-auto pb-4' : ''}>{keys.map(key=><section key={key} aria-label={key==='hot' ? 'Hot leads' : stages.find(s=>s[0]===key)?.[1]} className={mode==='pipeline' ? 'w-72 shrink-0 rounded-2xl bg-slate-50 p-3' : ''}>
      <h3 className="mb-3 font-bold">{key==='hot' ? 'Hot leads' : stages.find(s=>s[0]===key)?.[1]} <span className="text-slate-500">{pages[key]?.count ?? 0}</span></h3>
      <div className={mode==='hot' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>{pages[key]?.leads.map(card)}</div>
      {!pages[key]?.leads.length && <p className="py-4 text-sm text-slate-500">No leads here yet.</p>}
      {pages[key]?.hasMore && <button disabled={busy} className={`${button} mt-3`} onClick={()=>void loadMore(key)}>Load more</button>}
    </section>)}</div>}
    {selectedId && <AppModal open onClose={()=>{detailRequest.current++;setSelectedId('');setDetail(null);}} title={detail?.lead.name || 'Lead assessment'} size="lg">
      {!detail ? <p>Loading assessment…</p> : <div className="space-y-4">
        <p>{detail.lead.ai_summary || 'No summary saved.'}</p>
        {detail.assessment ? <div><h3 className="font-semibold">Latest call assessment · {new Date(detail.assessment.occurred_at).toLocaleString()}</h3><p className="text-sm text-slate-500">Assessment score: {detail.assessment.metadata?.score ?? 'Unknown'}/100. AI evidence should be checked against the call when uncertain.</p><ul className="ml-5 list-disc text-sm">{(detail.assessment.metadata?.evidence || []).map((fact,i)=><li key={i}>{fact}</li>)}</ul></div> : <p className="text-sm text-slate-500">No playbook assessment is saved. This score may come from activity signals or a manual update.</p>}
        {detail.lead.needs_human_review && <div className="rounded-xl bg-amber-50 p-3"><p>{detail.lead.human_review_reason || 'Please review this lead.'}</p><button disabled={busy} className={`${button} mt-2`} onClick={()=>void update(detail.lead.id,{needs_human_review:false,human_review_reason:null,activity_note:'Owner reviewed the qualification evidence.'})}>Mark reviewed</button></div>}
        <label className="block text-sm">Next action<input className={`${field} mt-1 w-full`} value={action} onChange={e=>setAction(e.target.value)} maxLength={500}/></label>
        <label className="block text-sm">Follow-up date (UTC)<input type="date" className={`${field} ml-2`} value={due} onChange={e=>setDue(e.target.value)}/></label>
        <p className="text-xs text-slate-500">The nurture rule can prepare one email when this date is due, if the lead qualifies. Saving a date does not send an email.</p>
        <button className={button} disabled={busy || (!!due && !action.trim())} onClick={()=>void update(detail.lead.id,{next_action:action.trim() || null,next_action_due_at:due ? new Date(`${due}T09:00:00.000Z`).toISOString() : null})}>Save follow-up</button>
        <Link className="ml-3 text-sm underline" to="/operator">Open agent workspace</Link>
      </div>}
    </AppModal>}
  </section>;
}
