import React, { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  type PlatformAssistantSnapshot,
} from "../../services/adminApi";

/**
 * agently/components/admin/PlatformAssistantAdmin.tsx   <-- NEW FILE
 *
 * Super-admin control panel for Agently's own in-app assistant.
 *
 * Four jobs, in the order they matter:
 *   1. Teach it   — FAQs and knowledge sources.
 *   2. Shape it   — persona, greeting, prompts, appearance.
 *   3. Watch it   — support escalations raised by tenants.
 *   4. Audit it   — confidentiality filter hits.
 *
 * Confidentiality mode itself is intentionally read-only here: there is no
 * legitimate reason to disable vendor secrecy on a customer-facing assistant,
 * and a switch that can leak the stack with one mis-click should not exist.
 */

type Section = "knowledge" | "behaviour" | "support" | "audit";

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "knowledge", label: "Knowledge & FAQs" },
  { key: "behaviour", label: "Persona & appearance" },
  { key: "support", label: "Escalations" },
  { key: "audit", label: "Confidentiality log" },
];

const card =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const label =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500";
const input =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-[#F59E0B]";
const textarea =
  "mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#F59E0B]";
const primaryBtn =
  "h-11 rounded-xl bg-[#0F172A] px-5 text-sm font-bold text-white transition disabled:opacity-40";
const ghostBtn =
  "h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:border-slate-300";

const PlatformAssistantAdmin: React.FC = () => {
  const [snapshot, setSnapshot] = useState<PlatformAssistantSnapshot | null>(
    null,
  );
  const [section, setSection] = useState<Section>("knowledge");

  /** Signed screenshot URLs, keyed by support request id. Fetched on click
   *  because the links expire after five minutes. */
  const [shots, setShots] = useState<
    Record<
      string,
      Array<{ path: string; url: string | null; error: string | null }>
    >
  >({});

  const loadShots = useCallback(async (requestId: string) => {
    try {
      const result = await adminApi.platformSupportAttachments(requestId);
      setShots((current) => ({ ...current, [requestId]: result.attachments }));
    } catch (err) {
      setShots((current) => ({
        ...current,
        [requestId]: [
          {
            path: "error",
            url: null,
            error: err instanceof Error ? err.message : "Could not load.",
          },
        ],
      }));
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // Persona draft
  const [form, setForm] = useState({
    name: "",
    headerTitle: "",
    welcomeMessage: "",
    placeholder: "",
    accentColor: "#F59E0B",
    supportEmail: "",
    customPrompt: "",
    suggestedPrompts: ["", "", "", ""],
    isActive: true,
  });
  const [spendCap, setSpendCap] = useState("25");

  // Composers
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.platformAssistant();
      setSnapshot(data);
      setForm({
        name: data.chatbot.name,
        headerTitle: data.chatbot.headerTitle,
        welcomeMessage: data.chatbot.welcomeMessage,
        placeholder: data.chatbot.placeholder,
        accentColor: data.chatbot.accentColor,
        supportEmail: data.chatbot.supportEmail,
        customPrompt: data.chatbot.customPrompt,
        suggestedPrompts: [0, 1, 2, 3].map(
          (index) => data.chatbot.suggestedPrompts[index] || "",
        ),
        isActive: data.chatbot.isActive,
      });
      setSpendCap(String(data.organization.dailySpendCapUsd));
    } catch (err) {
      setError(
        (err as Error).message ||
          "Could not load the assistant. Has the platform migration been run?",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  };

  const run = async (task: () => Promise<string>) => {
    setSaving(true);
    setError("");
    try {
      flash(await task());
      await load();
    } catch (err) {
      setError((err as Error).message || "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={card}>
        <p className="text-sm text-slate-500">Loading the assistant…</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
        {error || "No platform assistant found."}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-bold underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const spendPct = snapshot.spend.capUsd
    ? Math.min(100, (snapshot.spend.spentUsd / snapshot.spend.capUsd) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* ── Status strip ───────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <p className={label}>Status</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                form.isActive ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            {form.isActive ? "Live for tenants" : "Switched off"}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                await adminApi.updatePlatformAssistant({
                  isActive: !form.isActive,
                });
                return form.isActive
                  ? "Assistant switched off."
                  : "Assistant is live.";
              })
            }
            className="mt-3 text-xs font-bold text-[#B45309] underline"
          >
            {form.isActive ? "Switch off" : "Switch on"}
          </button>
        </div>

        <div className={card}>
          <p className={label}>Today's spend</p>
          <p className="mt-2 text-lg font-semibold">
            ${snapshot.spend.spentUsd.toFixed(2)}
            <span className="text-sm font-normal text-slate-400">
              {" "}
              / ${snapshot.spend.capUsd.toFixed(2)}
            </span>
          </p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                snapshot.spend.degraded ? "bg-red-500" : "bg-[#F59E0B]"
              }`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
          {snapshot.spend.degraded ? (
            <p className="mt-2 text-[11px] font-semibold text-red-600">
              Cap reached — answering from FAQs only.
            </p>
          ) : null}
        </div>

        <div className={card}>
          <p className={label}>Confidentiality filter</p>
          <p className="mt-2 text-lg font-semibold">
            {snapshot.violations.length} blocked
          </p>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Answers stopped before reaching a tenant. Locked on and not
            editable.
          </p>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* ── Section switcher ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            className={`h-10 rounded-xl px-4 text-xs font-bold transition ${
              section === item.key
                ? "bg-[#0F172A] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Knowledge ──────────────────────────────────────────────────── */}
      {section === "knowledge" ? (
        <div className="space-y-5">
          <div className={card}>
            <p className="text-sm font-semibold">Add an FAQ</p>
            <p className="mt-1 text-xs text-slate-500">
              Hand-written answers outrank scraped content and are what the
              assistant falls back to when the daily cap is reached.
            </p>
            <input
              value={faqQuestion}
              onChange={(event) => setFaqQuestion(event.target.value)}
              placeholder="How do I assign a number to an agent?"
              className={input}
            />
            <textarea
              value={faqAnswer}
              onChange={(event) => setFaqAnswer(event.target.value)}
              rows={4}
              placeholder="Open Phone Numbers, find the number, then choose Assign to agent…"
              className={textarea}
            />
            <button
              type="button"
              disabled={saving || !faqQuestion.trim() || !faqAnswer.trim()}
              onClick={() =>
                void run(async () => {
                  await adminApi.createPlatformFaq({
                    question: faqQuestion,
                    answer: faqAnswer,
                  });
                  setFaqQuestion("");
                  setFaqAnswer("");
                  return "FAQ added.";
                })
              }
              className={`${primaryBtn} mt-3`}
            >
              Add FAQ
            </button>
          </div>

          <div className={card}>
            <p className="text-sm font-semibold">Bulk import</p>
            <p className="mt-1 text-xs text-slate-500">
              One per line as <code>question, answer</code>. Only the first
              comma splits the line, so answers can contain commas.
            </p>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={6}
              placeholder={
                "How do I add credit?, Open Billing and choose Add credit.\nWhere are my call logs?, Call Logs in the left sidebar."
              }
              className={`${textarea} font-mono text-xs`}
            />
            <button
              type="button"
              disabled={saving || !bulkText.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await adminApi.importPlatformFaqs(bulkText);
                  setBulkText("");
                  return `Imported ${result.imported} FAQs.`;
                })
              }
              className={`${primaryBtn} mt-3`}
            >
              Import
            </button>
          </div>

          <div className={card}>
            <p className="text-sm font-semibold">Knowledge sources</p>
            <p className="mt-1 text-xs text-slate-500">
              Public Agently pages only. Never add internal documentation — the
              assistant quotes what it is given.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.agentlycall.com/features"
                className={`${input} mt-0 flex-1`}
              />
              <button
                type="button"
                disabled={saving || !sourceUrl.trim()}
                onClick={() =>
                  void run(async () => {
                    await adminApi.addPlatformSource(sourceUrl.trim());
                    setSourceUrl("");
                    return "Source queued for indexing.";
                  })
                }
                className={primaryBtn}
              >
                Add source
              </button>
            </div>

            {snapshot.sources.length ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {snapshot.sources.map((source) => (
                  <li
                    key={source.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {source.title || source.url}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {source.url} · {source.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await adminApi.deletePlatformSource(source.id);
                          return "Source removed.";
                        })
                      }
                      className="shrink-0 text-xs font-bold text-red-500"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-400">No sources yet.</p>
            )}
          </div>

          <div className={card}>
            <p className="text-sm font-semibold">
              FAQs in the knowledge base ({snapshot.faqs.length})
            </p>
            {snapshot.faqs.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {snapshot.faqs.map((faq) => (
                  <li key={faq.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{faq.question}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {faq.answer}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () => {
                              await adminApi.updatePlatformFaq(faq.id, {
                                isPublished: !faq.is_published,
                              });
                              return faq.is_published
                                ? "FAQ unpublished."
                                : "FAQ published.";
                            })
                          }
                          className="text-[11px] font-bold text-slate-500"
                        >
                          {faq.is_published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () => {
                              await adminApi.deletePlatformFaq(faq.id);
                              return "FAQ deleted.";
                            })
                          }
                          className="text-[11px] font-bold text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-400">No FAQs yet.</p>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Behaviour ──────────────────────────────────────────────────── */}
      {section === "behaviour" ? (
        <div className="space-y-5">
          <div className={card}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Assistant name</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="block">
                <span className={label}>Panel header</span>
                <input
                  value={form.headerTitle}
                  onChange={(event) =>
                    setForm({ ...form, headerTitle: event.target.value })
                  }
                  className={input}
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className={label}>Opening message</span>
              <textarea
                value={form.welcomeMessage}
                onChange={(event) =>
                  setForm({ ...form, welcomeMessage: event.target.value })
                }
                rows={2}
                className={textarea}
              />
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Input placeholder</span>
                <input
                  value={form.placeholder}
                  onChange={(event) =>
                    setForm({ ...form, placeholder: event.target.value })
                  }
                  className={input}
                />
              </label>
              <label className="block">
                <span className={label}>Support email</span>
                <input
                  value={form.supportEmail}
                  onChange={(event) =>
                    setForm({ ...form, supportEmail: event.target.value })
                  }
                  className={input}
                />
              </label>
            </div>

            <div className="mt-4">
              <span className={label}>Suggested questions (up to four)</span>
              <div className="mt-1.5 space-y-2">
                {form.suggestedPrompts.map((prompt, index) => (
                  <input
                    key={index}
                    value={prompt}
                    onChange={(event) => {
                      const next = [...form.suggestedPrompts];
                      next[index] = event.target.value;
                      setForm({ ...form, suggestedPrompts: next });
                    }}
                    placeholder={`Suggestion ${index + 1}`}
                    className={`${input} mt-0`}
                  />
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className={label}>Behaviour instructions</span>
              <p className="mt-1 text-xs text-slate-500">
                How it should help. The confidentiality rules are appended
                automatically and always win — do not restate them here, and do
                not name any vendor, or every answer echoing that name gets
                blocked.
              </p>
              <textarea
                value={form.customPrompt}
                onChange={(event) =>
                  setForm({ ...form, customPrompt: event.target.value })
                }
                rows={8}
                className={textarea}
              />
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  const result = await adminApi.updatePlatformAssistant({
                    name: form.name,
                    headerTitle: form.headerTitle,
                    welcomeMessage: form.welcomeMessage,
                    placeholder: form.placeholder,
                    accentColor: form.accentColor,
                    supportEmail: form.supportEmail,
                    customPrompt: form.customPrompt,
                    suggestedPrompts: form.suggestedPrompts.filter((p) =>
                      p.trim(),
                    ),
                  });
                  return result.warning || "Assistant updated.";
                })
              }
              className={`${primaryBtn} mt-5`}
            >
              Save changes
            </button>
          </div>

          <div className={card}>
            <p className="text-sm font-semibold">Daily spend cap</p>
            <p className="mt-1 text-xs text-slate-500">
              Tenants are never charged for the assistant, so this cost lands on
              Agently. Past the cap it answers from FAQs only rather than going
              offline.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min="0"
                step="1"
                value={spendCap}
                onChange={(event) => setSpendCap(event.target.value)}
                className={`${input} mt-0 sm:max-w-[180px]`}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(async () => {
                    await adminApi.updatePlatformSettings(Number(spendCap));
                    return "Spend cap updated.";
                  })
                }
                className={ghostBtn}
              >
                Update cap
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Escalations ────────────────────────────────────────────────── */}
      {section === "support" ? (
        <div className={card}>
          <p className="text-sm font-semibold">
            Support requests ({snapshot.supportRequests.length})
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Raised by tenants through the assistant. Logged here even when the
            email fails to send, so nothing is lost.
          </p>
          {snapshot.supportRequests.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {snapshot.supportRequests.map((request) => (
                <li key={request.id} className="py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        request.status === "resolved"
                          ? "bg-emerald-100 text-emerald-700"
                          : request.status === "acknowledged"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {request.status}
                    </span>
                    <span className="text-sm font-medium">
                      {request.contact_name || "Agently customer"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {request.contact_email}
                    </span>
                    {!request.emailed_at ? (
                      <span className="text-[10px] font-bold text-red-500">
                        EMAIL NOT SENT
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {request.body}
                  </p>

                  {/* Screenshots are fetched on demand rather than with the
                      snapshot: the signed URLs expire in 5 minutes, so
                      pre-loading them would hand the admin dead links. */}
                  {request.attachments && request.attachments.length > 0 ? (
                    <div className="mt-2">
                      {shots[request.id] ? (
                        <div className="flex flex-wrap gap-2">
                          {shots[request.id].map((file) =>
                            file.url ? (
                              <a
                                key={file.path}
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-lg border border-slate-200 transition hover:border-[#F59E0B]"
                              >
                                <img
                                  src={file.url}
                                  alt="Screenshot from the reporter"
                                  className="h-28 w-auto object-cover"
                                />
                              </a>
                            ) : (
                              <span
                                key={file.path}
                                className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600"
                              >
                                Couldn&rsquo;t load: {file.error || "unknown error"}
                              </span>
                            ),
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void loadShots(request.id)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-[#F59E0B] hover:text-[#F59E0B]"
                        >
                          View {request.attachments.length} screenshot
                          {request.attachments.length === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                  ) : null}
                  <div className="mt-2 flex gap-3">
                    {(["acknowledged", "resolved"] as const).map((status) =>
                      request.status === status ? null : (
                        <button
                          key={status}
                          type="button"
                          onClick={() =>
                            void run(async () => {
                              await adminApi.updatePlatformSupportRequest(
                                request.id,
                                status,
                              );
                              return `Marked ${status}.`;
                            })
                          }
                          className="text-[11px] font-bold text-slate-500 underline"
                        >
                          Mark {status}
                        </button>
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              Nothing escalated yet.
            </p>
          )}
        </div>
      ) : null}

      {/* ── Audit ──────────────────────────────────────────────────────── */}
      {section === "audit" ? (
        <div className={card}>
          <p className="text-sm font-semibold">Blocked answers</p>
          <p className="mt-1 text-xs text-slate-500">
            The assistant was about to name something confidential and the reply
            was replaced. Each entry is a gap in the knowledge base or the
            instructions worth closing.
          </p>
          {snapshot.violations.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {snapshot.violations.map((violation) => (
                <li key={violation.id} className="py-3">
                  <p className="text-sm font-medium">{violation.question}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Matched:{" "}
                    <span className="font-mono text-red-600">
                      {(violation.matched_terms || []).join(", ")}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-slate-400">
              Nothing blocked. The filter is running on every answer.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default PlatformAssistantAdmin;
