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

type BillingMetrics = {
  plan: Subscription["plan"];
  status: Subscription["status"];
  currentPeriodEnd: string;
  usage: Subscription["usage"];
  invoices: Invoice[];
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
