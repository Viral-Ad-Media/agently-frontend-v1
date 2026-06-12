import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  onAgentUpdated?: () => void;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
    {children}
  </p>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-400 ${props.className ?? ""}`}
  />
);

const Select = (
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  },
) => (
  <select
    {...props}
    className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-amber-400 ${props.className ?? ""}`}
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

const getOrgId = (number: TwilioNumberRecord) =>
  String(
    number.organization_id || number.organizationId || number.orgId || "",
  ).trim();

const getNumberId = (number: TwilioNumberRecord) =>
  String(
    number.id ||
      number.numberId ||
      number.phone_sid ||
      number.phoneSid ||
      number.sid ||
      "",
  ).trim();

const getPhoneNumber = (number: TwilioNumberRecord) =>
  String(number.phone_number || number.phoneNumber || "").trim();

const getAssignedAgentId = (number: TwilioNumberRecord) =>
  String(
    number.assigned_voice_agent_id ||
      number.assignedVoiceAgentId ||
      number.voiceAgentId ||
      number.agentId ||
      "",
  ).trim();

const getAssignedAgent = (
  number: TwilioNumberRecord,
  agents: AgentConfig[] = [],
) => {
  const assignedId = getAssignedAgentId(number);
  if (assignedId) {
    const agent = agents.find((candidate) => candidate.id === assignedId);
    if (agent) return agent;
  }
  const phone = getPhoneNumber(number);
  return agents.find((candidate) => candidate.twilioPhoneNumber === phone);
};

type AssignedNumberAgent = {
  id?: string;
  name?: string;
  direction?: string;
  assignmentId?: string;
  isDefaultForAgent?: boolean;
};

const getOutboundAssignedAgents = (
  number: TwilioNumberRecord,
  agents: AgentConfig[] = [],
): AssignedNumberAgent[] => {
  const raw =
    (number.outboundAssignedAgents as AssignedNumberAgent[] | undefined) ||
    (number.assignedAgents as AssignedNumberAgent[] | undefined) ||
    [];
  const byId = new Map<string, AssignedNumberAgent>();

  raw.forEach((agent) => {
    const id = String(agent?.id || "").trim();
    if (!id) return;
    const full = agents.find((candidate) => candidate.id === id);
    byId.set(id, {
      ...agent,
      name: agent.name || full?.name || "Unnamed agent",
      direction: agent.direction || full?.direction || "outbound",
    });
  });

  const legacy = getAssignedAgent(number, agents);
  if (legacy?.id && !byId.has(legacy.id)) {
    byId.set(legacy.id, {
      id: legacy.id,
      name: legacy.name,
      direction: legacy.direction,
      isDefaultForAgent: true,
    });
  }

  return [...byId.values()];
};

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({ org, onAgentUpdated }) => {
  const orgId = org.id;
  const [tab, setTab] = useState<Tab>("numbers");
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<string, string>
  >({});
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<
    AvailableTwilioNumber[]
  >([]);
  const [searchDone, setSearchDone] = useState(false);

  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadNumbers = useCallback(async () => {
    if (!orgId) return;
    setBusy("load");
    try {
      const response = await voiceCallsApi.phoneNumbers.getTwilioNumbers({
        organizationId: orgId,
      });
      const tenantNumbers = (response.numbers || []).filter((number) => {
        const row = number as any;
        return (
          getOrgId(number) === orgId &&
          row.is_platform_test_number !== true &&
          row.isPlatformTestNumber !== true &&
          row.source !== "platform_test" &&
          row.number_type !== "platform_test" &&
          row.numberType !== "platform_test" &&
          row.purchase_origin !== "platform_beta_test_pool"
        );
      });
      setNumbers(tenantNumbers);
      setHasLoaded(true);
    } catch (error: any) {
      showToast(
        error?.message || "Could not load phone numbers for this organization.",
        false,
      );
    } finally {
      setBusy(null);
    }
  }, [orgId, showToast]);

  useEffect(() => {
    void loadNumbers();
  }, [loadNumbers]);

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
        organizationId: orgId,
      });
      showToast(
        `${phoneNumber} purchased. Assign it to an agent from the Numbers tab.`,
      );
      await loadNumbers();
      setTab("numbers");
      window.setTimeout(() => onAgentUpdated?.(), 0);
    } catch (error: any) {
      showToast(error?.message || "Purchase failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = async (number: TwilioNumberRecord, agentId: string) => {
    const numberId = getNumberId(number);
    const phoneNumber = getPhoneNumber(number);
    if (!numberId || !agentId) {
      showToast("Select an agent before assigning a number.", false);
      return;
    }
    setBusy(`assign-${numberId}`);
    try {
      await voiceCallsApi.phoneNumbers.assignTwilioNumberToAgent(numberId, {
        agentId,
        voiceAgentId: agentId,
        direction: "outbound",
        isDefaultForAgent: true,
      });
      const assignedAgent = agents.find((agent) => agent.id === agentId);
      showToast(
        `${phoneNumber || "Number"} can now be used by ${assignedAgent?.name || "agent"}.`,
      );
      setAssignmentDrafts((current) => ({ ...current, [numberId]: "" }));
      setNumbers((current) =>
        current.map((item) => {
          if (getNumberId(item) !== numberId) return item;
          const existingAgents = getOutboundAssignedAgents(item, agents);
          const nextAgents = existingAgents.some(
            (agent) => agent.id === agentId,
          )
            ? existingAgents
            : [
                ...existingAgents,
                {
                  id: agentId,
                  name: assignedAgent?.name || "Agent",
                  direction: assignedAgent?.direction || "outbound",
                  isDefaultForAgent: existingAgents.length === 0,
                },
              ];
          return {
            ...item,
            outboundAssignedAgents: nextAgents,
            assignedAgents: nextAgents,
            assignmentCount: nextAgents.length,
            assigned_voice_agent_id: item.assigned_voice_agent_id || agentId,
            assignedVoiceAgentId: item.assignedVoiceAgentId || agentId,
            voiceAgentId: item.voiceAgentId || agentId,
            agentId: item.agentId || agentId,
            assigned_agent_status: "ready",
            assignedAgentStatus: "ready",
            overall_status: "ready",
            overallStatus: "ready",
            inbound_voice_status: "ready",
            inboundVoiceStatus: "ready",
            outbound_voice_status: "ready",
            outboundVoiceStatus: "ready",
          };
        }),
      );
      void loadNumbers();
      window.setTimeout(() => onAgentUpdated?.(), 0);
    } catch (error: any) {
      showToast(error?.message || "Assign failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveAgentAssignment = async (
    number: TwilioNumberRecord,
    agent: AssignedNumberAgent,
  ) => {
    const numberId = getNumberId(number);
    const phoneNumber = getPhoneNumber(number);
    const agentId = String(agent?.id || "").trim();
    if (!numberId || !agentId) return;
    setBusy(`unassign-${numberId}-${agentId}`);
    try {
      await voiceCallsApi.phoneNumbers.removeTwilioNumberAgentAssignment(
        numberId,
        agentId,
      );
      showToast(
        `${agent.name || "Agent"} can no longer use ${phoneNumber || "this number"} for outbound calls.`,
      );
      setNumbers((current) =>
        current.map((item) => {
          if (getNumberId(item) !== numberId) return item;
          const remaining = getOutboundAssignedAgents(item, agents).filter(
            (assigned) => assigned.id !== agentId,
          );
          return {
            ...item,
            outboundAssignedAgents: remaining,
            assignedAgents: remaining,
            assignmentCount: remaining.length,
          };
        }),
      );
      void loadNumbers();
      window.setTimeout(() => onAgentUpdated?.(), 0);
    } catch (error: any) {
      showToast(
        error?.message || "Could not remove this agent from the number.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  const handleUnassignAll = async (number: TwilioNumberRecord) => {
    const numberId = getNumberId(number);
    const phoneNumber = getPhoneNumber(number);
    if (!numberId) return;
    setBusy(`unassign-${numberId}`);
    try {
      await voiceCallsApi.phoneNumbers.updateTwilioNumber(numberId, {
        assigned_voice_agent_id: null,
        agentId: null,
        voiceAgentId: null,
        unassign: true,
      });
      showToast(`${phoneNumber || "Number"} removed from all outbound agents.`);
      setAssignmentDrafts((current) => ({ ...current, [numberId]: "" }));
      setNumbers((current) =>
        current.map((item) =>
          getNumberId(item) === numberId
            ? {
                ...item,
                assigned_voice_agent_id: null,
                assignedVoiceAgentId: null,
                voiceAgentId: null,
                agentId: null,
                outboundAssignedAgents: [],
                assignedAgents: [],
                assignmentCount: 0,
                assigned_agent_status: "needs_assignment",
                assignedAgentStatus: "needs_assignment",
              }
            : item,
        ),
      );
      void loadNumbers();
      window.setTimeout(() => onAgentUpdated?.(), 0);
    } catch (error: any) {
      showToast(error?.message || "Unassign failed.", false);
    } finally {
      setBusy(null);
    }
  };

  const renderNumberCard = (number: TwilioNumberRecord) => {
    const phoneNumber = getPhoneNumber(number) || "Unknown number";
    const numberId = getNumberId(number) || phoneNumber;
    const outboundAgents = getOutboundAssignedAgents(number, agents);
    const assignedAgentIds = new Set(
      outboundAgents.map((agent) => agent.id).filter(Boolean),
    );
    const capabilities = number.capabilities || {};
    const canVoice = capabilities.voice !== false;
    const canSms = capabilities.sms === true;
    const inbound =
      number.inbound_voice_status ||
      number.inboundVoiceStatus ||
      number.overall_status ||
      number.overallStatus ||
      number.configuration_status;
    const outbound =
      number.outbound_voice_status ||
      number.outboundVoiceStatus ||
      number.overall_status ||
      number.overallStatus ||
      number.configuration_status;

    return (
      <div
        key={numberId}
        className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-card"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xl">
                {FLAG_MAP[number.iso_country || number.isoCountry || "US"] ||
                  "🌍"}
              </span>
              <p className="text-lg font-black text-slate-900">{phoneNumber}</p>
            </div>
            <p className="font-mono text-xs text-slate-400">
              {number.phone_sid ||
                number.phoneSid ||
                number.sid ||
                number.id ||
                "No SID returned"}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
            {number.number_type ||
              number.numberType ||
              number.source ||
              "number"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${canVoice ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            Voice {canVoice ? "capable" : "unavailable"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${canSms ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
          >
            SMS {canSms ? "capable" : "not supported"}
          </span>
          <StatusPill label="Inbound" value={inbound} />
          <StatusPill label="Outbound" value={outbound} />
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Outbound agents using this number</Label>
              <p className="text-xs text-slate-500">
                One number can support multiple outbound agents. Choose which
                agent should be allowed to call from this number.
              </p>
            </div>
            <span className="w-fit rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 shadow-sm">
              {outboundAgents.length} assigned
            </span>
          </div>

          {outboundAgents.length > 0 && (
            <div className="mb-4 space-y-2">
              {outboundAgents.map((agent) => (
                <div
                  key={agent.id || agent.name}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {agent.name || "Unnamed agent"}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      {agent.isDefaultForAgent
                        ? "Default outbound number"
                        : "Outbound access"}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      void handleRemoveAgentAssignment(number, agent)
                    }
                    disabled={!!busy}
                    className="rounded-xl border border-amber-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 transition-all hover:bg-amber-50 disabled:opacity-50"
                  >
                    {busy === `unassign-${numberId}-${agent.id}`
                      ? "Removing…"
                      : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={assignmentDrafts[numberId] || ""}
              onChange={(event) =>
                setAssignmentDrafts((current) => ({
                  ...current,
                  [numberId]: event.target.value,
                }))
              }
              disabled={!!busy}
            >
              <option value="">Add another outbound agent</option>
              {agents
                .filter((agent) => !assignedAgentIds.has(agent.id))
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.direction})
                  </option>
                ))}
            </Select>
            <button
              onClick={() =>
                void handleAssign(number, assignmentDrafts[numberId] || "")
              }
              disabled={!!busy || !assignmentDrafts[numberId]}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {busy === `assign-${numberId}` ? "Adding…" : "Add agent"}
            </button>
          </div>

          {outboundAgents.length > 1 && (
            <button
              onClick={() => void handleUnassignAll(number)}
              disabled={!!busy}
              className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:text-red-600 disabled:opacity-50"
            >
              {busy === `unassign-${numberId}`
                ? "Removing all…"
                : "Remove all outbound agents"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-up space-y-6">
      {toast && (
        <div
          className={`fixed right-5 top-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900">Phone Numbers</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Search, reserve, and share business numbers across outbound agents
            in this organization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setTab("numbers")}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider ${tab === "numbers" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Numbers
            </button>
            <button
              onClick={() => setTab("search")}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider ${tab === "search" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Buy US Number
            </button>
          </div>
          <button
            onClick={() => void loadNumbers()}
            disabled={busy === "load"}
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "load" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-900">
              Manage calling numbers
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Assign one business number to multiple outbound agents. Inbound
              routing stays controlled separately, while outbound campaigns can
              share the same number.
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
            Multi-agent outbound
          </span>
        </div>
      </div>

      {tab === "numbers" && (
        <div className="space-y-4">
          {busy === "load" && !hasLoaded ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-card">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="text-sm text-slate-400">Loading phone numbers…</p>
            </div>
          ) : numbers.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-card">
              <div className="mb-3 text-4xl">📭</div>
              <p className="text-base font-black text-slate-900">
                No phone numbers found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                No rows were returned for this organization from
                twilio_phone_numbers.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={() => setTab("search")}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
                >
                  Buy Number
                </button>
                <button
                  onClick={() => void loadNumbers()}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-300"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {numbers.map(renderNumberCard)}
            </div>
          )}
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Search US voice-capable numbers
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Search is restricted to US numbers while readiness rules are
                  validated.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                US only
              </span>
            </div>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "search" ? "Searching…" : "Search Numbers"}
            </button>
          </div>

          {searchDone && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900">
                  {availableNumbers.length
                    ? `${availableNumbers.length} numbers available`
                    : "No numbers found"}
                </h3>
                <p className="text-xs text-slate-400">
                  Purchased numbers can be assigned from the Numbers tab.
                </p>
              </div>
              {availableNumbers.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <div className="mb-3 text-3xl">🔭</div>
                  <p className="text-sm font-bold text-slate-400">
                    No numbers found. Try another area code or clear the
                    filters.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availableNumbers.map((number) => {
                    const phoneNumber =
                      number.phoneNumber || number.phone_number;
                    const capabilities = number.capabilities || {};
                    return (
                      <div
                        key={phoneNumber}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-amber-300 hover:bg-amber-50/20"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div>
                            <p className="text-base font-black text-slate-900">
                              {number.friendlyName || phoneNumber}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {phoneNumber}
                            </p>
                          </div>
                          <span className="text-lg">🇺🇸</span>
                        </div>
                        {(number.locality || number.region) && (
                          <p className="mb-3 text-xs text-slate-500">
                            {[number.locality, number.region]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        <div className="mb-4 flex gap-1.5">
                          {capabilities.voice !== false && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Voice
                            </span>
                          )}
                          {capabilities.sms && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              SMS
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => void handlePurchase(number)}
                          disabled={!!busy}
                          className="w-full rounded-xl bg-slate-900 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600 disabled:opacity-50"
                        >
                          {busy === `purchase-${phoneNumber}`
                            ? "Purchasing…"
                            : "Purchase"}
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
