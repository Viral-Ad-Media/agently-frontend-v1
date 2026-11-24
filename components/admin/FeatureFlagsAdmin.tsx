import React, { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminFeatureFlag } from "../../services/adminApi";

/**
 * Super Admin → Feature switches.
 *
 * Turning a feature OFF hides it from every tenant on the LIVE app (and the
 * API refuses its routes) within ~15 seconds, with no redeploy. A local/dev
 * API ignores these switches and always shows every feature, so unfinished
 * work can keep being built and tested locally. See agently-server/lib/feature-flags.js.
 */

const card =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

const FeatureFlagsAdmin: React.FC = () => {
  const [features, setFeatures] = useState<AdminFeatureFlag[]>([]);
  const [enforcedHere, setEnforcedHere] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.featureFlags();
      setFeatures(result.features || []);
      setEnforcedHere(result.enforcedHere !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load feature switches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (feature: AdminFeatureFlag) => {
    setBusyKey(feature.key);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.setFeatureFlag(feature.key, !feature.enabled);
      setFeatures(result.features || []);
      setNotice(
        `${feature.label} is now ${!feature.enabled ? "ON" : "OFF"} for the live app.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the switch.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-lg font-semibold text-slate-900">Feature switches</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
          Switch off a feature that isn't finished. It disappears for every
          customer on the live app within about 15 seconds, and its API routes
          refuse requests. Your local version always keeps every feature on, so
          you can keep working on it and switch it back on when it's ready.
        </p>
        {!enforcedHere && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You're connected to a local API. Switches you change here are saved
            to the shared database and apply to the live app, but this local
            app ignores them.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </div>
      )}

      <div className={`${card} divide-y divide-slate-100 p-0`}>
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : (
          features.map((feature) => (
            <div
              key={feature.key}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${feature.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {feature.enabled ? "Live" : "Off"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{feature.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={feature.enabled}
                aria-label={`${feature.label} ${feature.enabled ? "on" : "off"}`}
                disabled={busyKey !== null}
                onClick={() => void toggle(feature)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${feature.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${feature.enabled ? "left-[1.375rem]" : "left-0.5"}`}
                />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FeatureFlagsAdmin;
