import React from "react";
import {useWebcall} from "../contexts/WebcallContext";
const labels:Record<string,string>={book_appointment:"Book appointment",cancel_appointment:"Cancel appointment",reschedule_appointment:"Reschedule appointment",update_lead_contact:"Update contact",send_prepared_emails:"Send emails"};
export default function VoiceActions(){
 const call=useWebcall();
 if(call.mode!=="owner" || !call.actions?.length)return null;
 return <section aria-label="Voice action reviews" className="space-y-3 p-3">{call.actions.map(action=><article key={action.id} className="rounded-xl border bg-white p-3 text-slate-800">
   <div className="flex justify-between gap-2"><strong>{labels[action.name] || "Business action"}</strong><span className="text-xs">{action.state}</span></div>
   {action.preview?.recipients ? action.preview.recipients.map((r:any,i:number)=><div key={i} className="mt-2 rounded border p-2 text-xs"><p>{r.name} · {r.to}</p><strong>{r.subject}</strong><p className="whitespace-pre-wrap">{r.body}</p></div>) : <dl className="my-2 text-xs">{Object.entries(action.preview || action.args).map(([k,v])=><div key={k}><dt className="inline font-semibold">{k.replaceAll("_"," ")}: </dt><dd className="inline break-words">{String(v)}</dd></div>)}</dl>}
   {action.result && <p role="status" className="mt-2 text-xs">{action.result.message || (action.result.success ? "Completed successfully." : "Could not complete this action.")}{typeof action.result.sent==="number" ? ` Sent ${action.result.sent}; failed ${action.result.failed || 0}.` : ""}</p>}
   {action.state==="pending" && <div className="mt-2 flex gap-2"><button disabled={!call.isCallLive} onClick={()=>call.decideAction(action.id,"approve")} className="rounded bg-orange-700 px-3 py-2 text-sm text-white">Approve action</button><button disabled={!call.isCallLive} onClick={()=>call.decideAction(action.id,"cancel")} className="rounded border px-3 py-2 text-sm">Cancel</button></div>}
   {action.state==="completed" && action.name.includes("appointment") && <a href="/bookings" className="text-xs underline">Open appointments</a>}
   {action.state==="completed" && action.name==="send_prepared_emails" && <a href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noreferrer" className="text-xs underline">Open Gmail Sent</a>}
 </article>)}</section>;
}
