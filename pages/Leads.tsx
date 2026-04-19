import React, { useState, useRef } from "react";
import { Lead } from "../types";
import { api } from "../services/api";

interface LeadsProps {
  leads: Lead[];
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => Promise<void>;
  onCreateLead: (
    payload: Pick<Lead, "name" | "email" | "phone" | "reason">,
  ) => Promise<void>;
  onExport: () => Promise<void>;
  org?: any; // for voice agents list
  onRefresh?: () => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-600",
  contacted: "bg-amber-50 text-amber-600",
  closed: "bg-emerald-50 text-emerald-600",
};
const STATUS_CYCLE: Record<string, Lead["status"]> = {
  new: "contacted",
  contacted: "closed",
  closed: "new",
};

const Leads: React.FC<LeadsProps> = ({
  leads,
  onUpdateLead,
  onCreateLead,
  onExport,
  org,
  onRefresh,
}) => {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    reason: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // Tagging state
  const [tagInput, setTagInput] = useState("");
  const [tagAction, setTagAction] = useState<"add" | "remove" | "set">("add");

  // Agent assignment state
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const filtered = leads.filter((l) => {
    const matchSearch =
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toast = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccess(msg);
    setTimeout(() => {
      setError("");
      setSuccess("");
    }, 3000);
  };

  const toggleStatus = async (lead: Lead) => {
    setSaving(true);
    try {
      await onUpdateLead(lead.id, { status: STATUS_CYCLE[lead.status] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreateLead(form);
      setForm({ name: "", email: "", phone: "", reason: "" });
      setShowAdd(false);
      toast("Lead created");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkStatus = async (status: Lead["status"]) => {
    if (!selected.size) return;
    setSaving(true);
    try {
      await Promise.all(
        [...selected].map((id) => onUpdateLead(id, { status })),
      );
      setSelected(new Set());
      toast(`${selected.size} leads updated`);
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast("Bulk update failed", true);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkTag = async () => {
    if (!selected.size) return;
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      toast("Enter at least one tag", true);
      return;
    }
    setSaving(true);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const res = await fetch(`${base}/api/leads/bulk/tags`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: [...selected], tags, action: tagAction }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error?.message || "Failed");
      toast(
        `Tags ${tagAction === "add" ? "added to" : tagAction === "remove" ? "removed from" : "set for"} ${selected.size} leads`,
      );
      setSelected(new Set());
      setShowTagModal(false);
      setTagInput("");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Tag update failed", true);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAssignAgent = async () => {
    if (!selected.size) return;
    if (!selectedAgentId) {
      toast("Please select an agent", true);
      return;
    }
    setSaving(true);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const res = await fetch(`${base}/api/leads/bulk/assign-agent`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: [...selected],
          voiceAgentId: selectedAgentId,
        }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error?.message || "Failed");
      toast(`Assigned agent to ${selected.size} leads`);
      setSelected(new Set());
      setShowAgentModal(false);
      setSelectedAgentId("");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Assignment failed", true);
    } finally {
      setSaving(false);
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) || "");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast("Please paste or upload CSV data", true);
      return;
    }
    setImporting(true);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
      const token =
        localStorage.getItem("agently.auth.token") ||
        sessionStorage.getItem("agently.auth.token") ||
        "";
      const r = await fetch(`${base}/api/leads/import-csv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ csv: csvText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Import failed");
      toast(`✓ Imported ${d.imported} leads`);
      setShowImport(false);
      setCsvText("");
      if (onRefresh) await onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", true);
    } finally {
      setImporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const inp =
    "w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 transition-all";

  return (
    <div className="space-y-5 animate-fade-up">
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Lead CRM</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {leads.length} total leads captured
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <>
              <button
                onClick={() => void handleBulkStatus("contacted")}
                className="rounded-xl bg-amber-500 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
              >
                Mark Contacted ({selected.size})
              </button>
              <button
                onClick={() => void handleBulkStatus("closed")}
                className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
              >
                Mark Closed ({selected.size})
              </button>
              <button
                onClick={() => setShowTagModal(true)}
                className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all"
              >
                <i className="fa-sharp fa-solid fa-tag mr-1" /> Tag (
                {selected.size})
              </button>
              <button
                onClick={() => setShowAgentModal(true)}
                className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all"
              >
                <i className="fa-sharp fa-solid fa-user-tie mr-1" /> Assign
                Agent ({selected.size})
              </button>
            </>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all flex items-center gap-1.5"
          >
            <i className="fa-sharp fa-solid fa-file-import" /> Import CSV
          </button>
          <button
            onClick={() => void onExport()}
            className="rounded-xl border border-slate-200 text-slate-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all flex items-center gap-1.5"
          >
            <i className="fa-sharp fa-solid fa-file-export" /> Export
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-slate-900 text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center gap-1.5"
          >
            <i className="fa-sharp fa-solid fa-plus" /> Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <i className="fa-sharp fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
              <tr>
                <th className="px-5 py-4">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={
                      selected.size === filtered.length && filtered.length > 0
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(filtered.map((l) => l.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className="px-5 py-4">Lead</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Inquiry</th>
                <th className="px-5 py-4">Tags</th>
                <th className="px-5 py-4">Captured</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-16 text-center text-slate-400 text-sm"
                  >
                    {leads.length === 0
                      ? "No leads yet — they appear here after AI calls capture them."
                      : "No leads match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                          {lead.name[0]?.toUpperCase()}
                        </div>
                        <p className="font-bold text-slate-900 text-sm">
                          {lead.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-600">{lead.phone}</p>
                      <p className="text-xs text-slate-400">{lead.email}</p>
                    </td>
                    <td className="px-5 py-4 max-w-[200px]">
                      <p className="text-xs text-slate-500 truncate">
                        {lead.reason || "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(lead as any).tags &&
                        Array.isArray((lead as any).tags) ? (
                          (lead as any).tags.slice(0, 2).map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] text-slate-300">—</span>
                        )}
                        {(lead as any).tags &&
                          (lead as any).tags.length > 2 && (
                            <span className="text-[9px] text-slate-300">
                              +{(lead as any).tags.length - 2}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[lead.status]}`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => void toggleStatus(lead)}
                        disabled={saving}
                        className="text-[10px] font-black text-slate-500 bg-slate-100 hover:bg-amber-100 hover:text-amber-700 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all uppercase tracking-wider"
                      >
                        → {STATUS_CYCLE[lead.status]}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Lead Modal - Correctly positioned */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAdd(false);
          }}
        >
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900">Add Lead</h3>
              <button
                onClick={() => setShowAdd(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
              >
                <i className="fa-sharp fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                required
                placeholder="Full name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className={inp}
              />
              <input
                placeholder="Phone number"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className={inp}
              />
              <input
                placeholder="Email address"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className={inp}
              />
              <textarea
                rows={3}
                placeholder="Reason / inquiry"
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                className={inp + " resize-none"}
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  {saving ? "Saving…" : "Create Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal - Correctly positioned */}
      {showImport && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowImport(false);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-slate-900">
                Import Leads from CSV
              </h3>
              <button
                onClick={() => setShowImport(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
              >
                <i className="fa-sharp fa-solid fa-xmark" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-500 mb-4">
              CSV must include columns:{" "}
              <code className="font-mono font-bold">
                name, phone, email, reason
              </code>{" "}
              (any order, case-insensitive). Optional <code>tags</code> column
              with pipe-separated values.
            </div>
            <div
              className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center mb-4 cursor-pointer hover:border-amber-300 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <i className="fa-sharp fa-solid fa-cloud-arrow-up text-2xl text-slate-300 mb-2 block" />
              <p className="text-sm font-bold text-slate-500">
                Click to upload CSV file
              </p>
              <p className="text-xs text-slate-400">or paste CSV text below</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvFile}
              />
            </div>
            <textarea
              rows={6}
              placeholder="Or paste CSV content here..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-mono outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowImport(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !csvText.trim()}
                className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                {importing ? (
                  <>
                    <i className="fa-sharp fa-solid fa-spinner fa-spin mr-2" />
                    Importing…
                  </>
                ) : (
                  "Import Leads"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tagging Modal - Correctly positioned */}
      {showTagModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTagModal(false);
          }}
        >
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-slate-900">
                Tag Selected Leads
              </h3>
              <button
                onClick={() => setShowTagModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
              >
                <i className="fa-sharp fa-solid fa-xmark" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Tags (comma‑separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. vip, webinar, demo-request"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Action
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setTagAction("add")}
                    className={`flex-1 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${tagAction === "add" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-500 hover:border-amber-300"}`}
                  >
                    Add Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagAction("remove")}
                    className={`flex-1 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${tagAction === "remove" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-500 hover:border-amber-300"}`}
                  >
                    Remove Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagAction("set")}
                    className={`flex-1 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${tagAction === "set" ? "bg-amber-500 text-white border-amber-500" : "border-slate-200 text-slate-500 hover:border-amber-300"}`}
                  >
                    Replace All
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowTagModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkTag}
                  disabled={saving || !tagInput.trim()}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  {saving ? "Applying…" : "Apply to Selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Agent Modal - Correctly positioned */}
      {showAgentModal && org && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAgentModal(false);
          }}
        >
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-slate-900">
                Assign Agent to Selected Leads
              </h3>
              <button
                onClick={() => setShowAgentModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
              >
                <i className="fa-sharp fa-solid fa-xmark" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  Select Voice Agent
                </label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">-- Choose agent --</option>
                  {org.voiceAgents?.map((agent: any) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.direction})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAgentModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAssignAgent}
                  disabled={saving || !selectedAgentId}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  {saving ? "Assigning…" : "Assign to Selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
