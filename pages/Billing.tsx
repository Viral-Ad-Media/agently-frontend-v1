import React, { useEffect, useMemo, useState } from "react";
import { Invoice, Organization } from "../types";
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
  demoTopUpEnabled?: boolean;
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
      minimumRechargeUsd: 30,
      status: "loading",
      recentTransactions: [],
      recentUsageCharges: [],
      demoTopUpEnabled: false,
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("30");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [usageRange, setUsageRange] = useState<UsageRange>("all");

  const wallet = billing.wallet || {};
  const balance = Number(wallet.balanceUsd ?? 0);
  const minimumRecharge = Math.max(1, Number(wallet.minimumRechargeUsd || 30));
  const minimumActive = Math.max(
    Number(wallet.numberRetention?.minimumRequiredUsd || 0),
    Number(wallet.minimums?.callUsd || 0),
    Number(wallet.minimums?.activeUsd || 0),
    1,
  );

  const loadBilling = async () => {
    setLoading(true);
    setError("");
    try {
      const response = (await api.getBillingSummary()) as BillingMetrics;
      if (response?.organizationId && response.organizationId !== org.id) {
        throw new Error(
          "Billing summary returned a different organization. Please log out and log back in before continuing.",
        );
      }
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
      setError(cleanError(err, "Unable to load billing details."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBilling();
    const timer = window.setInterval(() => void loadBilling(), 5000);
    const refreshHandler = (event: Event) => {
      const detail =
        (event as CustomEvent<{ organizationId?: string; source?: string }>)
          .detail || {};
      if (detail.organizationId && detail.organizationId !== org.id) return;
      if (detail.source === "billing-summary") return;
      void loadBilling();
    };
    window.addEventListener("agently:wallet-refresh", refreshHandler);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("agently:wallet-refresh", refreshHandler);
    };
  }, [org.id]);

  useEffect(() => {
    setTopUpAmount(String(minimumRecharge));
  }, [minimumRecharge]);

  const handlePurchaseCredit = async () => {
    setError("");
    setSuccess("");
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount < minimumRecharge) {
      setError(`Minimum top-up is ${money(minimumRecharge)}.`);
      return;
    }
    setLoading(true);
    try {
      if (!wallet.demoTopUpEnabled) {
        setSuccess(
          "Payment details captured. Connect the live payment processor to charge cards automatically.",
        );
        return;
      }
      const response = (await api.demoTopUpWallet(amount)) as {
        wallet?: BillingWallet;
      };
      if (response?.wallet) {
        setBilling((current) => ({ ...current, wallet: response.wallet }));
        const nextBalance = Number(response.wallet.balanceUsd);
        if (Number.isFinite(nextBalance)) {
          window.dispatchEvent(
            new CustomEvent("agently:wallet-refresh", {
              detail: {
                organizationId: org.id,
                balanceUsd: nextBalance,
                source: "billing-topup",
              },
            }),
          );
        }
      }
      setSuccess(`Added ${money(amount)} usage credit.`);
      await loadBilling();
    } catch (err) {
      setError(cleanError(err, "Unable to add credit."));
    } finally {
      setLoading(false);
    }
  };

  const activity = useMemo<ActivityItem[]>(() => {
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
          Number(charge.customerChargeUsd || 0) <= 0 ||
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
  }, [org.id, wallet.recentTransactions, wallet.recentUsageCharges]);

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
      <section className="overflow-hidden rounded-[2rem] bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#F59E0B]">
              Prepaid usage credit
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-[#0F172A] sm:text-4xl">
              Billing & usage
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B]">
              Agently currently runs on usage credit. Every paid service is
              deducted from the wallet immediately and the navbar shows the
              remaining balance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBilling()}
            className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-600 transition hover:border-[#F59E0B] hover:text-[#F59E0B]"
          >
            Refresh
          </button>
        </div>
        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {success}
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0F172A]/40">
                Add card details
              </p>
              <h3 className="mt-1 text-xl font-black text-[#0F172A]">
                Top up usage credit
              </h3>
            </div>
            <span className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-black text-white">
              Prepaid
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#64748B]">
            This replaces the old Starter/Professional plan card. Customers add
            credit and Agently deducts each service as it is used.
          </p>
          <div className="mt-5 grid gap-3">
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
              Add credit
            </button>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-[#0F172A] p-5 text-white shadow-sm sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
            Available balance
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <p className="text-5xl font-black tracking-tight">
              {wallet.balanceUsd === undefined ? "—" : money(balance)}
            </p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${lowCredit ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}
            >
              {lowCredit ? "Top-up needed" : "Active"}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Minimum active
              </p>
              <p className="mt-1 text-lg font-black">{money(minimumActive)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Minimum top-up
              </p>
              <p className="mt-1 text-lg font-black">
                {money(minimumRecharge)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                Wallet status
              </p>
              <p className="mt-1 text-lg font-black capitalize">
                {wallet.status || "active"}
              </p>
            </div>
          </div>
          {lowCredit && (
            <p className="mt-5 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900">
              Top up with at least {money(minimumActive)} to keep calls, website
              assistants, Knowledge Base syncs and campaigns active.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0F172A]/40">
              Usage billing credit
            </p>
            <h3 className="mt-1 text-2xl font-black text-[#0F172A]">
              Wallet activity
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              Top-ups, number purchases, calls, Knowledge Base syncs and other
              service deductions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {usageRanges.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => setUsageRange(range.key)}
                className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${usageRange === range.key ? "bg-[#0F172A] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                {range.label}
              </button>
            ))}
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

      <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0F172A]/40">
              Receipts
            </p>
            <h3 className="mt-1 text-xl font-black text-[#0F172A]">Invoices</h3>
          </div>
        </div>
        <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {(billing.invoices || []).map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-black text-[#0F172A]">
                  Invoice {invoice.id}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  {invoice.status} ·{" "}
                  {new Date(invoice.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-black">{money(invoice.amount)}</p>
                <button
                  type="button"
                  onClick={() => void onDownloadInvoice(invoice.id)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-[#F59E0B] hover:text-[#F59E0B]"
                >
                  Download
                </button>
              </div>
            </div>
          ))}
          {!(billing.invoices || []).length && (
            <p className="px-4 py-8 text-center text-sm font-semibold text-slate-400">
              No invoices yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Billing;
