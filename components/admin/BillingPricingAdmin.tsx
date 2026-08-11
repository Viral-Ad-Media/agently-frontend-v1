import React, { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  type PlatformBillingPricing,
} from "../../services/adminApi";

const DEFAULTS: PlatformBillingPricing = {
  minimumTopUpUsd: 10,
  defaultMarginPercent: 70,
  openAiRealtimeMarginPercent: 40,
  elevenLabsMarginPercent: 30,
  twilioCallMarginPercent: 70,
  twilioNumberMarginPercent: 70,
  stripeCheckoutEnabled: false,
  stripeWebhookConfigured: false,
  settingsSource: "default",
  updatedAt: null,
};

type NumericKey =
  | "minimumTopUpUsd"
  | "defaultMarginPercent"
  | "openAiRealtimeMarginPercent"
  | "elevenLabsMarginPercent"
  | "twilioCallMarginPercent"
  | "twilioNumberMarginPercent";

const marginMultiplier = (margin: number) => {
  const safe = Math.min(Math.max(Number(margin) || 0, 0), 95);
  return 1 / (1 - safe / 100);
};

const BillingPricingAdmin: React.FC = () => {
  const [pricing, setPricing] = useState<PlatformBillingPricing>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setPricing(await adminApi.billingPricing());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load billing pricing.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateNumber = (key: NumericKey, value: string) => {
    const numeric = Number(value);
    setPricing((current) => ({
      ...current,
      [key]: Number.isFinite(numeric) ? numeric : 0,
    }));
  };

  const rows = useMemo(
    () => [
      {
        key: "defaultMarginPercent" as const,
        label: "Default gross margin",
        description:
          "Fallback for any paid service without a more specific override.",
      },
      {
        key: "openAiRealtimeMarginPercent" as const,
        label: "OpenAI Realtime calls",
        description:
          "Applies to OpenAI Realtime audio, text and reconciliation usage.",
      },
      {
        key: "elevenLabsMarginPercent" as const,
        label: "ElevenLabs voice",
        description:
          "Applies to ElevenLabs speech generation and related voice usage.",
      },
      {
        key: "twilioCallMarginPercent" as const,
        label: "Twilio call traffic",
        description:
          "Applies to Twilio inbound and outbound voice-minute costs.",
      },
      {
        key: "twilioNumberMarginPercent" as const,
        label: "Twilio phone numbers",
        description:
          "Applies to number purchase, rental and recurring number costs.",
      },
    ],
    [],
  );

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await adminApi.updateBillingPricing(pricing);
      setPricing(updated);
      setSuccess(
        "Pricing saved. New usage and new top-ups now use these settings across every workspace.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save billing pricing.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
              Platform billing control
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Wallet and pricing
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
              These values apply to new usage across all plans and tenants.
              Historical wallet charges are never rewritten.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:border-amber-400 hover:text-amber-600 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {success}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">
              Stripe readiness
            </p>
            <div className="mt-4 grid gap-3">
              <StatusRow
                label="Checkout key"
                ready={pricing.stripeCheckoutEnabled}
              />
              <StatusRow
                label="Verified webhook"
                ready={pricing.stripeWebhookConfigured}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/55">
              Both indicators must be ready before customer card payments can
              automatically credit wallets.
            </p>
          </div>

          <label className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              Minimum customer top-up
            </span>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-2xl font-black text-slate-400">$</span>
              <input
                type="number"
                min="0.50"
                max="100000"
                step="0.01"
                value={pricing.minimumTopUpUsd}
                onChange={(event) =>
                  updateNumber("minimumTopUpUsd", event.target.value)
                }
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-lg font-black text-slate-950 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Billing pages, new wallets and Stripe Checkout all read this same
              value. The requested production minimum is $10.
            </p>
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div>
          <h3 className="text-xl font-black text-slate-950">
            Gross-margin overrides
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Gross margin is different from markup. A 40% gross margin charges
            approximately 1.67× the vendor cost; a 70% gross margin charges
            approximately 3.33×.
          </p>
        </div>

        <div className="mt-6 divide-y divide-slate-100">
          {rows.map((row) => {
            const value = Number(pricing[row.key] || 0);
            return (
              <div
                key={row.key}
                className="grid gap-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[1fr_170px] sm:items-center"
              >
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {row.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {row.description}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="95"
                      step="0.1"
                      value={value}
                      onChange={(event) =>
                        updateNumber(row.key, event.target.value)
                      }
                      className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-right text-sm font-black text-slate-950 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    />
                    <span className="text-sm font-black text-slate-400">%</span>
                  </div>
                  <p className="mt-1 text-right text-[11px] font-bold text-slate-400">
                    {marginMultiplier(value).toFixed(2)}× cost
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-slate-500">
            More-specific provider settings override the default. The same
            rate-card resolver is used by every tenant wallet deduction.
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 px-6 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Applying…" : "Apply everywhere"}
          </button>
        </div>
      </div>
    </section>
  );
};

const StatusRow: React.FC<{ label: string; ready: boolean }> = ({
  label,
  ready,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2.5">
    <span className="text-sm font-bold text-white/80">{label}</span>
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
        ready
          ? "bg-emerald-200 text-emerald-950"
          : "bg-amber-200 text-amber-950"
      }`}
    >
      {ready ? "Ready" : "Missing"}
    </span>
  </div>
);

export default BillingPricingAdmin;
