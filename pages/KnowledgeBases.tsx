import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AgentConfig,
  ChatbotConfig,
  KnowledgeBase,
  KnowledgeSource,
  Organization,
} from "../types";
import { api, ApiError } from "../services/api";

interface KnowledgeBasesProps {
  org: Organization;
  initialKnowledgeBases?: KnowledgeBase[];
  onChanged?: () => void | Promise<void>;
}

type ToastState = { type: "success" | "error"; text: string } | null;
type SyncNotice = {
  id: string;
  status: "running" | "success" | "error";
  title: string;
  text: string;
} | null;
type DeleteCheck = {
  knowledgeBase: KnowledgeBase;
  canDelete: boolean;
  blockerCount: number;
  blockers: {
    voiceAgents: Array<{ id: string; name: string; assignmentType?: string }>;
    chatbots: Array<{ id: string; name: string; assignmentType?: string }>;
  };
  cleanup: { sources: number; chunks: number; products: number; faqs: number };
};
type DeleteModalState = {
  knowledgeBase: KnowledgeBase;
  checking: boolean;
  deleting: boolean;
  check: DeleteCheck | null;
  error: string;
} | null;

const emptyCreateForm = {
  name: "",
  website: "",
  industry: "",
  description: "",
};

const KB_INDUSTRIES = [
  "Accounting & Bookkeeping",
  "Architecture",
  "Auto Repair & Mechanic",
  "Barbershop & Hair Salon",
  "Beauty & Wellness",
  "Cleaning Services",
  "Construction & Contracting",
  "Consulting",
  "Dental Practice",
  "E-commerce",
  "Education & Tutoring",
  "Electrical Services",
  "Event Planning",
  "Financial Services",
  "Fitness & Gym",
  "Food & Restaurant",
  "Freight & Logistics",
  "Healthcare & Medical",
  "Home Services",
  "Hotel & Hospitality",
  "Insurance",
  "IT & Technology",
  "Legal / Law Firm",
  "Manufacturing",
  "Marketing Agency",
  "Non-Profit",
  "Real Estate",
  "Retail",
  "SaaS / Software",
  "Transportation",
  "Travel Agency",
  "Other",
];

const normalizeInputUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const getSourceDomain = (
  source:
    | Pick<KnowledgeBase, "domain" | "primaryUrl">
    | Pick<KnowledgeSource, "domain" | "url" | "normalizedUrl">,
) => {
  const explicit = String((source as { domain?: unknown }).domain || "").trim();
  if (explicit) return explicit.replace(/^www\./i, "");
  const raw = String(
    (source as { primaryUrl?: unknown; url?: unknown; normalizedUrl?: unknown })
      .primaryUrl ||
      (source as { url?: unknown }).url ||
      (source as { normalizedUrl?: unknown }).normalizedUrl ||
      "",
  );
  try {
    return new URL(normalizeInputUrl(raw)).hostname.replace(/^www\./i, "");
  } catch {
    return (
      raw
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0] || "Unknown source"
    );
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const statusTone = (status?: string) => {
  const value = String(status || "pending").toLowerCase();
  if (["completed", "active", "synced"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }
  if (["failed", "error"].includes(value)) {
    return "bg-red-50 text-red-700 ring-red-100";
  }
  if (["scraping", "syncing", "pending"].includes(value)) {
    return "bg-amber-50 text-amber-700 ring-amber-100";
  }
  return "bg-slate-50 text-slate-600 ring-slate-100";
};

type ScrapeProgressPage = {
  url?: string;
  title?: string;
  status?:
    | "queued"
    | "fetching"
    | "processing"
    | "completed"
    | "failed"
    | string;
  percent?: number;
  error?: string;
};

type ScrapeProgress = {
  phase?: string;
  currentUrl?: string | null;
  pagesDetected?: number;
  pagesCompleted?: number;
  pagesFailed?: number;
  overallPercent?: number;
  pages?: ScrapeProgressPage[];
  updatedAt?: string;
};

const getScrapeProgress = (
  source?: KnowledgeSource | null,
): ScrapeProgress | null => {
  const metadata = source?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const progress = (metadata as { scrapeProgress?: unknown }).scrapeProgress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress))
    return null;
  return progress as ScrapeProgress;
};

type ScrapeReport = {
  coveragePercent?: number;
  pagesAttempted?: number;
  pagesScraped?: number;
  pagesFailed?: number;
  pagesDiscovered?: number;
  chunksStored?: number;
  productsFound?: number;
  productsStored?: number;
  failedPages?: Array<{ url?: string; reason?: string }>;
  warnings?: Array<{ url?: string; reason?: string }>;
  suggestedActions?: string[];
  usable?: boolean;
};

const getScrapeReport = (
  source?: KnowledgeSource | null,
): ScrapeReport | null => {
  const metadata = source?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const report = (metadata as { scrapeReport?: unknown }).scrapeReport;
  if (!report || typeof report !== "object" || Array.isArray(report))
    return null;
  return report as ScrapeReport;
};

const reportSummary = (source: KnowledgeSource) => {
  const progress = getScrapeProgress(source);
  const status = String(source.scrapeStatus || "").toLowerCase();
  if (progress && ["scraping", "syncing"].includes(status)) {
    const detected = Number(
      progress.pagesDetected || progress.pages?.length || 0,
    );
    const completed = Number(progress.pagesCompleted || 0);
    const failed = Number(progress.pagesFailed || 0);
    const percent = Number.isFinite(Number(progress.overallPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(progress.overallPercent))))
      : 0;
    return `${detected} page${detected === 1 ? "" : "s"} detected · ${percent}% complete · ${completed} successful · ${failed} failed`;
  }
  const report = getScrapeReport(source);
  if (!report) {
    if (status === "pending" || !source.lastScrapedAt) {
      return "Not synced yet. Click Sync to scrape and prepare this source.";
    }
    return "No detailed sync report is available yet.";
  }
  const coverage = Number.isFinite(Number(report.coveragePercent))
    ? `${Math.round(Number(report.coveragePercent))}% scraped`
    : "Sync report";
  const scraped = Number(report.pagesScraped || source.pageCount || 0);
  const attempted = Number(report.pagesAttempted || 0);
  const failed = Number(report.pagesFailed || 0);
  const products = Number(report.productsFound || source.productCount || 0);
  return `${coverage} · ${scraped}${attempted ? `/${attempted}` : ""} pages · ${products} products · ${failed} failed`;
};

const reportNoticeText = (
  source?: KnowledgeSource | null,
  fallback = "Sync completed. The cleaned knowledge is now available to assigned voice agents and chatbots.",
) => {
  if (!source) return fallback;
  const report = getScrapeReport(source);
  if (!report) return fallback;
  const failed = Number(report.pagesFailed || 0);
  const coverage = Number.isFinite(Number(report.coveragePercent))
    ? `${Math.round(Number(report.coveragePercent))}%`
    : "partially";
  const base = `Sync completed with ${coverage} coverage: ${Number(report.pagesScraped || source.pageCount || 0)} pages, ${Number(report.chunksStored || source.chunkCount || 0)} chunks, and ${Number(report.productsFound || source.productCount || 0)} products found.`;
  if (failed > 0)
    return `${base} ${failed} page${failed === 1 ? "" : "s"} failed; open Sync details for retry guidance.`;
  return `${base} This knowledge base is now available to assigned agents.`;
};

const compactUrl = (value?: string) => {
  const raw = String(value || "");
  if (raw.length <= 86) return raw;
  return `${raw.slice(0, 64)}…${raw.slice(-16)}`;
};

const displayName = (kb: KnowledgeBase | null | undefined) =>
  kb?.name || kb?.businessName || kb?.domain || "Untitled knowledge base";

const selectedForAgent = (
  knowledgeBases: KnowledgeBase[],
  agent: AgentConfig,
) =>
  knowledgeBases.find((kb) => kb.id === agent.knowledgeBaseId) ||
  knowledgeBases.find((kb) => kb.linkedVoiceAgentIds?.includes(agent.id)) ||
  knowledgeBases.find((kb) => kb.isPrimary) ||
  knowledgeBases[0] ||
  null;

const selectedForChatbot = (
  knowledgeBases: KnowledgeBase[],
  chatbot: ChatbotConfig,
) =>
  knowledgeBases.find((kb) => kb.id === chatbot.knowledgeBaseId) ||
  knowledgeBases.find((kb) => kb.linkedChatbotIds?.includes(chatbot.id)) ||
  knowledgeBases.find((kb) => kb.isPrimary) ||
  knowledgeBases[0] ||
  null;

const KnowledgeBases: React.FC<KnowledgeBasesProps> = ({
  org,
  initialKnowledgeBases = [],
  onChanged,
}) => {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(
    initialKnowledgeBases,
  );
  const [selectedId, setSelectedId] = useState(
    initialKnowledgeBases[0]?.id || "",
  );
  const [loading, setLoading] = useState(!initialKnowledgeBases.length);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [syncNotice, setSyncNotice] = useState<SyncNotice>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [industrySearch, setIndustrySearch] = useState("");
  const [industryOpen, setIndustryOpen] = useState(false);
  const industryRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [showAssignments, setShowAssignments] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null);
  const lastInitialSignature = useRef("");
  const resumedStaleSources = useRef(new Set<string>());

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        industryRef.current &&
        !industryRef.current.contains(event.target as Node)
      ) {
        setIndustryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = useMemo(
    () =>
      knowledgeBases.find((kb) => kb.id === selectedId) ||
      knowledgeBases[0] ||
      null,
    [knowledgeBases, selectedId],
  );

  const totals = useMemo(() => {
    return knowledgeBases.reduce(
      (acc, kb) => {
        acc.sources += kb.sources?.length || 0;
        acc.products += (kb.sources || []).reduce(
          (sum, source) => sum + (source.productCount || 0),
          0,
        );
        acc.chunks += (kb.sources || []).reduce(
          (sum, source) => sum + (source.chunkCount || 0),
          0,
        );
        return acc;
      },
      { sources: 0, products: 0, chunks: 0 },
    );
  }, [knowledgeBases]);

  useEffect(() => {
    const signature = initialKnowledgeBases
      .map((kb) => `${kb.id}:${kb.updatedAt || ""}`)
      .join("|");
    if (!signature || signature === lastInitialSignature.current) return;
    lastInitialSignature.current = signature;
    setKnowledgeBases(initialKnowledgeBases);
    setSelectedId(
      (current) =>
        initialKnowledgeBases.find((kb) => kb.id === current)?.id ||
        initialKnowledgeBases[0]?.id ||
        "",
    );
    setLoading(false);
  }, [initialKnowledgeBases]);

  const loadKnowledgeBases = async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    if (!opts.silent) setToast(null);
    try {
      const list = await api.listKnowledgeBases();
      setKnowledgeBases(list);
      setSelectedId(
        (current) =>
          list.find((kb) => kb.id === current)?.id || list[0]?.id || "",
      );
      await onChanged?.();
      return list;
    } catch (error) {
      if (!opts.silent) {
        setToast({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not load knowledge bases.",
        });
      }
      return null;
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  const refresh = async () => {
    await loadKnowledgeBases({ silent: false });
  };

  useEffect(() => {
    if (initialKnowledgeBases.length) return;
    void loadKnowledgeBases({ silent: false });
    // One initial load only; manual refresh is used after that to prevent reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setToast(null);
    try {
      const message = await action();
      setToast({ type: "success", text: message });
      await loadKnowledgeBases({ silent: true });
    } catch (error) {
      setToast({
        type: "error",
        text:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  };

  const createKnowledgeBase = async () => {
    const website = normalizeInputUrl(createForm.website);
    const name = createForm.name.trim();
    const industry = createForm.industry.trim();
    if (!name || !website || !industry) {
      setToast({
        type: "error",
        text: "Add a name, industry, and primary website before creating a knowledge base.",
      });
      return;
    }
    await runAction("create-kb", async () => {
      const created = await api.createKnowledgeBase({
        name,
        businessName: name,
        website,
        industry,
        description: createForm.description.trim(),
      });
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
      setSelectedId(created.id);
      return `${displayName(created)} created. Sync trusted sources when you are ready.`;
    });
  };

  const addSource = async () => {
    if (!selected) return;
    const url = normalizeInputUrl(sourceUrl);
    if (!url) {
      setToast({ type: "error", text: "Enter a valid source URL." });
      return;
    }
    await runAction(`add-source-${selected.id}`, async () => {
      await api.addKnowledgeSource(selected.id, {
        url,
        title: sourceTitle.trim(),
      });
      setSourceUrl("");
      setSourceTitle("");
      return "Source URL added.";
    });
  };

  const syncSource = (sourceId: string) => {
    if (!selected) return;
    const source = selectedSources.find((item) => item.id === sourceId);
    const title =
      source?.title || source?.domain || source?.url || "Knowledge source";
    setBusy(`sync-source-${sourceId}`);
    setToast(null);
    setSyncNotice({
      id: sourceId,
      status: "running",
      title: "Syncing knowledge source",
      text: `Getting pages, extracting content, products, FAQs, and cleaning data for ${title}. You can keep using Agently while this runs.`,
    });

    api
      .syncKnowledgeSource(selected.id, sourceId, { background: true })
      .then(async (result) => {
        await loadKnowledgeBases({ silent: true });
        if (result.accepted || result.background) {
          setSyncNotice({
            id: sourceId,
            status: "running",
            title: "Knowledge sync is running",
            text: "Agently is gathering pages, extracting content and product data, then cleaning the knowledge base in the background. You can keep using the app.",
          });
          return;
        }
        setSyncNotice({
          id: sourceId,
          status: "success",
          title: "Knowledge base is ready",
          text: reportNoticeText(
            result.source,
            `Sync completed. ${result.pagesScraped || 0} pages scraped and ${result.chunksStored || 0} compact chunks stored. This knowledge base can now be used by assigned agents.`,
          ),
        });
      })
      .catch((error) => {
        setSyncNotice({
          id: sourceId,
          status: "error",
          title: "Knowledge sync failed",
          text:
            error instanceof Error
              ? error.message
              : "Could not sync this source.",
        });
      })
      .finally(() => setBusy(null));
  };

  useEffect(() => {
    if (!syncNotice || syncNotice.status !== "running") return;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      const list = await loadKnowledgeBases({ silent: true });
      const currentSource = list
        ?.flatMap((kb) => kb.sources || [])
        .find((source) => source.id === syncNotice.id);
      const status = String(currentSource?.scrapeStatus || "").toLowerCase();
      if (["completed", "synced", "active"].includes(status)) {
        window.clearInterval(timer);
        setSyncNotice({
          id: syncNotice.id,
          status: "success",
          title: "Knowledge base is ready",
          text: reportNoticeText(currentSource),
        });
      } else if (["failed", "error"].includes(status)) {
        window.clearInterval(timer);
        setSyncNotice({
          id: syncNotice.id,
          status: "error",
          title: "Knowledge sync failed",
          text:
            currentSource?.lastError ||
            "The source could not be synced. Review the URL or try again.",
        });
      } else if (attempts >= 24) {
        window.clearInterval(timer);
      }
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncNotice?.id, syncNotice?.status]);

  useEffect(() => {
    const staleBefore = Date.now() - 15 * 60 * 1000;
    for (const kb of knowledgeBases) {
      for (const source of kb.sources || []) {
        const status = String(source.scrapeStatus || "").toLowerCase();
        const updatedAt = new Date(
          source.updatedAt || source.createdAt || 0,
        ).getTime();
        if (
          status === "scraping" &&
          Number.isFinite(updatedAt) &&
          updatedAt > 0 &&
          updatedAt < staleBefore &&
          !resumedStaleSources.current.has(source.id)
        ) {
          resumedStaleSources.current.add(source.id);
          void api
            .syncKnowledgeSource(kb.id, source.id, { background: true })
            .catch(() => {
              resumedStaleSources.current.delete(source.id);
            });
        }
      }
    }
  }, [knowledgeBases]);

  useEffect(() => {
    const hasActiveScrape = knowledgeBases.some((kb) =>
      (kb.sources || []).some((source) =>
        ["scraping", "syncing"].includes(
          String(source.scrapeStatus || "").toLowerCase(),
        ),
      ),
    );
    if (!hasActiveScrape) return;
    const timer = window.setInterval(() => {
      void loadKnowledgeBases({ silent: true });
    }, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    knowledgeBases
      .map(
        (kb) =>
          `${kb.id}:${(kb.sources || []).map((s) => `${s.id}:${s.scrapeStatus}`).join(",")}`,
      )
      .join("|"),
  ]);

  const assignVoiceAgent = async (
    agent: AgentConfig,
    knowledgeBaseId: string,
  ) => {
    await runAction(`assign-agent-${agent.id}`, async () => {
      await api.assignVoiceAgentKnowledgeBase(knowledgeBaseId, agent.id);
      const kb = knowledgeBases.find((item) => item.id === knowledgeBaseId);
      return `${agent.name} now uses ${displayName(kb)}.`;
    });
  };

  const assignChatbot = async (
    chatbot: ChatbotConfig,
    knowledgeBaseId: string,
  ) => {
    await runAction(`assign-chatbot-${chatbot.id}`, async () => {
      await api.assignChatbotKnowledgeBase(knowledgeBaseId, chatbot.id);
      const kb = knowledgeBases.find((item) => item.id === knowledgeBaseId);
      return `${chatbot.name} now uses ${displayName(kb)}.`;
    });
  };

  const openDeleteModal = async (knowledgeBase: KnowledgeBase) => {
    setDeleteModal({
      knowledgeBase,
      checking: true,
      deleting: false,
      check: null,
      error: "",
    });
    try {
      const check = await api.getKnowledgeBaseDeleteCheck(knowledgeBase.id);
      setDeleteModal({
        knowledgeBase,
        checking: false,
        deleting: false,
        check,
        error: "",
      });
    } catch (error) {
      setDeleteModal({
        knowledgeBase,
        checking: false,
        deleting: false,
        check: null,
        error:
          error instanceof Error
            ? error.message
            : "Could not verify whether this knowledge base can be deleted.",
      });
    }
  };

  const closeDeleteModal = () => {
    if (deleteModal?.deleting) return;
    setDeleteModal(null);
  };

  const confirmDeleteKnowledgeBase = async () => {
    if (!deleteModal || !deleteModal.check?.canDelete) return;
    const target = deleteModal.knowledgeBase;
    setDeleteModal((current) =>
      current ? { ...current, deleting: true, error: "" } : current,
    );
    try {
      await api.deleteKnowledgeBase(target.id);
      setToast({
        type: "success",
        text: `${displayName(target)} was deleted with its sources, scraped chunks, products, and FAQs.`,
      });
      setDeleteModal(null);
      const list = await loadKnowledgeBases({ silent: true });
      setSelectedId(
        (current) =>
          list?.find((kb) => kb.id === current)?.id || list?.[0]?.id || "",
      );
    } catch (error) {
      let nextCheck: DeleteCheck | null = deleteModal.check;
      const details = error instanceof ApiError ? error.details : null;
      if (details && typeof details === "object" && "canDelete" in details) {
        nextCheck = details as DeleteCheck;
      }
      setDeleteModal((current) =>
        current
          ? {
              ...current,
              deleting: false,
              check: nextCheck,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not delete this knowledge base.",
            }
          : current,
      );
    }
  };

  const showAssignmentManagerFromDelete = () => {
    setShowAssignments(true);
    closeDeleteModal();
    window.setTimeout(() => {
      document.getElementById("knowledge-base-assignments")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const selectedSources = selected?.sources || [];
  const filteredIndustries = KB_INDUSTRIES.filter((industry) =>
    industry
      .toLowerCase()
      .includes((industrySearch || createForm.industry).toLowerCase()),
  );
  const canCreateKnowledgeBase =
    Boolean(createForm.name.trim()) &&
    Boolean(normalizeInputUrl(createForm.website)) &&
    Boolean(createForm.industry.trim());
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, KnowledgeSource[]>();
    selectedSources.forEach((source) => {
      const domain = getSourceDomain(source);
      const list = groups.get(domain) || [];
      list.push(source);
      groups.set(domain, list);
    });
    return Array.from(groups.entries()).map(([domain, sources]) => ({
      domain,
      sources,
    }));
  }, [selectedSources]);

  return (
    <div className="animate-fade-up space-y-5 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.hash = "#/settings";
          }}
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-700"
        >
          <i className="fa-sharp fa-solid fa-chevron-left text-[9px]" />
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-600"
          >
            + Add Knowledge Base
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(busy)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-200 hover:text-amber-700 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">
              Knowledge Bases
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Keep every knowledge source separated and safe
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Use one knowledge base per website, brand, industry, department,
              or project. Agents and chatbots only use the knowledge base
              assigned to them.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
            <span className="font-black">Important:</span> only add URLs you own
            or are allowed to use. Avoid deleting or changing sources during
            live campaigns because it can change what agents know.
          </div>
        </div>
        {toast && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
              toast.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            {toast.text}
          </div>
        )}
      </section>

      {showCreate && (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-base font-black text-slate-900">
              Add Knowledge Base
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Start with the primary website. Additional pages and ecommerce
              data can be synced from sources inside this knowledge base.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((form) => ({ ...form, name: event.target.value }))
              }
              placeholder="Knowledge base name"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
            />
            <input
              value={createForm.website}
              onChange={(event) =>
                setCreateForm((form) => ({
                  ...form,
                  website: event.target.value,
                }))
              }
              placeholder="Primary website domain"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
            />
            <div ref={industryRef} className="relative">
              <input
                value={industryOpen ? industrySearch : createForm.industry}
                onFocus={() => {
                  setIndustryOpen(true);
                  setIndustrySearch(createForm.industry);
                }}
                onChange={(event) => {
                  setIndustrySearch(event.target.value);
                  setCreateForm((form) => ({
                    ...form,
                    industry: event.target.value,
                  }));
                  setIndustryOpen(true);
                }}
                placeholder="Search industry or category"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
              />
              {industryOpen ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {(filteredIndustries.length
                    ? filteredIndustries
                    : KB_INDUSTRIES
                  ).map((industry) => (
                    <button
                      key={industry}
                      type="button"
                      onClick={() => {
                        setCreateForm((form) => ({ ...form, industry }));
                        setIndustrySearch(industry);
                        setIndustryOpen(false);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition hover:bg-amber-50 ${createForm.industry === industry ? "bg-amber-50 text-amber-700" : "text-slate-700"}`}
                    >
                      {industry}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
              placeholder="Short description"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-amber-300"
            />
          </div>
          <div className="mt-4 flex flex-col justify-end gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createKnowledgeBase()}
              disabled={busy === "create-kb" || !canCreateKnowledgeBase}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "create-kb"
                ? "Creating…"
                : canCreateKnowledgeBase
                  ? "Create"
                  : "Complete required fields"}
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)]">
        <section className="rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-slate-100 sm:p-4">
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ["Bases", knowledgeBases.length],
              ["Sources", totals.sources],
              ["Products", totals.products],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
              Loading knowledge bases…
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
              Create your first knowledge base to begin.
            </div>
          ) : (
            <div className="custom-scrollbar max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {knowledgeBases.map((kb) => (
                <button
                  key={kb.id}
                  type="button"
                  onClick={() => setSelectedId(kb.id)}
                  className={`w-full rounded-2xl p-3 text-left transition ${
                    selected?.id === kb.id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">
                        {displayName(kb)}
                      </p>
                      <p
                        className={`mt-1 truncate text-xs font-semibold ${selected?.id === kb.id ? "text-white/60" : "text-slate-400"}`}
                      >
                        {kb.domain || kb.primaryUrl || "No website yet"}
                      </p>
                    </div>
                    {kb.isPrimary && (
                      <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest">
                      {kb.agentCount || 0} voice
                    </span>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest">
                      {kb.chatbotCount || 0} chatbot
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {selected ? (
            <>
              <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                      Selected
                    </p>
                    <h3 className="mt-1 truncate text-xl font-black text-slate-900">
                      {displayName(selected)}
                    </h3>
                    <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                      {selected.primaryUrl ||
                        selected.sources?.find((source) => source.isPrimary)
                          ?.url ||
                        selected.sources?.[0]?.url ||
                        selected.domain ||
                        "No primary website"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ${statusTone(selected.syncStatus || selected.status)}`}
                    >
                      {selected.syncStatus || selected.status || "pending"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openDeleteModal(selected)}
                      className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:border-red-200 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Sources", selectedSources.length],
                    [
                      "Chunks",
                      selectedSources.reduce(
                        (sum, source) => sum + (source.chunkCount || 0),
                        0,
                      ),
                    ],
                    [
                      "Products",
                      selectedSources.reduce(
                        (sum, source) => sum + (source.productCount || 0),
                        0,
                      ),
                    ],
                    ["Synced", formatDate(selected.lastSyncedAt)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5"
                    >
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-slate-900">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Source URLs
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Sources are grouped by domain so pages from different
                      websites stay clearly separated. Add a missing page URL
                      under the correct knowledge base, then sync that source.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]">
                  <input
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://website.com/page-that-was-missed"
                    className="min-w-0 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-300"
                  />
                  <input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="Optional source title"
                    className="min-w-0 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-300"
                  />
                  <button
                    type="button"
                    onClick={() => void addSource()}
                    disabled={busy === `add-source-${selected.id}`}
                    className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-40"
                  >
                    Add URL
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  {sourceGroups.length ? (
                    sourceGroups.map((group) => (
                      <div
                        key={group.domain}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">
                              {group.domain}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {group.sources.length} source
                              {group.sources.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {group.sources.map((source) => (
                            <div
                              key={source.id}
                              className="flex flex-col gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-800">
                                  {source.title || source.domain || "Source"}
                                </p>
                                <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                                  {source.url || source.normalizedUrl}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span
                                    className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ring-1 ${statusTone(source.scrapeStatus)}`}
                                  >
                                    {source.scrapeStatus || "pending"}
                                  </span>
                                  <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 ring-1 ring-slate-100">
                                    {source.chunkCount || 0} chunks
                                  </span>
                                  <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 ring-1 ring-slate-100">
                                    {source.productCount || 0} products
                                  </span>
                                </div>
                                <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Sync details
                                  </p>
                                  <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
                                    {reportSummary(source)}
                                  </p>
                                  {getScrapeProgress(source)?.pages?.length ||
                                  getScrapeReport(source)?.failedPages
                                    ?.length ||
                                  getScrapeReport(source)?.warnings?.length ? (
                                    <details
                                      className="mt-2"
                                      open={
                                        String(
                                          source.scrapeStatus || "",
                                        ).toLowerCase() === "scraping"
                                      }
                                    >
                                      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-amber-700">
                                        View page details
                                      </summary>
                                      <div className="mt-2 space-y-2 text-xs text-slate-600">
                                        {(
                                          getScrapeProgress(source)?.pages || []
                                        )
                                          .slice(0, 30)
                                          .map((item, index) => {
                                            const pageStatus = String(
                                              item.status || "queued",
                                            ).toLowerCase();
                                            const failed =
                                              pageStatus === "failed";
                                            const percent = Number.isFinite(
                                              Number(item.percent),
                                            )
                                              ? Math.max(
                                                  0,
                                                  Math.min(
                                                    100,
                                                    Math.round(
                                                      Number(item.percent),
                                                    ),
                                                  ),
                                                )
                                              : 0;
                                            return (
                                              <div
                                                key={`progress-${source.id}-${index}`}
                                                className={`rounded-xl bg-white p-2 ring-1 ${failed ? "ring-red-100" : "ring-slate-100"}`}
                                              >
                                                <div className="flex items-start justify-between gap-3">
                                                  <p
                                                    className={`min-w-0 break-all font-black ${failed ? "text-red-700" : "text-slate-700"}`}
                                                  >
                                                    {compactUrl(item.url)}
                                                  </p>
                                                  <span
                                                    className={`shrink-0 text-[10px] font-black ${failed ? "text-red-600" : "text-amber-700"}`}
                                                  >
                                                    {failed
                                                      ? "Failed"
                                                      : `${percent}%`}
                                                  </span>
                                                </div>
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                                  <div
                                                    className={`h-full rounded-full ${failed ? "bg-red-500" : pageStatus === "completed" ? "bg-emerald-500" : "bg-amber-500"}`}
                                                    style={{
                                                      width: `${percent}%`,
                                                    }}
                                                  />
                                                </div>
                                                <p
                                                  className={`mt-1 leading-5 ${failed ? "text-red-600" : "text-slate-500"}`}
                                                >
                                                  {item.error ||
                                                    pageStatus.replace(
                                                      /_/g,
                                                      " ",
                                                    )}
                                                </p>
                                              </div>
                                            );
                                          })}
                                        {(
                                          getScrapeReport(source)
                                            ?.failedPages || []
                                        )
                                          .filter(
                                            (failedPage) =>
                                              !(
                                                getScrapeProgress(source)
                                                  ?.pages || []
                                              ).some(
                                                (item) =>
                                                  item.url === failedPage.url,
                                              ),
                                          )
                                          .slice(0, 10)
                                          .map((item, index) => (
                                            <div
                                              key={`failed-${source.id}-${index}`}
                                              className="rounded-xl bg-white p-2 ring-1 ring-red-100"
                                            >
                                              <p className="break-all font-black text-red-700">
                                                {compactUrl(item.url)}
                                              </p>
                                              <p className="mt-1 leading-5 text-red-600">
                                                {item.reason ||
                                                  "This page could not be scraped. Remove it or add the URL directly for a separate retry."}
                                              </p>
                                            </div>
                                          ))}
                                        {(
                                          getScrapeReport(source)
                                            ?.suggestedActions || []
                                        ).length ? (
                                          <div className="rounded-xl bg-white p-2 ring-1 ring-slate-100">
                                            <p className="font-black text-slate-700">
                                              Suggested next step
                                            </p>
                                            <ul className="mt-1 list-disc space-y-1 pl-4 leading-5">
                                              {(
                                                getScrapeReport(source)
                                                  ?.suggestedActions || []
                                              )
                                                .slice(0, 3)
                                                .map((item, index) => (
                                                  <li
                                                    key={`suggestion-${source.id}-${index}`}
                                                  >
                                                    {item}
                                                  </li>
                                                ))}
                                            </ul>
                                          </div>
                                        ) : null}
                                      </div>
                                    </details>
                                  ) : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => syncSource(source.id)}
                                disabled={busy === `sync-source-${source.id}`}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-200 hover:text-amber-700 disabled:opacity-40"
                              >
                                {busy === `sync-source-${source.id}`
                                  ? "Syncing…"
                                  : "Sync"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm font-bold text-slate-400">
                      No sources yet. Add the primary domain or a missed page
                      URL to begin.
                    </div>
                  )}
                </div>
              </div>

              <div
                id="knowledge-base-assignments"
                className="scroll-mt-24 rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-slate-900">
                      Agent assignments
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Use this only when you need to move agents or chatbots
                      between knowledge bases.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAssignments((value) => !value)}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-200 hover:text-amber-700"
                  >
                    {showAssignments
                      ? "Hide assignments"
                      : "Manage assignments"}
                  </button>
                </div>

                {showAssignments ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                      <h4 className="text-sm font-black text-slate-900">
                        Voice Agents
                      </h4>
                      <div className="mt-3 space-y-2">
                        {org.voiceAgents.length ? (
                          org.voiceAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="truncate text-sm font-black text-slate-800">
                                {agent.name}
                              </span>
                              <select
                                value={
                                  selectedForAgent(knowledgeBases, agent)?.id ||
                                  ""
                                }
                                onChange={(event) =>
                                  void assignVoiceAgent(
                                    agent,
                                    event.target.value,
                                  )
                                }
                                className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black outline-none"
                              >
                                {knowledgeBases.map((kb) => (
                                  <option key={kb.id} value={kb.id}>
                                    {displayName(kb)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-400">
                            No voice agents yet.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 sm:p-4">
                      <h4 className="text-sm font-black text-slate-900">
                        Chatbots
                      </h4>
                      <div className="mt-3 space-y-2">
                        {org.chatbots.length ? (
                          org.chatbots.map((chatbot) => (
                            <div
                              key={chatbot.id}
                              className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="truncate text-sm font-black text-slate-800">
                                {chatbot.name}
                              </span>
                              <select
                                value={
                                  selectedForChatbot(knowledgeBases, chatbot)
                                    ?.id || ""
                                }
                                onChange={(event) =>
                                  void assignChatbot(
                                    chatbot,
                                    event.target.value,
                                  )
                                }
                                className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black outline-none"
                              >
                                {knowledgeBases.map((kb) => (
                                  <option key={kb.id} value={kb.id}>
                                    {displayName(kb)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-400">
                            No chatbots yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white py-14 text-center shadow-sm">
              <p className="text-sm font-bold text-slate-400">
                Select or create a knowledge base.
              </p>
            </div>
          )}
        </section>
      </div>
      {deleteModal ? (
        <div className="fixed inset-0 z-[230] flex items-end justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-600">
                  Delete Knowledge Base
                </p>
                <h3 className="mt-2 break-words text-xl font-black text-slate-900">
                  {displayName(deleteModal.knowledgeBase)}
                </h3>
                <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                  {deleteModal.knowledgeBase.primaryUrl ||
                    deleteModal.knowledgeBase.domain ||
                    "No primary website"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.deleting}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 transition hover:border-slate-300 disabled:opacity-40"
                aria-label="Close delete modal"
              >
                <i className="fa-sharp fa-solid fa-xmark" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-800">
              <p className="font-black">This is permanent.</p>
              <p className="mt-1">
                Deleting this knowledge base removes its source URLs, scraped
                chunks, product data, and FAQs from the database. This cannot be
                undone.
              </p>
            </div>

            {deleteModal.checking ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm font-bold text-slate-400">
                Checking assigned agents…
              </div>
            ) : deleteModal.check ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Sources", deleteModal.check.cleanup.sources],
                    ["Chunks", deleteModal.check.cleanup.chunks],
                    ["Products", deleteModal.check.cleanup.products],
                    ["FAQs", deleteModal.check.cleanup.faqs],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5"
                    >
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {deleteModal.check.canDelete ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
                    No voice agents or chatbots are using this knowledge base.
                    Final deletion is now available.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    <p className="font-black">
                      Reassign or delete these agents first.
                    </p>
                    <p className="mt-1">
                      Active agents must always have a knowledge base. Move the
                      agents below to another knowledge base, or delete the
                      agents, then reopen this confirmation.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-amber-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                          Voice Agents
                        </p>
                        {deleteModal.check.blockers.voiceAgents.length ? (
                          <div className="mt-2 space-y-1.5">
                            {deleteModal.check.blockers.voiceAgents.map(
                              (agent) => (
                                <p
                                  key={agent.id}
                                  className="truncate rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700"
                                >
                                  {agent.name}
                                </p>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-slate-400">
                            None
                          </p>
                        )}
                      </div>
                      <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-amber-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                          Chatbots
                        </p>
                        {deleteModal.check.blockers.chatbots.length ? (
                          <div className="mt-2 space-y-1.5">
                            {deleteModal.check.blockers.chatbots.map(
                              (chatbot) => (
                                <p
                                  key={chatbot.id}
                                  className="truncate rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700"
                                >
                                  {chatbot.name}
                                </p>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs font-bold text-slate-400">
                            None
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {deleteModal.error ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {deleteModal.error}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.deleting}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-slate-300 disabled:opacity-40"
              >
                Cancel
              </button>
              {deleteModal.check && !deleteModal.check.canDelete ? (
                <button
                  type="button"
                  onClick={showAssignmentManagerFromDelete}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-600"
                >
                  Manage assignments
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void confirmDeleteKnowledgeBase()}
                disabled={
                  !deleteModal.check?.canDelete ||
                  deleteModal.deleting ||
                  deleteModal.checking
                }
                className="rounded-2xl bg-red-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleteModal.deleting
                  ? "Deleting…"
                  : "Delete knowledge base and data"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {syncNotice ? (
        <div
          className={`fixed bottom-5 right-5 z-[220] w-[min(24rem,calc(100vw-2rem))] rounded-3xl border p-4 shadow-2xl transition-all ${
            syncNotice.status === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : syncNotice.status === "error"
                ? "border-red-100 bg-red-50 text-red-800"
                : "border-amber-100 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${
                syncNotice.status === "running" ? "bg-amber-100" : "bg-white/70"
              }`}
            >
              {syncNotice.status === "running" ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              ) : syncNotice.status === "success" ? (
                <i className="fa-sharp fa-solid fa-check text-emerald-600" />
              ) : (
                <i className="fa-sharp fa-solid fa-triangle-exclamation text-red-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{syncNotice.title}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                {syncNotice.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default KnowledgeBases;
