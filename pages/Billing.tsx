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

const Billing: React.FC<BillingProps> = ({
  org,
  onUpdatePlan,
  onCancelPlan,
  onDownloadInvoice,
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
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "bank" | "invoice"
  >("card");

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

  const invoices = billing.invoices || [];
  const wallet = billing.wallet || {};
  const walletBalance = Number(wallet.balanceUsd || 0);
  const minimumRecharge = Number(wallet.minimumRechargeUsd || 30);
  const walletTransactions = wallet.recentTransactions || [];
  const walletUsageCharges = wallet.recentUsageCharges || [];

  const handleDemoTopUp = async () => {
    const amount = Number(topUpAmount || minimumRecharge || 30);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid top-up amount.");
      return;
    }
    await runAction(
      async () => {
        await api.demoTopUpWallet(amount);
      },
      `${money(amount)} sandbox credit added to wallet.`,
    );
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Billing</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Manage your plan, usage, and invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBilling}
          disabled={loading}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
        >
          {error || `✓ ${success}`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="absolute right-8 top-8">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-600">
                {billing.status}
              </span>
            </div>
            <h3 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              Current Plan
            </h3>
            <h2 className="mb-2 text-4xl font-black text-slate-900">
              {billing.plan}{" "}
              <span className="text-lg font-medium text-slate-400">Plan</span>
            </h2>
            <p className="mb-8 text-slate-500">
              Next billing date:{" "}
              <strong>
                {new Date(billing.currentPeriodEnd).toLocaleDateString()}
              </strong>
            </p>

            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-end justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Minute Usage
                    </p>
                    <p className="text-xs text-slate-500">
                      {minutes(billing.usage.minutes)} /{" "}
                      {minutes(billing.usage.minuteLimit)} used
                    </p>
                  </div>
                  <p className="text-sm font-black text-indigo-600">
                    {usagePercent.toFixed(0)}%
                  </p>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${usagePercent > 90 ? "bg-red-500" : "bg-indigo-600"}`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4 border-t border-slate-100">
                {[
                  [
                    "Calls",
                    `${billing.usage.calls}/${billing.usage.callLimit}`,
                  ],
                  ["Minutes", `${minutes(billing.usage.minutes)}`],
                  ["Invoices", billing.totals.invoiceCount],
                  ["Paid", money(billing.totals.paidAmount)],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl bg-slate-50 p-4"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  disabled={loading}
                  onClick={() =>
                    void handleUpdatePlan(
                      billing.plan === "Pro" ? "Starter" : "Pro",
                    )
                  }
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {billing.plan === "Pro"
                    ? "Switch to Starter"
                    : "Upgrade to Pro"}
                </button>
                <button
                  disabled={loading || billing.status === "canceled"}
                  onClick={() =>
                    void runAction(onCancelPlan, "Plan cancellation saved.")
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel Plan
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#ff5527]/15 bg-[linear-gradient(135deg,#fffaf1_0%,#ffffff_52%,#f7f4eb_100%)] shadow-sm">
            <div className="flex flex-col gap-5 border-b border-[#232f3e]/8 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff5527]">
                  Usage Wallet
                </p>
                <h3 className="mt-2 text-3xl font-medium tracking-[-0.045em] text-[#232f3e]">
                  {money(walletBalance)}
                </h3>
                <p className="mt-1 text-sm text-[#232f3e]/60">
                  Customer-facing prepaid usage credit. Backend/admin credits
                  and real usage deductions refresh here automatically.
                </p>
                {wallet.warning && (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    {wallet.warning}
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-[#232f3e]/8 bg-white/80 px-4 py-3 text-sm text-[#232f3e]">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#232f3e]/40">
                  Minimum recharge
                </p>
                <p className="mt-1 text-xl font-black">
                  {money(minimumRecharge)}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#232f3e]/45">
                  Enforcement: {wallet.creditEnforcementMode || "observe"} ·
                  Auto-deduct: {wallet.autoChargeWalletEnabled ? "on" : "off"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
              {[
                ["Wallet status", wallet.status || "not created"],
                ["Total credits", money(Number(wallet.totalCreditsUsd || 0))],
                [
                  "Total debits",
                  money(Math.abs(Number(wallet.totalDebitsUsd || 0))),
                ],
                [
                  "Usage charges",
                  money(Number(wallet.totalUsageChargesUsd || 0)),
                ],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl bg-white/75 p-4 ring-1 ring-[#232f3e]/6"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/40">
                    {label}
                  </p>
                  <p className="mt-1 text-base font-black text-[#232f3e]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#232f3e]/8 p-6">
              <div className="rounded-[1.75rem] border border-[#232f3e]/10 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-base font-black text-[#232f3e]">
                      Add usage credit
                    </h4>
                    <p className="mt-1 text-xs text-[#232f3e]/55">
                      Sandbox payment UI for testing. Real card processing will
                      connect later through Stripe, Paystack, Flutterwave, or
                      another gateway.
                    </p>
                  </div>
                  <div className="rounded-full bg-[#ff5527]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5527]">
                    Gateway not connected
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    ["card", "Card"],
                    ["bank", "Bank transfer"],
                    ["invoice", "Invoice"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setPaymentMethod(key as "card" | "bank" | "invoice")
                      }
                      className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${paymentMethod === key ? "border-[#ff5527] bg-[#fffaf1] text-[#ff5527]" : "border-[#232f3e]/10 bg-white text-[#232f3e]/70"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[0.7fr_1.3fr]">
                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/45">
                      Amount
                    </span>
                    <input
                      value={topUpAmount}
                      onChange={(event) => setTopUpAmount(event.target.value)}
                      type="number"
                      min="1"
                      step="0.01"
                      className="mt-2 w-full rounded-2xl border border-[#232f3e]/10 bg-white px-4 py-3 text-lg font-black text-[#232f3e] outline-none focus:border-[#ff5527]"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/45">
                        Card number
                      </span>
                      <input
                        disabled
                        placeholder="4242 4242 4242 4242"
                        className="mt-2 w-full rounded-2xl border border-[#232f3e]/10 bg-[#f7f4eb] px-4 py-3 text-sm text-[#232f3e]/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/45">
                        Expiry / CVC
                      </span>
                      <input
                        disabled
                        placeholder="MM/YY · CVC"
                        className="mt-2 w-full rounded-2xl border border-[#232f3e]/10 bg-[#f7f4eb] px-4 py-3 text-sm text-[#232f3e]/50"
                      />
                    </label>
                  </div>
                </div>

                {wallet.demoTopUpEnabled ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleDemoTopUp()}
                    className="mt-5 w-full rounded-2xl bg-[#232f3e] px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-[#ff5527] disabled:opacity-50"
                  >
                    Add sandbox credit
                  </button>
                ) : (
                  <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                    Sandbox credit button is hidden until
                    BILLING_DEMO_TOPUP_ENABLED=true. Customers can see the
                    payment UI, but real top-up will wait for the payment
                    gateway.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-[#232f3e]/8 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-black text-[#232f3e]">
                  Recent usage deductions
                </h4>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#232f3e]/35">
                  Auto-refreshes every 10s
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {walletUsageCharges.slice(0, 5).map((charge) => (
                  <div
                    key={charge.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 text-sm ring-1 ring-[#232f3e]/6"
                  >
                    <div>
                      <p className="font-black capitalize text-[#232f3e]">
                        {(charge.provider || "usage").replace(/_/g, " ")} ·{" "}
                        {(charge.service || "service").replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-[#232f3e]/45">
                        {Number(charge.quantity || 0)} {charge.unit || "units"}{" "}
                        ·{" "}
                        {charge.createdAt
                          ? new Date(charge.createdAt).toLocaleString()
                          : "Just now"}
                      </p>
                    </div>
                    <p className="font-black text-red-500">
                      -{money(Number(charge.customerChargeUsd || 0))}
                    </p>
                  </div>
                ))}
                {!walletUsageCharges.length && (
                  <p className="rounded-2xl border border-dashed border-[#232f3e]/12 bg-white/60 px-4 py-5 text-center text-sm text-[#232f3e]/45">
                    No usage deductions yet. Backend/manual service usage will
                    appear here after wallet charging is enabled.
                  </p>
                )}
              </div>
            </div>
            <div className="border-t border-[#232f3e]/8 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-black text-[#232f3e]">
                  Recent wallet activity
                </h4>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#232f3e]/35">
                  Frontend-safe view
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {walletTransactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 text-sm ring-1 ring-[#232f3e]/6"
                  >
                    <div>
                      <p className="font-black capitalize text-[#232f3e]">
                        {(tx.source || tx.type || "wallet").replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-[#232f3e]/45">
                        {tx.createdAt
                          ? new Date(tx.createdAt).toLocaleString()
                          : "Just now"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-black ${Number(tx.amountUsd || 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {Number(tx.amountUsd || 0) >= 0 ? "+" : ""}
                        {money(Number(tx.amountUsd || 0))}
                      </p>
                      {tx.balanceAfterUsd !== undefined &&
                        tx.balanceAfterUsd !== null && (
                          <p className="text-xs text-[#232f3e]/45">
                            Balance {money(tx.balanceAfterUsd)}
                          </p>
                        )}
                    </div>
                  </div>
                ))}
                {!walletTransactions.length && (
                  <p className="rounded-2xl border border-dashed border-[#232f3e]/12 bg-white/60 px-4 py-5 text-center text-sm text-[#232f3e]/45">
                    No wallet transactions yet. Add demo credit after enabling
                    test mode.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold">Billing History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Invoice ID</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-mono text-sm">
                        {invoice.id}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(invoice.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold">
                        {money(invoice.amount)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-600">
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(() => onDownloadInvoice(invoice.id))
                          }
                          className="text-sm font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-sm text-slate-400"
                      >
                        No invoices yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-xl">
            <h3 className="mb-4 text-xl font-bold">Upgrade to Pro</h3>
            <ul className="mb-8 space-y-3">
              {[
                "500 monthly calls",
                "2,500 minutes included",
                "Multiple AI agents",
                "Advanced analytics",
                "Priority support",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm text-indigo-100"
                >
                  ✓ {feature}
                </li>
              ))}
            </ul>
            <button
              disabled={loading || billing.plan === "Pro"}
              onClick={() => void handleUpdatePlan("Pro")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 font-black text-indigo-600 shadow-lg hover:bg-indigo-50 disabled:opacity-50"
            >
              {billing.plan === "Pro" ? "Current Plan" : "Go Pro for $99/mo"}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-2 font-bold">Need a Custom Plan?</h4>
            <p className="mb-4 text-sm text-slate-500">
              For high-volume teams, we offer custom pricing and dedicated
              support.
            </p>
            <button
              type="button"
              onClick={() =>
                void runAction(onContactSales, "Sales inquiry sent.")
              }
              className="text-sm font-bold text-indigo-600 hover:underline"
            >
              Contact Sales →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
