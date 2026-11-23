import React, { useCallback, useEffect, useState } from "react";
import { api, type AutoTopUpStatus } from "../services/api";

/**
 * Auto top-up with a monthly cap — the card-on-file plan.
 *
 * When credit falls below the tenant's threshold, the server charges their
 * saved card by the chosen amount, never past the monthly cap. The balance
 * itself still only moves when Stripe confirms the payment.
 */

const money = (v: number) => `$${Number(v || 0).toFixed(2)}`;

const field =
  "flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-3 transition focus-within:border-[#f15a24] focus-within:ring-2 focus-within:ring-[#f15a24]/15";
const fieldInput =
  "h-full w-full border-0 bg-transparent px-1.5 text-[15px] font-medium tabular-nums text-[#0F172A] outline-none";

const AutoTopUpPanel: React.FC<{ cardsVersion?: number }> = ({
  cardsVersion = 0,
}) => {
  const [status, setStatus] = useState<AutoTopUpStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [hiddenForRole, setHiddenForRole] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("20");
  const [cap, setCap] = useState("100");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const apply = (s: AutoTopUpStatus) => {
    setStatus(s);
    setEnabled(s.enabled);
    setThreshold(String(s.thresholdUsd));
    setAmount(String(s.amountUsd));
    setCap(String(s.monthlyCapUsd));
  };

  const load = useCallback(async () => {
    try {
      const result = await api.getAutoTopUp();
      apply(result.autoTopUp);
      setLoadError("");
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // Members without billing rights simply don't see the panel.
      if (status === 401 || status === 403) {
        setHiddenForRole(true);
        return;
      }
      setLoadError(
        status === 404
          ? "Auto top-up isn't available on this server yet."
          : err instanceof Error
            ? err.message
            : "Auto top-up settings are unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, cardsVersion]);

  if (hiddenForRole) return null;
  if (loadError && !status) {
    // Say so rather than vanishing: a silently missing panel looks like a bug.
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-[#0F172A]">
          Auto top-up
        </h2>
        <p className="m-0 mt-1 text-[13px] text-slate-500">{loadError}</p>
      </section>
    );
  }
  if (!status) return null;

  const minimum = status.minimumTopUpUsd || 10;
  const dirty =
    enabled !== status.enabled ||
    Number(threshold) !== status.thresholdUsd ||
    Number(amount) !== status.amountUsd ||
    Number(cap) !== status.monthlyCapUsd;
  const canEnable = status.hasCard && status.available;
  const capNum = Math.max(Number(cap) || 0, 0);
  const usedPct =
    status.monthlyCapUsd > 0
      ? Math.min(100, (status.spentThisMonthUsd / status.monthlyCapUsd) * 100)
      : 0;
  const capReached =
    status.enabled && status.remainingThisMonthUsd < minimum;

  const save = async (nextEnabled = enabled) => {
    setMessage(null);
    // Any failure below leaves the switch where the server says it is.
    const fail = (text: string) => {
      setEnabled(status.enabled);
      setMessage({ tone: "error", text });
    };
    const a = Number(amount);
    const c = Number(cap);
    const t = Number(threshold);
    if (!Number.isFinite(a) || a < minimum) {
      fail(`Each top-up must be at least ${money(minimum)}.`);
      return;
    }
    if (!Number.isFinite(c) || c < a) {
      fail("The monthly cap must be at least one top-up.");
      return;
    }
    if (!Number.isFinite(t) || t < 0) {
      fail("Enter the balance that should trigger a top-up.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateAutoTopUp({
        enabled: nextEnabled,
        thresholdUsd: t,
        amountUsd: a,
        monthlyCapUsd: c,
      });
      apply(result.autoTopUp);
      setMessage({
        tone: "ok",
        text: nextEnabled
          ? "Auto top-up is on."
          : "Auto top-up is off.",
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not save auto top-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8"
      aria-labelledby="auto-topup-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="auto-topup-title"
            className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-[#0F172A]"
          >
            Auto top-up
          </h2>
          <p className="m-0 mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
            Keep everything running. When credit runs low, Agently tops it up
            from your saved card, never more than your monthly cap.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Auto top-up"
          disabled={!canEnable || saving}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            void save(next);
          }}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            enabled ? "bg-[#f15a24]" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
              enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {!status.hasCard ? (
        <p className="m-0 mt-5 rounded-[10px] bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          Add credit once with your card above. It's saved securely with
          Stripe, and auto top-up can then use it.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["When credit falls below", threshold, setThreshold, "auto-threshold"],
              ["Top up by", amount, setAmount, "auto-amount"],
              ["Monthly cap", cap, setCap, "auto-cap"],
            ].map(([label, value, setter, id]) => (
              <label key={id as string} htmlFor={id as string} className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-slate-600">
                  {label as string}
                </span>
                <span className={field}>
                  <span className="text-[15px] text-slate-400">$</span>
                  <input
                    id={id as string}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="1"
                    value={value as string}
                    onChange={(e) =>
                      (setter as React.Dispatch<React.SetStateAction<string>>)(
                        e.target.value,
                      )
                    }
                    className={fieldInput}
                  />
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-slate-500">
                Auto top-ups this month
              </span>
              <span className="font-medium tabular-nums text-[#0F172A]">
                {money(status.spentThisMonthUsd)}{" "}
                <span className="font-normal text-slate-400">
                  of {money(status.monthlyCapUsd)}
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${capReached ? "bg-amber-500" : "bg-[#f15a24]"}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>

          {status.pausedReason === "card_failed" && (
            <p className="m-0 mt-4 rounded-[10px] bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              Paused: your card couldn't be charged
              {status.lastError ? ` (${status.lastError.replace(/[.\s]+$/, "")})` : ""}. Update your
              card or add credit, then save to turn it back on.
            </p>
          )}
          {capReached && status.pausedReason !== "card_failed" && (
            <p className="m-0 mt-4 rounded-[10px] bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              This month's cap is reached, so automatic top-ups have stopped
              until next month. Raise the cap or add credit to keep going.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[12px] text-slate-400">
              {status.card
                ? `Charges your ${status.card.brand.charAt(0).toUpperCase()}${status.card.brand.slice(1)} ending ${status.card.last4}. Minimum top-up ${money(minimum)}.`
                : `Minimum top-up ${money(minimum)}.`}
            </p>
            <button
              type="button"
              disabled={saving || (!dirty && status.pausedReason !== "card_failed") || !canEnable}
              onClick={() => void save()}
              className="h-10 rounded-[10px] bg-[#0F172A] px-4 text-[13px] font-medium text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {capNum > 0 && Number(amount) > capNum && (
            <p className="m-0 mt-2 text-[12px] text-amber-700">
              The cap is smaller than one top-up.
            </p>
          )}
        </>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`m-0 mt-3 text-[13px] ${message.tone === "error" ? "text-red-700" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
};

export default AutoTopUpPanel;
