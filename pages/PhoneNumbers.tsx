import React, {
  useCallback,
  useEffect,
  lazy,
  Suspense,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useSearchParams } from "react-router-dom";
import { AgentConfig, CallRecord, Organization } from "../types";
import {
  TwilioNumberRecord,
  AvailableTwilioNumber,
  voiceCallsApi,
} from "../services/voiceCallsApi";
import AppModal from "../components/AppModal";
const CallLogs = lazy(() => import("./CallLogs"));

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  GB: "🇬🇧",
};

type Tab = "numbers" | "search" | "calls";
type Toast = { msg: string; ok: boolean } | null;

const parseTabParam = (value: string | null): Tab | null => {
  return value === "numbers" || value === "search" || value === "calls"
    ? value
    : null;
};

const parsePhoneTabParam = (
  value: string | null,
): Exclude<Tab, "calls"> | null => {
  return value === "numbers" || value === "search" ? value : null;
};

interface PhoneNumbersProps {
  org: Organization;
  calls?: CallRecord[];
  onDownloadReport?: (callId: string) => Promise<void>;
  onAgentUpdated?: () => void;
  initialTab?: Tab;
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

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  IE: "Ireland",
  NZ: "New Zealand",
};

const COUNTRY_FLAGS: Record<string, string> = {
  US: "\u{1F1FA}\u{1F1F8}",
  CA: "\u{1F1E8}\u{1F1E6}",
  GB: "\u{1F1EC}\u{1F1E7}",
  AU: "\u{1F1E6}\u{1F1FA}",
  IE: "\u{1F1EE}\u{1F1EA}",
  NZ: "\u{1F1F3}\u{1F1FF}",
};

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

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({
  org,
  calls = [],
  onDownloadReport = async () => undefined,
  onAgentUpdated,
  initialTab = "numbers",
}) => {
  const orgId = org.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isTabPending, startTabTransition] = useTransition();
  const [tab, setTab] = useState<Tab>(() => {
    if (initialTab === "calls")
      return parseTabParam(searchParams.get("tab")) || "calls";
    return parsePhoneTabParam(searchParams.get("tab")) || initialTab;
  });
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<TwilioNumberRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<string, string>
  >({});
  const [areaCode, setAreaCode] = useState("");
  // FIX: country was hardcoded to "US" and the input was disabled, so
  // GB/AU/IE/NZ inventory could never be reached even once the backend filter
  // was corrected. The list now comes from the server.
  const [country, setCountry] = useState("US");
  const [countryOptions, setCountryOptions] = useState<string[]>(["US"]);
  // FIX: purchase used window.confirm(), which is a browser dialog that named
  // our carrier. Low-credit used a top-anchored toast that is easy to miss on
  // mobile. Both are now in-app modals.
  const [purchaseTarget, setPurchaseTarget] =
    useState<AvailableTwilioNumber | null>(null);
  const [creditBlock, setCreditBlock] = useState<{
    title: string;
    message: string;
    ctaLabel: string;
    topUpPath: string;
  } | null>(null);
  const [contains, setContains] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<
    AvailableTwilioNumber[]
  >([]);
  const [searchDone, setSearchDone] = useState(false);
  const [openAgentMenu, setOpenAgentMenu] = useState<{
    numberId: string;
    agentId: string;
  } | null>(null);

  const agents = useMemo(() => org.voiceAgents || [], [org.voiceAgents]);
  const isCallsMode = initialTab === "calls";

  useEffect(() => {
    const requestedTab = isCallsMode
      ? parseTabParam(searchParams.get("tab")) || "calls"
      : parsePhoneTabParam(searchParams.get("tab")) || "numbers";
    setTab((current) => (current === requestedTab ? current : requestedTab));
  }, [searchParams, initialTab, isCallsMode]);

  const updateTab = useCallback(
    (nextTab: Tab) => {
      if (!isCallsMode && nextTab === "calls") return;
      startTabTransition(() => {
        setTab(nextTab);
        const nextParams = new URLSearchParams(searchParams);
        if (nextTab === "numbers") {
          nextParams.delete("tab");
        } else {
          nextParams.set("tab", nextTab);
        }
        setSearchParams(nextParams, { replace: true });
      });
    },
    [isCallsMode, searchParams, setSearchParams],
  );

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
    if (!isCallsMode) void loadNumbers();
  }, [isCallsMode, loadNumbers]);

  const handleSearch = async () => {
    setBusy("search");
    setSearchDone(false);
    setAvailableNumbers([]);
    try {
      const result =
        await voiceCallsApi.phoneNumbers.searchAvailableTwilioNumbers({
          country,
          type: "Local",
          areaCode: areaCode || undefined,
          contains: contains || undefined,
          requiresVoice: true,
          requiresSms: false,
          showAdvancedRestrictedNumbers: false,
          limit: 20,
        });
      setAvailableNumbers(result.numbers || []);
      const sellable =
        (result as any).sellableCountries ||
        (result as any).supportedCountries ||
        [];
      if (Array.isArray(sellable) && sellable.length)
        setCountryOptions(sellable);
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
    setBusy(`purchase-${phoneNumber}`);
    try {
      const defaultAgent =
        agents.find(
          (agent: any) =>
            String(agent?.is_active ?? agent?.isActive ?? true) !== "false",
        ) || agents[0];
      const purchased = await voiceCallsApi.phoneNumbers.purchaseTwilioNumber({
        phoneNumber,
        organizationId: orgId,
        country: number.isoCountry || number.iso_country || "US",
        type: (number as any).numberType || (number as any).type || "Local",
        agentId:
          (defaultAgent as any)?.id ||
          (defaultAgent as any)?.agentId ||
          undefined,
      });
      const assignedName =
        purchased?.autoAssignedAgent?.name || (defaultAgent as any)?.name;
      showToast(
        assignedName
          ? `${phoneNumber} purchased and connected to ${assignedName}. It is ready for inbound and outbound calls.`
          : `${phoneNumber} purchased. Add or assign a voice agent before calls can use it.`,
      );
      await loadNumbers();
      updateTab("numbers");
      window.setTimeout(() => onAgentUpdated?.(), 0);
    } catch (error: any) {
      // The 402 payload already carries title/ctaLabel/topUpPath. It was being
      // thrown into a toast at the top of the page, which is exactly why a
      // failing purchase looked like nothing happened on mobile.
      const details = error?.details as any;
      if (error?.status === 402 || error?.code === "INSUFFICIENT_CREDIT") {
        setCreditBlock({
          title: details?.title || "Usage credit required",
          message:
            error?.message ||
            "Add credit to your balance before buying a number.",
          ctaLabel: details?.ctaLabel || "Go to billing",
          topUpPath: details?.topUpPath || "#/billing",
        });
      } else {
        showToast(
          error?.message ||
            "We couldn't complete that purchase. Your balance was not charged.",
          false,
        );
      }
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
      setOpenAgentMenu(null);
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

  const confirmPurchase = async () => {
    const target = purchaseTarget;
    setPurchaseTarget(null);
    if (target) await handlePurchase(target);
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
    const typeLabel = String(
      number.number_type || number.numberType || number.source || "",
    ).trim();
    const shouldShowTypeLabel =
      !!typeLabel && !["unknown", "number"].includes(typeLabel.toLowerCase());

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
          {shouldShowTypeLabel && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
              {typeLabel}
            </span>
          )}
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
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="max-h-28 overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {outboundAgents.map((agent) => {
                    const agentId = String(agent.id || agent.name || "");
                    const selected =
                      openAgentMenu?.numberId === numberId &&
                      openAgentMenu?.agentId === agentId;
                    return (
                      <button
                        key={agentId}
                        type="button"
                        onClick={() =>
                          setOpenAgentMenu((current) =>
                            current?.numberId === numberId &&
                            current?.agentId === agentId
                              ? null
                              : { numberId, agentId },
                          )
                        }
                        className={`inline-flex max-w-[220px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black transition-all ${selected ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-200 hover:bg-amber-50"}`}
                        title={agent.name || "Unnamed agent"}
                      >
                        <span className="truncate">
                          {agent.name || "Unnamed agent"}
                        </span>
                        {agent.isDefaultForAgent && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                            title="Default outbound number"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(() => {
                const selectedAgent = outboundAgents.find(
                  (agent) =>
                    String(agent.id || agent.name || "") ===
                      openAgentMenu?.agentId &&
                    openAgentMenu?.numberId === numberId,
                );
                if (!selectedAgent) return null;
                return (
                  <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {selectedAgent.name || "Unnamed agent"}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        This agent can place outbound calls from this number.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleRemoveAgentAssignment(number, selectedAgent)
                      }
                      disabled={!!busy}
                      className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 shadow-sm transition-all hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy === `unassign-${numberId}-${selectedAgent.id}`
                        ? "Removing…"
                        : "Remove this agent"}
                    </button>
                  </div>
                );
              })()}
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

  if (isCallsMode) {
    return (
      <div className="animate-fade-up space-y-6">
        {toast && (
          <div
            className={`fixed right-5 top-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
          >
            {toast.msg}
          </div>
        )}
        <Suspense
          fallback={
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-card">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="text-sm font-bold text-slate-500">
                Loading call logs…
              </p>
            </div>
          }
        >
          <CallLogs
            calls={calls}
            org={org}
            onDownloadReport={onDownloadReport}
            embedded
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="ag-phone-numbers-page animate-fade-up space-y-5">
      {toast && (
        <div
          className={`fixed right-5 top-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-base font-medium text-slate-900 sm:text-lg">
          Manage calling numbers
        </h2>
        <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
          Assign one business number to multiple outbound agents. Inbound
          routing stays controlled separately, while outbound campaigns can
          share the same number.
        </p>
      </div>

      <div className="ag-page-inline-actions ag-phone-toolbar">
        <div
          className="ag-agent-tabs ag-agent-tabs-flat ag-phone-tabs"
          role="tablist"
          aria-label="Phone number sections"
        >
          <button
            type="button"
            onClick={() => updateTab("numbers")}
            className={`ag-phone-tab text-[13px] font-medium transition-all ${tab === "numbers" ? "ag-phone-tab-active" : ""}`}
          >
            Numbers
          </button>
          <button
            type="button"
            onClick={() => updateTab("search")}
            className={`ag-phone-tab text-[13px] font-medium transition-all ${tab === "search" ? "ag-phone-tab-active" : ""}`}
          >
            Buy Number
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isTabPending && (
            <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-amber-700">
              Loading view…
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadNumbers()}
            disabled={busy === "load"}
            className="ag-button-soft shrink-0"
          >
            {busy === "load" ? "Refreshing…" : "Refresh"}
          </button>
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
                You haven't added a phone number yet. Buy one to let your agent
                take and make calls.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={() => updateTab("search")}
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
                  Find a number for your business
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Every number shown is ready for calls and texts the moment you
                  buy it.
                </p>
              </div>
            </div>
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Country</Label>
                <select
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value);
                    setSearchDone(false);
                    setAvailableNumbers([]);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-amber-300"
                >
                  {countryOptions.map((iso) => (
                    <option key={iso} value={iso}>
                      {COUNTRY_LABELS[iso] || iso}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>
                  {["US", "CA"].includes(country) ? "Area code" : "Starts with"}
                </Label>
                <Input
                  placeholder={
                    ["US", "CA"].includes(country) ? "e.g. 212" : "e.g. 20"
                  }
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
                          <span className="text-lg">
                            {COUNTRY_FLAGS[
                              number.isoCountry || number.iso_country || country
                            ] || "🌐"}
                          </span>
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
                          onClick={() => setPurchaseTarget(number)}
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
      <AppModal
        open={!!purchaseTarget}
        onClose={() => setPurchaseTarget(null)}
        title="Confirm your new number"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPurchaseTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmPurchase()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
            >
              Buy this number
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          You're about to add{" "}
          <span className="font-black text-slate-900">
            {purchaseTarget?.phoneNumber || purchaseTarget?.phone_number}
          </span>{" "}
          to your workspace. The cost is taken from your usage balance, and the
          number is set up for calls and texts automatically.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          If anything goes wrong during setup, the number is returned and you
          are not charged.
        </p>
      </AppModal>

      <AppModal
        open={!!creditBlock}
        onClose={() => setCreditBlock(null)}
        title={creditBlock?.title || "Usage credit required"}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreditBlock(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest"
            >
              Not now
            </button>
            <a
              href={creditBlock?.topUpPath || "#/billing"}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
            >
              {creditBlock?.ctaLabel || "Go to billing"}
            </a>
          </div>
        }
      >
        <p className="text-sm text-slate-600">{creditBlock?.message}</p>
      </AppModal>
    </div>
  );
};

export default PhoneNumbers;
