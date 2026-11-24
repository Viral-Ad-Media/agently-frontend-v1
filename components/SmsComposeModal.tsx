import React, { useEffect, useMemo, useState } from "react";
import AppModal from "./AppModal";
import { api } from "../services/api";

/**
 * Text a lead from the tenant's own Agently number. Each message is charged
 * per segment against their credit (server: agently-server/lib/sms.js). Shown
 * only while the "sms" feature switch is on.
 */

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function segmentsFor(text: string) {
  let units = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  }
  if (!units) return 0;
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

export default function SmsComposeModal({
  open,
  onClose,
  leadId,
  phone,
  recipientName,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  phone: string;
  recipientName?: string;
}) {
  const [numbers, setNumbers] = useState<Array<{ id: string; phoneNumber: string }>>([]);
  const [fromNumberId, setFromNumberId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSmsNumbers()
      .then((result) => {
        if (cancelled) return;
        setNumbers(result.numbers || []);
        setFromNumberId(result.numbers?.[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your numbers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const segments = useMemo(() => segmentsFor(body), [body]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.sendSms({ leadId, body, fromNumberId: fromNumberId || undefined });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The text could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="md"
      title={`Text ${recipientName || "this lead"}`}
      description={`To ${phone}. Charged per message segment from your credit.`}
      footer={
        sent ? (
          <button type="button" className="ag-action-btn ag-action-btn--primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-[#5a5b61]">
              {segments > 0 ? `${body.length} characters · ${segments} segment${segments === 1 ? "" : "s"}` : ""}
            </p>
            <button
              type="button"
              className="ag-action-btn ag-action-btn--primary"
              disabled={busy || loading || !body.trim() || numbers.length === 0}
              onClick={() => void send()}
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
              {busy ? "Sending…" : "Send text"}
            </button>
          </div>
        )
      }
    >
      {sent ? (
        <p className="text-sm text-[#101216]">Your text is on its way.</p>
      ) : (
        <div className="space-y-4">
          {!loading && numbers.length === 0 && (
            <p className="rounded-lg border border-[#f3c9b4] bg-[#fff6f1] px-3 py-2 text-xs text-[#b63a0e]">
              You don't have an SMS-capable Agently number yet. Get one under Phone Numbers.
            </p>
          )}
          {numbers.length > 1 && (
            <div>
              <label className="ag-field-label" htmlFor="sms-from">
                Send from
              </label>
              <select
                id="sms-from"
                className="ag-field outline-none"
                value={fromNumberId}
                onChange={(event) => setFromNumberId(event.target.value)}
              >
                {numbers.map((number) => (
                  <option key={number.id} value={number.id}>
                    {number.phoneNumber}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="ag-field-label" htmlFor="sms-body">
              Message
            </label>
            <textarea
              id="sms-body"
              rows={5}
              maxLength={1600}
              className="ag-field outline-none"
              placeholder="Hi! Following up on your call earlier…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="ag-field-hint">
              Recipients can reply STOP to opt out; carriers then block further texts to them.
            </p>
          </div>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </AppModal>
  );
}
