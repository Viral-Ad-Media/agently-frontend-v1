import React, { useEffect, useMemo, useState } from "react";
import { AgentConfig, Organization } from "../types";
import { TwilioNumberRecord, voiceCallsApi } from "../services/voiceCallsApi";

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  GB: "🇬🇧",
};

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

const getNumberOrgId = (number: TwilioNumberRecord) =>
  number.organization_id || number.organizationId || number.orgId || "";

const getAssignedAgentId = (number: TwilioNumberRecord) =>
  number.assigned_voice_agent_id ||
  number.assignedVoiceAgentId ||
  number.voiceAgentId ||
  number.agentId ||
  number.assignedAgent?.id ||
  "";

const getAssignedAgent = (
  number: TwilioNumberRecord,
  agents: AgentConfig[] = [],
) => {
  const assignedId = getAssignedAgentId(number);
  if (assignedId) {
    const agent = agents.find((candidate) => candidate.id === assignedId);
    if (agent) return agent;
  }
  const phone = number.phone_number || number.phoneNumber;
  return agents.find((candidate) => candidate.twilioPhoneNumber === phone);
};

const isReadyValue = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .includes("ready");

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({ org, onAgentUpdated }) => {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [targetAgentId, setTargetAgentId] = useState(
    org.activeVoiceAgentId || org.agent?.id || "",
  );

  const organizationId = org.id;
  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const targetAgent =
    agents.find((agent) => agent.id === targetAgentId) || org.agent;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 4500);
  };

  const loadNumbers = async () => {
    if (!organizationId) {
      showToast(
        "Current organization could not be resolved. Please reload and sign in again.",
        false,
      );
      return;
    }
    setBusy("load");
    try {
      const result = await voiceCallsApi.phoneNumbers.getTwilioNumbers({
        organizationId,
      });
      const scopedNumbers = (result.numbers || []).filter((number) => {
        const numberOrgId = getNumberOrgId(number);
        return !numberOrgId || numberOrgId === organizationId;
      });
      setNumbers(scopedNumbers);
      setHasLoaded(true);
      if ((result.numbers || []).length !== scopedNumbers.length) {
        showToast(
          "Some numbers were hidden because they did not belong to this tenant.",
          false,
        );
      }
    } catch (error: any) {
      showToast(
        error?.message || "Could not load tenant phone numbers.",
        false,
      );
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (!targetAgentId && (org.activeVoiceAgentId || org.agent?.id)) {
      setTargetAgentId(org.activeVoiceAgentId || org.agent?.id || "");
    }
  }, [org.activeVoiceAgentId, org.agent?.id, targetAgentId]);

  const handleAssign = async (
    number: TwilioNumberRecord,
    agentId = targetAgentId,
  ) => {
    const numberId =
      number.id ||
      number.numberId ||
      number.phone_sid ||
      number.phoneSid ||
      number.sid;
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
        organizationId,
      });
      const assignedAgent = agents.find((agent) => agent.id === agentId);
      if (assignedAgent) {
        onAgentUpdated({
          twilioPhoneNumber: phoneNumber || "",
          twilioPhoneSid:
            number.phone_sid || number.phoneSid || number.sid || "",
        });
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

  const renderNumberCard = (number: TwilioNumberRecord) => {
    const phoneNumber =
      number.phone_number || number.phoneNumber || "Unknown number";
    const numberId =
      number.id ||
      number.numberId ||
      number.phone_sid ||
      number.phoneSid ||
      number.sid ||
      phoneNumber;
    const assigned = getAssignedAgent(number, agents);
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
    const readyForLeads = canVoice && isReadyValue(outbound);

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
            <p className="text-xs text-slate-400 font-mono">
              {number.phone_sid ||
                number.phoneSid ||
                number.sid ||
                number.id ||
                "No SID returned"}
            </p>
            <p className="text-[10px] text-slate-400 font-mono mt-1">
              Org: {getNumberOrgId(number) || organizationId}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
              {number.number_type ||
                number.numberType ||
                number.source ||
                "number"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${readyForLeads ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
            >
              {readyForLeads ? "Ready for calls" : "Needs readiness review"}
            </span>
          </div>
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
            <p className="text-xs text-slate-500 sm:w-56">
              {assigned
                ? `${assigned.name} can use this tenant number for inbound and outbound voice.`
                : "Assign this tenant number to any active agent."}
            </p>
          </div>
        </div>

        <button
          onClick={() => void handleAssign(number)}
          disabled={!!busy || !targetAgentId}
          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all"
        >
          {busy === `assign-${numberId}`
            ? "Assigning…"
            : `Assign to ${targetAgent?.name || "agent"}`}
        </button>
      </div>
    );
  };

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
            Showing only Twilio numbers owned by the current tenant
            organization.
          </p>
        </div>
        <button
          onClick={() => void loadNumbers()}
          disabled={busy === "load"}
          className="rounded-2xl bg-slate-900 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all"
        >
          {busy === "load" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-center">
          <div>
            <p className="text-sm font-black text-slate-900">
              Tenant-scoped phone numbers
            </p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              This page reads from{" "}
              <strong>twilio_phone_numbers.organization_id</strong> for the
              current tenant. It does not sync master-account numbers and it
              does not show numbers from other organizations.
            </p>
            <p className="text-[10px] font-mono text-slate-500 mt-2">
              Current organization: {organizationId}
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
                  {agent.name} ({agent.direction})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {busy === "load" && !hasLoaded ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Loading tenant phone numbers…
          </p>
        </div>
      ) : numbers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-16 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-black text-slate-900">
            No tenant phone numbers found
          </p>
          <p className="text-sm text-slate-500 mt-1">
            The backend returned no rows for this organization in
            twilio_phone_numbers.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {numbers.map(renderNumberCard)}
        </div>
      )}
    </div>
  );
};

export default PhoneNumbers;
