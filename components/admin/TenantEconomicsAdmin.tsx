import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminApi,
  type PricingMarginResponse,
  type TenantEconomicsResponse,
  type TenantEconomicsRow,
} from "../../services/adminApi";

/**
 * Owner-only economics panel: what every tenant has spent, what those services
 * actually cost us, the margin taken, and the controls to change that margin or
 * credit a tenant directly.
 *
 * Everything here comes from /api/super-admin/* endpoints that sit behind
 * requireSuperAdmin. Internal cost and profit must never reach a tenant, so
 * this component is only ever mounted inside the super-admin page.
 */

const money = (value: number | null | undefined, dp = 2) =>
  value == null ? "—" : `$${Number(value).toFixed(dp)}`;

const TenantEconomicsAdmin: React.FC = () => {
  const [data, setData] = useState<TenantEconomicsResponse | null>(null);
  const [margin, setMargin] = useState<PricingMarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [marginInput, setMarginInput] = useState("");
  const [savingMargin, setSavingMargin] = useState(false);

  const [topUpOrg, setTopUpOrg] = useState<TenantEconomicsRow | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [toppingUp, setToppingUp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [economics, marginConfig] = await Promise.all([
        adminApi.tenantEconomics(),
        adminApi.pricingMargin(),
      ]);
      setData(economics);
      setMargin(marginConfig);
      if (marginConfig.baseMarginPercent != null) {
        setMarginInput(String(marginConfig.baseMarginPercent));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load economics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMargin = async () => {
    const value = Number(marginInput);
    if (!Number.isFinite(value) || value <= 0 || value > 95) {
      setError("Margin must be greater than 0 and no more than 95.");
      return;
    }
    setSavingMargin(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.updatePricingMargin(value);
      setNotice(
        `Base margin changed from ${result.previousMarginPercent}% to ${result.marginPercent}% (${result.multiple}× cost). Applies to usage priced from now on.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update margin.");
    } finally {
      setSavingMargin(false);
    }
  };

  const submitTopUp = async () => {
    if (!topUpOrg) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a top-up amount greater than zero.");
      return;
    }
    setToppingUp(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.topUpWallet(
        topUpOrg.organizationId,
        amount,
        "super_admin_manual_credit",
      );
      setNotice(
        `Credited ${money(amount)} to ${topUpOrg.organizationName || topUpOrg.organizationId}.`,
      );
      setTopUpOrg(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not credit wallet.");
    } finally {
      setToppingUp(false);
    }
  };

  const totals = data?.totals;
  const marginMultiple = useMemo(() => {
    const value = Number(marginInput);
    if (!Number.isFinite(value) || value <= 0 || value >= 100) return null;
    return Math.round((100 / (100 - value)) * 1000) / 1000;
  }, [marginInput]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">
            Owner only
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]">
            Tenant economics
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            What each tenant has spent, what it actually cost us, and the margin
            taken. Internal cost and profit are never exposed to tenants.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void adminApi.downloadTenantEconomicsCsv()}
            className="rounded-xl bg-[#0F172A] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-[#1e293b]"
          >
            Download CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Provider cost", v: money(totals?.providerCostUsd), s: "What we paid" },
          { k: "Charged", v: money(totals?.chargedUsd), s: "Across all tenants" },
          { k: "Gross profit", v: money(totals?.grossProfitUsd), s: `${totals?.marginPercent ?? "—"}% margin` },
          { k: "Blended multiple", v: totals?.multiple ? `${totals.multiple}×` : "—", s: "Charged ÷ cost" },
        ].map((tile) => (
          <div
            key={tile.k}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {tile.k}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#0F172A]">
              {tile.v}
            </p>
            <p className="text-xs text-slate-400">{tile.s}</p>
          </div>
        ))}
      </div>

      {/* Margin control */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-black text-[#0F172A]">Base pricing margin</h3>
        <p className="mt-1 text-sm text-slate-500">
          Every billable line is priced from this one figure. Changing it
          re-prices all future usage — existing charges are not rewritten.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="margin-input"
              className="block text-[10px] font-black uppercase tracking-widest text-slate-400"
            >
              Margin %
            </label>
            <input
              id="margin-input"
              type="number"
              min={1}
              max={95}
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              className="mt-1 w-32 rounded-xl border border-slate-200 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-[#F59E0B]"
            />
          </div>
          <div className="pb-2.5 text-sm text-slate-500">
            {marginMultiple ? (
              <>
                Tenants pay{" "}
                <span className="font-black text-[#0F172A]">
                  {marginMultiple}×
                </span>{" "}
                our cost
              </>
            ) : (
              "Enter a value between 1 and 95"
            )}
          </div>
          <button
            type="button"
            onClick={() => void saveMargin()}
            disabled={savingMargin}
            className="rounded-xl bg-[#F59E0B] px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-[#d97706] disabled:opacity-50"
          >
            {savingMargin ? "Saving…" : "Update margin"}
          </button>
        </div>
        {margin?.overrides?.length ? (
          <p className="mt-3 text-xs text-slate-400">
            {margin.overrides.length} line-specific override
            {margin.overrides.length === 1 ? "" : "s"} take precedence over this
            base value:{" "}
            {margin.overrides.map((o) => o.scope).join(", ")}
          </p>
        ) : null}
      </div>

      {/* Per-tenant table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-slate-50">
              {["Tenant", "Wallet", "Our cost", "Charged", "Profit", "Margin", ""].map(
                (h, i) => (
                  <th
                    key={h || `sp-${i}`}
                    className={`border-b border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 ${i === 0 ? "text-left" : "text-right"}`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !data?.tenants.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  No billable usage recorded yet.
                </td>
              </tr>
            )}
            {data?.tenants.map((t) => (
              <React.Fragment key={t.organizationId}>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(
                          expanded === t.organizationId ? null : t.organizationId,
                        )
                      }
                      className="text-left"
                    >
                      <span className="text-sm font-bold text-[#0F172A]">
                        {t.organizationName || "Unnamed organization"}
                      </span>
                      <span className="block font-mono text-[10px] text-slate-400">
                        {t.organizationId}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">
                    {money(t.walletBalanceUsd)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">
                    {money(t.providerCostUsd, 4)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-[#0F172A]">
                    {money(t.chargedUsd, 4)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-emerald-600">
                    {money(t.grossProfitUsd, 4)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">
                    {t.marginPercent == null ? "—" : `${t.marginPercent}%`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setTopUpOrg(t);
                        setTopUpAmount("10");
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#F59E0B] hover:text-[#F59E0B]"
                    >
                      Credit
                    </button>
                  </td>
                </tr>
                {expanded === t.organizationId && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={7} className="px-4 py-3">
                      <table className="w-full">
                        <tbody>
                          {t.lines.map((l) => (
                            <tr key={l.line}>
                              <td className="py-1 text-xs text-slate-500">
                                {l.line}
                              </td>
                              <td className="py-1 text-right text-xs tabular-nums text-slate-400">
                                {l.quantity.toLocaleString()} {l.unit || ""}
                              </td>
                              <td className="w-28 py-1 text-right text-xs tabular-nums text-slate-500">
                                {money(l.cost, 4)}
                              </td>
                              <td className="w-28 py-1 text-right text-xs tabular-nums text-[#0F172A]">
                                {money(l.charged, 4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {data?.generatedAt && (
        <p className="text-xs text-slate-400">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}

      {/* Credit dialog */}
      {topUpOrg && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTopUpOrg(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-[#0F172A]">Credit wallet</h3>
            <p className="mt-1 text-sm text-slate-500">
              Adds spendable balance to{" "}
              <span className="font-bold text-[#0F172A]">
                {topUpOrg.organizationName || topUpOrg.organizationId}
              </span>
              . This is a manual credit outside Stripe — use it for internal
              testers, not paying customers.
            </p>
            <label
              htmlFor="topup-amount"
              className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400"
            >
              Amount USD
            </label>
            <input
              id="topup-amount"
              type="number"
              min={1}
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-[#F59E0B]"
            />
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setTopUpOrg(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitTopUp()}
                disabled={toppingUp}
                className="flex-1 rounded-xl bg-[#F59E0B] py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {toppingUp ? "Crediting…" : "Credit wallet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantEconomicsAdmin;
