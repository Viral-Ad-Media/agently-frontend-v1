import VoiceSetup from "../components/VoiceSetup";
import VoiceActions from "../components/VoiceActions";
import OperatorWorkspace from "../components/OperatorWorkspace";
import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import BrandSurface, { BTN_PRIMARY, BTN_SECONDARY, CARD, EYEBROW, FIELD, PANEL_ACCENT } from "../components/BrandSurface";
import type { OperatorPendingAction, OperatorReference } from "../services/api";
import { api } from "../services/api";
import type { Organization, User } from "../types";
import { useWebcall } from "../contexts/WebcallContext";

type Message = {
  role: "user" | "assistant";
  content: string;
  references?: OperatorReference[];
};
type ActionCard = OperatorPendingAction & {
  agentName: string;
  state: "pending" | "working" | "completed" | "partial" | "cancelled" | "failed" | "expired";
  result?: string;
};

const suggestions = [
  "What appointments do I have today?",
  "Give me a 30-day business and outreach summary.",
  "What information does your knowledge base have about our products?",
  "Find leads tagged VIP.",
];

const friendlyError = (error: unknown) =>
  error instanceof Error ? error.message : "That request did not complete. Please try again.";

const Operator: React.FC<{ org: Organization; user: User | null }> = ({ org, user }) => {
  const agents = useMemo(() => {
    const available = org.voiceAgents?.filter((agent) => agent?.id) || [];
    return available.length ? available : org.agent?.id ? [org.agent] : [];
  }, [org.agent, org.voiceAgents]);
  const storageKey = `agently:owner-operator-agent:${org.id}`;
  const [agentId, setAgentId] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem(storageKey) || org.activeVoiceAgentId || org.agent?.id || "";
      } catch { /* Private browsing can disable localStorage. */ }
    }
    return org.activeVoiceAgentId || org.agent?.id || "";
  });
  const selectedAgent = agents.find((agent) => agent.id === agentId) || agents[0];
  const [messages, setMessages] = useState<Message[]>([]);
  const [cards, setCards] = useState<ActionCard[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastAnnouncedAgentId = useRef(agentId);
  const webcall = useWebcall();

  useEffect(() => {
    if (!agents.some((agent) => agent.id === agentId) && agents[0]) setAgentId(agents[0].id);
  }, [agentId, agents]);
  useEffect(() => {
    if (!agentId) return;
    try {
      window.localStorage.setItem(storageKey, agentId);
      if (lastAnnouncedAgentId.current !== agentId) {
        lastAnnouncedAgentId.current = agentId;
        window.dispatchEvent(new Event("agently:operator-agent-changed"));
      }
    } catch { /* Optional preference only. */ }
  }, [agentId, storageKey]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, cards]);

  useEffect(()=>{
    let active=true;
    if(!selectedAgent?.id || !user || !["Owner","Admin"].includes(user.role))return;
    api.operatorWorkspace(selectedAgent.id,"actions").then(data=>{if(active)setCards((data.actions || []).map((action:any)=>({...action,agentName:selectedAgent.name,state:action.state==="processing" ? "working" : action.result?.partial ? "partial" : action.state,result:action.result?.message || (action.result?.sent != null ? `Sent ${action.result.sent} of ${action.result.total}.` : undefined)})));}).catch(()=>{});
    return()=>{active=false;};
  },[selectedAgent?.id,user?.id]);
  if (!user || !["Owner", "Admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const send = async (event?: FormEvent, submittedText?: string) => {
    event?.preventDefault();
    const text = (submittedText ?? draft).trim();
    if (!text || !selectedAgent || busy) return;
    const prior = messages;
    setDraft("");
    setError("");
    setBusy(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const response = await api.operatorChat({
        agentId: selectedAgent.id,
        message: text,
        history: prior.slice(-14).map(({ role, content }) => ({ role, content })),
      });
      setMessages((current) => [...current, {
        role: "assistant",
        content: response.reply || "I’m ready. What would you like me to look into?",
        references: response.references || [],
      }]);
      if (response.pendingActions?.length) {
        setCards((current) => [
          ...response.pendingActions.map((action) => ({ ...action, agentName: selectedAgent.name, state: "pending" as const })),
          ...current,
        ]);
      }
    } catch (requestError) {
      setMessages((current) => [...current, { role: "assistant", content: `I couldn’t complete that request. ${friendlyError(requestError)}` }]);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (card: ActionCard) => {
    if (actionBusyId || card.state !== "pending") return;
    setActionBusyId(card.id);
    setCards((current) => current.map((item) => item.id === card.id ? { ...item, state: "working" } : item));
    try {
      const result = await api.confirmOperatorAction(card.id);
      const failures = result.results?.filter((item) => !item.sent) || [];
      const detail = result.message || (card.type === "send_emails"
        ? result.success
          ? `Sent ${result.sent || 0} of ${result.total || result.sent || 0} approved emails${failures.length ? `. Not sent: ${failures.map((item) => item.name).join(", ")}.` : "."}`
          : failures.length ? `No emails were sent. ${failures.map((item) => `${item.name}: ${item.message || "send failed"}`).join("; ")}` : "No emails were sent. Reconnect Gmail and prepare the drafts again."
        : result.success ? `Appointment moved to ${result.localTime || "the approved time"}.` : "No change was completed. Please review the calendar and prepare it again.");
      const state = result.partial ? "partial" : result.success ? "completed" : "failed";
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, state, result: detail } : item));
    } catch (requestError) {
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, state: "failed", result: friendlyError(requestError) } : item));
    } finally {
      setActionBusyId(null);
    }
  };

  const cancel = async (card: ActionCard) => {
    if (actionBusyId || card.state !== "pending") return;
    setActionBusyId(card.id);
    try {
      await api.cancelOperatorAction(card.id);
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, state: "cancelled", result: "Cancelled. No email was sent and no calendar change was made." } : item));
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <BrandSurface className="h-full min-h-full overflow-y-auto">
      <main className="mx-auto flex min-h-full max-w-[1480px] flex-col px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
        <div className="mb-6 flex flex-col gap-5 border-b border-[var(--line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className={EYEBROW}>Private workspace · owner mode</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">Talk to {selectedAgent?.name || "your agent"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Ask about this business, its calendar, leads, outreach, or agent knowledge. Any email or calendar change is shown for your review before it runs.
            </p>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1">
              <span className={EYEBROW}>Business agent</span>
              <select
                aria-label="Choose business agent"
                value={selectedAgent?.id || ""}
                onChange={(event) => { setAgentId(event.target.value); setMessages([]); setCards([]); setError(""); }}
                className={`${FIELD} mt-2 h-11`}
                disabled={!agents.length || busy || webcall.isCallLive}
              >
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => selectedAgent && void webcall.startCall(selectedAgent, org, "owner")}
              disabled={!selectedAgent || webcall.status === "connecting" || webcall.status === "ready"}
              className={BTN_PRIMARY + " h-11 shrink-0 justify-center"}
              aria-label={`Talk to ${selectedAgent?.name || "your agent"} by voice`}
            >
              <i className="fa-solid fa-microphone" aria-hidden="true" />
              <span>{webcall.status === "connecting" || webcall.status === "ready" ? "Voice session active" : "Talk by voice"}</span>
            </button>
          </div>
        </div>

        {selectedAgent && <OperatorWorkspace agentId={selectedAgent.id} />}
        <div className="mb-4"><VoiceSetup /></div>
        {!agents.length ? (
          <div className={`${CARD} mx-auto my-10 max-w-xl p-8 text-center`}>
            <h3 className="text-xl font-semibold">Create a voice agent first</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">The operator needs an agent so it knows which business, calendar, and knowledge base you mean.</p>
          </div>
        ) : (
          <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
            <section className={`${CARD} flex min-h-[520px] flex-col overflow-hidden`} aria-label="Owner operator conversation">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
                <div>
                  <p className="text-sm font-semibold">{selectedAgent?.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{org.profile?.name || "Selected business"} · owner conversation</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--warm)] px-3 py-1.5 text-[11px] text-[var(--muted)]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Separate from Live Call
                </span>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
                {!messages.length && (
                  <div className="mx-auto max-w-xl py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--orange-tint)] text-[var(--orange-deep)]"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /></div>
                    <h3 className="mt-4 text-lg font-semibold">What should we take care of?</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">I’m here as your business operator, not as a caller-facing agent.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.map((suggestion) => (
                        <button key={suggestion} type="button" onClick={() => void send(undefined, suggestion)} disabled={busy} className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--ink)] transition hover:border-[var(--orange)] disabled:opacity-50">{suggestion}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message, index) => (
                  <article key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[82%] ${message.role === "user" ? "rounded-br-md bg-[var(--deep)] text-[var(--on-deep)]" : "rounded-bl-md bg-[var(--warm)] text-[var(--ink)]"}`}>
                      {message.role === "assistant" && <p className="mb-1 font-['IBM_Plex_Mono',monospace] text-[10px] uppercase tracking-wider text-[var(--muted)]">{selectedAgent?.name} · operator</p>}
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                      {message.references?.length ? <div className="mt-3 border-t border-black/10 pt-2"><p className="font-['IBM_Plex_Mono',monospace] text-[10px] uppercase tracking-wider text-[var(--muted)]">Knowledge sources</p><div className="mt-1 flex flex-wrap gap-2">{message.references.map((source, sourceIndex) => source.url ? <a key={`${source.source}-${sourceIndex}`} href={source.url} target="_blank" rel="noreferrer" className="text-xs text-[var(--orange-deep)] underline">{source.source}</a> : <span key={`${source.source}-${sourceIndex}`} className="text-xs text-[var(--muted)]">{source.source}</span>)}</div></div> : null}
                    </div>
                  </article>
                ))}
                {busy && <div className="flex items-center gap-2 text-sm text-[var(--muted)]" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--orange)]" /> Looking into that…</div>}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={(event) => void send(event)} className="border-t border-[var(--line)] bg-[var(--bg)] p-3 sm:p-4">
                {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    aria-label="Message your operator"
                    className={`${FIELD} max-h-36 min-h-[48px] resize-y`}
                    placeholder="Ask about the business, or give the operator a task…"
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={busy}
                  />
                  <button className={BTN_PRIMARY} type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><i className="fa-solid fa-arrow-up" aria-hidden="true" /><span className="hidden sm:inline">Send</span></button>
                </div>
                <p className="mt-2 px-1 text-[11px] text-[var(--muted)]">Enter to send · Shift + Enter for a new line</p>
              </form>
            </section>

            <aside className="space-y-4" aria-label="Action reviews">
              {webcall.agentId===selectedAgent?.id && <VoiceActions />}
              <div className="flex items-end justify-between gap-3">
                <div><p className={EYEBROW}>Review before action</p><h3 className="mt-1 text-xl font-semibold">Approvals</h3></div>
                {cards.some((card) => card.state === "pending") && <span className="rounded-full bg-[var(--orange-tint)] px-2.5 py-1 text-xs font-medium text-[var(--orange-deep)]">Needs review</span>}
              </div>
              {!cards.length ? (
                <div className={`${CARD} p-5`}><p className="text-sm text-[var(--muted)]">When the operator drafts an email or proposes a calendar change, you’ll review it here. Nothing is sent or moved without your approval.</p></div>
              ) : cards.map((card) => (
                <article key={card.id} className={`${CARD} overflow-hidden`}>
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                    <div><p className="text-sm font-semibold">{card.type === "send_emails" ? "Email draft" : "Appointment reschedule"}</p><p className="mt-1 text-xs text-[var(--muted)]">For {card.agentName} · {card.business || org.profile?.name || "business"}</p></div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase ${card.state === "pending" ? "bg-[var(--orange-tint)] text-[var(--orange-deep)]" : card.state === "completed" ? "bg-emerald-50 text-emerald-800" : card.state === "partial" ? "bg-amber-50 text-amber-800" : card.state === "working" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500"}`}>{card.state === "working" ? "working" : card.state}</span>
                  </div>
                  <div className="space-y-3 p-4">
                    <p className="text-sm text-[var(--muted)]">{card.summary}</p>
                    {card.state === "pending" && card.expiresAt && <p className="text-[11px] text-[var(--muted)]">Review by {new Date(card.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; drafts expire for safety.</p>}
                    {card.type === "send_emails" && card.recipients?.map((recipient, index) => <div key={`${recipient.to}-${index}`} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3"><p className="text-xs font-semibold">{recipient.name} <span className="font-normal text-[var(--muted)]">· {recipient.to}</span></p><p className="mt-2 text-xs font-semibold">{recipient.subject}</p><p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">{recipient.body}</p></div>)}
                    {card.type === "reschedule_appointment" && <div className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm"><p className="font-medium">{card.appointment}</p><p className="mt-2 text-xs text-[var(--muted)]">Current: {card.oldTime}</p><p className="mt-1 text-xs font-medium text-[var(--orange-deep)]">Proposed: {card.newTime}</p></div>}
                    {card.state === "pending" && <div className={PANEL_ACCENT + " p-3 text-xs leading-5 text-[var(--ink)]"}>{card.type === "send_emails" ? "Review every recipient and draft. Confirming sends these emails through your connected Gmail account." : "Confirming moves the appointment on this business calendar. The time will be checked again before the change."}</div>}
                    {card.result && <p className={`text-xs leading-5 ${card.state === "completed" ? "text-emerald-800" : card.state === "partial" ? "text-amber-800" : card.state === "failed" ? "text-red-700" : "text-[var(--muted)]"}`} role={card.state === "failed" ? "alert" : undefined}>{card.result}</p>}
                    {card.type === "send_emails" && ["partial","failed"].includes(card.state) && <button disabled={Boolean(actionBusyId)} className={BTN_SECONDARY} onClick={async()=>{setActionBusyId(card.id);try{const response=await api.retryOperatorAction(card.id);setCards(current=>[{...response.pendingAction,agentName:card.agentName,state:"pending"},...current]);}catch(e){setError(friendlyError(e));}finally{setActionBusyId(null);}}}>Review unsent emails</button>}
                    {card.state === "completed" && <a className="text-xs underline" href={card.type==="send_emails" ? "https://mail.google.com/mail/u/0/#sent" : "/bookings"} target="_blank" rel="noreferrer">Open {card.type==="send_emails" ? "Gmail Sent" : "appointments"}</a>}
                    {card.state === "pending" && <div className="flex gap-2"><button type="button" onClick={() => void confirm(card)} disabled={Boolean(actionBusyId)} className={BTN_PRIMARY + " flex-1"}>{card.type === "send_emails" ? "Approve & send" : "Approve change"}</button><button type="button" onClick={() => void cancel(card)} disabled={Boolean(actionBusyId)} className={BTN_SECONDARY}>Cancel</button></div>}
                  </div>
                </article>
              ))}
            </aside>
          </div>
        )}
      </main>
    </BrandSurface>
  );
};

export default Operator;
