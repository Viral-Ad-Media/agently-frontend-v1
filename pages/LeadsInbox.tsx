import { useEffect, useMemo, useRef, useState } from "react";
import SmsComposeModal from '../components/SmsComposeModal';
import { useFeatureFlag } from '../lib/featureFlags';
import { Link } from "react-router-dom";
import type { Lead } from "../types";
import LeadMediaGallery from "../components/LeadMediaGallery";
import LeadInsights from "../components/LeadInsights";
import EmailComposeModal from "../components/EmailComposeModal";

/**
 * LeadsInbox — the real Agently Leads page, rebuilt Pipedrive-style.
 *
 * Same component contract as the old pages/Leads.tsx, so App.tsx can swap
 * it in directly:
 *   <LeadsInbox leads onUpdateLead onCreateLead onDeleteLead
 *               onBulkDeleteLeads onExport onRefresh />
 *
 * Two zones:
 *   1. Inbox — unqualified leads (crmStage empty/new/contacted, not closed).
 *   2. Pipeline — qualified opportunities through won/lost, shown as a kanban.
 *
 * Conventions:
 *   - "Archive" maps to status='closed' (the app's terminal state); the
 *     Archive toggle shows closed leads.
 *   - "Convert to deal" sets crmStage='qualified', moving the lead from the
 *     inbox into the pipeline.
 *   - Drawer evidence and activity use the existing CRM endpoints.
 */

interface LeadsInboxProps {
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
  onDeleteLead: (leadId: string) => Promise<void>;
  onBulkDeleteLeads: (leadIds: string[]) => Promise<void>;
  onImportCsv: (csv: string) => Promise<void>;
  onExport: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

/* --------------------------------- helpers --------------------------------- */

const INBOX_STAGES = new Set(["", "new", "contacted"]);
const STAGES = [
  { key: "new", label: "New", probability: 10 },
  { key: "contacted", label: "Contacted", probability: 25 },
  { key: "qualified", label: "Qualified", probability: 50 },
  { key: "appointment_set", label: "Appointment set", probability: 65 },
  { key: "proposal_sent", label: "Proposal sent", probability: 80 },
  { key: "won", label: "Won", probability: 100 },
  { key: "lost", label: "Lost", probability: 0 },
];
const PIPELINE_STAGES = STAGES.filter(
  (stage) => !INBOX_STAGES.has(stage.key),
);

const TAG_PALETTE = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#BE185D", "#4D7C0F"];
const tagColor = (tag: string) => {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
};

const fmtMoney = (cents?: number | null, currency = "USD") =>
  cents && cents > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100)
    : "—";

const leadTitle = (l: Lead) => l.reason || l.name || "Untitled lead";

const tempStyles: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-slate-100 text-slate-500",
};

const scoreStyles = (s?: number) =>
  s == null ? "bg-slate-100 text-slate-400"
  : s >= 80 ? "bg-emerald-100 text-emerald-700"
  : s >= 50 ? "bg-amber-100 text-amber-700"
  : "bg-slate-100 text-slate-500";

function TagPill({ tag }: { tag: string }) {
  const color = tagColor(tag);
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: `${color}1a`, color }}
      title={tag}
    >
      <span className="truncate">{tag}</span>
    </span>
  );
}

function CompactTags({ tags = [] }: { tags?: string[] }) {
  if (!tags.length) return <span className="text-xs text-slate-300">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle" title={tags.join(", ")}>
      <span className="min-w-0 max-w-[92px]"><TagPill tag={tags[0]} /></span>
      {tags.length > 1 && (
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          +{tags.length - 1}
        </span>
      )}
    </span>
  );
}

const toolbarButton = "inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50";

/* ------------------------------ main component ----------------------------- */

type View = "inbox" | "pipeline";
type SortKey = "title" | "value" | "created" | "score";

export default function LeadsInbox(props: LeadsInboxProps) {
  const { leads } = props;
  const [view, setView] = useState<View>("inbox");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [emailLead, setEmailLead] = useState<Lead | null>(null);
  const [smsLead, setSmsLead] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const inboxTopRef = useRef<HTMLDivElement | null>(null);

  const activeLead = leads.find((l) => l.id === activeId) ?? null;

  const allTags = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => (l.tags ?? []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [leads]);

  const inboxLeads = useMemo(() => {
    let rows = leads.filter((l) =>
      showArchived ? l.status === "closed" : l.status !== "closed" && INBOX_STAGES.has(l.crmStage ?? ""),
    );
    if (tagFilter === "hot" || tagFilter === "warm" || tagFilter === "cold") {
      rows = rows.filter((l) => l.leadTemperature === tagFilter);
    } else if (tagFilter !== "all") {
      rows = rows.filter((l) => (l.tags ?? []).includes(tagFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        [leadTitle(l), l.name, l.email, l.phone, l.source].some((f) => f?.toLowerCase().includes(q)),
      );
    }
    const val = (l: Lead): string | number => {
      switch (sortKey) {
        case "title": return leadTitle(l).toLowerCase();
        case "value": return l.estimatedValueCents ?? 0;
        case "score": return l.aiScore ?? -1;
        default: return l.createdAt ?? "";
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "string") return sortDir * av.localeCompare(String(bv));
      return sortDir * (Number(av) - Number(bv));
    });
  }, [leads, showArchived, tagFilter, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(inboxLeads.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedLeads = inboxLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, tagFilter, showArchived, view, sortKey, sortDir, pageSize]);

  useEffect(() => {
    setPage((previous) => Math.min(previous, pageCount));
  }, [pageCount]);

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    inboxTopRef.current?.scrollIntoView({ block: "start" });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(-1); }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const bulkArchive = () =>
    run(async () => {
      for (const id of selected) await props.onUpdateLead(id, { status: "closed" });
      setSelected(new Set());
      await props.onRefresh();
    });

  const bulkDelete = () =>
    run(async () => {
      await props.onBulkDeleteLeads([...selected]);
      setSelected(new Set());
    });

  return (
    <div ref={inboxTopRef} className="min-w-0 bg-slate-50 pb-6">
      {/* header */}
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black text-slate-900">Leads</h1>
          <div className="flex rounded-xl border border-slate-300 bg-slate-100/70 p-1 shadow-sm sm:ml-2">
            {(["inbox", "pipeline"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold capitalize transition ${view === v ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
              >
                {v === "inbox" ? "Inbox" : "Pipeline"}
              </button>
            ))}
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              aria-label="Search leads"
              className="h-9 min-w-[160px] flex-1 basis-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-orange-400 sm:max-w-xs sm:basis-40"
            />
            <button
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? "Back to inbox" : "Archived leads"}
              className={`${toolbarButton} ${showArchived ? "border-orange-300 bg-orange-50 text-orange-700" : ""}`}
            >
              {showArchived ? "← Inbox" : "Archive"}
            </button>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Filter by tags"
              className="h-9 w-36 shrink-0 truncate rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none"
            >
              <option value="all">All tags</option>
              <option value="hot">🔥 Hot</option>
              <option value="warm">🟡 Warm</option>
              <option value="cold">⚪ Cold</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Link
              to="/outreach"
              className={toolbarButton}
            >
              Outreach
            </Link>
            <button
              onClick={() => { setShowImport(true); setImportError(""); }}
              className={toolbarButton}
            >
              Import CSV
            </button>
            <button
              onClick={() => props.onExport()}
              title="Export to CSV"
              className={toolbarButton}
            >
              Export
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              + Lead
            </button>
          </div>
        </div>
      </div>

      {busy && (
        <div className="bg-orange-50 px-6 py-1 text-xs font-bold text-orange-600">Working…</div>
      )}

      {view === "inbox" ? (
        <InboxTable
          leads={pagedLeads}
          totalLeads={inboxLeads.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={changePage}
          onPageSizeChange={(size) => { setPageSize(size); changePage(1); }}
          selected={selected}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={() =>
            setSelected((prev) => {
              const next = new Set(prev);
              const pageSelected = pagedLeads.every((lead) => prev.has(lead.id));
              pagedLeads.forEach((lead) => pageSelected ? next.delete(lead.id) : next.add(lead.id));
              return next;
            })
          }
          onOpen={(l) => setActiveId(l.id)}
          onArchive={(id) => run(async () => { await props.onUpdateLead(id, { status: "closed" }); await props.onRefresh(); })}
          onUnarchive={(id) => run(async () => { await props.onUpdateLead(id, { status: "contacted" }); await props.onRefresh(); })}
          onDelete={(id) => run(async () => { await props.onDeleteLead(id); })}
          showArchived={showArchived}
        />
      ) : (
        <PipelineBoard
          leads={leads}
          onOpen={(lead) => setActiveId(lead.id)}
          onMove={(id, stage) => run(async () => { await props.onUpdateLead(id, { crmStage: stage }); await props.onRefresh(); })}
        />
      )}

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 shadow-2xl">
          <span className="px-2 text-sm font-black text-white">{selected.size} selected</span>
          <BulkBtn onClick={bulkArchive}>Archive</BulkBtn>
          <BulkBtn danger onClick={bulkDelete}>Delete</BulkBtn>
          <button onClick={() => setSelected(new Set())} className="px-2 text-sm font-bold text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {showAdd && (
        <AddLeadModal
          onClose={() => setShowAdd(false)}
          onAdd={async (payload) => { await run(async () => { await props.onCreateLead(payload); }); setShowAdd(false); }}
        />
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Import leads</h2>
                <p className="mt-1 text-xs text-slate-500">CSV columns: name, phone, email, reason, tags.</p>
              </div>
              <button onClick={() => setShowImport(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="mb-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCsvText(String(reader.result ?? ""));
                reader.onerror = () => setImportError("Could not read that CSV file.");
                reader.readAsText(file);
              }}
            />
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={8}
              placeholder={'name,phone,email,reason,tags\nAda Lovelace,+15551234567,ada@example.com,Website enquiry,hot'}
              className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs outline-none focus:border-orange-400"
            />
            {importError && <p className="mt-2 text-sm font-semibold text-red-600">{importError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowImport(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button
                disabled={!csvText.trim() || busy}
                onClick={() => run(async () => {
                  try {
                    await props.onImportCsv(csvText);
                    setCsvText("");
                    setShowImport(false);
                  } catch (error) {
                    setImportError(error instanceof Error ? error.message : "Import failed. Check the CSV and try again.");
                  }
                })}
                className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-white shadow hover:bg-orange-600 disabled:opacity-50"
              >
                {busy ? "Importing…" : "Import leads"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeLead && (
        <LeadDrawer
          key={activeLead.id}
          lead={activeLead}
          onClose={() => setActiveId(null)}
          onArchive={(id) => run(async () => { await props.onUpdateLead(id, { status: "closed" }); await props.onRefresh(); setActiveId(null); })}
          onDelete={(id) => run(async () => { await props.onDeleteLead(id); setActiveId(null); })}
          onConvert={(id) => run(async () => { await props.onUpdateLead(id, { crmStage: "qualified" }); await props.onRefresh(); setActiveId(null); setView("pipeline"); })}
          onEmail={(lead) => { setActiveId(null); setEmailLead(lead); }}
          onText={(lead) => { setActiveId(null); setSmsLead(lead); }}
          onChanged={props.onRefresh}
          onRename={async (id, title) => { await props.onUpdateLead(id, { reason: title }); await props.onRefresh(); }}
          onSaveContact={async (id, contact) => { await props.onUpdateLead(id, contact); await props.onRefresh(); }}
        />
      )}
      {smsLead && (
        <SmsComposeModal
          key={smsLead.id}
          open
          onClose={() => setSmsLead(null)}
          leadId={smsLead.id}
          phone={smsLead.phone || ""}
          recipientName={smsLead.name}
        />
      )}
      {emailLead && (
        <EmailComposeModal
          key={emailLead.id}
          open
          onClose={() => setEmailLead(null)}
          leadId={emailLead.id}
          defaultTo={emailLead.email || ""}
          recipientName={emailLead.name}
        />
      )}
    </div>
  );
}

function BulkBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm font-bold ${danger ? "bg-red-500/20 text-red-300 hover:bg-red-500/30" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- inbox table ------------------------------- */

interface PaginationProps {
  totalLeads: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function LeadPagination({ totalLeads, page, pageSize, onPageChange, onPageSizeChange, position }: PaginationProps & { position: "top" | "bottom" }) {
  const pages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((number) => number >= 1 && number <= pages)
    .sort((a, b) => a - b);
  const buttonClass = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalLeads)} of {totalLeads} leads</span>
        <label className="flex items-center gap-2">
          <span>Per page</span>
          <select
            aria-label={`Leads per page (${position})`}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
          >
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <nav aria-label={`Lead pagination (${position})`} className="flex items-center gap-1">
        <button className={buttonClass} disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">‹</button>
        {pageNumbers.map((number, index) => (
          <span key={number} className="inline-flex items-center gap-1">
            {index > 0 && number > pageNumbers[index - 1] + 1 && <span className="px-1 text-xs text-slate-400">…</span>}
            <button
              onClick={() => onPageChange(number)}
              aria-label={`Page ${number}`}
              aria-current={number === page ? "page" : undefined}
              className={`${buttonClass} ${number === page ? "border-orange-200 bg-orange-50 text-orange-700" : ""}`}
            >{number}</button>
          </span>
        ))}
        <button className={buttonClass} disabled={page === pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">›</button>
      </nav>
    </div>
  );
}

function InboxTable(props: {
  leads: Lead[];
  selected: Set<string>;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onToggleSort: (k: SortKey) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (l: Lead) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
} & PaginationProps) {
  const { leads, selected, sortKey, sortDir, onToggleSort } = props;

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-3 py-3 text-left">
      <button onClick={() => onToggleSort(k)} className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-slate-400 hover:text-slate-600">
        {label}
        {sortKey === k && <span className="text-orange-500">{sortDir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl">📥</div>
        <p className="text-lg font-black text-slate-700">No leads here yet</p>
        <p className="mt-1 max-w-sm text-sm text-slate-400">
          New leads from calls, the website, and imports land in this inbox. Add your first lead to start qualifying.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 px-4 pb-4 sm:px-6">
      <LeadPagination {...props} position="top" />
      <div className="space-y-3 lg:hidden">
        {leads.map((lead) => (
          <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => props.onToggleSelect(lead.id)}
                aria-label={`Select ${lead.name}`}
                className="mt-1 h-4 w-4 accent-orange-500"
              />
              <button onClick={() => props.onOpen(lead)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-bold text-slate-900">{leadTitle(lead)}</span>
                <span className="mt-0.5 block truncate text-sm text-slate-500">{lead.name}</span>
              </button>
              <RowMenu
                lead={lead}
                showArchived={props.showArchived}
                onArchive={() => props.onArchive(lead.id)}
                onUnarchive={() => props.onUnarchive(lead.id)}
                onDelete={() => props.onDelete(lead.id)}
              />
            </div>
            <button onClick={() => props.onOpen(lead)} className="mt-3 block w-full text-left">
              <div className="space-y-1 text-xs text-slate-500">
                {lead.email && <div className="truncate">{lead.email}</div>}
                {lead.phone && <div>{lead.phone}</div>}
              </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {lead.leadTemperature && lead.leadTemperature !== "unqualified" && (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${tempStyles[lead.leadTemperature] ?? "bg-slate-100 text-slate-500"}`}>
                    {lead.leadTemperature}
                  </span>
                )}
                {lead.needsHumanReview && <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-black uppercase text-purple-700">Review</span>}
                {!!lead.tags?.length && <CompactTags tags={lead.tags} />}
                {lead.aiScore != null && <span className={`ml-auto rounded-lg px-2 py-1 text-xs font-black ${scoreStyles(lead.aiScore)}`}>AI {lead.aiScore}</span>}
              </div>
              {lead.nextAction && (
                <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700">
                  Next: {lead.nextAction}{lead.nextActionDueAt ? ` · ${new Date(lead.nextActionDueAt).toLocaleDateString()}` : ""}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="truncate text-slate-400">{lead.source || "Manual"} · {(lead.createdAt ?? "").slice(0, 10)}</span>
                <span className="font-bold text-slate-800">{fmtMoney(lead.estimatedValueCents, lead.currency)}</span>
              </div>
            </button>
          </article>
        ))}
      </div>
      <div role="region" aria-label="Scrollable leads table" tabIndex={0} className="hidden max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
          <colgroup>
            {[4, 15, 18, 12, 8, 13, 8, 8, 9, 5].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all leads on this page"
                  checked={leads.length > 0 && leads.every((lead) => selected.has(lead.id))}
                  onChange={props.onToggleSelectAll}
                  className="h-4 w-4 accent-orange-500"
                />
              </th>
              <SortHeader label="Lead" k="title" />
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Contact</th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Next action</th>
              <SortHeader label="Value" k="value" />
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Tags</th>
              <SortHeader label="AI score" k="score" />
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Source</th>
              <SortHeader label="Created" k="created" />
              <th className="py-3 pl-2 pr-5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={`group border-b border-slate-100 transition hover:bg-orange-50/40 ${selected.has(lead.id) ? "bg-orange-50/60" : ""}`}
              >
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    aria-label={`Select ${lead.name}`}
                    onChange={() => props.onToggleSelect(lead.id)}
                    className="h-4 w-4 accent-orange-500"
                  />
                </td>
                <td className="cursor-pointer px-3 py-3" onClick={() => props.onOpen(lead)}>
                  <div title={leadTitle(lead)} className="truncate font-bold text-slate-900 hover:text-orange-600 hover:underline">{leadTitle(lead)}</div>
                  {lead.leadTemperature && lead.leadTemperature !== "unqualified" && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-px text-[10px] font-black uppercase ${tempStyles[lead.leadTemperature] ?? "bg-slate-100 text-slate-500"}`}>
                      {lead.leadTemperature}
                    </span>
                  )}
                  {lead.needsHumanReview && (
                    <span className="mt-1 ml-1 inline-block rounded-full bg-purple-100 px-2 py-px text-[10px] font-black uppercase text-purple-700">
                      review
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div title={lead.name} className="truncate font-semibold text-slate-700">{lead.name}</div>
                  {lead.email ? <div title={lead.email} className="truncate text-xs text-slate-400">{lead.email}</div> : null}
                  {lead.phone ? <div title={lead.phone} className="truncate text-xs text-slate-400">{lead.phone}</div> : null}
                </td>
                <td className="px-3 py-3">
                  {lead.nextAction ? (
                    <>
                      <div title={lead.nextAction} className="truncate text-xs font-semibold text-slate-700">{lead.nextAction}</div>
                      {lead.nextActionDueAt && <div className="mt-1 text-[11px] text-slate-400">{new Date(lead.nextActionDueAt).toLocaleDateString()}</div>}
                    </>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="truncate px-3 py-3 font-bold text-slate-800" title={fmtMoney(lead.estimatedValueCents, lead.currency)}>{fmtMoney(lead.estimatedValueCents, lead.currency)}</td>
                <td className="px-3 py-3">
                  <button onClick={() => props.onOpen(lead)} aria-label={`Show tags for ${lead.name}`} className="max-w-full text-left">
                    <CompactTags tags={lead.tags} />
                  </button>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex min-w-[44px] justify-center rounded-lg px-2 py-1 text-xs font-black ${scoreStyles(lead.aiScore)}`}>
                    {lead.aiScore ?? "—"}
                  </span>
                </td>
                <td title={lead.source} className="truncate px-3 py-3 text-xs text-slate-500">{lead.source || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{(lead.createdAt ?? "").slice(0, 10)}</td>
                <td className="py-3 pl-2 pr-5" onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    lead={lead}
                    showArchived={props.showArchived}
                    onArchive={() => props.onArchive(lead.id)}
                    onUnarchive={() => props.onUnarchive(lead.id)}
                    onDelete={() => props.onDelete(lead.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LeadPagination {...props} position="bottom" />
    </div>
  );
}

function RowMenu({ lead, showArchived, onArchive, onUnarchive, onDelete }: {
  lead: Lead; showArchived: boolean; onArchive: () => void; onUnarchive: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded-lg px-2 py-1 text-lg font-black text-slate-300 hover:bg-slate-100 hover:text-slate-600">⋯</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {showArchived
              ? <MenuItem label="Unarchive" onClick={() => { onUnarchive(); setOpen(false); }} />
              : <MenuItem label="Archive" onClick={() => { onArchive(); setOpen(false); }} />}
            <MenuItem label="Delete" danger onClick={() => { if (confirm(`Delete "${leadTitle(lead)}"?`)) onDelete(); setOpen(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`block w-full px-4 py-2 text-left text-sm font-semibold ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-50"}`}>
      {label}
    </button>
  );
}

/* ------------------------------ add lead modal ----------------------------- */

function AddLeadModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (p: Pick<Lead, "name" | "email" | "phone" | "reason"> & { tags?: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [tags, setTags] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      reason: reason.trim() || name.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">Add lead</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Lead title</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Website redesign — Acme Corp" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 …" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-400">Tags (comma separated)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hot, vip" className={inputCls} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-white shadow hover:bg-orange-600">Save lead</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- lead drawer ------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">{children}</h3>;
}

/**
 * The lead's title, editable in place. It is stored as the lead's `reason`;
 * clearing it falls back to the contact name, like everywhere else.
 */
function EditableLeadTitle({ lead, onRename }: { lead: Lead; onRename: (id: string, title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.reason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const next = value.trim();
    if (next === (lead.reason || "").trim()) { setEditing(false); return; }
    setSaving(true);
    setError("");
    try {
      await onRename(lead.id, next);
      setEditing(false);
    } catch {
      setError("Couldn't save the title. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(lead.reason || ""); setEditing(true); }}
        title="Edit title"
        className="group flex max-w-full items-center gap-2 rounded-lg text-left"
      >
        <h2 className="truncate text-lg font-black text-slate-900">{leadTitle(lead)}</h2>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-orange-500">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span className="sr-only">Edit title</span>
      </button>
    );
  }

  return (
    <div>
      <input
        autoFocus
        value={value}
        disabled={saving}
        maxLength={200}
        aria-label="Lead title"
        placeholder={lead.name || "Lead title"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
        }}
        onBlur={() => void save()}
        className="w-full min-w-[16rem] rounded-lg border border-orange-300 bg-white px-2 py-1 text-lg font-black text-slate-900 outline-none ring-2 ring-orange-100"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Contact details with an Edit mode. Calls and chats can mishear a name or a
 * number, and every follow-up uses these fields, so the owner can correct
 * them. Source, created date and the AI summary stay read-only: they record
 * what actually happened.
 */
function ContactSection({ lead, onSave }: {
  lead: Lead;
  onSave: (id: string, contact: { name: string; email: string; phone: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lead.name || "");
  const [email, setEmail] = useState(lead.email || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const start = () => {
    setName(lead.name || ""); setEmail(lead.email || ""); setPhone(lead.phone || "");
    setError(""); setEditing(true);
  };
  const save = async () => {
    const next = { name: name.trim(), email: email.trim(), phone: phone.trim() };
    if (!next.name) { setError("Add a name."); return; }
    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) { setError("That email doesn't look right."); return; }
    setSaving(true); setError("");
    try {
      await onSave(lead.id, next);
      setEditing(false);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Contact</SectionTitle>
        {!editing && (
          <button type="button" onClick={start} className="mb-2 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-orange-600">
            Edit
          </button>
        )}
      </div>
      {!editing ? (
        <>
          <p className="text-sm font-bold text-slate-800">{lead.name}</p>
          {lead.email && <p className="text-sm text-slate-500">{lead.email}</p>}
          {lead.phone && <p className="text-sm text-slate-500">{lead.phone}</p>}
        </>
      ) : (
        <div className="space-y-2">
          <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={input} autoFocus />
          <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
          <input aria-label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={input} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadDrawer({ lead, onClose, onArchive, onDelete, onConvert, onEmail, onText, onChanged, onRename, onSaveContact }: {
  lead: Lead;
  onSaveContact: (id: string, contact: { name: string; email: string; phone: string }) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
  onEmail: (lead: Lead) => void;
  onText: (lead: Lead) => void;
  onChanged: () => Promise<void>;
}) {
  const gmailFeatureOn = useFeatureFlag('gmail');
  const smsFeatureOn = useFeatureFlag('sms');
  useEffect(() => {
    const close = (event: KeyboardEvent) => {if (event.key === 'Escape') onClose();};
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="w-28 shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-700">{children}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40" />
      <div role="dialog" aria-modal="true" aria-label={`Lead details for ${lead.name}`} className="absolute right-0 top-0 flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0 flex-1">
            <EditableLeadTitle lead={lead} onRename={onRename} />
            <p className="text-xs text-slate-400">
              Created {(lead.createdAt ?? "").slice(0, 10)}{lead.source ? ` · ${lead.source}` : ""}{lead.crmStage ? ` · ${lead.crmStage}` : ""}
            </p>
          </div>
          <button aria-label="Close lead details" onClick={onClose} className="ml-auto rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {/* On wide screens the details column stands still and only the
            photos/videos column scrolls. On phones it is one column, so the
            whole panel scrolls as before. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:overflow-hidden">
          <div className="min-w-0 border-r border-slate-100 px-6 py-4 md:overflow-y-auto">
            <SectionTitle>Lead details</SectionTitle>
            <div className="divide-y divide-slate-100">
              <Field label="Tags">
                <span className="flex flex-wrap justify-end gap-1">
                  {(lead.tags ?? []).map((t) => <TagPill key={t} tag={t} />)}
                  {(lead.tags ?? []).length === 0 && <span className="text-slate-300">—</span>}
                </span>
              </Field>
              <Field label="Value">{fmtMoney(lead.estimatedValueCents, lead.currency)}</Field>
              <Field label="Status">{lead.status}</Field>
              <Field label="Stage">{lead.crmStage || "—"}</Field>
              <Field label="Source">{lead.source || "—"}</Field>
            </div>

            {lead.aiSummary && <div className="mt-4 rounded-xl bg-slate-50 p-4"><SectionTitle>Latest summary</SectionTitle><p className="text-sm text-slate-600">{lead.aiSummary}</p></div>}

            <ContactSection lead={lead} onSave={onSaveContact} />

            <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {lead.phone && smsFeatureOn && <button onClick={() => onText(lead)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Text lead</button>}
              {lead.email && gmailFeatureOn && <button onClick={() => onEmail(lead)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Email lead</button>}
              <button onClick={() => onArchive(lead.id)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Archive</button>
              <button onClick={() => onConvert(lead.id)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">Convert to deal →</button>
              <button onClick={() => { if (confirm(`Delete "${leadTitle(lead)}"?`)) onDelete(lead.id); }} className="rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50">Delete</button>
            </div>
          </div>

          <div className="min-w-0 bg-slate-50/60 px-6 py-4 md:overflow-y-auto md:overscroll-contain">
            <LeadMediaGallery leadId={lead.id} />
            <LeadInsights key={lead.id} lead={lead} onChanged={onChanged}/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ pipeline board ----------------------------- */

function PipelineBoard({ leads, onMove, onOpen }: { leads: Lead[]; onMove: (id: string, stage: string) => void; onOpen: (lead: Lead) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const staged = leads.filter(
    (l) => l.crmStage && !INBOX_STAGES.has(l.crmStage) && l.status !== "closed",
  );
  const total = staged.reduce((s, l) => s + (l.estimatedValueCents ?? 0), 0);
  const weighted = staged.reduce((s, l) => {
    const st = STAGES.find((x) => x.key === l.crmStage);
    return s + (l.estimatedValueCents ?? 0) * ((st?.probability ?? 0) / 100);
  }, 0);

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Sales pipeline</h2>
        <button
          onClick={() => setShowSummary((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-black text-slate-500 hover:bg-slate-300"
          title="Pipeline summary"
        >
          i
        </button>
        {showSummary && (
          <div className="flex gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
            <span><b className="font-black">{staged.length}</b> <span className="text-slate-400">deals</span></span>
            <span><b className="font-black">{fmtMoney(total)}</b> <span className="text-slate-400">total</span></span>
            <span><b className="font-black">{fmtMoney(Math.round(weighted))}</b> <span className="text-slate-400">weighted</span></span>
          </div>
        )}
        <p className="ml-auto text-xs text-slate-400">Drag cards between stages</p>
      </div>

      {staged.length === 0 && (
        <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
          Your deal pipeline is ready. Open a lead from Inbox and choose <span className="font-bold text-slate-700">Convert to deal</span> when it is qualified.
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const cards = staged.filter((l) => l.crmStage === stage.key);
          const stageTotal = cards.reduce((s, l) => s + (l.estimatedValueCents ?? 0), 0);
          const isWon = stage.key === "won";
          const isLost = stage.key === "lost";
          return (
            <div
              key={stage.key}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) onMove(dragId, stage.key);
                setDragId(null); setDragOver(null);
              }}
              className={`w-72 shrink-0 rounded-2xl p-3 transition ${dragOver === stage.key ? "bg-orange-100 ring-2 ring-orange-400" : isWon ? "bg-emerald-50" : isLost ? "bg-slate-100" : "bg-slate-100"}`}
            >
              <div className="mb-3 flex items-center justify-between px-1" title={`${fmtMoney(stageTotal)} in this stage`}>
                <span className={`text-sm font-black ${isWon ? "text-emerald-700" : isLost ? "text-slate-500" : "text-slate-700"}`}>{stage.label}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-500 shadow-sm">
                  {cards.length} · {fmtMoney(stageTotal)}
                </span>
              </div>
              <div className="space-y-2">
                {cards.map((lead) => (
                  <button
                    key={lead.id}
                    draggable
                    onClick={() => onOpen(lead)}
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    className={`block w-full cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:shadow-md active:cursor-grabbing ${dragId === lead.id ? "opacity-40" : ""}`}
                  >
                    <p className="text-sm font-bold text-slate-900">{leadTitle(lead)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{lead.name}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-black text-slate-800">{fmtMoney(lead.estimatedValueCents, lead.currency)}</span>
                      {lead.aiScore != null && (
                        <span className={`rounded-lg px-1.5 py-0.5 text-[10px] font-black ${scoreStyles(lead.aiScore)}`}>{lead.aiScore}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <CompactTags tags={lead.tags} />
                    </div>
                    {lead.nextAction && (
                      <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">◷ {lead.nextAction}</p>
                    )}
                  </button>
                ))}
                {cards.length === 0 && (
                  <p className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-300">Drop deals here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
