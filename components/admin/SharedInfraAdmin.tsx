import React, { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  type SharedInfrastructureResponse,
} from "../../services/adminApi";

/**
 * Owner-only view of the flat infrastructure bills — the AWS Lightsail bundle
 * and the Supabase plan — and how that cost is split across tenants.
 *
 * This is the counterpart to Tenant economics. That panel covers what tenants
 * are charged per event (Twilio, OpenAI, ElevenLabs), which is metered and
 * billed as it happens. This one covers the bills that arrive as a single
 * number regardless of what anyone did, which nothing charged for until now.
 *
 * The server always runs this as a dry run, so opening this page cannot move
 * money. Charging happens only from scripts/billing-run-cycle.js --commit.
 */

const money = (value: number | null | undefined, dp = 2) =>
  value == null ? "—" : `$${Number(value).toFixed(dp)}`;

const gb = (bytes: number) =>
  bytes > 0 ? `${(bytes / 1e9).toFixed(2)} GB` : "—";

const duration = (seconds: number) => {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} hrs`;
};

const WINDOWS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

const SharedInfraAdmin: React.FC = () => {
  const [data, setData] = useState<SharedInfrastructureResponse | null>(null);
  const [hours, setHours] = useState(720);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowHours: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminApi.sharedInfrastructure(windowHours));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load infrastructure cost.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [load, hours]);

  const engine = data?.engine;
  const econ = data?.economics;
  const cost = data?.cost;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#F59E0B]">
            Owner only
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0F172A]">
            Shared infrastructure
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The Lightsail and Supabase bills arrive as flat amounts no matter
            what tenants do. This is how much they cost, and how that cost is
            split across tenants by the usage that actually drives it.
          </p>
        </div>
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => setHours(w.hours)}
              className={`rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                hours === w.hours
                  ? "bg-[#0F172A] text-white"
                  : "border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Profit or loss, first and unmissable. In absorb mode infrastructure
          never appears on a tenant invoice, which makes it very easy to run at
          a loss without noticing — so this cannot be buried below a table. */}
      {econ ? (
        <div
          className={`rounded-2xl border px-5 py-5 ${
            econ.profitable
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p
              className={`text-sm font-black uppercase tracking-widest ${
                econ.profitable ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {econ.profitable ? "Profitable" : "Running at a loss"}
            </p>
            <p className="text-[12px] text-slate-500">
              {econ.mode === "absorb"
                ? "Infrastructure is priced into the unit rate — tenants never see it as a line item."
                : "Infrastructure is billed to tenants directly."}
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "True cost", value: money(econ.totalCostUsd), note: `provider ${money(econ.directCostUsd)} + infra ${money(econ.sharedCostUsd)}` },
              { label: "Revenue", value: money(econ.revenueUsd), note: "usage charges collected" },
              {
                label: "Gross profit",
                value: money(econ.grossProfitUsd),
                note: econ.actualMarginPercent == null ? "—" : `${econ.actualMarginPercent}% actual margin`,
                bad: !econ.profitable,
              },
              { label: "Infra share of cost", value: `${econ.infraShareOfCostPercent}%`, note: "of what we actually spend" },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {c.label}
                </p>
                <p
                  className={`mt-1 text-xl font-black tracking-tight ${
                    c.bad ? "text-red-700" : "text-[#0F172A]"
                  }`}
                >
                  {c.value}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{c.note}</p>
              </div>
            ))}
          </div>

          {/* The number that should set unit prices. */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-900/10 pt-4 text-[12px]">
            <span className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
              charging <strong className="text-[#0F172A]">{econ.currentMultiplier}×</strong> provider cost
            </span>
            <span className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
              break-even at <strong className="text-[#0F172A]">{econ.breakEvenMultiplier ?? "—"}×</strong>
            </span>
            <span className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
              <strong className="text-[#0F172A]">{econ.requiredMultiplier ?? "—"}×</strong> for the target margin
            </span>
          </div>
        </div>
      ) : null}

      {/* Configuration state. */}
      {engine ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <ul className="space-y-1 text-[13px] text-slate-600">
            <li>
              Mode: <strong>{engine.mode}</strong>
            </li>
            <li>
              Infrastructure cost configured:{" "}
              <strong>{engine.configured ? "yes" : "no"}</strong>
              {engine.configured ? null : (
                <>
                  {" "}
                  — set <code>AWS_LIGHTSAIL_MONTHLY_USD</code> and{" "}
                  <code>SUPABASE_MONTHLY_USD</code> from the real invoices
                </>
              )}
            </li>
            <li>
              Target margin: <strong>{engine.marginPercent}%</strong> ={" "}
              <strong>{engine.marginMultiple}× cost</strong>{" "}
              <span className="text-slate-400">({engine.marginSource})</span>
            </li>
          </ul>
          {engine.warnings.map((w) => (
            <p key={w} className="mt-2 text-[12px] text-amber-800">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : null}

      {data && cost ? (
        <>
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Infra cost / month",
                value: money(cost.monthlyTotalUsd),
                note: "Lightsail + Supabase, flat",
              },
              {
                label: `Our cost, ${data.window.hours}h`,
                value: money(cost.windowPooledUsd, 4),
                note: "pro-rated to this window",
              },
              {
                label: "Recovered from tenants",
                value: money(cost.billableUsd),
                note: `${engine?.marginMultiple}× cost`,
              },
              {
                label: "Absorbed by us",
                value: money(cost.unallocatedUsd, 4),
                note: "nobody used the drivers",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-black tracking-tight text-[#0F172A]">
                  {card.value}
                </p>
                <p className="mt-1 text-[12px] text-slate-500">{card.note}</p>
              </div>
            ))}
          </div>

          {/* How each bill is split. Without this the tenant numbers below are
              unexplainable, which is the whole problem this panel solves. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
              How each bill is split
            </h3>
            <div className="mt-4 space-y-3">
              {Object.entries(data.pools).map(([name, pool]) => (
                <div
                  key={name}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold capitalize text-[#0F172A]">
                      {name}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {money(data.cost.monthlyPools[name])}/month ·{" "}
                      {money(pool.poolUsd, 4)} this window
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(pool.drivers).length ? (
                      Object.entries(pool.drivers).map(([driver, weight]) => (
                        <span
                          key={driver}
                          className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                        >
                          {data.drivers[driver]?.label || driver}{" "}
                          <strong className="text-[#0F172A]">
                            {Math.round(weight * 100)}%
                          </strong>
                        </span>
                      ))
                    ) : (
                      <span className="rounded-lg bg-white px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-slate-200">
                        unused this window — absorbed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per tenant */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-5 py-3">Organization</th>
                    <th className="px-5 py-3 text-right">Compute</th>
                    <th className="px-5 py-3 text-right">Stored</th>
                    <th className="px-5 py-3 text-right">Activity</th>
                    <th className="px-5 py-3 text-right">Share</th>
                    <th className="px-5 py-3 text-right">Our cost</th>
                    <th className="px-5 py-3 text-right">{econ?.mode === "absorb" ? "Charged" : "Billed"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.length ? (
                    data.tenants.map((t) => (
                      <tr
                        key={t.organizationId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-5 py-3 font-mono text-[12px] text-slate-500">
                          {t.organizationId}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {duration(t.computeSeconds)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {gb(t.storageBytes)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {money(t.activityCostUsd, 4)}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {t.sharePercent.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {money(t.sharedCostUsd, 4)}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-[#0F172A]">
                          {money(t.sharedBillableUsd)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-8 text-center text-slate-400"
                      >
                        No tenant usage in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[12px] text-slate-400">
            Direct provider cost in this window ({money(cost.directCostUsd, 4)})
            is charged per event as it happens and is shown here for context
            only — it is not part of the figures above.
          </p>
        </>
      ) : null}
    </div>
  );
};

export default SharedInfraAdmin;
