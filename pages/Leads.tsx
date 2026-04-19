import React, { useEffect, useMemo, useRef, useState } from "react";
import AppModal from "../components/AppModal";
import { api } from "../services/api";
import { AgentConfig, Lead, LeadOutreachSchedule, LeadOutreachWindow, Organization } from "../types";

interface LeadsProps {
  leads: Lead[];
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => Promise<void>;
  onCreateLead: (
    payload: Pick<Lead, "name" | "email" | "phone" | "reason"> & {
      status?: Lead["status"];
      tags?: string[];
      voiceAgentId?: string;
      assignmentContext?: string;
    },
  ) => Promise<void>;
  onExport: () => Promise<void>;
  org?: Organization;
  onRefresh?: () => Promise<void>;
}

type TagAction = "add" | "remove" | "set";
type ScheduleTarget =
  | { type: "lead"; leadIds: string[]; label: string }
  | { type: "tag"; tag: string; label: string };

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-600 border-blue-100",
  contacted: "bg-amber-50 text-amber-700 border-amber-100",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

const STATUS_CYCLE: Record<Lead["status"], Lead["status"]> = {
  new: "contacted",
  contacted: "closed",
  closed: "new",
};

const WEEKDAYS = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];

const emptyWindow = (): LeadOutreachWindow => ({
  weekdays: ["mon", "tue", "wed", "thu", "fri"],
  time: "10:00",
});

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40";

const normalizeTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const Leads: React.FC<LeadsProps> = ({
  leads,
  onUpdateLead,
  onCreateLead,
  onExport,
  org,
  onRefresh,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [schedules, setSchedules] = useState<LeadOutreachSchedule[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [leadForm, setLeadForm] = useState({
    name: "",
    email: "",
    phone: "",
    reason: "",
    tags: "",
    voiceAgentId: org?.activeVoiceAgentId || "",
    assignmentContext: "",
  });

  const [tagForm, setTagForm] = useState({
    tags: "",
    action: "add" as TagAction,
  });

  const [assignForm, setAssignForm] = useState({
    voiceAgentId: org?.activeVoiceAgentId || "",
    tag: "",
    assignmentContext: "",
  });

  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    voiceAgentId: org?.activeVoiceAgentId || "",
    timezone: org?.profile.timezone || "America/New_York",
    extraContext: "",
    syncExistingLeads: true,
    windows: [emptyWindow()],
  });

  useEffect(() => {
    setLeadForm((current) => ({
      ...current,
      voiceAgentId: current.voiceAgentId || org?.activeVoiceAgentId || "",
    }));
    setAssignForm((current) => ({
      ...current,
      voiceAgentId: current.voiceAgentId || org?.activeVoiceAgentId || "",
    }));
    setScheduleForm((current) => ({
      ...current,
      voiceAgentId: current.voiceAgentId || org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || current.timezone || "America/New_York",
    }));
  }, [org?.activeVoiceAgentId, org?.profile.timezone]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const voiceAgents = org?.voiceAgents || [];
  const agentById = useMemo(
    () => new Map(voiceAgents.map((agent) => [agent.id, agent])),
    [voiceAgents],
  );

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      for (const tag of lead.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        !query ||
        lead.name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        lead.email.toLowerCase().includes(query) ||
        (lead.tags || []).some((tag) => tag.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const selectedLeadIds = useMemo(() => [...selectedIds], [selectedIds]);
  const selectedLeads = useMemo(
    () => filteredLeads.filter((lead) => selectedIds.has(lead.id)),
    [filteredLeads, selectedIds],
  );

  const showMessage = (message: string, ok = true) => setToast({ message, ok });

  const refreshAll = async () => {
    if (onRefresh) await onRefresh();
    try {
      const response = await api.listLeadSchedules();
      setSchedules(response.schedules || []);
    } catch (error) {
      console.error("Failed to refresh schedules", error);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Something went wrong.", false);
    } finally {
      setBusy(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredLeads.map((lead) => lead.id)));
  };

  const handleCreateLead = async (event: React.FormEvent) => {
    event.preventDefault();
    await withBusy("create-lead", async () => {
      await onCreateLead({
        name: leadForm.name,
        phone: leadForm.phone,
        email: leadForm.email,
        reason: leadForm.reason,
        tags: normalizeTags(leadForm.tags),
        voiceAgentId: leadForm.voiceAgentId || undefined,
        assignmentContext: leadForm.assignmentContext || undefined,
      });
      setLeadForm({
        name: "",
        email: "",
        phone: "",
        reason: "",
        tags: "",
        voiceAgentId: org?.activeVoiceAgentId || "",
        assignmentContext: "",
      });
      setShowAddModal(false);
      await refreshAll();
      showMessage("Lead created successfully.");
    });
  };

  const handleBulkStatus = async (status: Lead["status"]) => {
    if (selectedLeadIds.length === 0) return;
    await withBusy(`status-${status}`, async () => {
      await Promise.all(selectedLeadIds.map((leadId) => onUpdateLead(leadId, { status })));
      setSelectedIds(new Set());
      await refreshAll();
      showMessage(`Updated ${selectedLeadIds.length} leads.`);
    });
  };

  const handleToggleStatus = async (lead: Lead) => {
    await withBusy(`lead-${lead.id}`, async () => {
      await onUpdateLead(lead.id, { status: STATUS_CYCLE[lead.status] });
      await refreshAll();
      showMessage(`Updated ${lead.name}.`);
    });
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      showMessage("Paste CSV data or upload a CSV file first.", false);
      return;
    }
    await withBusy("import-csv", async () => {
      const result = await api.importLeadsCsv(csvText);
      setShowImportModal(false);
      setCsvText("");
      await refreshAll();
      showMessage(`Imported ${result.imported} leads.`);
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const handleBulkTags = async () => {
    if (selectedLeadIds.length === 0) {
      showMessage("Select at least one lead first.", false);
      return;
    }
    const tags = normalizeTags(tagForm.tags);
    if (tags.length === 0) {
      showMessage("Enter one or more tags.", false);
      return;
    }
    await withBusy("bulk-tags", async () => {
      await api.bulkTagLeads(selectedLeadIds, tags, tagForm.action);
      setShowTagModal(false);
      setTagForm({ tags: "", action: "add" });
      setSelectedIds(new Set());
      await refreshAll();
      showMessage(`Updated tags for ${selectedLeadIds.length} leads.`);
    });
  };

  const handleAssignAgent = async () => {
    if (!assignForm.voiceAgentId) {
      showMessage("Select a voice agent first.", false);
      return;
    }

    await withBusy("assign-agent", async () => {
      if (selectedLeadIds.length > 0) {
        await api.bulkAssignLeadAgent(selectedLeadIds, assignForm.voiceAgentId);
        if (assignForm.assignmentContext.trim()) {
          await Promise.all(
            selectedLeadIds.map((leadId) =>
              onUpdateLead(leadId, { assignmentContext: assignForm.assignmentContext.trim(), voiceAgentId: assignForm.voiceAgentId }),
            ),
          );
        }
      } else if (assignForm.tag.trim()) {
        await api.assignLeadAgentByTag(assignForm.tag.trim(), assignForm.voiceAgentId);
      } else {
        showMessage("Select leads or choose a tag collection.", false);
        return;
      }

      setShowAssignModal(false);
      setAssignForm({
        voiceAgentId: org?.activeVoiceAgentId || "",
        tag: "",
        assignmentContext: "",
      });
      setSelectedIds(new Set());
      await refreshAll();
      showMessage("Voice agent assignment saved.");
    });
  };

  const openSingleLeadAssignment = (lead: Lead) => {
    setSelectedIds(new Set([lead.id]));
    setAssignForm({
      voiceAgentId: lead.voiceAgentId || org?.activeVoiceAgentId || "",
      tag: "",
      assignmentContext: lead.assignmentContext || "",
    });
    setShowAssignModal(true);
  };

  const openSingleLeadSchedule = (lead: Lead) => {
    setScheduleTarget({ type: "lead", leadIds: [lead.id], label: lead.name });
    setScheduleForm({
      name: `${lead.name} outreach`,
      voiceAgentId: lead.voiceAgentId || org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: lead.assignmentContext || lead.reason || "",
      syncExistingLeads: true,
      windows: [emptyWindow()],
    });
  };

  const openTagSchedule = (tag: string) => {
    setScheduleTarget({ type: "tag", tag, label: `Tag · ${tag}` });
    setScheduleForm({
      name: `${tag} campaign`,
      voiceAgentId: org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: "",
      syncExistingLeads: true,
      windows: [emptyWindow()],
    });
  };

  const openSelectedSchedule = () => {
    if (selectedLeadIds.length === 0) {
      showMessage("Select at least one lead first.", false);
      return;
    }
    setScheduleTarget({
      type: "lead",
      leadIds: selectedLeadIds,
      label: `${selectedLeadIds.length} selected leads`,
    });
    setScheduleForm({
      name: `Selected leads campaign`,
      voiceAgentId: org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: "",
      syncExistingLeads: true,
      windows: [emptyWindow()],
    });
  };

  const updateWindow = (index: number, updates: Partial<LeadOutreachWindow>) => {
    setScheduleForm((current) => ({
      ...current,
      windows: current.windows.map((window, currentIndex) =>
        currentIndex === index ? { ...window, ...updates } : window,
      ),
    }));
  };

  const toggleWindowDay = (index: number, day: string) => {
    setScheduleForm((current) => ({
      ...current,
      windows: current.windows.map((window, currentIndex) => {
        if (currentIndex !== index) return window;
        const exists = window.weekdays.includes(day);
        return {
          ...window,
          weekdays: exists
            ? window.weekdays.filter((value) => value !== day)
            : [...window.weekdays, day],
        };
      }),
    }));
  };

  const handleCreateSchedule = async () => {
    if (!scheduleTarget) return;
    if (!scheduleForm.voiceAgentId) {
      showMessage("Select a voice agent first.", false);
      return;
    }

    await withBusy("create-schedule", async () => {
      await api.createLeadSchedule({
        name: scheduleForm.name,
        targetType: scheduleTarget.type,
        leadIds: scheduleTarget.type === "lead" ? scheduleTarget.leadIds : undefined,
        tag: scheduleTarget.type === "tag" ? scheduleTarget.tag : undefined,
        voiceAgentId: scheduleForm.voiceAgentId,
        windows: scheduleForm.windows,
        timezone: scheduleForm.timezone,
        extraContext: scheduleForm.extraContext,
        syncExistingLeads: scheduleTarget.type === "tag" ? scheduleForm.syncExistingLeads : false,
      });
      setScheduleTarget(null);
      setSelectedIds(new Set());
      await refreshAll();
      showMessage("Outreach schedule saved.");
    });
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    await withBusy(`delete-schedule-${scheduleId}`, async () => {
      await api.deleteLeadSchedule(scheduleId);
      await refreshAll();
      showMessage("Schedule deleted.");
    });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {toast ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            toast.ok
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-red-100 bg-red-50 text-red-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Lead CRM</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Import, tag, assign, and schedule voice-agent outreach from one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedLeadIds.length > 0 ? (
            <>
              <button
                onClick={() => void handleBulkStatus("contacted")}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600"
              >
                Mark Contacted ({selectedLeadIds.length})
              </button>
              <button
                onClick={() => setShowTagModal(true)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
              >
                Tag Selected
              </button>
              <button
                onClick={() => setShowAssignModal(true)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
              >
                Assign Agent
              </button>
              <button
                onClick={openSelectedSchedule}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
              >
                Schedule Calls
              </button>
            </>
          ) : null}
          <button
            onClick={() => setShowImportModal(true)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
          >
            Import CSV
          </button>
          <button
            onClick={() => void onExport()}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-amber-600"
          >
            Add Lead
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <i className="fa-sharp fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, phone, email, or tags"
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-medium outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <button
                onClick={toggleAll}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-slate-300"
              >
                {selectedIds.size === filteredLeads.length && filteredLeads.length > 0
                  ? "Clear Selection"
                  : "Select Visible"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-black text-slate-900">Lead list</p>
                <p className="text-xs text-slate-400">{filteredLeads.length} visible of {leads.length} total leads</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <i className="fa-sharp fa-solid fa-address-book text-4xl text-slate-200" />
                  <p className="mt-4 text-sm font-bold text-slate-500">No leads match your filters.</p>
                </div>
              ) : (
                filteredLeads.map((lead) => {
                  const assignedAgent = lead.voiceAgentId ? agentById.get(lead.voiceAgentId) : null;
                  return (
                    <div key={lead.id} className="px-5 py-4 transition-all hover:bg-slate-50/70">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex flex-1 gap-4">
                          <button
                            onClick={() => toggleSelect(lead.id)}
                            className={`mt-1 flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                              selectedIds.has(lead.id)
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                            aria-label={`Select ${lead.name}`}
                          >
                            <i className="fa-sharp fa-solid fa-check text-[10px]" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-slate-900">{lead.name}</p>
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[lead.status] || "border-slate-100 bg-slate-50 text-slate-500"}`}>
                                {lead.status}
                              </span>
                              {assignedAgent ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                  Agent · {assignedAgent.name}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              {lead.phone ? <span>{lead.phone}</span> : null}
                              {lead.email ? <span>· {lead.email}</span> : null}
                              <span>· Added {new Date(lead.createdAt).toLocaleDateString()}</span>
                            </div>
                            {lead.reason ? (
                              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                {lead.reason}
                              </p>
                            ) : null}
                            {lead.assignmentContext ? (
                              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-500">Assignment context</p>
                                {lead.assignmentContext}
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(lead.tags || []).length > 0 ? (
                                (lead.tags || []).map((tag) => (
                                  <button
                                    key={tag}
                                    onClick={() => {
                                      setAssignForm((current) => ({ ...current, tag }));
                                      setShowAssignModal(true);
                                    }}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-all hover:border-amber-300 hover:text-amber-700"
                                  >
                                    #{tag}
                                  </button>
                                ))
                              ) : (
                                <span className="text-xs text-slate-300">No tags yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <button
                            onClick={() => void handleToggleStatus(lead)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                          >
                            Cycle Status
                          </button>
                          <button
                            onClick={() => openSingleLeadAssignment(lead)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                          >
                            Assign Agent
                          </button>
                          <button
                            onClick={() => openSingleLeadSchedule(lead)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                          >
                            Schedule Call
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Tag collections</h3>
                <p className="text-xs text-slate-400">Bulk assign voice agents and campaigns by tag.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {tagStats.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">
                  Import or tag leads to create reusable collections.
                </div>
              ) : (
                tagStats.map(({ tag, count }) => (
                  <div key={tag} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-900">#{tag}</p>
                        <p className="text-xs text-slate-400">{count} leads</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAssignForm({
                              voiceAgentId: org?.activeVoiceAgentId || "",
                              tag,
                              assignmentContext: "",
                            });
                            setSelectedIds(new Set());
                            setShowAssignModal(true);
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => openTagSchedule(tag)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                        >
                          Schedule
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Outreach schedules</h3>
                <p className="text-xs text-slate-400">Saved call windows for individual leads or tag campaigns.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {schedules.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">
                  No schedules saved yet.
                </div>
              ) : (
                schedules.map((schedule) => {
                  const scheduleAgent = agentById.get(schedule.voiceAgentId);
                  return (
                    <div key={schedule.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">{schedule.name || (schedule.targetType === "tag" ? `Tag · ${schedule.tag}` : "Lead outreach")}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {schedule.targetType === "tag" ? `Tag: ${schedule.tag}` : `Lead ID: ${schedule.leadId}`}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {scheduleAgent?.name || "Unknown agent"} · {schedule.timezone}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            {schedule.windows.map((window) => `${window.weekdays.join(", ")} @ ${window.time}`).join(" · ")}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleDeleteSchedule(schedule.id)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-200 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <AppModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add lead"
        description="Create a lead manually and optionally tag or assign it immediately."
        size="lg"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="lead-create-form"
              disabled={busy === "create-lead"}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {busy === "create-lead" ? "Saving…" : "Create lead"}
            </button>
          </div>
        }
      >
        <form id="lead-create-form" onSubmit={handleCreateLead} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Full name</label>
            <input value={leadForm.name} onChange={(event) => setLeadForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</label>
            <input value={leadForm.phone} onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
            <input type="email" value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assign agent</label>
            <select value={leadForm.voiceAgentId} onChange={(event) => setLeadForm((current) => ({ ...current, voiceAgentId: event.target.value }))} className={inputClass}>
              <option value="">No agent yet</option>
              {voiceAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Reason / context</label>
            <textarea value={leadForm.reason} onChange={(event) => setLeadForm((current) => ({ ...current, reason: event.target.value }))} className={`${inputClass} min-h-[108px]`} />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags</label>
            <input value={leadForm.tags} onChange={(event) => setLeadForm((current) => ({ ...current, tags: event.target.value }))} className={inputClass} placeholder="vip, webinar, follow-up" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment notes</label>
            <input value={leadForm.assignmentContext} onChange={(event) => setLeadForm((current) => ({ ...current, assignmentContext: event.target.value }))} className={inputClass} placeholder="Talk about the premium package" />
          </div>
        </form>
      </AppModal>

      <AppModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import leads from CSV"
        description="Paste a CSV file or upload one. Name, phone, email, reason, tags, voice agent id, and assignment context are supported."
        size="xl"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowImportModal(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleImportCsv()}
              disabled={busy === "import-csv"}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white transition-all hover:bg-amber-600 disabled:opacity-50"
            >
              {busy === "import-csv" ? "Importing…" : "Import leads"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">Upload CSV file</p>
                <p className="text-xs text-slate-400">Perfect for ClickFunnels exports, email lists, and CRM exports.</p>
              </div>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
                >
                  Choose file
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">CSV contents</label>
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              className={`${inputClass} min-h-[320px] font-mono text-xs`}
              placeholder={"name,phone,email,reason,tags\nJane Smith,+15551234567,jane@demo.com,Asked about pricing,vip|demo"}
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={showTagModal}
        onClose={() => setShowTagModal(false)}
        title="Bulk tag leads"
        description="Add, remove, or replace tags across your selected leads."
        size="md"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowTagModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void handleBulkTags()} disabled={busy === "bulk-tags"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white transition-all hover:bg-amber-600 disabled:opacity-50">{busy === "bulk-tags" ? "Saving…" : "Save tags"}</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Action</label>
            <select value={tagForm.action} onChange={(event) => setTagForm((current) => ({ ...current, action: event.target.value as TagAction }))} className={inputClass}>
              <option value="add">Add tags</option>
              <option value="remove">Remove tags</option>
              <option value="set">Replace all tags</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags</label>
            <input value={tagForm.tags} onChange={(event) => setTagForm((current) => ({ ...current, tags: event.target.value }))} className={inputClass} placeholder="vip, webinar, renewal" />
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
            {selectedLeadIds.length} selected leads will be updated.
          </div>
        </div>
      </AppModal>

      <AppModal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Assign voice agent"
        description={selectedLeadIds.length > 0 ? `Apply an agent to ${selectedLeadIds.length} selected leads.` : "Assign an agent to a full tag collection."}
        size="lg"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void handleAssignAgent()} disabled={busy === "assign-agent"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white transition-all hover:bg-amber-600 disabled:opacity-50">{busy === "assign-agent" ? "Saving…" : "Assign agent"}</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Voice agent</label>
            <select value={assignForm.voiceAgentId} onChange={(event) => setAssignForm((current) => ({ ...current, voiceAgentId: event.target.value }))} className={inputClass}>
              <option value="">Choose an agent</option>
              {voiceAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tag collection (optional)</label>
            <input value={assignForm.tag} onChange={(event) => setAssignForm((current) => ({ ...current, tag: event.target.value }))} className={inputClass} placeholder="vip" disabled={selectedLeadIds.length > 0} />
            <p className="mt-1 text-xs text-slate-400">Leave this empty when working on selected leads. Use it to assign an agent to a whole tag collection.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment notes</label>
            <textarea value={assignForm.assignmentContext} onChange={(event) => setAssignForm((current) => ({ ...current, assignmentContext: event.target.value }))} className={`${inputClass} min-h-[120px]`} placeholder="Talk about the enterprise offer and mention the webinar they attended." />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        title="Create outreach schedule"
        description={scheduleTarget?.label || "Save outbound call timing for a lead or tag."}
        size="xl"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setScheduleTarget(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void handleCreateSchedule()} disabled={busy === "create-schedule"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white transition-all hover:bg-amber-600 disabled:opacity-50">{busy === "create-schedule" ? "Saving…" : "Save schedule"}</button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule name</label>
              <input value={scheduleForm.name} onChange={(event) => setScheduleForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="VIP nurture campaign" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Voice agent</label>
              <select value={scheduleForm.voiceAgentId} onChange={(event) => setScheduleForm((current) => ({ ...current, voiceAgentId: event.target.value }))} className={inputClass}>
                <option value="">Choose an agent</option>
                {voiceAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Timezone</label>
              <input value={scheduleForm.timezone} onChange={(event) => setScheduleForm((current) => ({ ...current, timezone: event.target.value }))} className={inputClass} placeholder="America/New_York" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Extra context</label>
              <input value={scheduleForm.extraContext} onChange={(event) => setScheduleForm((current) => ({ ...current, extraContext: event.target.value }))} className={inputClass} placeholder="Mention their recent quote request" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900">Call windows</p>
                <p className="text-xs text-slate-400">Example: Monday–Thursday at 10:00 and Saturday–Sunday at 08:00.</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleForm((current) => ({ ...current, windows: [...current.windows, emptyWindow()] }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-slate-300"
              >
                Add window
              </button>
            </div>
            {scheduleForm.windows.map((window, index) => (
              <div key={`${index}-${window.time}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-start">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Weekdays</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const active = window.weekdays.includes(day.code);
                        return (
                          <button
                            key={day.code}
                            type="button"
                            onClick={() => toggleWindowDay(index, day.code)}
                            className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Call time</label>
                    <input type="time" value={window.time} onChange={(event) => updateWindow(index, { time: event.target.value })} className={inputClass} />
                  </div>
                  <div className="flex items-end justify-end">
                    {scheduleForm.windows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setScheduleForm((current) => ({ ...current, windows: current.windows.filter((_, currentIndex) => currentIndex !== index) }))}
                        className="rounded-xl border border-red-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 transition-all hover:border-red-200"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {scheduleTarget?.type === "tag" ? (
            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={scheduleForm.syncExistingLeads}
                onChange={(event) => setScheduleForm((current) => ({ ...current, syncExistingLeads: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              Also assign this voice agent to the existing leads already carrying this tag.
            </label>
          ) : null}
        </div>
      </AppModal>
    </div>
  );
};

export default Leads;
