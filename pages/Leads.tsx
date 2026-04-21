import React, { useEffect, useMemo, useRef, useState } from "react";
import AppModal from "../components/AppModal";
import { api } from "../services/api";
import { Lead, LeadOutreachSchedule, LeadOutreachWindow, Organization } from "../types";

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

interface Schedule extends LeadOutreachSchedule {
  startDate?: string;
  endDate?: string;
}

type TagAction = "add" | "remove" | "set";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-600 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const STATUS_NEXT: Record<Lead["status"], Lead["status"]> = {
  new: "contacted", contacted: "closed", closed: "new",
};
const WEEKDAYS = [
  { code: "mon", label: "Mon" }, { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" }, { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" }, { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];
const TIMEZONES = [
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Toronto","America/Phoenix","America/Anchorage","America/Sao_Paulo",
  "America/Mexico_City","America/Bogota","America/Buenos_Aires",
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome",
  "Europe/Amsterdam","Europe/Zurich","Europe/Stockholm","Europe/Moscow",
  "Africa/Lagos","Africa/Nairobi","Africa/Johannesburg","Africa/Cairo","Africa/Accra",
  "Asia/Dubai","Asia/Riyadh","Asia/Karachi","Asia/Kolkata","Asia/Bangkok",
  "Asia/Singapore","Asia/Hong_Kong","Asia/Shanghai","Asia/Tokyo","Asia/Seoul",
  "Australia/Sydney","Australia/Melbourne","Australia/Perth","Pacific/Auckland","UTC",
];

const PAGE_SIZE = 10;
const SIDEBAR_SIZE = 3;
const emptyWindow = (): LeadOutreachWindow => ({ weekdays: ["mon","tue","wed","thu","fri"], time: "10:00" });
const iCls = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40";
const normTags = (v: string) => v.split(",").map(t => t.trim()).filter(Boolean);

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysFromNow(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
// Find first occurrence of any selected weekday from today
function smartStartDate(weekdays: string[]): string {
  if (!weekdays.length) return todayStr();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const code = ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
    if (weekdays.includes(code)) return d.toISOString().slice(0, 10);
  }
  return todayStr();
}
function countOccurrences(start: string, end: string, weekdays: string[]): number {
  if (!start || !end || !weekdays.length) return 0;
  let count = 0;
  const cur = new Date(start); const endD = new Date(end);
  while (cur <= endD) {
    const code = ["sun","mon","tue","wed","thu","fri","sat"][cur.getDay()];
    if (weekdays.includes(code)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
function countCompleted(start: string, weekdays: string[]): number {
  if (!start || !weekdays.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0; const cur = new Date(start);
  while (cur < today) {
    const code = ["sun","mon","tue","wed","thu","fri","sat"][cur.getDay()];
    if (weekdays.includes(code)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const Leads: React.FC<LeadsProps> = ({
  leads: externalLeads, onUpdateLead, onCreateLead,
  onDeleteLead, onBulkDeleteLeads, onExport, org, onRefresh,
}) => {
  const [localLeads, setLocalLeads] = useState<Lead[]>(externalLeads);
  useEffect(() => { setLocalLeads(externalLeads); }, [externalLeads]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ tag: string; label: string } | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const [tagPage, setTagPage] = useState(1);
  const [schPage, setSchPage] = useState(1);

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const defaultTz = (org as any)?.profile?.timezone || (org as any)?.settings?.timezone || "America/New_York";

  const allTags = useMemo(() => {
    const s = new Set<string>();
    localLeads.forEach(l => (l.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [localLeads]);

  const [leadForm, setLeadForm] = useState({ name:"", email:"", phone:"", reason:"", tags:"" });
  const [tagForm, setTagForm] = useState({ tags:"", action:"add" as TagAction, removeList: [] as string[] });

  const defaultSchedForm = () => {
    const wins = [emptyWindow()];
    return {
      name: "", voiceAgentId: "",
      timezone: defaultTz,
      extraContext: "", syncExistingLeads: true,
      windows: wins,
      startDate: smartStartDate(wins[0].weekdays),
      endDate: "",
      dateError: "",
    };
  };
  const [scheduleForm, setScheduleForm] = useState(defaultSchedForm());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const voiceAgents = org?.voiceAgents || [];
  // ONLY outbound agents for outreach scheduling
  const outboundAgents = useMemo(() => voiceAgents.filter(a => a.direction === "outbound"), [voiceAgents]);
  const agentById = useMemo(() => new Map(voiceAgents.map(a => [a.id, a])), [voiceAgents]);

  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    localLeads.forEach(l => (l.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [localLeads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localLeads.filter(l => {
      const ms = !q || [l.name, l.phone, l.email, ...(l.tags || [])].some(s => s.toLowerCase().includes(q));
      return ms && (statusFilter === "all" || l.status === statusFilter);
    });
  }, [localLeads, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const pagedLeads = filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selIds = useMemo(() => [...selectedIds], [selectedIds]);

  const totalTagPages = Math.max(1, Math.ceil(tagStats.length / SIDEBAR_SIZE));
  const pagedTags = tagStats.slice((tagPage - 1) * SIDEBAR_SIZE, tagPage * SIDEBAR_SIZE);
  const totalSchPages = Math.max(1, Math.ceil(schedules.length / SIDEBAR_SIZE));
  const pagedSch = schedules.slice((schPage - 1) * SIDEBAR_SIZE, schPage * SIDEBAR_SIZE);

  const showMsg = (msg: string, ok = true) => setToast({ msg, ok });

  const refreshSchedules = async () => {
    try { setSchedules((await api.listLeadSchedules()).schedules as Schedule[]); } catch {}
  };
  useEffect(() => { void refreshSchedules(); }, []);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (e) { showMsg(e instanceof Error ? e.message : "Something went wrong.", false); }
    finally { setBusy(null); }
  };

  const toggleSel = (id: string) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => {
    if (selectedIds.size === pagedLeads.length && pagedLeads.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pagedLeads.map(l => l.id)));
  };

  const oPatch = (id: string, u: Partial<Lead>) => setLocalLeads(p => p.map(l => l.id === id ? { ...l, ...u } : l));
  const oPatchMany = (ids: string[], u: Partial<Lead>) => setLocalLeads(p => p.map(l => ids.includes(l.id) ? { ...l, ...u } : l));
  const oRemove = (ids: string[]) => setLocalLeads(p => p.filter(l => !ids.includes(l.id)));

  const cycleStatus = async (lead: Lead) => {
    const next = STATUS_NEXT[lead.status];
    oPatch(lead.id, { status: next });
    if (activeLead?.id === lead.id) setActiveLead(l => l ? { ...l, status: next } : l);
    try { await onUpdateLead(lead.id, { status: next }); }
    catch { oPatch(lead.id, { status: lead.status }); showMsg("Status update failed.", false); }
  };

  const bulkStatus = async (status: Lead["status"]) => {
    if (!selIds.length) return;
    const ids = [...selIds]; oPatchMany(ids, { status }); setSelectedIds(new Set());
    try { await Promise.all(ids.map(id => onUpdateLead(id, { status }))); showMsg(`Updated ${ids.length} leads.`); }
    catch { showMsg("Bulk status failed.", false); }
  };

  const createLead = async (e: React.FormEvent) => {
    e.preventDefault();
    await withBusy("create", async () => {
      await onCreateLead({ name: leadForm.name, phone: leadForm.phone, email: leadForm.email, reason: leadForm.reason, tags: normTags(leadForm.tags) });
      setLeadForm({ name: "", email: "", phone: "", reason: "", tags: "" });
      setShowAddModal(false); showMsg("Lead created.");
    });
  };

  const importCsv = async () => {
    if (!csvText.trim()) { showMsg("Paste CSV data first.", false); return; }
    await withBusy("import", async () => {
      const r = await api.importLeadsCsv(csvText);
      setShowImportModal(false); setCsvText("");
      if (onRefresh) await onRefresh();
      showMsg(`Imported ${r.imported} leads.`);
    });
  };

  const applyTags = async () => {
    if (!selIds.length) { showMsg("Select leads first.", false); return; }
    const action = tagForm.action;
    let tags: string[];
    if (action === "remove") {
      tags = tagForm.removeList;
      if (!tags.length) { showMsg("Select at least one tag to remove.", false); return; }
    } else {
      tags = normTags(tagForm.tags);
      if (!tags.length) { showMsg("Enter at least one tag.", false); return; }
    }
    const ids = [...selIds];
    setLocalLeads(p => p.map(l => {
      if (!ids.includes(l.id)) return l;
      const cur = l.tags || [];
      const next = action === "add" ? [...new Set([...cur, ...tags])]
        : action === "remove" ? cur.filter(t => !tags.includes(t))
        : tags;
      return { ...l, tags: next };
    }));
    setShowTagModal(false); setTagForm({ tags: "", action: "add", removeList: [] }); setSelectedIds(new Set());
    try { await api.bulkTagLeads(ids, tags, action); showMsg(`Tags updated for ${ids.length} leads.`); }
    catch { setLocalLeads(externalLeads); showMsg("Tag update failed.", false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { ids, label } = deleteTarget;
    oRemove(ids); setDeleteTarget(null); setSelectedIds(new Set()); setActiveLead(null);
    try {
      if (ids.length === 1) { if (onDeleteLead) await onDeleteLead(ids[0]); else await (api as any).deleteLead(ids[0]); }
      else { if (onBulkDeleteLeads) await onBulkDeleteLeads(ids); else await (api as any).bulkDeleteLeads(ids); }
      showMsg(`Deleted ${label}.`);
    } catch { setLocalLeads(externalLeads); showMsg("Delete failed.", false); }
  };

  // Validate schedule — endDate is strictly required
  const validateSchedule = (form: typeof scheduleForm): string => {
    if (!form.voiceAgentId) return "Select a voice agent.";
    if (!form.startDate) return "Select a start date.";
    if (!form.endDate) return ""; // handled by disabled state
    if (form.endDate <= form.startDate) return "End date must be after start date.";
    const allDays = form.windows.flatMap(w => w.weekdays);
    if (!allDays.length) return "Select at least one day.";
    const occ = countOccurrences(form.startDate, form.endDate, allDays);
    if (occ === 0) return "No call windows fall in the selected date range.";
    return "";
  };

  // When days change, recalculate smart start date
  const toggleSDay = (i: number, day: string) => {
    setScheduleForm(c => {
      const newWins = c.windows.map((w, idx) => idx !== i ? w : {
        ...w, weekdays: w.weekdays.includes(day) ? w.weekdays.filter(d => d !== day) : [...w.weekdays, day],
      });
      const allDays = newWins.flatMap(w => w.weekdays);
      return { ...c, windows: newWins, startDate: allDays.length ? smartStartDate(allDays) : c.startDate, dateError: "" };
    });
  };
  const updateSWindow = (i: number, upd: Partial<LeadOutreachWindow>) =>
    setScheduleForm(c => ({ ...c, windows: c.windows.map((w, idx) => idx === i ? { ...w, ...upd } : w) }));

  const toggleEDay = (i: number, day: string) =>
    setEditingSchedule(c => c ? { ...c, windows: c.windows.map((w, idx) => idx !== i ? w : {
      ...w, weekdays: w.weekdays.includes(day) ? w.weekdays.filter(d => d !== day) : [...w.weekdays, day],
    }) } : c);
  const updateEWindow = (i: number, upd: Partial<LeadOutreachWindow>) =>
    setEditingSchedule(c => c ? { ...c, windows: c.windows.map((w, idx) => idx === i ? { ...w, ...upd } : w) } : c);

  const openTagSchedule = (tag: string) => {
    const wins = [emptyWindow()];
    const firstOutbound = outboundAgents[0]?.id || "";
    setScheduleTarget({ tag, label: `Tag · ${tag}` });
    setScheduleForm({
      name: `${tag} campaign`, voiceAgentId: firstOutbound,
      timezone: defaultTz, extraContext: "", syncExistingLeads: true,
      windows: wins, startDate: smartStartDate(wins[0].weekdays), endDate: "", dateError: "",
    });
  };

  const saveSchedule = async () => {
    const err = validateSchedule(scheduleForm);
    if (err) { setScheduleForm(c => ({ ...c, dateError: err })); return; }
    if (!scheduleTarget) return;
    await withBusy("schedule", async () => {
      await api.createLeadSchedule({
        name: scheduleForm.name, targetType: "tag",
        tag: scheduleTarget.tag, voiceAgentId: scheduleForm.voiceAgentId,
        windows: scheduleForm.windows, timezone: scheduleForm.timezone,
        extraContext: scheduleForm.extraContext, syncExistingLeads: scheduleForm.syncExistingLeads,
        startDate: scheduleForm.startDate, endDate: scheduleForm.endDate,
      } as any);
      setScheduleTarget(null); // auto-close
      setSelectedIds(new Set());
      await refreshSchedules(); showMsg("Schedule saved.");
    });
  };

  const saveEditedSchedule = async () => {
    if (!editingSchedule) return;
    const start = (editingSchedule as any).startDate || "";
    const end = (editingSchedule as any).endDate || "";
    if (!end) { showMsg("End date is required.", false); return; }
    if (end <= start) { showMsg("End date must be after start date.", false); return; }
    await withBusy("edit-sch", async () => {
      await api.updateLeadSchedule(editingSchedule.id, {
        name: editingSchedule.name, voiceAgentId: editingSchedule.voiceAgentId,
        windows: editingSchedule.windows, timezone: editingSchedule.timezone,
        extraContext: editingSchedule.extraContext, isActive: editingSchedule.isActive,
        startDate: start, endDate: end,
      } as any);
      setEditingSchedule(null); // auto-close
      await refreshSchedules(); showMsg("Schedule updated.");
    });
  };

  const getCampaignMetrics = (sch: Schedule) => {
    const allDays = sch.windows.flatMap(w => w.weekdays);
    const start = (sch as any).startDate || ""; const end = (sch as any).endDate || "";
    const total = countOccurrences(start, end, allDays);
    const completed = Math.min(countCompleted(start, allDays), total);
    return { total, completed, remaining: Math.max(0, total - completed), pct: total > 0 ? Math.round((completed / total) * 100) : 0, isComplete: total > 0 && completed >= total };
  };

  // Pager
  const Pager = ({ cur, total, onChange }: { cur: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 mt-1">
        <span className="text-[10px] text-slate-400">{cur}/{total}</span>
        <div className="flex gap-1">
          <button onClick={() => onChange(Math.max(1, cur - 1))} disabled={cur === 1} className="rounded px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">‹</button>
          <button onClick={() => onChange(Math.min(total, cur + 1))} disabled={cur === total} className="rounded px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">›</button>
        </div>
      </div>
    );
  };

  // Windows editor (shared between create/edit)
  const WindowsEditor = ({ windows, onToggle, onTime, onAdd, onRemove }: {
    windows: LeadOutreachWindow[];
    onToggle: (i: number, d: string) => void;
    onTime: (i: number, t: string) => void;
    onAdd: () => void;
    onRemove: (i: number) => void;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">Call windows</p>
          <p className="text-xs text-slate-400 mt-0.5">Uses 24-hour format · e.g. 09:00 = 9 AM, 14:00 = 2 PM</p>
        </div>
        <button type="button" onClick={onAdd} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">+ Window</button>
      </div>
      {windows.map((w, i) => (
        <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {WEEKDAYS.map(d => (
              <button key={d.code} type="button" onClick={() => onToggle(i, d.code)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all
                  ${w.weekdays.includes(d.code) ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                Call time <span className="font-medium text-slate-400 normal-case tracking-normal">(24h · 09:00 = 9AM, 17:00 = 5PM)</span>
              </label>
              <input type="time" value={w.time} onChange={e => onTime(i, e.target.value)} className={iCls} />
            </div>
            {windows.length > 1 && (
              <button type="button" onClick={() => onRemove(i)}
                className="rounded-xl border border-red-100 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-500 hover:border-red-200 mb-0.5">
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // Styled date input
  const DateInput = ({ label, value, onChange, min, required = false, hint = "" }: {
    label: string; value: string; onChange: (v: string) => void; min?: string; required?: boolean; hint?: string;
  }) => (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        <input type="date" value={value} min={min || todayStr()} onChange={e => onChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-slate-800 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40 cursor-pointer [color-scheme:light]"
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
      </div>
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );

  const schedEndDateMissing = !scheduleForm.endDate;
  const schedValidErr = scheduleForm.endDate ? validateSchedule(scheduleForm) : "";

  return (
    <div className="space-y-6 animate-fade-up">
      {toast && (
        <div className={`fixed top-5 right-5 z-[300] rounded-2xl px-5 py-3 text-sm font-bold shadow-xl
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Lead CRM</h2>
          <p className="mt-0.5 text-xs text-slate-400">{localLeads.length} total · tag leads to assign and schedule outreach</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selIds.length > 0 && (
            <>
              <button onClick={() => void bulkStatus("contacted")}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600">
                Mark Contacted ({selIds.length})
              </button>
              <button onClick={() => setShowTagModal(true)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300 hover:text-amber-700">
                Tag Selected
              </button>
              <button onClick={() => setDeleteTarget({ ids: selIds, label: `${selIds.length} lead${selIds.length > 1 ? "s" : ""}` })}
                className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-100">
                Delete ({selIds.length})
              </button>
            </>
          )}
          <button onClick={() => setShowImportModal(true)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">Import CSV</button>
          <button onClick={() => void onExport()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">Export CSV</button>
          <button onClick={() => setShowAddModal(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600">+ Add Lead</button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">

        {/* LEFT */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email or tag…"
                  className="w-full rounded-2xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/40" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 outline-none focus:border-amber-300">
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="closed">Closed</option>
              </select>
              <button onClick={toggleAll} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 whitespace-nowrap">
                {selectedIds.size === pagedLeads.length && pagedLeads.length > 0 ? "Clear" : "Select Page"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-black text-slate-900">Leads</p>
              <p className="text-xs text-slate-400">Page {page}/{totalPages} · {filteredLeads.length} matching</p>
            </div>
            <div className="divide-y divide-slate-100">
              {pagedLeads.length === 0 ? (
                <div className="py-14 text-center"><p className="text-4xl">📋</p><p className="mt-3 text-sm font-bold text-slate-400">No leads match your filters.</p></div>
              ) : pagedLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <button onClick={() => toggleSel(lead.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all
                      ${selectedIds.has(lead.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button onClick={() => setActiveLead(lead)} className="flex flex-1 flex-col items-start gap-1 text-left min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{lead.name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[lead.status]}`}>{lead.status}</span>
                    </div>
                    {(lead.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(lead.tags || []).map(t => (
                          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">#{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                  <button onClick={() => setDeleteTarget({ ids: [lead.id], label: lead.name })}
                    className="rounded-xl border border-red-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-50 shrink-0">Delete</button>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
                <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1} className="rounded px-1.5 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(page - 2, totalPages - 4)) + i).map(n => (
                    <button key={n} onClick={() => setPage(n)} className={`rounded h-7 w-7 text-[10px] font-black ${n === page ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{n}</button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded px-2 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="rounded px-1.5 py-1 text-[10px] font-black text-slate-400 hover:bg-slate-100 disabled:opacity-30">»</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-0.5">Tag collections</h3>
            <p className="text-xs text-slate-400 mb-4">Create outreach campaigns by tag.</p>
            {tagStats.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-400">Tag leads to create collections.</div>
            ) : (
              <>
                {pagedTags.map(({ tag, count }) => (
                  <div key={tag} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="font-black text-slate-900 text-sm">#{tag}</p><p className="text-xs text-slate-400">{count} lead{count !== 1 ? "s" : ""}</p></div>
                      <button onClick={() => openTagSchedule(tag)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-300 hover:text-amber-700">Schedule</button>
                    </div>
                  </div>
                ))}
                <Pager cur={tagPage} total={totalTagPages} onChange={setTagPage} />
              </>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 mb-0.5">Outreach schedules</h3>
            <p className="text-xs text-slate-400 mb-4">Campaign windows with duration tracking.</p>
            {schedules.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-400">No schedules yet.</div>
            ) : (
              <>
                {pagedSch.map(sch => {
                  const agent = agentById.get(sch.voiceAgentId);
                  const m = getCampaignMetrics(sch);
                  return (
                    <div key={sch.id} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 text-sm truncate">{sch.name || `Tag · ${sch.tag}`}</p>
                          <p className="text-xs text-slate-400">{agent?.name || "—"} · #{sch.tag}</p>
                          {(sch as any).startDate && <p className="text-[10px] text-slate-400">{(sch as any).startDate} → {(sch as any).endDate}</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => setEditingSchedule(sch)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-amber-300 hover:text-amber-700">Edit</button>
                          <button onClick={() => void withBusy(`del-${sch.id}`, async () => { await api.deleteLeadSchedule(sch.id); await refreshSchedules(); showMsg("Deleted."); })}
                            disabled={busy === `del-${sch.id}`}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-red-200 hover:text-red-500 disabled:opacity-40">Del</button>
                        </div>
                      </div>
                      {m.total > 0 && (
                        <>
                          <div className="flex justify-between text-[10px] font-black mb-1">
                            {m.isComplete ? <span className="text-emerald-600">✓ Complete — edit to restart</span>
                              : <span className="text-slate-500">{m.completed} of {m.total} reached</span>}
                            <span className="text-slate-400">{m.remaining} left</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${m.pct}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <Pager cur={schPage} total={totalSchPages} onChange={setSchPage} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Per-lead detail */}
      {activeLead && (
        <AppModal open onClose={() => setActiveLead(null)} title={activeLead.name}
          description={`Added ${new Date(activeLead.createdAt).toLocaleDateString()}`} size="lg"
          footer={<div className="flex gap-3">
            <button onClick={() => setActiveLead(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Close</button>
            <button onClick={() => void cycleStatus(activeLead)} className={`flex-1 rounded-xl border py-3 text-sm font-black ${STATUS_STYLES[activeLead.status]}`}>
              {activeLead.status} → cycle
            </button>
            <button onClick={() => { setDeleteTarget({ ids: [activeLead.id], label: activeLead.name }); setActiveLead(null); }}
              className="rounded-xl border border-red-100 px-5 py-3 text-sm font-black text-red-500 hover:bg-red-50">Delete</button>
          </div>}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[activeLead.status]}`}>{activeLead.status}</span>
              {activeLead.voiceAgentId && agentById.get(activeLead.voiceAgentId) && (
                <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  {agentById.get(activeLead.voiceAgentId)!.name}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p><p className="text-sm font-black text-slate-900">{activeLead.phone || "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Email</p><p className="text-sm font-black text-slate-900 truncate">{activeLead.email || "—"}</p></div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {(activeLead.tags || []).length > 0
                  ? (activeLead.tags || []).map(t => <span key={t} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">#{t}</span>)
                  : <span className="text-xs text-slate-400">No tags yet</span>}
              </div>
            </div>
            {activeLead.reason && <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Reason</p><p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{activeLead.reason}</p></div>}
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Quick Tag</p>
              <div className="flex gap-2">
                <input id="qtag" placeholder="vip, webinar…" className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-amber-300" />
                <button onClick={async () => {
                  const el = document.getElementById("qtag") as HTMLInputElement;
                  const tags = normTags(el.value); if (!tags.length) return;
                  const next = [...new Set([...(activeLead.tags || []), ...tags])];
                  oPatch(activeLead.id, { tags: next }); setActiveLead(l => l ? { ...l, tags: next } : l); el.value = "";
                  try { await api.bulkTagLeads([activeLead.id], tags, "add"); showMsg("Tags added."); }
                  catch { showMsg("Tag failed.", false); }
                }} className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600">Add</button>
              </div>
            </div>
          </div>
        </AppModal>
      )}

      {/* Add lead */}
      <AppModal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add lead" description="Create a lead manually." size="lg"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" form="lead-form" disabled={busy === "create"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">{busy === "create" ? "Saving…" : "Create lead"}</button>
        </div>}>
        <form id="lead-form" onSubmit={createLead} className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Full name *</label><input value={leadForm.name} onChange={e => setLeadForm(c => ({ ...c, name: e.target.value }))} className={iCls} required /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</label><input value={leadForm.phone} onChange={e => setLeadForm(c => ({ ...c, phone: e.target.value }))} className={iCls} /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label><input type="email" value={leadForm.email} onChange={e => setLeadForm(c => ({ ...c, email: e.target.value }))} className={iCls} /></div>
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags</label><input value={leadForm.tags} onChange={e => setLeadForm(c => ({ ...c, tags: e.target.value }))} className={iCls} placeholder="vip, webinar" /></div>
          <div className="sm:col-span-2"><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Reason</label><textarea value={leadForm.reason} onChange={e => setLeadForm(c => ({ ...c, reason: e.target.value }))} className={`${iCls} min-h-[80px]`} /></div>
        </form>
      </AppModal>

      {/* Import CSV */}
      <AppModal open={showImportModal} onClose={() => setShowImportModal(false)} title="Import leads" description="name, phone, email, reason, tags columns." size="xl"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowImportModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void importCsv()} disabled={busy === "import"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">{busy === "import" ? "Importing…" : "Import"}</button>
        </div>}>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-900">Upload CSV file</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result || "")); r.readAsText(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-slate-300">Choose file</button>
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} className={`${iCls} min-h-[220px] font-mono text-xs`} placeholder={"name,phone,email,reason,tags\nJane,+1555…,jane@…,Pricing,vip|demo"} />
        </div>
      </AppModal>

      {/* Tag modal with remove dropdown */}
      <AppModal open={showTagModal} onClose={() => setShowTagModal(false)} title="Tag leads"
        description={`${selIds.length} lead${selIds.length !== 1 ? "s" : ""} selected.`} size="md"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setShowTagModal(false)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void applyTags()} disabled={busy === "bulk-tags"} className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50">{busy === "bulk-tags" ? "Saving…" : "Apply tags"}</button>
        </div>}>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Action</label>
            <select value={tagForm.action} onChange={e => setTagForm(c => ({ ...c, action: e.target.value as TagAction, tags: "", removeList: [] }))} className={iCls}>
              <option value="add">Add tags</option>
              <option value="remove">Remove tags</option>
              <option value="set">Replace all tags</option>
            </select></div>
          {tagForm.action === "remove" ? (
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Select tags to remove</label>
              {allTags.length === 0 ? <p className="text-xs text-slate-400">No tags found.</p> : (
                <div className="flex flex-wrap gap-2">
                  {allTags.map(tag => {
                    const sel = tagForm.removeList.includes(tag);
                    return (
                      <button key={tag} type="button"
                        onClick={() => setTagForm(c => ({ ...c, removeList: sel ? c.removeList.filter(t => t !== tag) : [...c.removeList, tag] }))}
                        className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all
                          ${sel ? "border-red-400 bg-red-50 text-red-600" : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-500"}`}>
                        #{tag} {sel && "✕"}
                      </button>
                    );
                  })}
                </div>
              )}
              {tagForm.removeList.length > 0 && <p className="mt-2 text-xs text-slate-500">Will remove: {tagForm.removeList.map(t => `#${t}`).join(", ")}</p>}
            </div>
          ) : (
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tags (comma separated)</label>
              <input value={tagForm.tags} onChange={e => setTagForm(c => ({ ...c, tags: e.target.value }))} className={iCls} placeholder="vip, webinar, renewal" autoFocus /></div>
          )}
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">{selIds.length} leads affected.</p>
        </div>
      </AppModal>

      {/* Delete confirmation */}
      <AppModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete leads" description="This cannot be undone." size="md"
        footer={<div className="flex gap-3">
          <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleDelete()} disabled={busy === "delete"} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">{busy === "delete" ? "Deleting…" : "Yes, delete permanently"}</button>
        </div>}>
        <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          Permanently deleting <strong>{deleteTarget?.label}</strong>. This cannot be recovered.
        </div>
      </AppModal>

      {/* ═══ CREATE SCHEDULE MODAL ═══ */}
      <AppModal open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} title="Create outreach schedule"
        description={scheduleTarget?.label || ""} size="xl"
        footer={
          <div className="space-y-3">
            {/* Save disabled + message when no end date */}
            {schedEndDateMissing && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs font-medium text-amber-700 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                Select a campaign end date to enable saving — campaigns cannot run indefinitely.
              </div>
            )}
            {schedValidErr && !schedEndDateMissing && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs font-medium text-red-600">{schedValidErr}</div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setScheduleTarget(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void saveSchedule()}
                disabled={busy === "schedule" || schedEndDateMissing || !!schedValidErr}
                className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {busy === "schedule" ? "Saving…" : schedEndDateMissing ? "Select end date to save" : "Save schedule"}
              </button>
            </div>
          </div>
        }>
        <div className="space-y-5">
          {scheduleForm.dateError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{scheduleForm.dateError}</div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule name</label>
              <input value={scheduleForm.name} onChange={e => setScheduleForm(c => ({ ...c, name: e.target.value }))} className={iCls} placeholder="VIP nurture" />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                Outbound agent {outboundAgents.length === 0 && <span className="text-red-400 normal-case font-normal tracking-normal ml-1">(none found)</span>}
              </label>
              <select value={scheduleForm.voiceAgentId} onChange={e => setScheduleForm(c => ({ ...c, voiceAgentId: e.target.value }))} className={iCls}>
                <option value="">Choose outbound agent</option>
                {outboundAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {outboundAgents.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">Create an outbound agent in Agent Settings first.</p>
              )}
            </div>
          </div>

          <WindowsEditor
            windows={scheduleForm.windows}
            onToggle={toggleSDay}
            onTime={(i, t) => updateSWindow(i, { time: t })}
            onAdd={() => setScheduleForm(c => ({ ...c, windows: [...c.windows, emptyWindow()] }))}
            onRemove={i => setScheduleForm(c => ({ ...c, windows: c.windows.filter((_, j) => j !== i) }))}
          />

          {/* Campaign duration — styled amber box */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Campaign Duration</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DateInput label="Start date" value={scheduleForm.startDate} min={todayStr()} required
                hint="Auto-set to first matching day"
                onChange={v => setScheduleForm(c => ({ ...c, startDate: v, dateError: "" }))} />
              <DateInput label="End date" value={scheduleForm.endDate} min={scheduleForm.startDate || todayStr()} required
                hint={schedEndDateMissing ? "⚠ Required — select an end date" : ""}
                onChange={v => setScheduleForm(c => ({ ...c, endDate: v, dateError: "" }))} />
            </div>
            {scheduleForm.startDate && scheduleForm.endDate && scheduleForm.endDate > scheduleForm.startDate && (
              <div className="rounded-xl bg-white border border-amber-100 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0" />
                {countOccurrences(scheduleForm.startDate, scheduleForm.endDate, scheduleForm.windows.flatMap(w => w.weekdays))} call sessions planned · ends {scheduleForm.endDate}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Timezone</label>
            <select value={scheduleForm.timezone} onChange={e => setScheduleForm(c => ({ ...c, timezone: e.target.value }))} className={iCls}>
              {[scheduleForm.timezone, ...TIMEZONES.filter(t => t !== scheduleForm.timezone)].map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Extra context for agent</label>
            <input value={scheduleForm.extraContext} onChange={e => setScheduleForm(c => ({ ...c, extraContext: e.target.value }))} className={iCls} placeholder="Mention their recent enquiry…" />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={scheduleForm.syncExistingLeads} onChange={e => setScheduleForm(c => ({ ...c, syncExistingLeads: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
            Also assign this agent to existing leads with this tag
          </label>
        </div>
      </AppModal>

      {/* Edit schedule */}
      {editingSchedule && (
        <AppModal open onClose={() => setEditingSchedule(null)} title="Edit schedule" description={editingSchedule.name || ""} size="xl"
          footer={<div className="flex gap-3">
            <button type="button" onClick={() => setEditingSchedule(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void saveEditedSchedule()} disabled={busy === "edit-sch" || !(editingSchedule as any).endDate}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">
              {busy === "edit-sch" ? "Saving…" : !(editingSchedule as any).endDate ? "Select end date to save" : "Save changes"}
            </button>
          </div>}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Name</label><input value={editingSchedule.name} onChange={e => setEditingSchedule(c => c ? { ...c, name: e.target.value } : c)} className={iCls} /></div>
              <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Outbound agent</label>
                <select value={editingSchedule.voiceAgentId} onChange={e => setEditingSchedule(c => c ? { ...c, voiceAgentId: e.target.value } : c)} className={iCls}>
                  <option value="">Choose</option>
                  {outboundAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></div>
            </div>
            <WindowsEditor
              windows={editingSchedule.windows}
              onToggle={toggleEDay}
              onTime={(i, t) => updateEWindow(i, { time: t })}
              onAdd={() => setEditingSchedule(c => c ? { ...c, windows: [...c.windows, emptyWindow()] } : c)}
              onRemove={i => setEditingSchedule(c => c ? { ...c, windows: c.windows.filter((_, j) => j !== i) } : c)}
            />
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-4">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">Campaign Duration</p>
              <div className="grid grid-cols-2 gap-4">
                <DateInput label="Start date" value={(editingSchedule as any).startDate || ""} min={todayStr()} required
                  onChange={v => setEditingSchedule(c => c ? { ...c, startDate: v } as any : c)} />
                <DateInput label="End date *" value={(editingSchedule as any).endDate || ""} min={(editingSchedule as any).startDate || todayStr()} required
                  hint={!(editingSchedule as any).endDate ? "⚠ Required" : ""}
                  onChange={v => setEditingSchedule(c => c ? { ...c, endDate: v } as any : c)} />
              </div>
            </div>
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Timezone</label>
              <select value={editingSchedule.timezone} onChange={e => setEditingSchedule(c => c ? { ...c, timezone: e.target.value } : c)} className={iCls}>
                {[editingSchedule.timezone, ...TIMEZONES.filter(t => t !== editingSchedule.timezone)].map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select></div>
            <div><label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">Extra context</label><input value={editingSchedule.extraContext} onChange={e => setEditingSchedule(c => c ? { ...c, extraContext: e.target.value } : c)} className={iCls} /></div>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <input type="checkbox" checked={editingSchedule.isActive} onChange={e => setEditingSchedule(c => c ? { ...c, isActive: e.target.checked } : c)} className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
              Schedule is active
            </label>
          </div>
        </AppModal>
      )}
    </div>
  );
};

export default Leads;
