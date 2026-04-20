import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppModal from "../components/AppModal";
import { api } from "../services/api";
import {
  Lead,
  LeadOutreachSchedule,
  LeadOutreachWindow,
  Organization,
} from "../types";

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
  onDeleteLead?: (leadId: string) => Promise<void>;
  onBulkDeleteLeads?: (leadIds: string[]) => Promise<void>;
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
const STATUS_NEXT: Record<Lead["status"], Lead["status"]> = {
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

const PAGE_SIZE = 20;
const emptyWindow = (): LeadOutreachWindow => ({
  weekdays: ["mon", "tue", "wed", "thu", "fri"],
  time: "10:00",
});
const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40";
const normalizeTags = (value: string) =>
  value.split(",").map((t) => t.trim()).filter(Boolean);

const Leads: React.FC<LeadsProps> = ({
  leads: externalLeads,
  onUpdateLead,
  onCreateLead,
  onDeleteLead,
  onBulkDeleteLeads,
  onExport,
  org,
  onRefresh,
}) => {
  // Local copy of leads for instant optimistic updates — no page reload needed
  const [localLeads, setLocalLeads] = useState<Lead[]>(externalLeads);
  useEffect(() => { setLocalLeads(externalLeads); }, [externalLeads]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [schedules, setSchedules] = useState<LeadOutreachSchedule[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [leadForm, setLeadForm] = useState({
    name: "", email: "", phone: "", reason: "", tags: "",
    voiceAgentId: org?.activeVoiceAgentId || "", assignmentContext: "",
  });
  const [tagForm, setTagForm] = useState({ tags: "", action: "add" as TagAction });
  const [assignForm, setAssignForm] = useState({
    voiceAgentId: org?.activeVoiceAgentId || "", tag: "", assignmentContext: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    name: "", voiceAgentId: org?.activeVoiceAgentId || "",
    timezone: org?.profile.timezone || "America/New_York",
    extraContext: "", syncExistingLeads: true, windows: [emptyWindow()],
  });

  useEffect(() => {
    setLeadForm((c) => ({ ...c, voiceAgentId: c.voiceAgentId || org?.activeVoiceAgentId || "" }));
    setAssignForm((c) => ({ ...c, voiceAgentId: c.voiceAgentId || org?.activeVoiceAgentId || "" }));
    setScheduleForm((c) => ({
      ...c,
      voiceAgentId: c.voiceAgentId || org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || c.timezone,
    }));
  }, [org?.activeVoiceAgentId, org?.profile.timezone]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const voiceAgents = org?.voiceAgents || [];
  const agentById = useMemo(() => new Map(voiceAgents.map((a) => [a.id, a])), [voiceAgents]);

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of localLeads)
      for (const tag of lead.tags || [])
        counts.set(tag, (counts.get(tag) || 0) + 1);
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [localLeads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localLeads.filter((lead) => {
      const matchSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        (lead.tags || []).some((t) => t.toLowerCase().includes(q));
      const matchStatus = statusFilter === "all" || lead.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [localLeads, search, statusFilter]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const pagedLeads = filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedLeadIds = useMemo(() => [...selectedIds], [selectedIds]);

  const showMsg = (message: string, ok = true) => setToast({ message, ok });

  const refreshSchedules = async () => {
    try {
      const r = await api.listLeadSchedules();
      setSchedules(r.schedules || []);
    } catch { /* silent */ }
  };

  useEffect(() => { void refreshSchedules(); }, []);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { showMsg(e instanceof Error ? e.message : "Something went wrong.", false); }
    finally { setBusy(null); }
  };

  // ── Selection
  const toggleSelect = (id: string) =>
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (selectedIds.size === pagedLeads.length && pagedLeads.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pagedLeads.map((l) => l.id)));
  };

  // ── Optimistic helpers
  const optimisticPatch = (id: string, updates: Partial<Lead>) =>
    setLocalLeads((prev) => prev.map((l) => l.id === id ? { ...l, ...updates } : l));
  const optimisticPatchMany = (ids: string[], updates: Partial<Lead>) =>
    setLocalLeads((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, ...updates } : l));
  const optimisticRemove = (ids: string[]) =>
    setLocalLeads((prev) => prev.filter((l) => !ids.includes(l.id)));

  // ── Status cycle (instant — no reload)
  const handleToggleStatus = async (lead: Lead) => {
    const next = STATUS_NEXT[lead.status];
    optimisticPatch(lead.id, { status: next });
    try { await onUpdateLead(lead.id, { status: next }); }
    catch { optimisticPatch(lead.id, { status: lead.status }); showMsg("Status update failed.", false); }
  };

  // ── Bulk status (instant)
  const handleBulkStatus = async (status: Lead["status"]) => {
    if (!selectedLeadIds.length) return;
    const ids = [...selectedLeadIds];
    optimisticPatchMany(ids, { status });
    setSelectedIds(new Set());
    try {
      await Promise.all(ids.map((id) => onUpdateLead(id, { status })));
      showMsg(`Updated ${ids.length} leads.`);
    } catch { showMsg("Bulk status update failed.", false); }
  };

  // ── Create lead
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    await withBusy("create-lead", async () => {
      await onCreateLead({
        name: leadForm.name, phone: leadForm.phone, email: leadForm.email,
        reason: leadForm.reason, tags: normalizeTags(leadForm.tags),
        voiceAgentId: leadForm.voiceAgentId || undefined,
        assignmentContext: leadForm.assignmentContext || undefined,
      });
      setLeadForm({ name: "", email: "", phone: "", reason: "", tags: "",
        voiceAgentId: org?.activeVoiceAgentId || "", assignmentContext: "" });
      setShowAddModal(false);
      showMsg("Lead created.");
    });
  };

  // ── Import CSV
  const handleImportCsv = async () => {
    if (!csvText.trim()) { showMsg("Paste CSV data first.", false); return; }
    await withBusy("import-csv", async () => {
      const r = await api.importLeadsCsv(csvText);
      setShowImportModal(false); setCsvText("");
      if (onRefresh) await onRefresh();
      showMsg(`Imported ${r.imported} leads.`);
    });
  };

  // ── Bulk tag (optimistic)
  const handleBulkTags = async () => {
    if (!selectedLeadIds.length) { showMsg("Select leads first.", false); return; }
    const tags = normalizeTags(tagForm.tags);
    if (!tags.length) { showMsg("Enter at least one tag.", false); return; }
    const ids = [...selectedLeadIds];
    const action = tagForm.action;

    setLocalLeads((prev) => prev.map((l) => {
      if (!ids.includes(l.id)) return l;
      const cur = l.tags || [];
      const next =
        action === "add" ? [...new Set([...cur, ...tags])] :
        action === "remove" ? cur.filter((t) => !tags.includes(t)) :
        tags;
      return { ...l, tags: next };
    }));

    setShowTagModal(false);
    setTagForm({ tags: "", action: "add" });
    setSelectedIds(new Set());

    try {
      await api.bulkTagLeads(ids, tags, action);
      showMsg(`Tags updated for ${ids.length} lead${ids.length !== 1 ? "s" : ""}.`);
    } catch (e) {
      setLocalLeads(externalLeads);
      showMsg(e instanceof Error ? e.message : "Tag update failed.", false);
    }
  };

  // ── Assign agent (optimistic)
  const handleAssignAgent = async () => {
    if (!assignForm.voiceAgentId) { showMsg("Select an agent first.", false); return; }
    await withBusy("assign-agent", async () => {
      if (selectedLeadIds.length > 0) {
        const ids = [...selectedLeadIds];
        optimisticPatchMany(ids, {
          voiceAgentId: assignForm.voiceAgentId,
          assignmentContext: assignForm.assignmentContext || undefined,
        });
        await api.bulkAssignLeadAgent(ids, assignForm.voiceAgentId);
        if (assignForm.assignmentContext.trim())
          await Promise.all(ids.map((id) =>
            onUpdateLead(id, { assignmentContext: assignForm.assignmentContext.trim(), voiceAgentId: assignForm.voiceAgentId })));
      } else if (assignForm.tag.trim()) {
        await api.assignLeadAgentByTag(assignForm.tag.trim(), assignForm.voiceAgentId);
        if (onRefresh) await onRefresh();
      } else { showMsg("Select leads or enter a tag collection.", false); return; }
      setShowAssignModal(false);
      setAssignForm({ voiceAgentId: org?.activeVoiceAgentId || "", tag: "", assignmentContext: "" });
      setSelectedIds(new Set());
      showMsg("Agent assignment saved.");
    });
  };

  // ── Delete with 2-step confirmation
  const confirmDelete = (ids: string[], label: string) => {
    setDeleteTarget({ ids, label });
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { ids, label } = deleteTarget;
    optimisticRemove(ids);
    setShowDeleteModal(false);
    setDeleteTarget(null);
    setSelectedIds(new Set());
    try {
      if (ids.length === 1) {
        if (onDeleteLead) await onDeleteLead(ids[0]);
        else await (api as any).deleteLead(ids[0]);
      } else {
        if (onBulkDeleteLeads) await onBulkDeleteLeads(ids);
        else await (api as any).bulkDeleteLeads(ids);
      }
      showMsg(`Deleted ${label}.`);
    } catch (e) {
      setLocalLeads(externalLeads);
      showMsg(e instanceof Error ? e.message : "Delete failed.", false);
    }
  };

  // ── Schedule helpers
  const openSingleSchedule = (lead: Lead) => {
    setScheduleTarget({ type: "lead", leadIds: [lead.id], label: lead.name });
    setScheduleForm({ name: `${lead.name} outreach`,
      voiceAgentId: lead.voiceAgentId || org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: lead.assignmentContext || lead.reason || "",
      syncExistingLeads: true, windows: [emptyWindow()] });
  };
  const openTagSchedule = (tag: string) => {
    setScheduleTarget({ type: "tag", tag, label: `Tag · ${tag}` });
    setScheduleForm({ name: `${tag} campaign`,
      voiceAgentId: org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: "", syncExistingLeads: true, windows: [emptyWindow()] });
  };
  const openSelectedSchedule = () => {
    if (!selectedLeadIds.length) { showMsg("Select leads first.", false); return; }
    setScheduleTarget({ type: "lead", leadIds: [...selectedLeadIds],
      label: `${selectedLeadIds.length} selected leads` });
    setScheduleForm({ name: "Selected leads campaign",
      voiceAgentId: org?.activeVoiceAgentId || "",
      timezone: org?.profile.timezone || "America/New_York",
      extraContext: "", syncExistingLeads: true, windows: [emptyWindow()] });
  };

  const handleCreateSchedule = async () => {
    if (!scheduleTarget || !scheduleForm.voiceAgentId) {
      showMsg("Select a voice agent first.", false); return;
    }
    await withBusy("create-schedule", async () => {
      await api.createLeadSchedule({
        name: scheduleForm.name, targetType: scheduleTarget.type,
        leadIds: scheduleTarget.type === "lead" ? scheduleTarget.leadIds : undefined,
        tag: scheduleTarget.type === "tag" ? scheduleTarget.tag : undefined,
        voiceAgentId: scheduleForm.voiceAgentId, windows: scheduleForm.windows,
        timezone: scheduleForm.timezone, extraContext: scheduleForm.extraContext,
        syncExistingLeads: scheduleTarget.type === "tag" ? scheduleForm.syncExistingLeads : false,
      });
      setScheduleTarget(null); setSelectedIds(new Set());
      await refreshSchedules();
      showMsg("Outreach schedule saved.");
    });
  };

  const handleDeleteSchedule = async (id: string) => {
    await withBusy(`del-sch-${id}`, async () => {
      await api.deleteLeadSchedule(id);
      await refreshSchedules();
      showMsg("Schedule deleted.");
    });
  };

  const updateWindow = (i: number, updates: Partial<LeadOutreachWindow>) =>
    setScheduleForm((c) => ({ ...c, windows: c.windows.map((w, idx) => idx === i ? { ...w, ...updates } : w) }));
  const toggleDay = (i: number, day: string) =>
    setScheduleForm((c) => ({
      ...c,
      windows: c.windows.map((w, idx) => idx !== i ? w : {
        ...w,
        weekdays: w.weekdays.includes(day) ? w.weekdays.filter((d) => d !== day) : [...w.weekdays, day],
      }),
    }));

  // ── Pagination bar
  const Pagination = () => {
    const start = filteredLeads.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filteredLeads.length);
    const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
    const pageNums = Array.from({ length: Math.min(5, totalPages) }, (_, i) => windowStart + i);
    return (
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
        <p className="text-xs text-slate-400">Showing {start}–{end} of {filteredLeads.length}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1}
            className="rounded-lg px-2 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30">«</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
          {pageNums.map((pg) => (
            <button key={pg} onClick={() => setPage(pg)}
              className={`h-8 w-8 rounded-lg text-xs font-black transition-all ${pg === page ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {pg}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
            className="rounded-lg px-2 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30">»</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Lead CRM</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {localLeads.length} total leads · Import, tag, assign, and schedule voice outreach.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedLeadIds.length > 0 && (
            <>
              <button onClick={() => void handleBulkStatus("contacted")}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600">
                Mark Contacted ({selectedLeadIds.length})
              </button>
              <button onClick={() => setShowTagModal(true)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300 hover:text-amber-700">
                Tag Selected
              </button>
              <button onClick={() => { setAssignForm({ voiceAgentId: org?.activeVoiceAgentId || "", tag: "", assignmentContext: "" }); setShowAssignModal(true); }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                Assign Agent
              </button>
              <button onClick={openSelectedSchedule}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                Schedule Calls
              </button>
              <button onClick={() => confirmDelete(selectedLeadIds, `${selectedLeadIds.length} lead${selectedLeadIds.length !== 1 ? "s" : ""}`)}
                className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-100">
                Delete ({selectedLeadIds.length})
              </button>
            </>
          )}
          <button onClick={() => setShowImportModal(true)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
            Import CSV
          </button>
          <button onClick={() => void onExport()}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
            Export CSV
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600">
            + Add Lead
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">

        {/* LEFT: leads list */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email or tag…"
                  className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 outline-none focus:border-amber-300">
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="closed">Closed</option>
              </select>
              <button onClick={toggleAll}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300">
                {selectedIds.size === pagedLeads.length && pagedLeads.length > 0 ? "Clear Page" : "Select Page"}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-black text-slate-900">Lead list</p>
                <p className="text-xs text-slate-400">
                  Page {page}/{totalPages} · {filteredLeads.length} matching · {localLeads.length} total
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {pagedLeads.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-4xl">📋</p>
                  <p className="mt-4 text-sm font-bold text-slate-500">No leads match your filters.</p>
                </div>
              ) : pagedLeads.map((lead) => {
                const agent = lead.voiceAgentId ? agentById.get(lead.voiceAgentId) : null;
                return (
                  <div key={lead.id} className="px-5 py-4 hover:bg-slate-50/70 transition-colors">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex flex-1 gap-4">
                        <button onClick={() => toggleSelect(lead.id)}
                          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all
                            ${selectedIds.has(lead.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-slate-900">{lead.name}</p>
                            <button onClick={() => void handleToggleStatus(lead)} title="Click to cycle status"
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:opacity-75 transition-opacity
                                ${STATUS_STYLES[lead.status] || "border-slate-100 bg-slate-50 text-slate-500"}`}>
                              {lead.status}
                            </button>
                            {agent && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                {agent.name}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                            {lead.phone && <span>{lead.phone}</span>}
                            {lead.email && <span>· {lead.email}</span>}
                            <span>· {new Date(lead.createdAt).toLocaleDateString()}</span>
                          </div>
                          {lead.reason && (
                            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{lead.reason}</p>
                          )}
                          {lead.assignmentContext && (
                            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-500">Assignment context</p>
                              {lead.assignmentContext}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(lead.tags || []).length > 0 ? (
                              (lead.tags || []).map((tag) => (
                                <button key={tag}
                                  onClick={() => { setAssignForm((c) => ({ ...c, tag })); setSelectedIds(new Set()); setShowAssignModal(true); }}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-amber-300 hover:text-amber-700">
                                  #{tag}
                                </button>
                              ))
                            ) : (
                              <span className="text-xs text-slate-300">No tags yet</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Per-row actions */}
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <button onClick={() => { setSelectedIds(new Set([lead.id])); setShowTagModal(true); }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300 hover:text-amber-700">
                          Tag
                        </button>
                        <button onClick={() => {
                          setSelectedIds(new Set([lead.id]));
                          setAssignForm({ voiceAgentId: lead.voiceAgentId || org?.activeVoiceAgentId || "", tag: "", assignmentContext: lead.assignmentContext || "" });
                          setShowAssignModal(true);
                        }} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                          Assign
                        </button>
                        <button onClick={() => openSingleSchedule(lead)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                          Schedule
                        </button>
                        <button onClick={() => confirmDelete([lead.id], lead.name)}
                          className="rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && <Pagination />}
          </div>
        </div>

        {/* RIGHT: tags + schedules */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-0.5">Tag collections</h3>
            <p className="text-xs text-slate-400 mb-4">Bulk-assign agents and campaigns by tag.</p>
            {tagStats.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">
                No tags yet. Tag leads to create collections.
              </div>
            ) : tagStats.map(({ tag, count }) => (
              <div key={tag} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">#{tag}</p>
                    <p className="text-xs text-slate-400">{count} lead{count !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setAssignForm({ voiceAgentId: org?.activeVoiceAgentId || "", tag, assignmentContext: "" }); setSelectedIds(new Set()); setShowAssignModal(true); }}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                      Assign
                    </button>
                    <button onClick={() => openTagSchedule(tag)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                      Schedule
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-0.5">Outreach schedules</h3>
            <p className="text-xs text-slate-400 mb-4">Saved call windows for leads or campaigns.</p>
            {schedules.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400">
                No schedules saved yet.
              </div>
            ) : schedules.map((sch) => {
              const schAgent = agentById.get(sch.voiceAgentId);
              return (
                <div key={sch.id} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 truncate">{sch.name || (sch.targetType === "tag" ? `Tag · ${sch.tag}` : "Lead outreach")}</p>
                      <p className="mt-1 text-xs text-slate-400">{sch.targetType === "tag" ? `Tag: ${sch.tag}` : `Lead: ${sch.leadId}`}</p>
                      <p className="text-xs text-slate-400">{schAgent?.name || "Unknown agent"} · {sch.timezone}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {sch.windows.map((w) => `${w.weekdays.join(", ")} @ ${w.time}`).join(" · ")}
                      </p>
                    </div>
                    <button onClick={() => void handleDeleteSchedule(sch.id)} disabled={busy === `del-sch-${sch.id}`}
                      className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-red-200 hover:text-red-500 disabled:opacity-40">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── MODALS ─── */}

      {/* Add lead */}
      <AppModal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add lead" description="Create a lead manually." size="lg"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" form="lead-form" disabled={busy === "create-lead"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">
            {busy === "create-lead" ? "Saving…" : "Create lead"}
          </button>
        </div>}>
        <form id="lead-form" onSubmit={handleCreateLead} className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Full name *</label>
            <input value={leadForm.name} onChange={(e) => setLeadForm((c) => ({ ...c, name: e.target.value }))} className={inputClass} required /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</label>
            <input value={leadForm.phone} onChange={(e) => setLeadForm((c) => ({ ...c, phone: e.target.value }))} className={inputClass} /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
            <input type="email" value={leadForm.email} onChange={(e) => setLeadForm((c) => ({ ...c, email: e.target.value }))} className={inputClass} /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assign agent</label>
            <select value={leadForm.voiceAgentId} onChange={(e) => setLeadForm((c) => ({ ...c, voiceAgentId: e.target.value }))} className={inputClass}>
              <option value="">No agent yet</option>
              {voiceAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Reason / context</label>
            <textarea value={leadForm.reason} onChange={(e) => setLeadForm((c) => ({ ...c, reason: e.target.value }))} className={`${inputClass} min-h-[90px]`} /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags (comma separated)</label>
            <input value={leadForm.tags} onChange={(e) => setLeadForm((c) => ({ ...c, tags: e.target.value }))} className={inputClass} placeholder="vip, webinar" /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment notes</label>
            <input value={leadForm.assignmentContext} onChange={(e) => setLeadForm((c) => ({ ...c, assignmentContext: e.target.value }))} className={inputClass} /></div>
        </form>
      </AppModal>

      {/* Import CSV */}
      <AppModal open={showImportModal} onClose={() => setShowImportModal(false)} title="Import leads from CSV"
        description="Columns: name, phone, email, reason, tags, voice_agent_id, assignment_context." size="xl"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowImportModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleImportCsv()} disabled={busy === "import-csv"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">
            {busy === "import-csv" ? "Importing…" : "Import leads"}
          </button>
        </div>}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 flex items-center justify-between gap-3">
            <div><p className="text-sm font-black text-slate-900">Upload CSV file</p>
              <p className="text-xs text-slate-400">ClickFunnels, GoHighLevel, HubSpot exports all work.</p></div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result || "")); r.readAsText(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
              Choose file
            </button>
          </div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">CSV contents</label>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)}
              className={`${inputClass} min-h-[260px] font-mono text-xs`}
              placeholder={"name,phone,email,reason,tags\nJane Smith,+15551234567,jane@demo.com,Pricing enquiry,vip|demo"} /></div>
        </div>
      </AppModal>

      {/* Tag modal */}
      <AppModal open={showTagModal} onClose={() => setShowTagModal(false)} title="Tag leads"
        description={`${selectedLeadIds.length} lead${selectedLeadIds.length !== 1 ? "s" : ""} selected.`} size="md"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowTagModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleBulkTags()} disabled={busy === "bulk-tags"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">
            {busy === "bulk-tags" ? "Saving…" : "Apply tags"}
          </button>
        </div>}>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Action</label>
            <select value={tagForm.action} onChange={(e) => setTagForm((c) => ({ ...c, action: e.target.value as TagAction }))} className={inputClass}>
              <option value="add">Add tags</option>
              <option value="remove">Remove tags</option>
              <option value="set">Replace all tags</option>
            </select></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags (comma separated)</label>
            <input value={tagForm.tags} onChange={(e) => setTagForm((c) => ({ ...c, tags: e.target.value }))} className={inputClass} placeholder="vip, webinar, renewal" autoFocus /></div>
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Changes appear instantly in the list. {selectedLeadIds.length} leads will be updated.
          </p>
        </div>
      </AppModal>

      {/* Assign agent */}
      <AppModal open={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign voice agent"
        description={selectedLeadIds.length > 0 ? `Apply to ${selectedLeadIds.length} selected lead${selectedLeadIds.length !== 1 ? "s" : ""}.` : "Assign to a tag collection."} size="lg"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleAssignAgent()} disabled={busy === "assign-agent"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">
            {busy === "assign-agent" ? "Saving…" : "Assign agent"}
          </button>
        </div>}>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Voice agent</label>
            <select value={assignForm.voiceAgentId} onChange={(e) => setAssignForm((c) => ({ ...c, voiceAgentId: e.target.value }))} className={inputClass}>
              <option value="">Choose an agent</option>
              {voiceAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          {selectedLeadIds.length === 0 && (
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tag collection</label>
              <input value={assignForm.tag} onChange={(e) => setAssignForm((c) => ({ ...c, tag: e.target.value }))} className={inputClass} placeholder="vip" />
              <p className="mt-1 text-xs text-slate-400">Leave empty when using selected leads above.</p></div>
          )}
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Assignment notes</label>
            <textarea value={assignForm.assignmentContext} onChange={(e) => setAssignForm((c) => ({ ...c, assignmentContext: e.target.value }))} className={`${inputClass} min-h-[100px]`} placeholder="Talk about the enterprise offer…" /></div>
        </div>
      </AppModal>

      {/* Delete confirmation */}
      <AppModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete leads"
        description="This cannot be undone." size="md"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleDelete()} disabled={busy === "delete"} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
            {busy === "delete" ? "Deleting…" : "Yes, delete permanently"}
          </button>
        </div>}>
        <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          You are about to permanently delete <strong>{deleteTarget?.label}</strong>.
          Associated schedules remain but the lead data will be gone.
        </div>
      </AppModal>

      {/* Schedule modal */}
      <AppModal open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} title="Create outreach schedule"
        description={scheduleTarget?.label || ""} size="xl"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setScheduleTarget(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleCreateSchedule()} disabled={busy === "create-schedule"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">
            {busy === "create-schedule" ? "Saving…" : "Save schedule"}
          </button>
        </div>}>
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule name</label>
              <input value={scheduleForm.name} onChange={(e) => setScheduleForm((c) => ({ ...c, name: e.target.value }))} className={inputClass} placeholder="VIP nurture campaign" /></div>
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Voice agent</label>
              <select value={scheduleForm.voiceAgentId} onChange={(e) => setScheduleForm((c) => ({ ...c, voiceAgentId: e.target.value }))} className={inputClass}>
                <option value="">Choose an agent</option>
                {voiceAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Timezone</label>
              <input value={scheduleForm.timezone} onChange={(e) => setScheduleForm((c) => ({ ...c, timezone: e.target.value }))} className={inputClass} placeholder="America/New_York" /></div>
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Extra context for agent</label>
              <input value={scheduleForm.extraContext} onChange={(e) => setScheduleForm((c) => ({ ...c, extraContext: e.target.value }))} className={inputClass} placeholder="Mention their recent quote" /></div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-black text-slate-900">Call windows</p>
                <p className="text-xs text-slate-400">e.g. Mon–Fri at 10:00 and Sat–Sun at 09:00</p></div>
              <button type="button" onClick={() => setScheduleForm((c) => ({ ...c, windows: [...c.windows, emptyWindow()] }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">
                + Window
              </button>
            </div>
            {scheduleForm.windows.map((w, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-start">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Days</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => (
                        <button key={d.code} type="button" onClick={() => toggleDay(i, d.code)}
                          className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all
                            ${w.weekdays.includes(d.code) ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div><label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Time</label>
                    <input type="time" value={w.time} onChange={(e) => updateWindow(i, { time: e.target.value })} className={inputClass} /></div>
                  <div className="flex items-end justify-end">
                    {scheduleForm.windows.length > 1 && (
                      <button type="button" onClick={() => setScheduleForm((c) => ({ ...c, windows: c.windows.filter((_, idx) => idx !== i) }))}
                        className="rounded-xl border border-red-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:border-red-200">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {scheduleTarget?.type === "tag" && (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={scheduleForm.syncExistingLeads}
                onChange={(e) => setScheduleForm((c) => ({ ...c, syncExistingLeads: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
              Also assign this agent to existing leads with this tag
            </label>
          )}
        </div>
      </AppModal>
    </div>
  );
};

export default Leads;
