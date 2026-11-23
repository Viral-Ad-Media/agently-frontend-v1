import React, {useEffect,useState} from 'react';
import {api} from '../services/api';
import {clearSessionToken} from '../services/session';
type Session=Awaited<ReturnType<typeof api.listSessions>>['sessions'][number];
export default function SessionSecurity(){
 const [sessions,setSessions]=useState<Session[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{try{const result=await api.listSessions();setSessions(result.sessions);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load signed-in devices.');}};
 useEffect(()=>{void refresh();},[]);
 const signOut=async(id?:string)=>{
  setBusy(true);setError('');
  try{
   if(id){await api.revokeSession(id);await refresh();}
   else{await api.logoutEverywhere();clearSessionToken();window.location.assign('/login');}
  }catch(e){setError(e instanceof Error?e.message:'Sign-out could not be confirmed. Please retry.');}
  finally{setBusy(false);}
 };
 return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="session-security-heading">
  <h2 id="session-security-heading" className="text-lg font-semibold text-slate-900">Signed-in devices</h2>
  <p className="mt-2 text-sm text-slate-600">Sessions end after 30 minutes without a request or eight hours after signing in. Up to three sessions can stay signed in; a new sign-in replaces the oldest.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  <ul className="mt-4 divide-y divide-slate-100">{sessions.map(session=><li key={session.id} className="flex items-center justify-between gap-4 py-4">
   <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{session.client||'Browser'} {session.current&&<span className="ml-2 text-xs text-indigo-600">This device</span>}</p>
    <p className="mt-1 truncate text-xs text-slate-500" title={session.user_agent||''}>{session.user_agent||'Device information unavailable'}</p>
    <p className="mt-1 text-xs text-slate-500">Last active {new Date(session.last_seen_at).toLocaleString()} · {session.request_ip||'Address unavailable'}</p></div>
   {!session.current&&<button type="button" disabled={busy} onClick={()=>void signOut(session.id)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50">Sign out</button>}
  </li>)}</ul>
  <div className="mt-4 flex gap-3"><button type="button" disabled={busy} onClick={()=>void signOut()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Sign out all devices</button>
   <button type="button" disabled={busy} onClick={()=>void refresh()} className="px-3 py-2 text-sm font-medium text-slate-600">Refresh</button></div>
 </section>;
}
