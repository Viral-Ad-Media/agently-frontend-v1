import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import RegionOverlay from "../components/RegionOverlay";
import type {
  ChatConversation,
  ChatInboxMedia,
  ChatInboxMessage,
  FrontDeskKpis,
  FrontDeskSettings,
  LeadQuote,
  PriceSheetItem,
} from "../types";

/**
 * Front Desk: where the owner works the website chat.
 *  - Inbox: every chat, live. Open one, take it over from the assistant,
 *    reply. If the customer has left, the reply is emailed with a link that
 *    reopens the same chat.
 *  - Quotes: estimates built from customer photos and the price list.
 *    Anything over the auto-send limit waits here for approval.
 *  - Price list: the items and prices quotes are built from, and the limit.
 */

type Tab = "inbox" | "quotes" | "prices";
type Toast = { ok: boolean; msg: string } | null;

const UNITS = ["ea", "hr", "sq", "sqft", "lf", "ft", "m", "m2", "job", "visit"];

function money(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(cents / 100));
  } catch {
    return `${currency} ${Math.round(cents / 100)}`;
  }
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function duration(seconds: number | null) {
  if (seconds == null) return "–";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const label = "text-[10px] font-black uppercase tracking-widest text-slate-400";
const card = "rounded-2xl border border-slate-200 bg-white";
const btn = "rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50";
const btnDark = `${btn} bg-slate-900 text-white hover:bg-slate-800`;
const btnLight = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

const STATUS_CHIP: Record<ChatConversation["status"], { text: string; cls: string }> = {
  ai: { text: "Assistant", cls: "bg-slate-100 text-slate-600" },
  human: { text: "You", cls: "bg-indigo-50 text-indigo-700" },
  closed: { text: "Closed", cls: "bg-slate-50 text-slate-400" },
};

const QUOTE_CHIP: Record<string, { text: string; cls: string }> = {
  draft: { text: "Waiting for contact details", cls: "bg-slate-100 text-slate-600" },
  pending_approval: { text: "Needs your approval", cls: "bg-amber-50 text-amber-700" },
  sent: { text: "Sent", cls: "bg-sky-50 text-sky-700" },
  accepted: { text: "Accepted", cls: "bg-emerald-50 text-emerald-700" },
  declined: { text: "Declined", cls: "bg-slate-100 text-slate-500" },
  void: { text: "Cancelled", cls: "bg-slate-50 text-slate-400" },
};

/* ── KPI strip ─────────────────────────────────────────────── */
const Kpis: React.FC<{ kpis: FrontDeskKpis | null }> = ({ kpis }) => {
  const tiles = [
    { k: "Unread chats", v: kpis ? String(kpis.conversationsUnread) : "–" },
    { k: "Photos received", v: kpis ? String(kpis.photosReceived) : "–" },
    { k: "Quotes sent", v: kpis ? String(kpis.quotesSent) : "–" },
    { k: "Awaiting approval", v: kpis ? String(kpis.quotesPendingApproval) : "–" },
    { k: "Time to quote", v: kpis ? duration(kpis.medianSecondsToQuote) : "–" },
    { k: "Booked after quote", v: kpis && kpis.bookedRate != null ? `${Math.round(kpis.bookedRate * 100)}%` : "–" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.k} className={`${card} p-3`}>
          <p className={label}>{t.k}</p>
          <p className="mt-1 text-xl font-black text-slate-900">{t.v}</p>
        </div>
      ))}
    </div>
  );
};

/* ── Inbox ─────────────────────────────────────────────────── */
const Inbox: React.FC<{ notify: (ok: boolean, msg: string) => void; onChange: () => void }> = ({ notify, onChange }) => {
  const [list, setList] = useState<ChatConversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<{
    conversation: ChatConversation;
    messages: ChatInboxMessage[];
    media: Record<string, ChatInboxMedia>;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef(0);

  const loadList = useCallback(async () => {
    try {
      const r = await api.listConversations();
      setList(r.conversations || []);
    } catch {
      setList((l) => l || []);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const r = await api.getConversation(id);
      setThread(r);
    } catch {
      /* keep what is on screen */
    }
  }, []);

  useEffect(() => {
    void loadList();
    const t = window.setInterval(() => void loadList(), 15000);
    return () => window.clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!activeId) return;
    setThread(null);
    countRef.current = 0;
    void loadThread(activeId);
    const t = window.setInterval(() => void loadThread(activeId), 6000);
    return () => window.clearInterval(t);
  }, [activeId, loadThread]);

  useEffect(() => {
    const n = thread?.messages.length || 0;
    if (n !== countRef.current) {
      countRef.current = n;
      endRef.current?.scrollIntoView?.({ block: "end" });
    }
  }, [thread]);

  const conv = thread?.conversation;

  const send = async () => {
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.replyToConversation(activeId, draft.trim());
      setDraft("");
      const how: Record<string, string> = {
        live: "Sent. They're in the chat now.",
        live_and_email: "Sent in chat and by email.",
        email: "They've left the site, so this was emailed with a link back to the chat.",
        email_failed: "Saved, but the email didn't go out. They'll see it if they return.",
        waiting: "Saved. They'll see it when they return to the chat.",
        no_email: "Saved. They've left and gave no email, so they'll only see it if they come back.",
      };
      notify(r.delivery !== "email_failed", how[r.delivery] || "Sent.");
      await loadThread(activeId);
      void loadList();
    } catch (e) {
      notify(false, errText(e, "Reply failed."));
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: ChatConversation["status"]) => {
    if (!activeId) return;
    try {
      await api.setConversationStatus(activeId, status);
      await loadThread(activeId);
      void loadList();
      onChange();
    } catch (e) {
      notify(false, errText(e, "Couldn't update the chat."));
    }
  };

  const remove = async () => {
    if (!activeId || !window.confirm("Delete this chat and its messages? This can't be undone.")) return;
    try {
      await api.deleteConversation(activeId);
      setActiveId(null);
      setThread(null);
      void loadList();
    } catch (e) {
      notify(false, errText(e, "Delete failed."));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className={`${card} max-h-[70vh] overflow-y-auto ${activeId ? "hidden lg:block" : ""}`}>
        {list === null ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : list.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-slate-700">No chats yet</p>
            <p className="mt-1 text-xs text-slate-500">
              When someone messages your website chat, the conversation appears here while it's happening.
            </p>
          </div>
        ) : (
          list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${activeId === c.id ? "bg-slate-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{c.leadName || "Website visitor"}</span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">{c.unread}</span>
                )}
                <span className="text-[10px] font-semibold text-slate-400">{ago(c.lastMessageAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{c.lastPreview || "…"}</p>
              <div className="mt-1 flex gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP[c.status].cls}`}>
                  {STATUS_CHIP[c.status].text}
                </span>
                {c.temporary && (
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400">No details yet</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <div className={`${card} flex min-h-[50vh] flex-col ${activeId ? "" : "hidden lg:flex"}`}>
        {!activeId ? (
          <div className="m-auto p-8 text-center text-sm text-slate-400">Pick a chat to read it and reply.</div>
        ) : !conv ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <button type="button" className={`${btnLight} lg:hidden`} onClick={() => setActiveId(null)}>
                Back
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900">{conv.leadName || "Website visitor"}</p>
                <p className="truncate text-xs text-slate-500">
                  {[conv.leadEmail, conv.leadPhone].filter(Boolean).join(" · ") ||
                    "No contact details yet. This chat is deleted after 24 hours unless they leave some."}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${conv.visitorLive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {conv.visitorLive ? "In the chat now" : "Not on the site"}
              </span>
              {conv.status === "human" ? (
                <button type="button" className={btnLight} onClick={() => void setStatus("ai")}>
                  Hand back to assistant
                </button>
              ) : (
                <button type="button" className={btnLight} onClick={() => void setStatus("human")}>
                  Take over
                </button>
              )}
              {conv.status !== "closed" && (
                <button type="button" className={btnLight} onClick={() => void setStatus("closed")}>
                  Close
                </button>
              )}
              <button type="button" className={`${btn} text-slate-400 hover:text-rose-600`} onClick={() => void remove()}>
                Delete
              </button>
            </div>

            <div className="max-h-[55vh] flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {thread!.messages.map((m) => {
                const mine = m.role !== "visitor";
                const media = m.mediaId ? thread!.media[m.mediaId] : null;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.role === "visitor"
                          ? "bg-white text-slate-800 border border-slate-200"
                          : m.role === "owner"
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      <p className={`mb-0.5 text-[10px] font-black uppercase tracking-widest ${m.role === "owner" ? "text-indigo-200" : "text-slate-400"}`}>
                        {m.role === "visitor" ? "Customer" : m.role === "owner" ? "You" : "Assistant"} ·{" "}
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {media &&
                        (media.kind === "video" ? (
                          <video src={media.url || undefined} poster={media.posterUrl || undefined} controls playsInline preload="none" className="mb-1 w-64 max-w-full rounded-lg" />
                        ) : media.url ? (
                          <div className="mb-1 w-64 max-w-full overflow-hidden rounded-lg">
                            <RegionOverlay src={media.url} alt={media.summary || "Customer photo"} regions={media.regions} />
                          </div>
                        ) : null)}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="border-t border-slate-100 p-3">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                  }}
                  rows={2}
                  maxLength={4000}
                  aria-label="Reply to customer"
                  placeholder="Write a reply…"
                  className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <button type="button" className={btnDark} disabled={sending || !draft.trim()} onClick={() => void send()}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {conv.status === "human"
                  ? "You've taken this chat over. The assistant stays quiet until you hand it back."
                  : "Replying takes the chat over from the assistant."}{" "}
                {conv.visitorLive
                  ? "They'll see your reply in the chat."
                  : conv.leadEmail
                    ? "They've left the site, so your reply is emailed with a link back to this chat."
                    : "They've left and gave no email, so they'll only see it if they return."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ── Quotes ────────────────────────────────────────────────── */
const Quotes: React.FC<{ notify: (ok: boolean, msg: string) => void; onChange: () => void }> = ({ notify, onChange }) => {
  const [quotes, setQuotes] = useState<LeadQuote[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  const load = useCallback(async () => {
    try {
      const r = await api.listQuotes();
      setQuotes(r.quotes || []);
    } catch {
      setQuotes([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const sorted = useMemo(
    () => [...(quotes || [])].sort((a, b) => Number(b.status === "pending_approval") - Number(a.status === "pending_approval")),
    [quotes],
  );

  const act = async (q: LeadQuote, what: "approve" | "void" | "save") => {
    setBusy(q.id);
    try {
      if (what === "save" || (what === "approve" && edits[q.id])) {
        const e = edits[q.id] || {};
        await api.updateQuoteLines(
          q.id,
          q.lines.map((l) => ({ code: l.code, qty: Number(e[l.code] ?? l.qty) })).filter((l) => l.qty > 0),
        );
        setEdits((all) => {
          const next = { ...all };
          delete next[q.id];
          return next;
        });
      }
      if (what === "approve") {
        await api.approveQuote(q.id);
        notify(true, `Quote emailed to ${q.leadEmail || "the customer"}.`);
      } else if (what === "void") {
        await api.voidQuote(q.id);
        notify(true, "Quote cancelled.");
      } else notify(true, "Quote updated.");
      await load();
      onChange();
    } catch (e) {
      notify(false, errText(e, "That didn't work."));
    } finally {
      setBusy(null);
    }
  };

  if (quotes === null) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!quotes.length)
    return (
      <div className={`${card} p-8 text-center`}>
        <p className="text-sm font-bold text-slate-700">No quotes yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Turn quotes on under Price list. Then when a customer sends a photo in chat, the assistant drafts an estimate from your prices
          and it shows up here.
        </p>
      </div>
    );

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {sorted.map((q) => {
        const open = q.status === "pending_approval" || q.status === "draft";
        const chip = QUOTE_CHIP[q.status] || QUOTE_CHIP.draft;
        return (
          <div key={q.id} className={`${card} p-4`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900">{q.leadName || "Website visitor"}</p>
                <p className="truncate text-xs text-slate-500">{q.leadEmail || "No email address yet"}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.text}</span>
            </div>
            {q.summary && <p className="mt-2 text-xs text-slate-600">{q.summary}</p>}
            <table className="mt-3 w-full text-xs">
              <tbody>
                {q.lines.map((l) => (
                  <tr key={l.code} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-700">{l.description}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-500">
                      {open ? (
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Quantity for ${l.description}`}
                          value={edits[q.id]?.[l.code] ?? String(l.qty)}
                          onChange={(e) => setEdits((all) => ({ ...all, [q.id]: { ...(all[q.id] || {}), [l.code]: e.target.value } }))}
                          className="w-16 rounded-lg border border-slate-200 px-1.5 py-0.5 text-right"
                        />
                      ) : (
                        l.qty
                      )}{" "}
                      {l.unit}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-slate-800">{money(l.totalCents, q.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-base font-black text-slate-900">
              {money(q.lowCents, q.currency)} to {money(q.highCents, q.currency)}
            </p>
            <p className="text-[11px] text-slate-400">
              {q.sentAt ? `Emailed ${new Date(q.sentAt).toLocaleString()}` : `Drafted ${new Date(q.createdAt).toLocaleString()}`}
            </p>
            {open && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnDark}
                  disabled={busy === q.id || !q.leadId || !q.leadEmail}
                  title={!q.leadEmail ? "The customer hasn't given an email address yet" : undefined}
                  onClick={() => void act(q, "approve")}
                >
                  {busy === q.id ? "Working…" : "Approve & email"}
                </button>
                {edits[q.id] && (
                  <button type="button" className={btnLight} disabled={busy === q.id} onClick={() => void act(q, "save")}>
                    Save quantities
                  </button>
                )}
                <button type="button" className={btnLight} disabled={busy === q.id} onClick={() => void act(q, "void")}>
                  Cancel quote
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ── Price list & rules ────────────────────────────────────── */
type Row = { code: string; label: string; unit: string; price: string };

const Prices: React.FC<{ notify: (ok: boolean, msg: string) => void }> = ({ notify }) => {
  const [settings, setSettings] = useState<FrontDeskSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [limit, setLimit] = useState("0");
  const [models, setModels] = useState<{ reply: string; assessment: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = (s: FrontDeskSettings) => {
    setSettings(s);
    setRows(s.priceSheet.map((i: PriceSheetItem) => ({ code: i.code, label: i.label, unit: i.unit, price: String(i.priceCents / 100) })));
    setLimit(String(Math.round(s.autoSendLimitCents / 100)));
  };

  useEffect(() => {
    api
      .getFrontDeskSettings()
      .then((r) => {
        apply(r.settings);
        setModels(r.models || null);
      })
      .catch(() => notify(false, "Couldn't load Front Desk settings."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return <p className="text-sm text-slate-400">Loading…</p>;

  const setRow = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async (patch: Partial<FrontDeskSettings> = {}) => {
    setSaving(true);
    try {
      const priceSheet = rows
        .filter((r) => r.label.trim() && r.price !== "" && Number(r.price) >= 0)
        .map((r) => ({ code: r.code, label: r.label.trim(), unit: r.unit, priceCents: Math.round(Number(r.price) * 100) }));
      const r = await api.saveFrontDeskSettings({
        priceSheet,
        autoSendLimitCents: Math.max(0, Math.round(Number(limit) || 0)) * 100,
        quotesEnabled: settings.quotesEnabled,
        conversationsEnabled: settings.conversationsEnabled,
        ...patch,
      });
      apply(r.settings);
      notify(true, "Saved.");
    } catch (e) {
      notify(false, errText(e, "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Quotes from customer photos</p>
            <p className="text-xs text-slate-500">
              The assistant reads the photo and picks items from your price list. The prices are always yours; it never makes one up.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.quotesEnabled}
            aria-label="Quotes from customer photos"
            disabled={saving}
            onClick={() => void save({ quotesEnabled: !settings.quotesEnabled })}
            className={`relative h-6 w-11 rounded-full transition ${settings.quotesEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.quotesEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <p className={label}>Price list</p>
        <div className="mt-2 space-y-2">
          {rows.length === 0 && <p className="text-xs text-slate-500">No items yet. Add the jobs you quote most often.</p>}
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={r.label}
                onChange={(e) => setRow(i, { label: e.target.value })}
                placeholder="What it is, e.g. Replace shingles"
                aria-label="Item name"
                maxLength={120}
                className="min-w-[180px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <span className="text-sm text-slate-400">{settings.currency}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.price}
                onChange={(e) => setRow(i, { price: e.target.value })}
                placeholder="Price"
                aria-label="Price"
                className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <span className="text-xs text-slate-400">per</span>
              <select
                value={r.unit}
                onChange={(e) => setRow(i, { unit: e.target.value })}
                aria-label="Unit"
                className="rounded-xl border border-slate-200 px-2 py-2 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button type="button" className={`${btn} text-slate-400 hover:text-rose-600`} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={`${btnLight} mt-3`} onClick={() => setRows((all) => [...all, { code: "", label: "", unit: "ea", price: "" }])}>
          Add item
        </button>
      </div>

      <div className={`${card} p-4`}>
        <p className={label}>Approval limit</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Email quotes automatically up to</span>
          <span className="text-sm text-slate-400">{settings.currency}</span>
          <input
            type="number"
            min={0}
            step="1"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            aria-label="Auto-send limit"
            className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Quotes above this wait for you under Quotes. Set 0 to approve every quote yourself. Quotes go out by email only.
        </p>
      </div>

      <div className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Keep chat conversations</p>
            <p className="text-xs text-slate-500">
              Needed for the inbox. A chat from someone who leaves no contact details is deleted after 24 hours. Turn off to store no
              chat messages at all.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.conversationsEnabled}
            aria-label="Keep chat conversations"
            disabled={saving}
            onClick={() => void save({ conversationsEnabled: !settings.conversationsEnabled })}
            className={`relative h-6 w-11 rounded-full transition ${settings.conversationsEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.conversationsEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnDark} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save price list"}
        </button>
        {models && (
          <span className="text-[11px] text-slate-400">
            Photo analysis: OpenAI {models.reply}; with quotes on: {models.assessment}
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Page ──────────────────────────────────────────────────── */
const FrontDesk: React.FC = () => {
  const [tab, setTab] = useState<Tab>("inbox");
  const [kpis, setKpis] = useState<FrontDeskKpis | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const loadKpis = useCallback(() => {
    api
      .getFrontDeskKpis(30)
      .then(setKpis)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadKpis();
    const t = window.setInterval(loadKpis, 60000);
    return () => window.clearInterval(t);
  }, [loadKpis]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const notify = useCallback((ok: boolean, msg: string) => setToast({ ok, msg }), []);

  const tabs: { id: Tab; text: string; badge?: number }[] = [
    { id: "inbox", text: "Inbox", badge: kpis?.conversationsUnread },
    { id: "quotes", text: "Quotes", badge: kpis?.quotesPendingApproval },
    { id: "prices", text: "Price list" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Front Desk</h1>
        <p className="text-sm text-slate-500">Your website chats, the quotes drafted from customer photos, and your price list. Last 30 days.</p>
      </div>
      <Kpis kpis={kpis} />
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            {t.text}
            {!!t.badge && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tab === "inbox" && <Inbox notify={notify} onChange={loadKpis} />}
      {tab === "quotes" && <Quotes notify={notify} onChange={loadKpis} />}
      {tab === "prices" && <Prices notify={notify} />}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default FrontDesk;
