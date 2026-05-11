import React, { useEffect, useMemo, useState } from "react";
import { AgentConfig, Organization } from "../types";
import {
  TwilioNumberRecord,
  AvailableTwilioNumber,
  voiceCallsApi,
} from "../services/voiceCallsApi";

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  GB: "🇬🇧",
};

type Tab = "numbers" | "search";
type Toast = { msg: string; ok: boolean } | null;

interface PhoneNumbersProps {
  org: Organization;
  onAgentUpdated: (updates: Partial<AgentConfig>) => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
    {children}
  </p>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all ${props.className ?? ""}`}
  />
);

const Select = (
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  },
) => (
  <select
    {...props}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all ${props.className ?? ""}`}
  >
    {props.children}
  </select>
);

const normalizeStatusText = (value?: string | null) => {
  const raw = String(value || "unknown").replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const readinessClass = (value?: string | null) => {
  const status = String(value || "").toLowerCase();
  if (
    ["ready", "active", "configured", "verified"].some((word) =>
      status.includes(word),
    )
  ) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (
    ["pending", "needs", "unknown", "not run"].some((word) =>
      status.includes(word),
    )
  ) {
    return "bg-amber-100 text-amber-700";
  }
  if (["failed", "error", "blocked"].some((word) => status.includes(word))) {
    return "bg-red-100 text-red-700";
  }
  return "bg-slate-100 text-slate-600";
};

const StatusPill = ({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${readinessClass(value)}`}
  >
    <span className="text-slate-500/70">{label}:</span>
    {normalizeStatusText(value)}
  </span>
);

const getAssignedAgent = (
  number: TwilioNumberRecord,
  agents: AgentConfig[] = [],
) => {
  const assignedId =
    number.assigned_voice_agent_id ||
    number.assignedVoiceAgentId ||
    number.voiceAgentId;
  if (assignedId) {
    const agent = agents.find((candidate) => candidate.id === assignedId);
    if (agent) return agent;
  }
  const phone = number.phone_number || number.phoneNumber;
  return agents.find((candidate) => candidate.twilioPhoneNumber === phone);
};

const agentLabel = (agent?: AgentConfig | null) => {
  if (!agent) return "Unassigned";
  return `${agent.name} (${agent.direction})`;
};

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({ org, onAgentUpdated }) => {
  const [tab, setTab] = useState<Tab>("numbers");
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [targetAgentId, setTargetAgentId] = useState(
    org.activeVoiceAgentId || org.agent?.id || "",
  );
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<
    AvailableTwilioNumber[]
  >([]);
  const [searchDone, setSearchDone] = useState(false);

  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const targetAgent =
    agents.find((agent) => agent.id === targetAgentId) || org.agent;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 4500);
  };

  const loadNumbers = async () => {
    setBusy("load");
    try {
      const normalized = await voiceCallsApi.phoneNumbers.getTwilioNumbers();
      setNumbers(normalized.numbers || []);
      setHasLoaded(true);
    } catch (error: any) {
      showToast(error?.message || "Could not load phone numbers.", false);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadNumbers();
  }, []);

  useEffect(() => {
    if (!targetAgentId && (org.activeVoiceAgentId || org.agent?.id)) {
      setTargetAgentId(org.activeVoiceAgentId || org.agent?.id || "");
    }
  }, [org.activeVoiceAgentId, org.agent?.id, targetAgentId]);

  const handleSearch = async () => {
    setBusy("search");
    setSearchDone(false);
    setAvailableNumbers([]);
    try {
      const result =
        await voiceCallsApi.phoneNumbers.searchAvailableTwilioNumbers({
          country: "US",
          areaCode: areaCode || undefined,
          contains: contains || undefined,
          limit: 20,
        });
      setAvailableNumbers(result.numbers || []);
      setSearchDone(true);
    } catch (error: any) {
      showToast(error?.message || "Number search failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handlePurchase = async (number: AvailableTwilioNumber) => {
    const phoneNumber = number.phoneNumber || number.phone_number;
    if (!phoneNumber) return;
    if (
      !window.confirm(
        `Purchase ${phoneNumber}? This may charge the connected Twilio account.`,
      )
    )
      return;
    setBusy(`purchase-${phoneNumber}`);
    try {
      const purchased = await voiceCallsApi.phoneNumbers.purchaseTwilioNumber({
        phoneNumber,
        voiceAgentId: targetAgentId || undefined,
        agentId: targetAgentId || undefined,
      });
      const purchasedNumber =
        purchased.number || purchased.phoneNumber || purchased;
      const numberId =
        purchasedNumber?.id ||
        purchasedNumber?.numberId ||
        purchasedNumber?.phone_number_id;
      if (targetAgentId && numberId) {
        await voiceCallsApi.phoneNumbers.assignTwilioNumberToAgent(numberId, {
          agentId: targetAgentId,
          voiceAgentId: targetAgentId,
        });
      }
      if (targetAgentId) {
        onAgentUpdated({ twilioPhoneNumber: phoneNumber });
      }
      showToast(
        `${phoneNumber} purchased${targetAgent ? ` for ${targetAgent.name}` : ""}.`,
      );
      await loadNumbers();
      setTab("numbers");
    } catch (error: any) {
      showToast(error?.message || "Purchase failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = async (
    number: TwilioNumberRecord,
    agentId = targetAgentId,
  ) => {
    const numberId = number.id || number.numberId;
    const phoneNumber = number.phone_number || number.phoneNumber;
    if (!numberId || !agentId) {
      showToast("Select an agent before assigning a number.", false);
      return;
    }
    setBusy(`assign-${numberId}`);
    try {
      await voiceCallsApi.phoneNumbers.assignTwilioNumberToAgent(numberId, {
        agentId,
        voiceAgentId: agentId,
      });
      const assignedAgent = agents.find((agent) => agent.id === agentId);
      if (assignedAgent) {
        onAgentUpdated({ twilioPhoneNumber: phoneNumber || "" });
      }
      showToast(
        `${phoneNumber || "Number"} assigned to ${assignedAgent?.name || "agent"}.`,
      );
      await loadNumbers();
    } catch (error: any) {
      showToast(error?.message || "Assign failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleRelease = async (number: TwilioNumberRecord) => {
    const numberId = number.id || number.numberId;
    const phoneNumber = number.phone_number || number.phoneNumber;
    if (!numberId) return;
    if (
      !window.confirm(
        `Remove ${phoneNumber || "this number"} from this workspace?`,
      )
    )
      return;
    setBusy(`delete-${numberId}`);
    try {
      await voiceCallsApi.phoneNumbers.deleteTwilioNumber(numberId);
      showToast(`${phoneNumber || "Number"} removed.`);
      await loadNumbers();
    } catch (error: any) {
      showToast(error?.message || "Remove failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const renderNumberCard = (number: TwilioNumberRecord) => {
    const phoneNumber =
      number.phone_number || number.phoneNumber || "Unknown number";
    const numberId = number.id || number.numberId || phoneNumber;
    const assigned = getAssignedAgent(number, agents);
    const capabilities = number.capabilities || {};
    const canVoice = capabilities.voice !== false;
    const canSms = capabilities.sms === true;
    return (
      <div
        key={numberId}
        className="rounded-3xl border border-slate-200 bg-white shadow-card p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">
                {FLAG_MAP[number.iso_country || number.isoCountry || "US"] ||
                  "🌍"}
              </span>
              <p className="text-lg font-black text-slate-900">{phoneNumber}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${canVoice ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            Voice {canVoice ? "ready" : "unavailable"}
          </span>
          {canSms && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700">
              SMS capable
            </span>
          )}
          <StatusPill
            label="Status"
            value={
              number.overall_status ||
              number.overallStatus ||
              number.configuration_status ||
              "ready"
            }
          />
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <Label>Assigned agent</Label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Select
              value={assigned?.id || ""}
              onChange={(event) =>
                void handleAssign(number, event.target.value)
              }
              disabled={!!busy}
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.direction})
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500 sm:w-52">
              {assigned
                ? `${assigned.name} can use this number for inbound and outbound voice.`
                : "Assign to any active agent."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void handleAssign(number)}
            disabled={!!busy || !targetAgentId}
            className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all"
          >
            {busy === `assign-${numberId}`
              ? "Assigning…"
              : `Assign to ${targetAgent?.name || "agent"}`}
          </button>
          <button
            onClick={() => void handleRelease(number)}
            disabled={!!busy}
            className="rounded-xl border border-red-200 text-red-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 disabled:opacity-50 transition-all"
          >
            {busy === `delete-${numberId}` ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    );
  };

  const numbersToShow = numbers;

  return (
    <div className="animate-fade-up space-y-6">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Phone Numbers</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Buy and assign Twilio numbers. Currently supporting US voice-capable
            numbers only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setTab("numbers")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${tab === "numbers" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Numbers
            </button>
            <button
              onClick={() => setTab("search")}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider ${tab === "search" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Buy US Number
            </button>
          </div>
          <button
            onClick={() => void loadNumbers()}
            disabled={busy === "load"}
            className="rounded-2xl bg-slate-900 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {busy === "load" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-center">
          <div>
            <p className="text-sm font-black text-slate-900">
              Phase 2 scope: phone numbers only
            </p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              A single number can support both inbound and outbound calls. A
              single active agent can also support both inbound and outbound
              behavior. This page only manages purchase, readiness display, and
              assignment.
            </p>
          </div>
          <div>
            <Label>Default assignment target</Label>
            <Select
              value={targetAgentId}
              onChange={(event) => setTargetAgentId(event.target.value)}
            >
              <option value="">Choose an agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agentLabel(agent)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {tab === "numbers" && (
        <div className="space-y-4">
          {busy === "load" && !hasLoaded ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading phone numbers…</p>
            </div>
          ) : numbersToShow.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-base font-black text-slate-900">
                No phone numbers found
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Buy a new US voice-capable number to get started.
              </p>
              <div className="flex justify-center gap-3 mt-5">
                <button
                  onClick={() => setTab("search")}
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600"
                >
                  Buy Number
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {numbersToShow.map(renderNumberCard)}
            </div>
          )}
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Search US voice-capable numbers
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Phase 2 intentionally restricts purchase search to US numbers
                  while readiness rules are validated.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                US only
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <Label>Country</Label>
                <Input value="United States (US)" disabled />
              </div>
              <div>
                <Label>Area code</Label>
                <Input
                  placeholder="e.g. 212"
                  value={areaCode}
                  onChange={(event) =>
                    setAreaCode(
                      event.target.value.replace(/\D/g, "").slice(0, 3),
                    )
                  }
                />
              </div>
              <div>
                <Label>Contains digits</Label>
                <Input
                  placeholder="e.g. 555"
                  value={contains}
                  onChange={(event) =>
                    setContains(
                      event.target.value.replace(/\D/g, "").slice(0, 7),
                    )
                  }
                />
              </div>
            </div>
            <button
              onClick={() => void handleSearch()}
              disabled={busy === "search"}
              className="rounded-2xl bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            >
              {busy === "search" ? "Searching…" : "Search Numbers"}
            </button>
          </div>

          {searchDone && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-slate-900">
                  {availableNumbers.length
                    ? `${availableNumbers.length} numbers available`
                    : "No numbers found"}
                </h3>
                <p className="text-xs text-slate-400">
                  Assigning to:{" "}
                  <strong>{targetAgent?.name || "Choose an agent"}</strong>
                </p>
              </div>
              {availableNumbers.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <div className="text-3xl mb-3">🔭</div>
                  <p className="text-sm font-bold text-slate-400">
                    No numbers found. Try another area code or clear the
                    filters.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableNumbers.map((number) => {
                    const phoneNumber =
                      number.phoneNumber || number.phone_number;
                    const capabilities = number.capabilities || {};
                    return (
                      <div
                        key={phoneNumber}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-amber-300 hover:bg-amber-50/20 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-base font-black text-slate-900">
                              {number.friendlyName || phoneNumber}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {phoneNumber}
                            </p>
                          </div>
                          <span className="text-lg">🇺🇸</span>
                        </div>
                        {(number.locality || number.region) && (
                          <p className="text-xs text-slate-500 mb-3">
                            {[number.locality, number.region]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        <div className="flex gap-1.5 mb-4">
                          {capabilities.voice !== false && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                              Voice
                            </span>
                          )}
                          {capabilities.sms && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                              SMS
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => void handlePurchase(number)}
                          disabled={!!busy || !targetAgentId}
                          className="w-full rounded-xl bg-slate-900 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all"
                        >
                          {busy === `purchase-${phoneNumber}`
                            ? "Purchasing…"
                            : "Purchase & Assign"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PhoneNumbers;
