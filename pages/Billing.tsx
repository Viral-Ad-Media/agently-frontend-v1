import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Invoice, Organization } from "../types";
import { NETWORK_OFFLINE_MESSAGE, api } from "../services/api";
import SettingsTabs from "../components/SettingsTabs";
import { useSearchParams } from "react-router-dom";

interface BillingProps {
  org: Organization;
  onUpdatePlan: (plan: "Starter" | "Pro") => Promise<void>;
  onCancelPlan: () => Promise<void>;
  onDownloadInvoice: (invoiceId: string) => Promise<void>;
  onContactSales: () => Promise<void>;
}

type WalletTransaction = {
  id: string;
  organizationId?: string;
  type: string;
  amountUsd: number;
  balanceBeforeUsd?: number | null;
  balanceAfterUsd?: number | null;
  source?: string;
  externalId?: string | null;
  createdAt: string;
};

type WalletUsageCharge = {
  id: string;
  organizationId?: string;
  provider: string;
  service: string;
  eventType?: string;
  unit: string;
  quantity: number;
  customerChargeUsd: number;
  walletTransactionId?: string | null;
  createdAt: string;
};

type BillingWallet = {
  enabled?: boolean;
  currency?: string;
  balanceUsd?: number;
  minimumRechargeUsd?: number;
  status?: string;
  totalCreditsUsd?: number;
  totalDebitsUsd?: number;
  totalUsageChargesUsd?: number;
  latestTransactionAt?: string | null;
  recentTransactions?: WalletTransaction[];
  recentUsageCharges?: WalletUsageCharge[];
  recentActivity?: ActivityItem[];
  demoTopUpEnabled?: boolean;
  stripeTopUpEnabled?: boolean;
  stripeWebhookConfigured?: boolean;
  creditEnforcementMode?: string;
  autoChargeWalletEnabled?: boolean;
  numberRetention?: {
    status?: string;
    openCase?: boolean;
    minimumRequiredUsd?: number;
    graceEndsAt?: string | null;
  } | null;
  minimums?: {
    callUsd?: number;
    chatUsd?: number;
    voicePreviewUsd?: number;
    knowledgeSyncUsd?: number;
    activeUsd?: number;
    hardStopBalanceUsd?: number;
    maxNegativeBalanceUsd?: number;
  };
  warning?: string;
};

type BillingMetrics = {
  organizationId?: string;
  invoices: Invoice[];
  wallet?: BillingWallet;
  totals?: {
    paidAmount: number;
    pendingAmount: number;
    invoiceCount: number;
  };
};

type UsageRange = "all" | "1h" | "24h" | "7d" | "30d";

const usageRanges: Array<{ key: UsageRange; label: string }> = [
  { key: "all", label: "All activity" },
  { key: "1h", label: "Last 1 hour" },
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const money = (value?: number | string | null) => {
  const n = Number(value || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
};

const cleanError = (err: unknown, fallback: string) => {
  if (!navigator.onLine) return NETWORK_OFFLINE_MESSAGE;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: string }).message || fallback);
  }
  return fallback;
};

const rangeToMs = (range: UsageRange) => {
  if (range === "all") return Number.POSITIVE_INFINITY;
  const hours =
    range === "1h"
      ? 1
      : range === "24h"
        ? 24
        : range === "7d"
          ? 24 * 7
          : 24 * 30;
  return hours * 60 * 60 * 1000;
};

const usageLabel = (charge: WalletUsageCharge) => {
  const raw =
    `${charge.provider || ""} ${charge.service || ""} ${charge.eventType || ""} ${charge.unit || ""}`.toLowerCase();
  if (
    raw.includes("number_purchase") ||
    raw.includes("phone_number") ||
    raw.includes("number purchase")
  )
    return "Business-number purchase";
  if (raw.includes("number_rental") || raw.includes("rental"))
    return "Business-number rental";
  if (
    raw.includes("scrape") ||
    raw.includes("knowledge") ||
    raw.includes("sync")
  )
    return "Knowledge Base sync";
  if (raw.includes("voice_preview") || raw.includes("preview"))
    return "Voice preview";
  if (raw.includes("call") || raw.includes("minute") || raw.includes("voice"))
    return "Call usage";
  if (
    raw.includes("chat") ||
    raw.includes("message") ||
    raw.includes("conversation")
  )
    return "Website assistant usage";
  if (raw.includes("storage")) return "Storage usage";
  if (raw.includes("email") || raw.includes("notification"))
    return "Notification delivery";
  if (raw.includes("lead")) return "Lead usage";
  return "Platform usage";
};

const transactionLabel = (tx: WalletTransaction) => {
  const raw = `${tx.type || ""} ${tx.source || ""}`.toLowerCase();
  if (raw.includes("credit") || raw.includes("top")) return "Credit added";
  if (raw.includes("refund")) return "Credit refund";
  if (raw.includes("usage")) return "Usage debit";
  return "Wallet transaction";
};

const unitLabel = (charge: WalletUsageCharge) => {
  const qty = Number(charge.quantity || 0);
  const unit = charge.unit || "unit";
  if (unit === "minute") return `${qty.toFixed(qty % 1 ? 1 : 0)} min`;
  if (unit === "second") return `${qty.toFixed(0)} sec`;
  if (unit === "number") return `${qty.toFixed(0)} number`;
  if (unit === "sync") return `${qty.toFixed(0)} sync`;
  return `${qty.toLocaleString()} ${unit}${qty === 1 ? "" : "s"}`;
};

type ActivityItem = {
  id: string;
  createdAt: string;
  title: string;
  subtitle: string;
  amountUsd: number;
  tone: "credit" | "debit" | "neutral";
  balanceAfterUsd?: number | null;
};

const Billing: React.FC<BillingProps> = ({ org, onDownloadInvoice }) => {
  const [billing, setBilling] = useState<BillingMetrics>({
    invoices: org.invoices || [],
    wallet: {
      enabled: true,
      currency: "USD",
      balanceUsd: undefined,
      minimumRechargeUsd: 10,
      status: "loading",
      recentTransactions: [],
      recentUsageCharges: [],
      demoTopUpEnabled: false,
      stripeTopUpEnabled: false,
      stripeWebhookConfigured: false,
    },
  });
  const [loading, setLoading] = useState(false);
  /*
   * Checkout gets its own flag. It used to share `loading` with the billing
   * fetch, so while the page was still loading its data the top-up button sat
   * disabled and labelled "Opening checkout…" before the user had clicked
   * anything.
   */
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [searchParams, setSearchParams] = useSearchParams();
  const [usageRange, setUsageRange] = useState<UsageRange>("all");
  const [savedCards, setSavedCards] = useState<
    Array<{ id: string; brand: string; last4: string }>
  >([]);
  const mountedRef = useRef(true);
  const billingRequestInFlight = useRef(false);
  const billingRequestIdRef = useRef(0);

  const wallet = billing.wallet || {};
  const balance = Number(wallet.balanceUsd ?? 0);
  const minimumRecharge = Math.max(
    0.5,
    Number(wallet.minimumRechargeUsd || 10),
  );
  const minimumActive = Math.max(
    Number(wallet.numberRetention?.minimumRequiredUsd || 0),
    Number(wallet.minimums?.callUsd || 0),
    Number(wallet.minimums?.activeUsd || 0),
    1,
  );

  const loadBilling = useCallback(
    async (options?: { silent?: boolean }) => {
      if (billingRequestInFlight.current) return;
      billingRequestInFlight.current = true;
      const requestId = ++billingRequestIdRef.current;
      const silent = Boolean(options?.silent);
      if (mountedRef.current && !silent) {
        setLoading(true);
        setError("");
      }
      try {
        const response = (await api.getBillingSummary()) as BillingMetrics;
        if (response?.organizationId && response.organizationId !== org.id) {
          throw new Error(
            "Billing summary returned a different organization. Please log out and log back in before continuing.",
          );
        }
        if (!mountedRef.current || requestId !== billingRequestIdRef.current)
          return;
        setBilling(response);
        const nextBalance = Number(response?.wallet?.balanceUsd);
        if (Number.isFinite(nextBalance)) {
          window.dispatchEvent(
            new CustomEvent("agently:wallet-refresh", {
              detail: {
                organizationId: org.id,
                balanceUsd: nextBalance,
                source: "billing-summary",
              },
            }),
          );
        }
      } catch (err) {
        if (mountedRef.current && requestId === billingRequestIdRef.current) {
          setError(cleanError(err, "Unable to load billing details."));
        }
      } finally {
        if (requestId === billingRequestIdRef.current) {
          billingRequestInFlight.current = false;
        }
        if (
          mountedRef.current &&
          requestId === billingRequestIdRef.current &&
          !silent
        ) {
          setLoading(false);
        }
      }
    },
    [org.id],
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadBilling();
    const refreshInBackground = () => {
      if (document.visibilityState === "visible") {
        void loadBilling({ silent: true });
      }
    };
    const timer = window.setInterval(refreshInBackground, 30000);
    const refreshHandler = (event: Event) => {
      const detail =
        (event as CustomEvent<{ organizationId?: string; source?: string }>)
          .detail || {};
      if (detail.organizationId && detail.organizationId !== org.id) return;
      if (detail.source === "billing-summary") return;
      void loadBilling({ silent: true });
    };
    window.addEventListener("agently:wallet-refresh", refreshHandler);
    document.addEventListener("visibilitychange", refreshInBackground);
    return () => {
      mountedRef.current = false;
      billingRequestIdRef.current += 1;
      billingRequestInFlight.current = false;
      window.clearInterval(timer);
      window.removeEventListener("agently:wallet-refresh", refreshHandler);
      document.removeEventListener("visibilitychange", refreshInBackground);
    };
  }, [loadBilling, org.id]);

  useEffect(() => {
    setTopUpAmount(String(minimumRecharge));
  }, [minimumRecharge]);

  /*
   * Saved cards decide whether "Add credit" charges directly (D3) or sends the
   * tenant through checkout to collect their first card. A failure here is not
   * fatal: an empty list just means we fall back to checkout.
   */
  useEffect(() => {
    let active = true;
    api
      .listSavedCards()
      .then((result) => {
        if (active) setSavedCards(result.cards || []);
      })
      .catch(() => {
        if (active) setSavedCards([]);
      });
    return () => {
      active = false;
    };
  }, [org.id]);

  useEffect(() => {
    const result = searchParams.get("stripe");
    const sessionId = searchParams.get("session_id");
    if (result === "cancelled") {
      setError("");
      setSuccess("Payment was cancelled. No credit was added.");
      setSearchParams({}, { replace: true });
      return;
    }
    if (result !== "success" || !sessionId) return;

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    setError("");
    setSuccess("Payment received. Confirming your wallet credit…");

    const checkStatus = async () => {
      attempts += 1;
      try {
        const response = await api.getStripeWalletTopUpStatus(sessionId);
        if (cancelled) return;
        const topUp = response.topUp;
        if (topUp.credited) {
          setSuccess(
            `${money(topUp.amountUsd)} was added to your usage credit.`,
          );
          setSearchParams({}, { replace: true });
          await loadBilling();
          return;
        }
        if (
          ["payment_failed", "checkout_failed", "expired"].includes(
            topUp.status,
          )
        ) {
          setSuccess("");
          setError(
            topUp.failureMessage ||
              "The payment was not completed. No credit was added.",
          );
          setSearchParams({}, { replace: true });
          return;
        }
        if (attempts < 30) {
          timer = window.setTimeout(checkStatus, 2000);
        } else {
          setSuccess(
            "Payment is still being confirmed. Your balance will update automatically after Stripe confirms it.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (attempts < 8) {
          timer = window.setTimeout(checkStatus, 2500);
        } else {
          setSuccess("");
          setError(
            cleanError(
              err,
              "Unable to confirm the payment yet. Refresh billing shortly.",
            ),
          );
        }
      }
    };

    void checkStatus();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loadBilling, searchParams, setSearchParams]);

  const handlePurchaseCredit = async () => {
    setError("");
    setSuccess("");
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount < minimumRecharge) {
      setError(`Minimum top-up is ${money(minimumRecharge)}.`);
      return;
    }
    /*
     * D4, layer one: disabled synchronously, before any await, so a double
     * click cannot produce a second request. Layers two and three (a per-tenant
     * lock and a Stripe idempotency key) live on the server, because this one
     * is trivially bypassed by a retried fetch.
     */
    setCheckoutLoading(true);
    try {
      if (wallet.stripeTopUpEnabled) {
        /*
         * D3 — returning tenants with a saved card never see checkout again.
         * Note we do NOT add the amount to the balance here: crediting happens
         * on the Stripe webhook, so we just refetch and let the real number
         * arrive. Optimistic crediting is how a failed card still shows money.
         */
        if (savedCards.length > 0) {
          await api.chargeSavedCard(amount, savedCards[0].id);
          setSuccess(
            "Payment submitted. Your balance updates as soon as the payment is confirmed.",
          );
          await loadBilling({ silent: true });
          return;
        }

        const response = await api.createStripeWalletTopUp(amount);
        if (!response.checkoutUrl)
          throw new Error("Could not start secure checkout. Please try again.");
        window.location.assign(response.checkoutUrl);
        return;
      }

      // The unverified demo top-up path has been removed. Card checkout is
      // the only way a tenant adds credit; internal testers are credited from
      // the super-admin dashboard instead.
      throw new Error(
        "Card top-ups aren't available right now. Please contact support to add credit.",
      );
    } catch (err) {
      setError(cleanError(err, "Unable to start secure checkout."));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const activity = useMemo<ActivityItem[]>(() => {
    if (Array.isArray(wallet.recentActivity)) {
      return wallet.recentActivity.map((item) => ({
        ...item,
        amountUsd: Number(item.amountUsd || 0),
        balanceAfterUsd:
          item.balanceAfterUsd == null ? null : Number(item.balanceAfterUsd),
      }));
    }

    const scopedTransactions = (wallet.recentTransactions || []).filter(
      (tx) => tx.organizationId === org.id,
    );
    const scopedCharges = (wallet.recentUsageCharges || []).filter(
      (charge) => charge.organizationId === org.id,
    );
    const txById = new Map(scopedTransactions.map((tx) => [tx.id, tx]));
    const chargeItems: ActivityItem[] = scopedCharges
      .filter(
        (charge) =>
          Number(charge.customerChargeUsd || 0) > 0 &&
          Boolean(charge.walletTransactionId),
      )
      .map((charge) => {
        const tx = charge.walletTransactionId
          ? txById.get(charge.walletTransactionId)
          : undefined;
        const amount = Number(charge.customerChargeUsd || 0);
        return {
          id: `charge-${charge.id}`,
          createdAt: charge.createdAt,
          title: usageLabel(charge),
          subtitle: unitLabel(charge),
          amountUsd: amount <= 0 ? 0 : -Math.abs(amount),
          tone: amount <= 0 ? "neutral" : "debit",
          balanceAfterUsd: tx?.balanceAfterUsd ?? null,
        };
      });
    const chargeTxIds = new Set(
      scopedCharges.map((c) => c.walletTransactionId).filter(Boolean),
    );
    const transactionItems: ActivityItem[] = scopedTransactions
      .filter((tx) => !chargeTxIds.has(tx.id))
      .map((tx) => {
        const amount = Number(tx.amountUsd || 0);
        return {
          id: `tx-${tx.id}`,
          createdAt: tx.createdAt,
          title: transactionLabel(tx),
          subtitle: tx.source || "wallet",
          amountUsd: amount,
          tone: amount > 0 ? "credit" : amount < 0 ? "debit" : "neutral",
          balanceAfterUsd: tx.balanceAfterUsd ?? null,
        };
      });
    return [...chargeItems, ...transactionItems].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [
    org.id,
    wallet.recentActivity,
    wallet.recentTransactions,
    wallet.recentUsageCharges,
  ]);

  const filteredActivity = useMemo(() => {
    if (usageRange === "all") return activity;
    const cutoff = Date.now() - rangeToMs(usageRange);
    return activity.filter(
      (item) => new Date(item.createdAt).getTime() >= cutoff,
    );
  }, [activity, usageRange]);

  const lowCredit = balance < minimumActive;

  return (
    <div className="space-y-6 pb-12 text-[#0F172A]">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl">
            Billing & usage
          </h2>
          <p className="mt-2 hidden max-w-3xl text-sm leading-relaxed text-[#64748B] sm:block">
            Agently currently runs on usage credit. Every paid service is
            deducted from the wallet immediately and the navbar shows the
            remaining balance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBilling()}
          disabled={loading}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-600 transition hover:border-[#F59E0B] hover:text-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 sm:rounded-xl"
          aria-label="Refresh billing"
          title="Refresh"
        >
          <i
            className={`fa-sharp fa-solid ${loading ? "fa-spinner fa-spin" : "fa-rotate-right"} text-sm`}
            aria-hidden="true"
          />
        </button>
      </header>

      <SettingsTabs active="billing" />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {success}
        </p>
      )}

      {/*
        One panel, not two competing cards with boxes nested inside boxes.
        Balance is the only number that gets display size; the limits that used
        to sit in three tiles are now a quiet meta line, and the top-up controls
        sit inline on the right the way funded-balance products present them.
      */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <p className="text-[13px] font-medium text-slate-500">
                Available balance
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  lowCredit
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {lowCredit ? "Top-up needed" : "Active"}
              </span>
            </div>

            {wallet.balanceUsd === undefined ? (
              // A 44px em-dash renders as a black bar and reads as a broken
              // value. A skeleton of the same height reads as "still loading".
              <div
                className="mt-2 h-10 w-40 animate-pulse rounded-lg bg-slate-200"
                role="status"
                aria-label="Loading balance"
              />
            ) : (
              <p className="mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.02em] text-[#0F172A] tabular-nums">
                {money(balance)}
              </p>
            )}

            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
              <span>
                Minimum top-up{" "}
                <span className="font-medium text-[#0F172A] tabular-nums">
                  {money(minimumRecharge)}
                </span>
              </span>
              <span aria-hidden className="text-slate-300">
                ·
              </span>
              <span>
                Stays active above{" "}
                <span className="font-medium text-[#0F172A] tabular-nums">
                  {money(minimumActive)}
                </span>
              </span>
            </p>

            {lowCredit && (
              <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-amber-800">
                Top up with at least {money(minimumActive)} to keep calls,
                website assistants, Knowledge Base syncs and campaigns active.
              </p>
            )}
          </div>

          <div className="w-full lg:w-[19rem]">
            <div className="flex flex-wrap gap-2">
              {[10, 25, 50, 100]
                .filter((amount) => amount >= minimumRecharge)
                .map((amount) => {
                  const active = Number(topUpAmount) === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTopUpAmount(String(amount))}
                      className={`h-9 min-w-[3.5rem] rounded-[10px] px-3 text-[13px] font-medium tabular-nums transition active:scale-[0.97] ${
                        active
                          ? "bg-[#0F172A] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      ${amount}
                    </button>
                  );
                })}
            </div>

            <label className="mt-3 block">
              <span className="sr-only">Top-up amount in US dollars</span>
              <div className="flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-3 transition focus-within:border-[#F59E0B] focus-within:ring-2 focus-within:ring-[#F59E0B]/15">
                <span className="text-[15px] text-slate-400">$</span>
                <input
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  type="number"
                  min={minimumRecharge}
                  step="0.01"
                  className="h-full w-full bg-transparent px-1.5 text-[15px] font-medium tabular-nums text-[#0F172A] outline-none"
                />
              </div>
            </label>

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={handlePurchaseCredit}
              className="mt-3 h-11 w-full rounded-[10px] bg-[#0F172A] text-[13px] font-medium text-white transition hover:bg-[#1E293B] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {checkoutLoading ? "Opening checkout…" : "Add credit"}
            </button>

            <p className="mt-2.5 text-[12px] leading-relaxed text-slate-400">
              {savedCards.length > 0 ? (
                <>
                  Charged to your saved {savedCards[0].brand} ending{" "}
                  {savedCards[0].last4}. Credit lands once the payment is
                  confirmed.
                </>
              ) : (
                <>
                  Card details are entered on Stripe and saved for next time.
                  Credit lands once Stripe confirms the payment.
                </>
              )}
            </p>

            {/* Only claim Stripe is unconfigured once the backend has actually
                answered, and only for the capability that is genuinely missing.
                This used to read the both-keys flag, so a working checkout with
                no webhook secret told tenants checkout was unavailable. */}
            {wallet.status !== "loading" && !wallet.stripeTopUpEnabled ? (
              <p className="mt-2.5 rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Card payments are unavailable right now. Please try again
                shortly.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {/* No uppercase-tracking eyebrow and no font-black: measured
                against Stripe, headings sit at ~16-18px/600, not 24px/900
                under a wide-tracked label. */}
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[#0F172A]">
              Wallet activity
            </h3>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Top-ups, number purchases, calls, Knowledge Base syncs and other
              service deductions.
            </p>
          </div>
          {/* One dropdown instead of five pill buttons — same pattern as the
              log time-range picker on platforms like Vercel. */}
          <div className="relative shrink-0">
            <select
              value={usageRange}
              onChange={(e) => setUsageRange(e.target.value as UsageRange)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-[#0F172A] outline-none transition hover:border-slate-300 focus:border-amber-400 sm:w-auto"
            >
              {usageRanges.map((range) => (
                <option key={range.key} value={range.key}>
                  {range.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400" />
          </div>
        </div>

        <div className="mt-5 max-h-[720px] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-100">
          {filteredActivity.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-black text-[#0F172A]">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  {item.subtitle} · {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p
                  className={`text-sm font-black tabular-nums ${item.tone === "credit" ? "text-emerald-600" : item.tone === "debit" ? "text-red-600" : "text-slate-400"}`}
                >
                  {item.tone === "credit"
                    ? "+"
                    : item.tone === "debit"
                      ? "-"
                      : ""}
                  {money(Math.abs(item.amountUsd))}
                </p>
                {item.balanceAfterUsd !== null &&
                  item.balanceAfterUsd !== undefined && (
                    <p className="mt-1 text-xs text-slate-400">
                      Balance {money(item.balanceAfterUsd)}
                    </p>
                  )}
              </div>
            </div>
          ))}
          {!filteredActivity.length && (
            <p className="px-4 py-10 text-center text-sm font-semibold text-slate-400">
              No wallet activity found for this period.
            </p>
          )}
        </div>
      </section>

    </div>
  );
};

export default Billing;
