import React, { useEffect, useMemo, useState } from "react";
import { AgentConfig, Organization } from "../types";
import { TwilioNumberRecord, voiceCallsApi } from "../services/voiceCallsApi";

// ── helpers ──────────────────────────────────────────────────
const getOrgId = (n: TwilioNumberRecord) =>
  n.organization_id || n.organizationId || "";
const getNumId = (n: TwilioNumberRecord) => n.id || n.numberId || "";
const getPhone = (n: TwilioNumberRecord) =>
  n.phone_number || n.phoneNumber || "";
const getAgentId = (n: TwilioNumberRecord) =>
  n.assigned_voice_agent_id ||
  n.assignedVoiceAgentId ||
  n.voiceAgentId ||
  n.agentId ||
  "";

const statusClass = (v?: string | null) => {
  const s = String(v || "").toLowerCase();
  if (["ready", "active", "verified", "configured"].some((w) => s.includes(w)))
    return "bg-emerald-100 text-emerald-700";
  if (["pending", "needs", "unknown"].some((w) => s.includes(w)))
    return "bg-amber-100 text-amber-700";
  if (["failed", "error", "blocked"].some((w) => s.includes(w)))
    return "bg-red-100 text-red-600";
  return "bg-slate-100 text-slate-500";
};

const fmt = (v?: string | null) =>
  String(v || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

type Toast = { msg: string; ok: boolean } | null;

interface Props {
  org: Organization;
  onAgentUpdated?: () => void;
}

// ── Search modal ─────────────────────────────────────────────
interface SearchResult {
  phoneNumber: string;
  friendlyName?: string;
  locality?: string;
  region?: string;
  capabilities?: { voice?: boolean; sms?: boolean };
}

// ── Component ────────────────────────────────────────────────
const PhoneNumbers: React.FC<Props> = ({ org, onAgentUpdated }) => {
  const orgId = org.id;
  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);

  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Search & purchase state
  const [showSearch, setShowSearch] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchaseAgent, setPurchaseAgent] = useState(
    org.activeVoiceAgentId || "",
  );

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 4500);
  };

  // ── Load tenant numbers ──────────────────────────────────
  const loadNumbers = async () => {
    if (!orgId) return;
    setBusy("load");
    try {
      const res = (await voiceCallsApi.phoneNumbers.getTwilioNumbers({
        organizationId: orgId,
      })) as any;
      // Defensive: only keep rows that belong to this org
      const all: TwilioNumberRecord[] = res?.numbers || [];
      const scoped = all.filter((n) => {
        const nOrgId = getOrgId(n);
        return !nOrgId || nOrgId === orgId;
      });
      setNumbers(scoped);
      setLoaded(true);
    } catch (e: any) {
      showToast(e?.message || "Could not load phone numbers.", false);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadNumbers();
  }, [orgId]);

  // ── Assign number to agent ───────────────────────────────
  const handleAssign = async (number: TwilioNumberRecord, agentId: string) => {
    const numberId = getNumId(number);
    if (!numberId || !agentId) {
      showToast("Select an agent first.", false);
      return;
    }
    // Guard: agent already has a different number assigned
    const agentCurrentNumber = numbers.find(
      (n) => getAgentId(n) === agentId && getNumId(n) !== numberId,
    );
    if (agentCurrentNumber) {
      showToast(
        `${agents.find((a) => a.id === agentId)?.name || "This agent"} already has ${getPhone(agentCurrentNumber)} assigned. Unassign that number first.`,
        false,
      );
      return;
    }
    setBusy(`assign-${numberId}`);
    try {
      await voiceCallsApi.phoneNumbers.assignTwilioNumberToAgent(numberId, {
        agentId,
        voiceAgentId: agentId,
      });
      showToast(`${getPhone(number)} assigned successfully.`);
      onAgentUpdated?.();
      await loadNumbers();
    } catch (e: any) {
      showToast(e?.message || "Assign failed.", false);
    } finally {
      setBusy(null);
    }
  };

  // ── Unassign number (set assigned_voice_agent_id = null) ─
  const handleUnassign = async (number: TwilioNumberRecord) => {
    const numberId = getNumId(number);
    if (!numberId) return;
    setBusy(`unassign-${numberId}`);
    try {
      // PATCH the number row to clear agent assignment
      await voiceCallsApi.phoneNumbers.updateTwilioNumber(numberId, {
        agentId: null,
        voiceAgentId: null,
        unassign: true,
      });
      showToast(`${getPhone(number)} unassigned.`);
      onAgentUpdated?.();
      await loadNumbers();
    } catch (e: any) {
      showToast(e?.message || "Unassign failed.", false);
    } finally {
      setBusy(null);
    }
  };

  // ── Release (delete) number ──────────────────────────────
  const handleRelease = async (number: TwilioNumberRecord) => {
    const phone = getPhone(number);
    if (
      !window.confirm(
        `Release ${phone}? This removes it from your Twilio account permanently.`,
      )
    )
      return;
    // Backend DELETE /numbers/:sid uses phone_sid
    const sid =
      number.phone_sid || number.phoneSid || number.sid || getNumId(number);
    setBusy(`release-${getNumId(number)}`);
    try {
      await voiceCallsApi.phoneNumbers.deleteTwilioNumber(sid);
      showToast(`${phone} released.`);
      onAgentUpdated?.();
      await loadNumbers();
    } catch (e: any) {
      showToast(e?.message || "Release failed.", false);
    } finally {
      setBusy(null);
    }
  };

  // ── Search US numbers ────────────────────────────────────
  const handleSearch = async () => {
    setSearching(true);
    setResults([]);
    try {
      const res =
        (await voiceCallsApi.phoneNumbers.searchAvailableTwilioNumbers({
          country: "US",
          type: "Local",
          areaCode: areaCode || undefined,
          contains: contains || undefined,
          limit: 20,
          requiresVoice: true,
        })) as any;
      const list: SearchResult[] = (res?.numbers || [])
        .map((n: any) => ({
          phoneNumber: n.phoneNumber || n.phone_number || n.friendlyName || "",
          friendlyName: n.friendlyName || n.friendly_name || "",
          locality: n.locality || "",
          region: n.region || n.regionCode || "",
          capabilities: n.capabilities || { voice: true, sms: true },
        }))
        .filter((n: SearchResult) => n.phoneNumber);
      setResults(list);
      if (!list.length)
        showToast("No numbers found for those criteria.", false);
    } catch (e: any) {
      showToast(e?.message || "Search failed.", false);
    } finally {
      setSearching(false);
    }
  };

  // ── Purchase number ──────────────────────────────────────
  const handlePurchase = async (phoneNumber: string) => {
    setPurchasing(phoneNumber);
    try {
      await voiceCallsApi.phoneNumbers.purchaseTwilioNumber({
        phoneNumber,
        voiceAgentId: purchaseAgent || undefined,
        agentId: purchaseAgent || undefined,
        country: "US",
      });
      showToast(`${phoneNumber} purchased and added to your account.`);
      setShowSearch(false);
      setResults([]);
      onAgentUpdated?.();
      await loadNumbers();
    } catch (e: any) {
      showToast(e?.message || "Purchase failed.", false);
    } finally {
      setPurchasing(null);
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="animate-fade-up space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Phone Numbers</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Numbers assigned to your organization · US voice only (MVP)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadNumbers()}
            disabled={busy === "load"}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 disabled:opacity-50 transition-all"
          >
            {busy === "load" ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={() => {
              setShowSearch(true);
              setResults([]);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
          >
            + Get US Number
          </button>
        </div>
      </div>

      {/* Rules callout */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
        <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-1">
          Assignment rules
        </p>
        <ul className="text-xs text-amber-800 space-y-0.5">
          <li>· Each number can only be assigned to one agent at a time</li>
          <li>· Each agent can only have one number (inbound + outbound)</li>
          <li>
            · To reassign, unassign the number from its current agent first
          </li>
          <li>· Deleting an agent returns the number to the unassigned pool</li>
        </ul>
        <p className="text-[10px] font-mono text-amber-600 mt-2">
          Org: {orgId}
        </p>
      </div>

      {/* Loading skeleton */}
      {busy === "load" && !loaded && (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading your numbers…</p>
        </div>
      )}

      {/* Empty state */}
      {loaded && numbers.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 py-20 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-black text-slate-900">No numbers yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Purchase a US number above to get started.
          </p>
        </div>
      )}

      {/* Number cards */}
      {numbers.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {numbers.map((n) => {
            const numberId = getNumId(n);
            const phone = getPhone(n);
            const assignedId = getAgentId(n);
            const assignedAgent = agents.find((a) => a.id === assignedId);
            const isAssigned = !!assignedId;
            const isBusy =
              busy === `assign-${numberId}` ||
              busy === `unassign-${numberId}` ||
              busy === `release-${numberId}`;

            return (
              <div
                key={numberId}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🇺🇸</span>
                      <p className="text-lg font-black text-slate-900">
                        {phone}
                      </p>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {n.phone_sid || n.phoneSid || "No SID"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      {n.number_type || n.numberType || "Local"}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${statusClass(n.overall_status || n.overallStatus)}`}
                    >
                      {fmt(n.overall_status || n.overallStatus || "unknown")}
                    </span>
                  </div>
                </div>

                {/* Status pills */}
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusClass(n.inbound_voice_status || n.inboundVoiceStatus)}`}
                  >
                    In:{" "}
                    {fmt(n.inbound_voice_status || n.inboundVoiceStatus || "—")}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusClass(n.outbound_voice_status || n.outboundVoiceStatus)}`}
                  >
                    Out:{" "}
                    {fmt(
                      n.outbound_voice_status || n.outboundVoiceStatus || "—",
                    )}
                  </span>
                  {n.capabilities?.voice !== false && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Voice ✓
                    </span>
                  )}
                  {n.capabilities?.sms && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      SMS ✓
                    </span>
                  )}
                </div>

                {/* Assignment section */}
                <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Assigned Agent
                  </p>

                  {isAssigned ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                          {(assignedAgent?.name || "A")[0]}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">
                            {assignedAgent?.name || assignedId}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {assignedAgent?.direction || "—"} · handles inbound
                            + outbound
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => void handleUnassign(n)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-xl border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-50 transition-all"
                      >
                        {busy === `unassign-${numberId}` ? "…" : "Unassign"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          e.target.value && void handleAssign(n, e.target.value)
                        }
                        disabled={isBusy}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                      >
                        <option value="">Assign to agent…</option>
                        {agents
                          .filter((a) => {
                            // Only show agents that don't already have a number
                            const agentHasNumber = numbers.some(
                              (num) =>
                                getAgentId(num) === a.id &&
                                getNumId(num) !== numberId,
                            );
                            return !agentHasNumber;
                          })
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.direction})
                            </option>
                          ))}
                      </select>
                      {isBusy && (
                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  )}
                </div>

                {/* Release */}
                <button
                  onClick={() => void handleRelease(n)}
                  disabled={isBusy}
                  className="w-full rounded-xl border border-red-100 text-red-500 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-40 transition-all"
                >
                  {busy === `release-${numberId}`
                    ? "Releasing…"
                    : "Release Number"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search & Purchase Modal */}
      {showSearch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-black text-slate-900">
                  Get a US Phone Number
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Search and purchase from available Twilio numbers
                </p>
              </div>
              <button
                onClick={() => setShowSearch(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:bg-slate-200 flex items-center justify-center text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {/* Agent to assign on purchase */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  Assign to agent after purchase
                </label>
                <select
                  value={purchaseAgent}
                  onChange={(e) => setPurchaseAgent(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">No agent (assign later)</option>
                  {agents
                    .filter((a) => {
                      const agentHasNumber = numbers.some(
                        (n) => getAgentId(n) === a.id,
                      );
                      return !agentHasNumber;
                    })
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.direction})
                      </option>
                    ))}
                </select>
              </div>

              {/* Search filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Area Code (optional)
                  </label>
                  <input
                    value={areaCode}
                    onChange={(e) =>
                      setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    placeholder="e.g. 212"
                    maxLength={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Contains digits (optional)
                  </label>
                  <input
                    value={contains}
                    onChange={(e) =>
                      setContains(e.target.value.replace(/\D/g, "").slice(0, 7))
                    }
                    placeholder="e.g. 5555"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <button
                onClick={handleSearch}
                disabled={searching}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                {searching ? "Searching…" : "Search US Numbers"}
              </button>

              {/* Results */}
              {results.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {results.length} available numbers
                  </p>
                  {results.map((r) => (
                    <div
                      key={r.phoneNumber}
                      className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl px-4 py-3"
                    >
                      <div>
                        <p className="font-black text-slate-900 text-sm">
                          {r.phoneNumber}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {[r.locality, r.region].filter(Boolean).join(", ") ||
                            "US"}
                          {r.capabilities?.sms && " · SMS ✓"}
                        </p>
                      </div>
                      <button
                        onClick={() => void handlePurchase(r.phoneNumber)}
                        disabled={!!purchasing}
                        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all whitespace-nowrap"
                      >
                        {purchasing === r.phoneNumber
                          ? "Purchasing…"
                          : "Purchase"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneNumbers;
