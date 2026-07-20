import React, { useEffect, useMemo, useState } from "react";
import { Invoice, Organization, Subscription } from "../types";
import { NETWORK_OFFLINE_MESSAGE, api } from "../services/api";

interface BillingProps {
  org: Organization;
  onUpdatePlan: (plan: "Starter" | "Pro") => Promise<void>;
  onCancelPlan: () => Promise<void>;
  onDownloadInvoice: (invoiceId: string) => Promise<void>;
  onContactSales: () => Promise<void>;
}

type WalletTransaction = {
  id: string;
  type: string;
  amountUsd: number;
  balanceBeforeUsd?: number | null;
  balanceAfterUsd?: number | null;
  source?: string;
  createdAt: string;
};

type WalletUsageCharge = {
  id: string;
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
  demoTopUpEnabled?: boolean;
  creditEnforcementMode?: string;
  autoChargeWalletEnabled?: boolean;
  minimums?: {
    callUsd?: number;
    chatUsd?: number;
    voicePreviewUsd?: number;
    knowledgeSyncUsd?: number;
  };
  warning?: string;
};

type BillingMetrics = {
  plan: Subscription["plan"];
  status: Subscription["status"];
  currentPeriodEnd: string;
  usage: Subscription["usage"];
  invoices: Invoice[];
  wallet?: BillingWallet;
  totals: {
    paidAmount: number;
    pendingAmount: number;
    invoiceCount: number;
  };
};

type UsageRange = "1h" | "24h" | "7d" | "30d";

const usageRanges: Array<{ key: UsageRange; label: string }> = [
  { key: "1h", label: "Last 1 hour" },
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const cleanError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("offline")
  ) {
    return NETWORK_OFFLINE_MESSAGE;
  }
  return message;
};

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const minutes = (value: number) => `${Number(value || 0).toFixed(1)}m`;

const friendlyStatus = (status?: string) =>
  String(status || "active")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const rangeToMs = (range: UsageRange) => {
  switch (range) {
    case "1h":
      return 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "24h":
    default:
      return 24 * 60 * 60 * 1000;
  }
};

const usageLabel = (charge: WalletUsageCharge) => {
  const raw =
    `${charge.eventType || ""} ${charge.service || ""} ${charge.unit || ""} ${charge.provider || ""}`.toLowerCase();

  if (raw.includes("call") || raw.includes("phone") || raw.includes("minute")) {
    return "Call usage";
  }

  if (
    raw.includes("chat") ||
    raw.includes("message") ||
    raw.includes("conversation")
  ) {
    return "Chat usage";
  }

  if (raw.includes("voice") || raw.includes("preview")) {
    return "Voice preview";
  }

  if (
    raw.includes("knowledge") ||
    raw.includes("sync") ||
    raw.includes("scrape") ||
    raw.includes("source")
  ) {
    return "Knowledge update";
  }

  if (raw.includes("email") || raw.includes("notification")) {
    return "Notification delivery";
  }

  return "Platform usage";
};

const quantityLabel = (charge: WalletUsageCharge) => {
  const quantity = Number(charge.quantity || 0);
  const unit = String(charge.unit || "").toLowerCase();

  if (unit.includes("minute") || unit === "min" || unit === "mins") {
    return `${quantity.toFixed(quantity >= 10 ? 0 : 1)} min`;
  }

  if (unit.includes("second") || unit === "sec" || unit === "secs") {
    return `${quantity.toFixed(quantity >= 10 ? 0 : 1)} sec`;
  }

  if (unit.includes("call")) {
    return `${quantity.toFixed(0)} ${quantity === 1 ? "call" : "calls"}`;
  }

  if (unit.includes("message")) {
    return `${quantity.toFixed(0)} ${quantity === 1 ? "message" : "messages"}`;
  }

  return `${quantity.toFixed(quantity >= 10 ? 0 : 1)} billable ${quantity === 1 ? "unit" : "units"}`;
};

const transactionLabel = (tx: WalletTransaction) => {
  const raw = `${tx.type || ""} ${tx.source || ""}`.toLowerCase();
  const amount = Number(tx.amountUsd || 0);

  if (amount > 0 || raw.includes("credit") || raw.includes("top")) {
    return "Credit added";
  }

  if (raw.includes("refund")) {
    return "Credit returned";
  }

  if (raw.includes("adjust")) {
    return "Account adjustment";
  }

  return "Usage deduction";
};

const Billing: React.FC<BillingProps> = ({
  org,
  onUpdatePlan,
  onCancelPlan,
  onContactSales,
}) => {
  const [billing, setBilling] = useState<BillingMetrics>({
    plan: org.subscription.plan,
    status: org.subscription.status,
    currentPeriodEnd: org.subscription.currentPeriodEnd,
    usage: org.subscription.usage,
    invoices: org.invoices || [],
    wallet: {
      enabled: true,
      currency: "USD",
      balanceUsd: 0,
      minimumRechargeUsd: 30,
      status: "not_created",
      recentTransactions: [],
      recentUsageCharges: [],
      demoTopUpEnabled: false,
    },
    totals: {
      paidAmount: (org.invoices || [])
        .filter((invoice) => invoice.status === "Paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      pendingAmount: (org.invoices || [])
        .filter((invoice) => invoice.status !== "Paid")
        .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      invoiceCount: (org.invoices || []).length,
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("30");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [usageRange, setUsageRange] = useState<UsageRange>("24h");
  const [usageMenuOpen, setUsageMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const usagePercent = useMemo(() => {
    const limit = Number(billing.usage.minuteLimit || 0);
    return limit > 0
      ? Math.min(100, (Number(billing.usage.minutes || 0) / limit) * 100)
      : 0;
  }, [billing.usage.minuteLimit, billing.usage.minutes]);

  const loadBilling = async () => {
    setLoading(true);
    setError("");
    try {
      const response = (await api.getBillingSummary()) as BillingMetrics;
      setBilling(response);
    } catch (err) {
      setError(cleanError(err, "Unable to load billing details."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBilling();
    const timer = window.setInterval(() => {
      void loadBilling();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUsageMenuOpen(false);
        setHistoryOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const handleUpdatePlan = async (newPlan: "Starter" | "Pro") => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await onUpdatePlan(newPlan);
      await loadBilling();
      setSuccess(`Plan updated to ${newPlan}.`);
    } catch (planError) {
      setError(cleanError(planError, "Unable to update plan."));
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (
    action: () => Promise<void>,
    successMessage?: string,
  ) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await action();
      await loadBilling();
      if (successMessage) setSuccess(successMessage);
    } catch (actionError) {
      setError(
        cleanError(actionError, "Unable to complete that billing action."),
      );
    } finally {
      setLoading(false);
    }
  };

  const wallet = billing.wallet || {};
  const walletBalance = Number(wallet.balanceUsd || 0);
  const minimumRecharge = Number(wallet.minimumRechargeUsd || 30);
  const walletTransactions = wallet.recentTransactions || [];
  const walletUsageCharges = wallet.recentUsageCharges || [];
  const currentRange = usageRanges.find((range) => range.key === usageRange);
  const activityRangeStart = Date.now() - rangeToMs(usageRange);
  const walletActivity = useMemo(() => {
    const chargeRows = walletUsageCharges.map((charge) => ({
      id: `charge-${charge.id}`,
      kind: "debit" as const,
      title: usageLabel(charge),
      detail: quantityLabel(charge),
      amountUsd: -Math.abs(Number(charge.customerChargeUsd || 0)),
      balanceAfterUsd: null as number | null,
      createdAt: charge.createdAt,
      sortTime: new Date(charge.createdAt || 0).getTime() || 0,
    }));

    const usageTransactionIds = new Set(
      walletUsageCharges
        .map((charge) => charge.walletTransactionId)
        .filter(Boolean),
    );

    const transactionRows = walletTransactions
      .filter((tx) => {
        const amount = Number(tx.amountUsd || 0);
        if (amount >= 0) return true;
        return !usageTransactionIds.has(tx.id);
      })
      .map((tx) => ({
        id: `tx-${tx.id}`,
        kind:
          Number(tx.amountUsd || 0) >= 0
            ? ("credit" as const)
            : ("debit" as const),
        title: transactionLabel(tx),
        detail: tx.createdAt
          ? new Date(tx.createdAt).toLocaleString()
          : "Just now",
        amountUsd: Number(tx.amountUsd || 0),
        balanceAfterUsd:
          tx.balanceAfterUsd !== undefined && tx.balanceAfterUsd !== null
            ? Number(tx.balanceAfterUsd)
            : null,
        createdAt: tx.createdAt,
        sortTime: new Date(tx.createdAt || 0).getTime() || 0,
      }));

    return [...chargeRows, ...transactionRows].sort(
      (a, b) => b.sortTime - a.sortTime,
    );
  }, [walletTransactions, walletUsageCharges]);

  const filteredWalletActivity = walletActivity.filter((item) => {
    if (!item.createdAt) return true;
    const createdTime = new Date(item.createdAt).getTime();
    return Number.isNaN(createdTime) ? true : createdTime >= activityRangeStart;
  });
  const filteredDebitTotal = filteredWalletActivity
    .filter((item) => item.amountUsd < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amountUsd || 0)), 0);

  const handlePurchaseCredit = () => {
    const amount = Number(topUpAmount || minimumRecharge || 30);
    if (!Number.isFinite(amount) || amount < minimumRecharge) {
      setError(`Minimum credit purchase is ${money(minimumRecharge)}.`);
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("Card payment will be available shortly.");
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">Account Billing</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-900">
            Billing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage your plan, wallet balance, and usage deductions.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBilling}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[#F59E0B]/35 bg-white px-4 text-[11px] font-black uppercase tracking-[0.16em] text-[#F59E0B] transition hover:bg-[#F59E0B]/10 disabled:opacity-50"
        >
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
        >
          {error || `✓ ${success}`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Current plan
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <h3 className="text-3xl font-semibold tracking-[-0.05em] text-[#0F172A]">
                  {billing.plan}
                </h3>
                <span className="mb-1 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-600">
                  {friendlyStatus(billing.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Next billing date:{" "}
                {new Date(billing.currentPeriodEnd).toLocaleDateString()}
              </p>
            </div>
            <button
              disabled={loading || billing.status === "canceled"}
              onClick={() =>
                void runAction(onCancelPlan, "Plan cancellation saved.")
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel plan
            </button>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Minute usage</p>
                <p className="text-xs text-slate-500">
                  {minutes(billing.usage.minutes)} /{" "}
                  {minutes(billing.usage.minuteLimit)} used
                </p>
              </div>
              <p className="text-sm font-black text-[#F59E0B]">
                {usagePercent.toFixed(0)}%
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-700 ${usagePercent > 90 ? "bg-red-500" : "bg-[#F59E0B]"}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Calls", `${billing.usage.calls}/${billing.usage.callLimit}`],
              ["Minutes", minutes(billing.usage.minutes)],
              ["Invoices", billing.totals.invoiceCount],
              ["Paid", money(billing.totals.paidAmount)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl bg-slate-50 px-4 py-3"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-base font-black text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-3xl bg-[#0F172A] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
              Upgrade
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
              Upgrade to Pro
            </h3>
            <p className="mt-2 text-sm text-white/65">
              Increase call volume, minutes, analytics, and support access.
            </p>
            <button
              disabled={loading || billing.plan === "Pro"}
              onClick={() => void handleUpdatePlan("Pro")}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#F59E0B] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#d97706] disabled:opacity-50"
            >
              {billing.plan === "Pro" ? "Current plan" : "Go Pro"}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Custom plan
            </p>
            <h4 className="mt-2 text-lg font-semibold tracking-[-0.035em] text-[#0F172A]">
              Need more volume?
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Get a plan built for larger teams and heavier call usage.
            </p>
            <button
              type="button"
              onClick={() =>
                void runAction(onContactSales, "Sales inquiry sent.")
              }
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-[#0F172A] transition hover:bg-slate-50"
            >
              Contact sales
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[#F59E0B]/15 bg-[linear-gradient(135deg,#ffffff_0%,#F8FAFC_58%,#F1F5F9_100%)] shadow-sm">
        <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] lg:items-start">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F59E0B]">
              Usage wallet
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <h3 className="text-3xl font-semibold tracking-[-0.06em] text-[#0F172A] sm:text-4xl">
                {money(walletBalance)}
              </h3>
              <span className="mb-1 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0F172A]/45 shadow-sm ring-1 ring-slate-200">
                {friendlyStatus(wallet.status)}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-[#0F172A]/60">
              Wallet credit powers billable calls, chats, and account activity.
              Usage pauses when available credit is below the required minimum.
            </p>
            {wallet.warning && (
              <p className="mt-3 inline-flex rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                {wallet.warning}
              </p>
            )}

            <div className="mt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-black text-[#0F172A]">
                    Usage history
                  </h4>
                  <p className="mt-1 text-xs text-[#0F172A]/45">
                    Showing {currentRange?.label.toLowerCase()} ·{" "}
                    {money(filteredDebitTotal)} deducted
                  </p>
                </div>
                <div className="relative flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#0F172A]/60 transition hover:bg-slate-50"
                  >
                    View history
                  </button>
                  <button
                    type="button"
                    aria-label="Usage history range"
                    onClick={() => setUsageMenuOpen((open) => !open)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black leading-none text-[#0F172A]/55 transition hover:bg-slate-50"
                  >
                    ⋯
                  </button>
                  {usageMenuOpen && (
                    <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                      {usageRanges.map((range) => (
                        <button
                          key={range.key}
                          type="button"
                          onClick={() => {
                            setUsageRange(range.key);
                            setUsageMenuOpen(false);
                          }}
                          className={`flex w-full items-center px-4 py-2.5 text-left text-sm font-bold transition hover:bg-slate-50 ${usageRange === range.key ? "text-[#F59E0B]" : "text-[#0F172A]/70"}`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 max-h-[390px] overflow-y-auto rounded-2xl bg-white/75 px-3 ring-1 ring-slate-200/70 sm:px-4">
                {filteredWalletActivity.slice(0, 36).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0 sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#0F172A]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#0F172A]/45">
                        {item.kind === "debit"
                          ? `${item.detail} · ${item.createdAt ? new Date(item.createdAt).toLocaleString() : "Just now"}`
                          : item.detail}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-black ${item.kind === "credit" && Number(item.amountUsd || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {item.kind === "credit" &&
                        Number(item.amountUsd || 0) > 0
                          ? "+"
                          : "-"}
                        {money(Math.abs(Number(item.amountUsd || 0)))}
                      </p>
                      {item.balanceAfterUsd !== null && (
                        <p className="hidden text-xs text-[#0F172A]/40 sm:block">
                          Balance {money(item.balanceAfterUsd)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {!filteredWalletActivity.length && (
                  <p className="px-4 py-8 text-center text-sm text-[#0F172A]/45">
                    No wallet activity found for this period.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] bg-white/85 p-4 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0F172A]/40">
                  Add credit
                </p>
                <p className="mt-1 text-xs text-[#0F172A]/50">
                  Minimum purchase {money(minimumRecharge)}
                </p>
              </div>
              <p className="rounded-full bg-[#F59E0B]/10 px-3 py-1 text-xs font-black text-[#F59E0B]">
                Card
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Amount
                </span>
                <input
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  type="number"
                  min={minimumRecharge}
                  step="0.01"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-[#0F172A] outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Card number
                </span>
                <input
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  inputMode="numeric"
                  placeholder="1234 1234 1234 1234"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Expiry
                  </span>
                  <input
                    value={cardExpiry}
                    onChange={(event) => setCardExpiry(event.target.value)}
                    placeholder="MM / YY"
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    CVC
                  </span>
                  <input
                    value={cardCvc}
                    onChange={(event) => setCardCvc(event.target.value)}
                    inputMode="numeric"
                    placeholder="123"
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-slate-300 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handlePurchaseCredit}
                className="h-11 w-full rounded-xl bg-[#0F172A] px-5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Purchase credit
              </button>
            </div>
          </div>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                  Usage history
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#0F172A]">
                  {currentRange?.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500 transition hover:bg-slate-200"
              >
                ×
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Activity</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWalletActivity.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-[#0F172A]">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.kind === "debit"
                            ? item.detail
                            : "Wallet credit"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : "Just now"}
                      </td>
                      <td
                        className={`px-6 py-4 text-right text-sm font-black ${item.kind === "credit" && Number(item.amountUsd || 0) > 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {item.kind === "credit" &&
                        Number(item.amountUsd || 0) > 0
                          ? "+"
                          : "-"}
                        {money(Math.abs(Number(item.amountUsd || 0)))}
                      </td>
                    </tr>
                  ))}
                  {!filteredWalletActivity.length && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-12 text-center text-sm text-slate-400"
                      >
                        No wallet activity found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
