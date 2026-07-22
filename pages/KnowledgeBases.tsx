/**
 * agently/pages/KnowledgeBases.tsx   <-- FULL REPLACEMENT
 * PATCH 29 — P3. Replaces the file wholesale. Delete the old one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A REWRITE RATHER THAN A PATCH
 * ═══════════════════════════════════════════════════════════════════════════
 * The old file had a state architecture that could not be patched into
 * correctness. Three separate effects (lines 520, 556, 582) each called
 * loadKnowledgeBases(), which does setKnowledgeBases(freshArray) — a new array
 * identity every tick. Every card, every source row, every menu remounted every
 * 4-5 seconds. Two of those effects ran concurrently on overlapping intervals.
 * The third re-triggered syncs on sources stuck in 'scraping'.
 *
 * BOTH BLOCKERS, NAMED:
 *
 *   BLOCKER 1 (server) — setImmediate() on Vercel. Fixed by PATCH 18: the job
 *   runs on the always-on Railway worker. Sources can no longer stick, so the
 *   condition the stale-resume effect chased no longer exists.
 *
 *   BLOCKER 2 (client) — whole-list replacement on every tick. Fixed here by
 *   architecture, not by tuning intervals:
 *
 *     • The KB list is loaded ONCE and mutated surgically thereafter.
 *       updateOne() rewrites a single element and preserves the identity of
 *       every other element, so React skips them entirely.
 *     • Live scrape progress never enters this component's state at all. It
 *       lives inside <PageSelector>, which polls one small endpoint. This
 *       component does not re-render while a scrape runs.
 *     • Exactly one refresh happens at job completion, via onCompleted.
 *
 * Net effect: zero intervals in this file. The page is static unless the user
 * acts on it.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AgentConfig,
  ChatbotConfig,
  KnowledgeBase,
  Organization,
} from "../types";
import { api } from "../services/api";
import AppModal from "../components/AppModal";
import PageSelector from "../components/PageSelector";
import MonitoringToggle from "../components/MonitoringToggle";

interface KnowledgeBasesProps {
  org: Organization;
  initialKnowledgeBases?: KnowledgeBase[];
  onChanged?: () => void | Promise<void>;
}

type Toast = { ok: boolean; text: string } | null;

type DeleteCheck = {
  canDelete: boolean;
  blockerCount: number;
  blockers: {
    voiceAgents: Array<{ id: string; name: string }>;
    chatbots: Array<{ id: string; name: string }>;
  };
  cleanup: { sources: number; chunks: number; products: number; faqs: number };
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
  "Event Planning",
  "Fitness & Gym",
  "Healthcare",
  "Home Services",
  "Hospitality & Hotels",
  "Insurance",
  "Legal Services",
  "Logistics & Delivery",
  "Manufacturing",
  "Marketing Agency",
  "Real Estate",
  "Restaurant & Food",
  "Retail",
  "SaaS & Technology",
  "Travel & Tourism",
  "Veterinary",
  "Other",
];

const emptyForm = { name: "", website: "", industry: "", description: "" };

const KnowledgeBases: React.FC<KnowledgeBasesProps> = ({
  org,
  initialKnowledgeBases = [],
  onChanged,
}) => {
  const [bases, setBases] = useState<KnowledgeBase[]>(initialKnowledgeBases);
  const [loaded, setLoaded] = useState(initialKnowledgeBases.length > 0);
  const [activeId, setActiveId] = useState<string | null>(
    initialKnowledgeBases[0]?.id || null,
  );
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<DeleteCheck | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const agents = useMemo<AgentConfig[]>(
    () => org.voiceAgents || [],
    [org.voiceAgents],
  );
  const chatbots = useMemo<ChatbotConfig[]>(
    () => (org as any).chatbots || [],
    [org],
  );

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  // ── Loading ───────────────────────────────────────────────────────────────
  //
  // Called on mount, and after actions the user took. NEVER on a timer.
  // There is not a single setInterval or setTimeout-loop in this file.

  const loadAll = useCallback(async () => {
    try {
      const list = await api.listKnowledgeBases();
      setBases(list || []);
      setLoaded(true);
      setActiveId((current) =>
        current && (list || []).some((k: KnowledgeBase) => k.id === current)
          ? current
          : (list || [])[0]?.id || null,
      );
    } catch (err: any) {
      showToast(err?.message || "Could not load your knowledge bases.", false);
      setLoaded(true);
    }
  }, [showToast]);

  useEffect(() => {
    if (!initialKnowledgeBases.length) void loadAll();
    // Intentionally mount-only. Re-running this on every render is precisely
    // the loop the old file suffered from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Surgical single-item update. This is the core of blocker 2's fix.
   * Every untouched element keeps its object identity, so React's
   * reconciliation skips those subtrees entirely — no remount, no scroll jump,
   * no closed menus, no flicker.
   */
  const updateOne = useCallback((id: string, patch: Partial<KnowledgeBase>) => {
    setBases((current) => {
      const index = current.findIndex((k) => k.id === id);
      if (index === -1) return current;
      const next = current.slice();
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const active = useMemo(
    () => bases.find((k) => k.id === activeId) || null,
    [bases, activeId],
  );

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showToast("Give this knowledge base a name.", false);
      return;
    }
    setBusy("create");
    try {
      const created = await api.createKnowledgeBase({
        name: form.name.trim(),
        website: form.website.trim(),
        industry: form.industry,
        description: form.description.trim(),
      });
      // Append rather than reload: preserves identity of every existing card.
      setBases((current) => [...current, created]);
      setActiveId(created.id);
      setCreateOpen(false);
      setForm(emptyForm);
      showToast(`${created.name} created. Find its pages to get started.`);
      void onChanged?.();
    } catch (err: any) {
      showToast(err?.message || "Could not create that knowledge base.", false);
    } finally {
      setBusy(null);
    }
  };

  // ── Assignment ────────────────────────────────────────────────────────────

  const assignAgent = async (agent: AgentConfig, kbId: string) => {
    setBusy(`agent-${agent.id}`);
    try {
      await api.assignVoiceAgentKnowledgeBase(kbId, agent.id);
      updateOne(kbId, {
        linkedVoiceAgentIds: [
          ...new Set([
            ...((active as any)?.linkedVoiceAgentIds || []),
            agent.id,
          ]),
        ],
      } as any);
      showToast(`${agent.name} now uses this knowledge base.`);
      void onChanged?.();
    } catch (err: any) {
      showToast(err?.message || "Could not assign that agent.", false);
    } finally {
      setBusy(null);
    }
  };

  const assignChatbot = async (chatbot: ChatbotConfig, kbId: string) => {
    setBusy(`chatbot-${chatbot.id}`);
    try {
      await api.assignChatbotKnowledgeBase(kbId, chatbot.id);
      updateOne(kbId, {
        linkedChatbotIds: [
          ...new Set([
            ...((active as any)?.linkedChatbotIds || []),
            chatbot.id,
          ]),
        ],
      } as any);
      showToast(`${chatbot.name} now uses this knowledge base.`);
      void onChanged?.();
    } catch (err: any) {
      showToast(err?.message || "Could not assign that chatbot.", false);
    } finally {
      setBusy(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const openDelete = async (kb: KnowledgeBase) => {
    setDeleteTarget(kb);
    setDeleteCheck(null);
    setDeleteError("");
    try {
      const check = await api.getKnowledgeBaseDeleteCheck(kb.id);
      setDeleteCheck(check as DeleteCheck);
    } catch (err: any) {
      setDeleteError(err?.message || "Could not check what this would remove.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy("delete");
    try {
      await api.deleteKnowledgeBase(deleteTarget.id);
      setBases((current) => current.filter((k) => k.id !== deleteTarget.id));
      setActiveId((current) => (current === deleteTarget.id ? null : current));
      setDeleteTarget(null);
      showToast(`${deleteTarget.name} removed.`);
      void onChanged?.();
    } catch (err: any) {
      setDeleteError(err?.message || "Could not remove that knowledge base.");
    } finally {
      setBusy(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <p className="text-sm font-bold text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-2xl border p-4 text-sm font-bold ${
            toast.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Knowledge Bases</h2>
          <p className="mt-1 text-xs text-slate-500">
            What your agents know. Choose the pages worth learning from — you're
            charged per page read, so fewer, better pages usually wins.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
        >
          + New knowledge base
        </button>
      </div>

      {bases.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-16 text-center">
          <div className="mb-3 text-4xl">📚</div>
          <p className="text-base font-black text-slate-900">
            No knowledge bases yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Create one and point it at your website. We'll list the pages and
            you pick what your agent should learn.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 rounded-2xl bg-slate-900 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
          >
            Create one
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          {/* Sidebar */}
          <aside className="space-y-2">
            {bases.map((kb) => {
              const isActive = kb.id === activeId;
              const pending = (kb as any).pendingChangeCount || 0;
              return (
                <button
                  key={kb.id}
                  onClick={() => setActiveId(kb.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    isActive
                      ? "border-amber-400 bg-amber-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-black text-slate-900">
                      {kb.name}
                    </p>
                    {pending > 0 && (
                      <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-black text-white">
                        {pending}
                      </span>
                    )}
                  </div>
                  {(kb as any).website && (
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                      {(kb as any).website}
                    </p>
                  )}
                </button>
              );
            })}
          </aside>

          {/* Detail */}
          <section className="space-y-4">
            {active ? (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        {active.name}
                      </h3>
                      {(active as any).description && (
                        <p className="mt-1 text-xs text-slate-500">
                          {(active as any).description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => void openDelete(active)}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:border-rose-300"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Assignment */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Voice agents
                      </p>
                      {agents.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No agents yet.{" "}
                          <Link
                            to="/agent-settings"
                            className="font-bold text-amber-600"
                          >
                            Create one
                          </Link>
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {agents.map((agent) => {
                            const linked = (
                              (active as any).linkedVoiceAgentIds || []
                            ).includes(agent.id);
                            return (
                              <button
                                key={agent.id}
                                disabled={
                                  linked || busy === `agent-${agent.id}`
                                }
                                onClick={() =>
                                  void assignAgent(agent, active.id)
                                }
                                className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all ${
                                  linked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 hover:border-amber-300"
                                }`}
                              >
                                {agent.name} {linked && "✓"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Chatbots
                      </p>
                      {chatbots.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No chatbots yet.{" "}
                          <Link
                            to="/messenger"
                            className="font-bold text-amber-600"
                          >
                            Create one
                          </Link>
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {chatbots.map((bot) => {
                            const linked = (
                              (active as any).linkedChatbotIds || []
                            ).includes(bot.id);
                            return (
                              <button
                                key={bot.id}
                                disabled={
                                  linked || busy === `chatbot-${bot.id}`
                                }
                                onClick={() =>
                                  void assignChatbot(bot, active.id)
                                }
                                className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all ${
                                  linked
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 hover:border-amber-300"
                                }`}
                              >
                                {bot.name} {linked && "✓"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/*
                  Discovery / selection / progress. Everything about a running
                  scrape is owned by this child. It polls one endpoint and
                  re-renders only its own page cards. This parent does not
                  re-render while a scrape runs — that is the glitch fix.

                  `key` pins the child to the knowledge base, so switching KBs
                  tears down the old poller cleanly instead of leaking it.
                */}
                <PageSelector
                  key={active.id}
                  knowledgeBaseId={active.id}
                  website={(active as any).website || ""}
                  existingDiscoveryId={
                    (active as any).latestDiscoveryId || null
                  }
                  onToast={showToast}
                  // Fires ONCE, on completion. Never on a progress tick.
                  onCompleted={() => {
                    void loadAll();
                    void onChanged?.();
                  }}
                />

                <MonitoringToggle
                  key={`monitor-${active.id}`}
                  knowledgeBaseId={active.id}
                  initialEnabled={
                    (active as any).changeMonitoringEnabled === true
                  }
                  initialMode={
                    (active as any).changeMonitoringMode || "notify_only"
                  }
                  initialIntervalHours={
                    (active as any).changeMonitoringIntervalHours || 24
                  }
                  lastCheckedAt={(active as any).lastChangeCheckAt || null}
                  onToast={showToast}
                />
              </>
            ) : (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 p-16 text-center">
                <p className="text-sm font-bold text-slate-400">
                  Select a knowledge base
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Create modal */}
      <AppModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New knowledge base"
        description="Point it at a website and we'll show you what's there before anything is read."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={busy === "create"}
              className="rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {busy === "create" ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Main website"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Website
            </label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://yourbusiness.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Industry
            </label>
            <select
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-amber-300"
            >
              <option value="">Select…</option>
              {KB_INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>
      </AppModal>

      {/* Delete modal */}
      <AppModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Remove ${deleteTarget?.name || ""}?`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest"
            >
              Keep it
            </button>
            <button
              onClick={() => void confirmDelete()}
              disabled={busy === "delete" || deleteCheck?.canDelete === false}
              className="rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              {busy === "delete" ? "Removing…" : "Remove permanently"}
            </button>
          </div>
        }
      >
        {deleteError && (
          <p className="mb-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
            {deleteError}
          </p>
        )}
        {!deleteCheck ? (
          <p className="text-sm text-slate-500">Checking what this affects…</p>
        ) : deleteCheck.canDelete ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>This permanently removes everything your agents learned here:</p>
            <ul className="ml-4 list-disc text-xs text-slate-500">
              <li>{deleteCheck.cleanup.sources} source(s)</li>
              <li>
                {deleteCheck.cleanup.chunks} passage(s) of learned content
              </li>
              <li>{deleteCheck.cleanup.faqs} FAQ(s)</li>
              <li>{deleteCheck.cleanup.products} product record(s)</li>
            </ul>
            <p className="text-xs font-bold text-rose-600">
              This cannot be undone.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <p className="font-bold">
              Still in use — move these across first, or your agents will lose
              their answers mid-conversation:
            </p>
            <ul className="ml-4 list-disc text-xs text-slate-500">
              {deleteCheck.blockers.voiceAgents.map((a) => (
                <li key={a.id}>{a.name} (voice agent)</li>
              ))}
              {deleteCheck.blockers.chatbots.map((c) => (
                <li key={c.id}>{c.name} (chatbot)</li>
              ))}
            </ul>
          </div>
        )}
      </AppModal>
    </div>
  );
};

export default KnowledgeBases;
