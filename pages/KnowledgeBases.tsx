import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AgentConfig, ChatbotConfig, KnowledgeBase, KnowledgeSource, Organization } from "../types";
import { api, ApiError } from "../services/api";

interface KnowledgeBasesProps {
  org: Organization;
  initialKnowledgeBases?: KnowledgeBase[];
  onChanged?: () => void | Promise<void>;
}

type ToastState = { type: "success" | "error"; text: string } | null;

const emptyCreateForm = {
  businessName: "",
  website: "",
  industry: "",
  description: "",
};

const knowledgeBaseForAgent = (
  knowledgeBases: KnowledgeBase[],
  agent: AgentConfig,
) =>
  knowledgeBases.find((kb) => kb.linkedVoiceAgentIds?.includes(agent.id)) ||
  knowledgeBases.find((kb) => kb.id === agent.knowledgeBaseId) ||
  knowledgeBases.find((kb) => kb.isPrimary) ||
  knowledgeBases[0] ||
  null;

const knowledgeBaseForChatbot = (
  knowledgeBases: KnowledgeBase[],
  chatbot: ChatbotConfig,
) =>
  knowledgeBases.find((kb) => kb.linkedChatbotIds?.includes(chatbot.id)) ||
  knowledgeBases.find((kb) => kb.id === chatbot.knowledgeBaseId) ||
  knowledgeBases.find((kb) => kb.isPrimary) ||
  knowledgeBases[0] ||
  null;

const formatDate = (value?: string | null) => {
  if (!value) return "Never";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
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

const normalizeInputUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const KnowledgeBases: React.FC<KnowledgeBasesProps> = ({
  org,
  initialKnowledgeBases = [],
  onChanged,
}) => {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(initialKnowledgeBases);
  const [selectedId, setSelectedId] = useState(initialKnowledgeBases[0]?.id || "");
  const [loading, setLoading] = useState(!initialKnowledgeBases.length);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, { title: string; url: string }>>({});

  const selected = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedId) || knowledgeBases[0] || null,
    [knowledgeBases, selectedId],
  );

  const [editForm, setEditForm] = useState({
    name: "",
    businessName: "",
    primaryUrl: "",
    industry: "",
    description: "",
  });

  useEffect(() => {
    setKnowledgeBases(initialKnowledgeBases);
    if (!selectedId && initialKnowledgeBases[0]?.id) {
      setSelectedId(initialKnowledgeBases[0].id);
    }
  }, [initialKnowledgeBases, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name || "",
      businessName: selected.businessName || "",
      primaryUrl: selected.primaryUrl || "",
      industry: selected.industry || "",
      description: selected.description || "",
    });
    setSourceDrafts(
      Object.fromEntries(
        (selected.sources || []).map((source) => [
          source.id,
          { title: source.title || "", url: source.url || source.normalizedUrl || "" },
        ]),
      ),
    );
  }, [selected?.id, selected?.updatedAt, selected?.sources?.length]);

  const refresh = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const list = await api.listKnowledgeBases();
      setKnowledgeBases(list);
      setSelectedId((current) =>
        list.find((kb) => kb.id === current)?.id || list[0]?.id || "",
      );
      await onChanged?.();
      return list;
    } catch (error) {
      setToast({
        type: "error",
        text: error instanceof Error ? error.message : "Could not load business knowledge bases.",
      });
      return [];
    } finally {
      if (!options.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh({ silent: Boolean(initialKnowledgeBases.length) });
    // Load once on page entry. Bootstrap updates still flow through initialKnowledgeBases.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setToast(null);
    try {
      const message = await action();
      setToast({ type: "success", text: message });
      await refresh({ silent: true });
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
    if (!website) {
      setToast({ type: "error", text: "Enter the main website for this business knowledge base." });
      return;
    }
    await runAction("create-kb", async () => {
      const created = await api.createKnowledgeBase({
        businessName: createForm.businessName.trim(),
        name: createForm.businessName.trim()
          ? `${createForm.businessName.trim()} Knowledge Base`
          : undefined,
        website,
        industry: createForm.industry.trim(),
        description: createForm.description.trim(),
      });
      setCreateForm(emptyCreateForm);
      setShowCreate(false);
      setSelectedId(created.id);
      return `${created.businessName || created.name} knowledge base created.`;
    });
  };

  const saveSelected = async () => {
    if (!selected) return;
    await runAction(`save-${selected.id}`, async () => {
      const updated = await api.updateKnowledgeBase(selected.id, {
        name: editForm.name.trim(),
        businessName: editForm.businessName.trim(),
        website: normalizeInputUrl(editForm.primaryUrl),
        industry: editForm.industry.trim(),
        description: editForm.description.trim(),
      });
      return `${updated.businessName || updated.name} updated.`;
    });
  };

  const makePrimary = async () => {
    if (!selected) return;
    await runAction(`primary-${selected.id}`, async () => {
      await api.updateKnowledgeBase(selected.id, { isPrimary: true });
      return `${selected.businessName || selected.name} is now the primary business knowledge base.`;
    });
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.businessName || selected.name}? This is blocked if agents or chatbots are still assigned.`)) {
      return;
    }
    await runAction(`delete-${selected.id}`, async () => {
      await api.deleteKnowledgeBase(selected.id);
      return "Knowledge base deleted.";
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
      return "Source URL added to this business knowledge base.";
    });
  };

  const saveSource = async (source: KnowledgeSource) => {
    if (!selected) return;
    const draft = sourceDrafts[source.id] || { title: source.title || "", url: source.url || "" };
    await runAction(`save-source-${source.id}`, async () => {
      await api.updateKnowledgeSource(selected.id, source.id, {
        title: draft.title,
        url: normalizeInputUrl(draft.url),
      });
      return "Source updated.";
    });
  };

  const deleteSource = async (source: KnowledgeSource) => {
    if (!selected) return;
    if (!window.confirm(`Remove ${source.url}? Its stored chunks for this source will also be removed.`)) {
      return;
    }
    await runAction(`delete-source-${source.id}`, async () => {
      await api.deleteKnowledgeSource(selected.id, source.id);
      return "Source removed.";
    });
  };

  const syncSource = async (source: KnowledgeSource) => {
    if (!selected) return;
    await runAction(`sync-source-${source.id}`, async () => {
      const result = await api.syncKnowledgeSource(selected.id, source.id);
      return `Synced ${result.pagesScraped || 0} pages and stored ${result.chunksStored || 0} chunks for this source.`;
    });
  };

  const assignVoiceAgent = async (agent: AgentConfig, knowledgeBaseId: string) => {
    await runAction(`assign-agent-${agent.id}`, async () => {
      const kb = knowledgeBases.find((item) => item.id === knowledgeBaseId);
      await api.assignVoiceAgentKnowledgeBase(knowledgeBaseId, agent.id);
      return `${agent.name} now uses ${kb?.businessName || kb?.name || "the selected knowledge base"}.`;
    });
  };

  const assignChatbot = async (chatbot: ChatbotConfig, knowledgeBaseId: string) => {
    await runAction(`assign-chatbot-${chatbot.id}`, async () => {
      const kb = knowledgeBases.find((item) => item.id === knowledgeBaseId);
      await api.assignChatbotKnowledgeBase(knowledgeBaseId, chatbot.id);
      return `${chatbot.name} now uses ${kb?.businessName || kb?.name || "the selected knowledge base"}.`;
    });
  };

  const totals = useMemo(() => {
    const sources = knowledgeBases.reduce((sum, kb) => sum + (kb.sources?.length || 0), 0);
    const chunks = knowledgeBases.reduce(
      (sum, kb) => sum + (kb.sources || []).reduce((acc, source) => acc + (source.chunkCount || 0), 0),
      0,
    );
    return { sources, chunks };
  }, [knowledgeBases]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
              Business Knowledge Bases
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              Separate each business before your agents speak
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
              Use this workspace to keep Golfbase, Nutritionbase, and any other business knowledge apart. Each voice agent or chatbot should be assigned to the exact business it represents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowCreate((value) => !value)}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-amber-600"
            >
              + Add Business
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || Boolean(busy)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-amber-200 hover:text-amber-700 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Businesses</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{knowledgeBases.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Source URLs</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.sources}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stored chunks</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totals.chunks}</p>
          </div>
        </div>

        {toast && (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
              toast.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-red-100 bg-red-50 text-red-700"
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 shadow-card sm:p-6">
          <div className="mb-4">
            <h3 className="text-base font-black text-slate-900">Add a separate business</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              This creates an isolated knowledge space with its own website, FAQs, product data, and connected agents.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={createForm.businessName}
              onChange={(event) => setCreateForm((form) => ({ ...form, businessName: event.target.value }))}
              placeholder="Business name, e.g. Nutritionbase"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
            <input
              value={createForm.website}
              onChange={(event) => setCreateForm((form) => ({ ...form, website: event.target.value }))}
              placeholder="Primary website, e.g. nutritionbase.com"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
            <input
              value={createForm.industry}
              onChange={(event) => setCreateForm((form) => ({ ...form, industry: event.target.value }))}
              placeholder="Industry, e.g. Ecommerce, Healthcare, Real Estate"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
            <input
              value={createForm.description}
              onChange={(event) => setCreateForm((form) => ({ ...form, description: event.target.value }))}
              placeholder="Short description"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createKnowledgeBase()}
              disabled={busy === "create-kb"}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-40"
            >
              {busy === "create-kb" ? "Creating…" : "Create Knowledge Base"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-card">
              Loading business knowledge bases…
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm font-bold text-slate-500 shadow-card">
              No knowledge bases yet. Add your first business to begin.
            </div>
          ) : (
            knowledgeBases.map((kb) => (
              <button
                key={kb.id}
                type="button"
                onClick={() => setSelectedId(kb.id)}
                className={`w-full rounded-3xl border p-4 text-left shadow-card transition ${
                  selected?.id === kb.id
                    ? "border-amber-300 bg-amber-50/70"
                    : "border-slate-200 bg-white hover:border-amber-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">
                      {kb.businessName || kb.name}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {kb.domain || kb.primaryUrl || "No primary website"}
                    </p>
                  </div>
                  {kb.isPrimary && (
                    <span className="rounded-full bg-slate-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                      Primary
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-100">
                    {kb.agentCount || 0} voice
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-100">
                    {kb.chatbotCount || 0} chatbot
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${statusTone(kb.syncStatus)}`}>
                    {kb.syncStatus || "pending"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600">
                    Selected Business
                  </p>
                  <h3 className="mt-2 text-xl font-black text-slate-900">
                    {selected.businessName || selected.name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Last synced: {formatDate(selected.lastSyncedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!selected.isPrimary && (
                    <button
                      type="button"
                      onClick={() => void makePrimary()}
                      disabled={busy === `primary-${selected.id}`}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:border-amber-200 hover:text-amber-700 disabled:opacity-40"
                    >
                      Make Primary
                    </button>
                  )}
                  {!selected.isPrimary && (
                    <button
                      type="button"
                      onClick={() => void deleteSelected()}
                      disabled={Boolean(busy)}
                      className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Knowledge base name</span>
                  <input
                    value={editForm.name}
                    onChange={(event) => setEditForm((form) => ({ ...form, name: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business name</span>
                  <input
                    value={editForm.businessName}
                    onChange={(event) => setEditForm((form) => ({ ...form, businessName: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Primary website</span>
                  <input
                    value={editForm.primaryUrl}
                    onChange={(event) => setEditForm((form) => ({ ...form, primaryUrl: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Industry</span>
                  <input
                    value={editForm.industry}
                    onChange={(event) => setEditForm((form) => ({ ...form, industry: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business description</span>
                  <textarea
                    rows={3}
                    value={editForm.description}
                    onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))}
                    className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveSelected()}
                  disabled={busy === `save-${selected.id}`}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  {busy === `save-${selected.id}` ? "Saving…" : "Save Business"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Source URLs</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Add website URLs that belong to this business. These sources remain isolated under this knowledge base.
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 ring-1 ring-slate-100">
                  {selected.sources?.length || 0} sources
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_14rem_auto]">
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://business.com/products or sitemap"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
                />
                <input
                  value={sourceTitle}
                  onChange={(event) => setSourceTitle(event.target.value)}
                  placeholder="Optional label"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-100"
                />
                <button
                  type="button"
                  onClick={() => void addSource()}
                  disabled={!sourceUrl.trim() || busy === `add-source-${selected.id}`}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  Add Source
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {(selected.sources || []).map((source) => {
                  const draft = sourceDrafts[source.id] || { title: source.title || "", url: source.url || "" };
                  return (
                    <div key={source.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_15rem]">
                          <input
                            value={draft.url}
                            onChange={(event) =>
                              setSourceDrafts((current) => ({
                                ...current,
                                [source.id]: { ...draft, url: event.target.value },
                              }))
                            }
                            disabled={source.isPrimary}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
                          />
                          <input
                            value={draft.title}
                            onChange={(event) =>
                              setSourceDrafts((current) => ({
                                ...current,
                                [source.id]: { ...draft, title: event.target.value },
                              }))
                            }
                            placeholder="Source title"
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void syncSource(source)}
                            disabled={busy === `sync-source-${source.id}`}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600 disabled:opacity-40"
                          >
                            {busy === `sync-source-${source.id}` ? "Syncing…" : "Sync"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveSource(source)}
                            disabled={busy === `save-source-${source.id}`}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-200 hover:text-amber-700 disabled:opacity-40"
                          >
                            Save
                          </button>
                          {!source.isPrimary && (
                            <button
                              type="button"
                              onClick={() => void deleteSource(source)}
                              disabled={busy === `delete-source-${source.id}`}
                              className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-100 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                        {source.isPrimary && <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">Primary source</span>}
                        <span className={`rounded-full px-2.5 py-1 ring-1 ${statusTone(source.scrapeStatus)}`}>
                          {source.scrapeStatus || "pending"}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-500 ring-1 ring-slate-100">
                          {source.pageCount || 0} pages
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-500 ring-1 ring-slate-100">
                          {source.chunkCount || 0} chunks
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-500 ring-1 ring-slate-100">
                          Last synced: {formatDate(source.lastScrapedAt)}
                        </span>
                      </div>
                      {source.lastError && (
                        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                          {source.lastError}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
                <h3 className="text-base font-black text-slate-900">Voice agent assignments</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Each voice agent should use exactly one business knowledge base.
                </p>
                <div className="mt-5 space-y-3">
                  {org.voiceAgents.map((agent) => {
                    const assigned = knowledgeBaseForAgent(knowledgeBases, agent);
                    return (
                      <div key={agent.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{agent.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Current: {assigned?.businessName || assigned?.name || "Unassigned"}
                            </p>
                          </div>
                          <select
                            value={assigned?.id || ""}
                            onChange={(event) => void assignVoiceAgent(agent, event.target.value)}
                            disabled={busy === `assign-agent-${agent.id}` || !knowledgeBases.length}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 sm:w-72"
                          >
                            {knowledgeBases.map((kb) => (
                              <option key={kb.id} value={kb.id}>
                                {kb.businessName || kb.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
                <h3 className="text-base font-black text-slate-900">Chatbot assignments</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Chatbots can use the same business as a voice agent or a different one.
                </p>
                <div className="mt-5 space-y-3">
                  {org.chatbots.map((chatbot) => {
                    const assigned = knowledgeBaseForChatbot(knowledgeBases, chatbot);
                    return (
                      <div key={chatbot.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{chatbot.name}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              Current: {assigned?.businessName || assigned?.name || "Unassigned"}
                            </p>
                          </div>
                          <select
                            value={assigned?.id || ""}
                            onChange={(event) => void assignChatbot(chatbot, event.target.value)}
                            disabled={busy === `assign-chatbot-${chatbot.id}` || !knowledgeBases.length}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100 sm:w-72"
                          >
                            {knowledgeBases.map((kb) => (
                              <option key={kb.id} value={kb.id}>
                                {kb.businessName || kb.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {org.chatbots.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                      No chatbots yet. Create one from the Chatbot Agent page.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 text-sm font-semibold leading-relaxed text-amber-900">
              <p className="font-black">Important isolation rule</p>
              <p className="mt-1">
                Agents assigned to {selected.businessName || selected.name} only retrieve FAQs and chunks from this business knowledge base. They will not answer from another business unless you deliberately reassign them.
              </p>
              <Link to="/agent" className="mt-3 inline-flex font-black text-amber-700 underline">
                Go to Voice Agent Studio
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBases;
