import React, { useState } from "react";
import AppModal from "./AppModal";
import { api } from "../services/api";
import type { EmailPurpose } from "../services/api";

const PURPOSES: { value: EmailPurpose; label: string }[] = [
  { value: "follow_up", label: "Follow up" },
  { value: "meeting_invite", label: "Meeting invite" },
  { value: "reschedule", label: "Reschedule" },
  { value: "send_link", label: "Send a link" },
  { value: "custom", label: "Something else" },
];

/**
 * Draft a personal email with AI, edit it, and send it from the tenant's own
 * Gmail. Nothing is sent until the user presses Send.
 */
export default function EmailComposeModal({
  open,
  onClose,
  leadId,
  appointmentId,
  defaultTo = "",
  recipientName,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  appointmentId?: string;
  defaultTo?: string;
  recipientName?: string;
}) {
  const [purpose, setPurpose] = useState<EmailPurpose>("follow_up");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentFrom, setSentFrom] = useState<string | null>(null);

  const field =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100";

  const reset = () => {
    setSubject("");
    setBody("");
    setError(null);
    setSentFrom(null);
    setTo(defaultTo);
  };

  const draft = async () => {
    setBusy("draft");
    setError(null);
    try {
      const result = await api.draftEmail({
        purpose,
        leadId,
        appointmentId,
        link: link.trim() || undefined,
        notes: notes.trim() || undefined,
        to: to || undefined,
      });
      setSubject(result.subject);
      setBody(result.body);
      if (!to && result.to) setTo(result.to);
    } catch (e: any) {
      setError(e?.message || "Couldn't draft the email.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    setError(null);
    try {
      const result = await api.sendEmail({ to, subject, body, purpose, leadId, appointmentId });
      setSentFrom(result.from);
    } catch (e: any) {
      setError(e?.message || "The email was not sent.");
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <AppModal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={recipientName ? `Email ${recipientName}` : "Send an email"}
    >
      {sentFrom ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-emerald-700">Sent from {sentFrom}.</p>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              What is it for?
              <select className={`${field} mt-1`} value={purpose} onChange={(e) => setPurpose(e.target.value as EmailPurpose)}>
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Link to include (optional)
              <input className={`${field} mt-1`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            Anything to mention (optional)
            <textarea className={`${field} mt-1`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => void draft()}
            disabled={busy !== null}
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"
          >
            {busy === "draft" ? "Drafting…" : subject ? "Redraft" : "Draft with AI"}
          </button>

          <label className="block text-xs font-semibold text-slate-600">
            To
            <input className={`${field} mt-1`} type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Subject
            <input className={`${field} mt-1`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Message
            <textarea className={`${field} mt-1`} rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy !== null || !to || !subject.trim() || !body.trim()}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy === "send" ? "Sending…" : "Send from Gmail"}
            </button>
          </div>
        </div>
      )}
    </AppModal>
  );
}
