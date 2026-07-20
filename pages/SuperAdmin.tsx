import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BlogContent from "../components/BlogContent";
import {
  adminApi,
  getAdminToken,
  type BlogPostInput,
  type SuperAdminMetrics,
  type SuperAdminUser,
} from "../services/adminApi";
import type {
  BlogBlock,
  BlogPost,
  BlogStatus,
  BlogTemplateKey,
} from "../services/blogApi";

type AdminTab = "overview" | "users" | "blog";
type BlogWorkspaceTab = "build" | "automation";

const createId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const TEMPLATE_PRESETS: Record<
  BlogTemplateKey,
  { label: string; description: string; blocks: BlogBlock[] }
> = {
  product_update: {
    label: "Product update",
    description:
      "A strong release announcement with a summary, feature detail, and supporting visual.",
    blocks: [
      {
        id: createId(),
        type: "paragraph",
        text: "Start with a clear summary of what changed and why it matters to Agently customers.",
      },
      { id: createId(), type: "heading", text: "What is new" },
      {
        id: createId(),
        type: "paragraph",
        text: "Explain the update in practical terms. Focus on the customer outcome rather than internal implementation details.",
      },
      { id: createId(), type: "image", url: "", alt: "", caption: "" },
      {
        id: createId(),
        type: "heading",
        text: "What this means for your team",
      },
      {
        id: createId(),
        type: "paragraph",
        text: "Close with the actions customers can now take and what to expect next.",
      },
    ],
  },
  editorial: {
    label: "Editorial",
    description:
      "A thoughtful article with a strong point of view, supporting sections, and a pull quote.",
    blocks: [
      {
        id: createId(),
        type: "paragraph",
        text: "Open with the problem, observation, or market change the article will explore.",
      },
      { id: createId(), type: "heading", text: "The real issue" },
      {
        id: createId(),
        type: "paragraph",
        text: "Develop the main idea with useful examples and a clear point of view.",
      },
      {
        id: createId(),
        type: "quote",
        text: "Use this block for the most memorable sentence in the article.",
      },
      { id: createId(), type: "heading", text: "A better way forward" },
      {
        id: createId(),
        type: "paragraph",
        text: "End with practical advice readers can apply immediately.",
      },
    ],
  },
  guide: {
    label: "Practical guide",
    description:
      "A structured how-to article with steps, a visual, and a concise conclusion.",
    blocks: [
      {
        id: createId(),
        type: "paragraph",
        text: "Explain what the reader will be able to do by the end of this guide.",
      },
      { id: createId(), type: "heading", text: "Before you begin" },
      {
        id: createId(),
        type: "bullets",
        items: [
          "First requirement",
          "Second requirement",
          "The result you are aiming for",
        ],
      },
      { id: createId(), type: "image", url: "", alt: "", caption: "" },
      { id: createId(), type: "heading", text: "Put it into practice" },
      {
        id: createId(),
        type: "paragraph",
        text: "Walk through the process and finish with the next best action.",
      },
    ],
  },
};

const emptyPost = (
  templateKey: BlogTemplateKey = "product_update",
): BlogPostInput => ({
  title: "",
  excerpt: "",
  status: "draft",
  templateKey,
  coverImageUrl: "",
  authorName: "Agently Team",
  contentBlocks: TEMPLATE_PRESETS[templateKey].blocks.map((block) => ({
    ...block,
    id: createId(),
  })) as BlogBlock[],
  seoTitle: "",
  seoDescription: "",
});

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const accountStatusInfo = (status: string) => {
  const normalized = String(status || "unknown").toLowerCase();
  if (normalized === "active") {
    return {
      label: "Enabled",
      detail: "The organization can use prepaid credit normally.",
    };
  }
  if (normalized === "trialing") {
    return {
      label: "Legacy trial flag",
      detail:
        "A leftover organization flag; it is not a paid plan or current trial offer.",
    };
  }
  if (normalized === "past_due") {
    return {
      label: "Billing hold",
      detail: "The account was marked for billing attention.",
    };
  }
  if (normalized === "canceled") {
    return {
      label: "Disabled",
      detail: "The organization subscription flag is disabled.",
    };
  }
  return {
    label: normalized || "Unknown",
    detail: "No recognized organization status was returned.",
  };
};

const AdminLogin: React.FC<{ onAuthenticated: (email: string) => void }> = ({
  onAuthenticated,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .config()
      .then((config) => {
        setEnabled(config.enabled);
        setOtpRequired(config.otpRequired);
      })
      .catch(() => setEnabled(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.login(email, password, otp);
      onAuthenticated(response.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08111f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F172A] shadow-[0_36px_120px_rgba(0,0,0,.38)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(245,158,11,.2),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,.12),transparent_42%)]" />
          <div className="relative">
            <img
              src="/agently-reception-wordmark-light.png"
              alt="Agently"
              className="h-10 w-auto"
            />
          </div>
          <div className="relative max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#F59E0B]">
              Owner control room
            </p>
            <h1 className="mt-5 text-[clamp(2.8rem,5vw,5.6rem)] font-medium leading-[0.9] tracking-[-0.07em]">
              Private access to the business behind Agently.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/55">
              Manage customers, monitor wallet exposure, and publish public
              product updates from one protected workspace.
            </p>
          </div>
          <p className="relative text-xs text-white/35">
            This route is intentionally absent from public navigation.
          </p>
        </div>

        <div className="flex items-center justify-center bg-[#F8FAFC] p-6 text-[#0F172A] sm:p-10 lg:p-12">
          <form onSubmit={submit} className="w-full max-w-md">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-700"
            >
              ← Return to Agently
            </Link>
            <p className="mt-10 text-[10px] font-black uppercase tracking-[0.24em] text-[#F59E0B]">
              Super admin
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em]">
              Secure sign in
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Use the owner credentials configured on the backend. Access is
              rate-limited and expires automatically.
            </p>

            {!enabled ? (
              <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Super-admin access is disabled or not configured on the backend.
              </div>
            ) : null}
            {error ? (
              <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Admin email
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="username"
                  required
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Password
                </span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                />
              </label>
              {otpRequired ? (
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">
                    Authenticator code
                  </span>
                  <input
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm tracking-[0.35em] outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/15"
                  />
                </label>
              ) : null}
              <button
                disabled={loading || !enabled}
                className="h-12 w-full rounded-xl bg-[#0F172A] px-5 text-sm font-bold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? "Verifying…" : "Enter control room"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const BlockEditor: React.FC<{
  blocks: BlogBlock[];
  onChange: (blocks: BlogBlock[]) => void;
  onUpload: (file: File) => Promise<string>;
}> = ({ blocks, onChange, onUpload }) => {
  const [newBlockType, setNewBlockType] =
    useState<BlogBlock["type"]>("paragraph");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    blocks[0]?.id || null,
  );

  useEffect(() => {
    if (!blocks.length) {
      setSelectedBlockId(null);
      return;
    }
    if (
      !selectedBlockId ||
      !blocks.some((block) => block.id === selectedBlockId)
    ) {
      setSelectedBlockId(blocks[0].id);
    }
  }, [blocks, selectedBlockId]);

  const update = (index: number, next: BlogBlock) =>
    onChange(
      blocks.map((block, blockIndex) => (blockIndex === index ? next : block)),
    );

  const updateStyle = (
    index: number,
    patch: NonNullable<BlogBlock["style"]>,
  ) => {
    const block = blocks[index];
    update(index, {
      ...block,
      style: { ...(block.style || {}), ...patch },
    } as BlogBlock);
  };

  const remove = (index: number) =>
    onChange(blocks.filter((_, blockIndex) => blockIndex !== index));

  const duplicate = (index: number) => {
    const copy = { ...blocks[index], id: createId() } as BlogBlock;
    onChange([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const add = (type: BlogBlock["type"]) => {
    const block: BlogBlock =
      type === "image"
        ? {
            id: createId(),
            type,
            url: "",
            alt: "",
            caption: "",
            style: { widthPercent: 100, mediaFit: "cover", borderRadius: 20 },
          }
        : type === "video"
          ? {
              id: createId(),
              type,
              url: "",
              caption: "",
              posterUrl: "",
              style: { widthPercent: 100, mediaFit: "cover", borderRadius: 20 },
            }
          : type === "bullets"
            ? {
                id: createId(),
                type,
                items: [""],
                style: { widthPercent: 100, textAlign: "left" },
              }
            : {
                id: createId(),
                type,
                text: "",
                style: {
                  widthPercent: 100,
                  textAlign: "left",
                  fontSize:
                    type === "heading" ? 34 : type === "quote" ? 26 : 17,
                },
              };
    onChange([...blocks, block]);
  };

  const isTextBlock = (block: BlogBlock) =>
    block.type === "heading" ||
    block.type === "paragraph" ||
    block.type === "quote" ||
    block.type === "bullets";

  const selectedIndex = blocks.findIndex(
    (block) => block.id === selectedBlockId,
  );
  const selectedBlock = selectedIndex >= 0 ? blocks[selectedIndex] : null;
  const selectedStyle = selectedBlock?.style || {};

  return (
    <div>
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Element to add"
            value={newBlockType}
            onChange={(event) =>
              setNewBlockType(event.target.value as BlogBlock["type"])
            }
            className="h-10 min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-amber-400"
          >
            <option value="heading">Heading</option>
            <option value="paragraph">Paragraph</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="quote">Quote</option>
            <option value="bullets">Bullets</option>
          </select>
          <button
            type="button"
            onClick={() => add(newBlockType)}
            className="h-10 rounded-xl bg-[#0F172A] px-4 text-xs font-bold text-white"
          >
            + Add element
          </button>
          <span className="ml-auto hidden text-[11px] text-slate-400 lg:block">
            Select a block, edit its style here, or drag ⋮⋮ to reposition it.
          </span>
        </div>

        {selectedBlock && isTextBlock(selectedBlock) ? (
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.7fr_0.9fr_auto_auto_auto]">
            <label>
              <span className="sr-only">Font family</span>
              <select
                value={selectedStyle.fontFamily || "default"}
                onChange={(event) =>
                  updateStyle(selectedIndex, {
                    fontFamily: event.target.value as NonNullable<
                      BlogBlock["style"]
                    >["fontFamily"],
                  })
                }
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600"
              >
                <option value="default">Site font</option>
                <option value="sans">Clean sans</option>
                <option value="display">Display</option>
                <option value="serif">Editorial serif</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Font size</span>
              <input
                type="number"
                min="12"
                max="92"
                value={selectedStyle.fontSize || ""}
                placeholder="Size"
                onChange={(event) =>
                  updateStyle(selectedIndex, {
                    fontSize: Number(event.target.value),
                  })
                }
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600"
              />
            </label>
            <label>
              <span className="sr-only">Text alignment</span>
              <select
                value={selectedStyle.textAlign || "left"}
                onChange={(event) =>
                  updateStyle(selectedIndex, {
                    textAlign: event.target.value as NonNullable<
                      BlogBlock["style"]
                    >["textAlign"],
                  })
                }
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600"
              >
                <option value="left">Align left</option>
                <option value="center">Align center</option>
                <option value="right">Align right</option>
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500">
              Text
              <input
                type="color"
                value={selectedStyle.textColor || "#0f172a"}
                onChange={(event) =>
                  updateStyle(selectedIndex, { textColor: event.target.value })
                }
                className="h-6 w-7 border-0 bg-transparent"
              />
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500">
              Fill
              <input
                type="color"
                value={selectedStyle.backgroundColor || "#ffffff"}
                onChange={(event) =>
                  updateStyle(selectedIndex, {
                    backgroundColor: event.target.value,
                  })
                }
                className="h-6 w-7 border-0 bg-transparent"
              />
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500">
              <input
                type="checkbox"
                checked={Boolean(
                  "readAloud" in selectedBlock && selectedBlock.readAloud,
                )}
                onChange={(event) =>
                  update(selectedIndex, {
                    ...selectedBlock,
                    readAloud: event.target.checked,
                  } as BlogBlock)
                }
                className="h-4 w-4 accent-amber-500"
              />
              Listen
            </label>
          </div>
        ) : selectedBlock ? (
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            {selectedBlock.type === "image"
              ? "Image selected — use the controls in the block to replace it, add alt text, resize it, or change its fit."
              : "Video selected — paste a lightweight hosted MP4 URL and use the block controls for its poster, size, and fit."}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {blocks.map((block, index) => {
          const style = block.style || {};
          return (
            <div
              key={block.id}
              onClick={() => setSelectedBlockId(block.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedIndex !== null) moveTo(draggedIndex, index);
                setDraggedIndex(null);
              }}
              className={`rounded-2xl border bg-white p-4 transition ${
                draggedIndex === index
                  ? "border-amber-400 opacity-60"
                  : selectedBlockId === block.id
                    ? "border-amber-400 ring-2 ring-amber-400/10"
                    : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragEnd={() => setDraggedIndex(null)}
                  className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-xl bg-slate-100 text-sm font-black text-slate-500 active:cursor-grabbing"
                  aria-label={`Drag ${block.type} block`}
                  title="Drag to reorder"
                >
                  ⋮⋮
                </button>

                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      {index + 1}. {block.type}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="h-8 w-8 rounded-lg border border-slate-200 text-xs text-slate-500 disabled:opacity-30"
                        aria-label="Move block up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === blocks.length - 1}
                        className="h-8 w-8 rounded-lg border border-slate-200 text-xs text-slate-500 disabled:opacity-30"
                        aria-label="Move block down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicate(index)}
                        className="h-8 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-500"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="h-8 w-8 rounded-lg border border-red-100 text-xs text-red-500"
                        aria-label="Remove block"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {block.type === "image" ? (
                    <div className="space-y-3">
                      {block.url ? (
                        <img
                          src={block.url}
                          alt=""
                          className="max-h-56 w-full rounded-xl object-cover"
                        />
                      ) : null}
                      <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#0F172A] px-3 py-2 text-xs font-bold text-white">
                        {block.url ? "Replace image" : "Upload image"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const url = await onUpload(file);
                            update(index, { ...block, url });
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <input
                        value={block.alt || ""}
                        onChange={(event) =>
                          update(index, { ...block, alt: event.target.value })
                        }
                        placeholder="Alternative text"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                      />
                      <input
                        value={block.caption || ""}
                        onChange={(event) =>
                          update(index, {
                            ...block,
                            caption: event.target.value,
                          })
                        }
                        placeholder="Optional caption"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                      />
                    </div>
                  ) : block.type === "video" ? (
                    <div className="space-y-3">
                      {block.url ? (
                        <video
                          src={block.url}
                          poster={block.posterUrl || undefined}
                          controls
                          preload="metadata"
                          className="max-h-64 w-full rounded-xl bg-slate-950"
                        />
                      ) : null}
                      <input
                        value={block.url}
                        onChange={(event) =>
                          update(index, { ...block, url: event.target.value })
                        }
                        placeholder="Paste a lightweight MP4 or hosted video URL"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          value={block.posterUrl || ""}
                          onChange={(event) =>
                            update(index, {
                              ...block,
                              posterUrl: event.target.value,
                            })
                          }
                          placeholder="Optional poster image URL"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                        />
                        <input
                          value={block.caption || ""}
                          onChange={(event) =>
                            update(index, {
                              ...block,
                              caption: event.target.value,
                            })
                          }
                          placeholder="Optional caption"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                  ) : block.type === "bullets" ? (
                    <div className="space-y-2">
                      {block.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex gap-2">
                          <input
                            value={item}
                            onChange={(event) =>
                              update(index, {
                                ...block,
                                items: block.items.map((entry, entryIndex) =>
                                  entryIndex === itemIndex
                                    ? event.target.value
                                    : entry,
                                ),
                              })
                            }
                            placeholder={`List item ${itemIndex + 1}`}
                            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-amber-400"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              update(index, {
                                ...block,
                                items: block.items.filter(
                                  (_, entryIndex) => entryIndex !== itemIndex,
                                ),
                              })
                            }
                            className="h-10 w-10 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          update(index, {
                            ...block,
                            items: [...block.items, ""],
                          })
                        }
                        className="text-xs font-bold text-amber-700"
                      >
                        + Add list item
                      </button>
                    </div>
                  ) : (
                    <textarea
                      value={block.text}
                      onChange={(event) =>
                        update(index, {
                          ...block,
                          text: event.target.value,
                        } as BlogBlock)
                      }
                      rows={block.type === "heading" ? 2 : 5}
                      placeholder={
                        block.type === "heading"
                          ? "Section heading"
                          : block.type === "quote"
                            ? "Pull quote"
                            : "Write the paragraph"
                      }
                      className="w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-amber-400"
                    />
                  )}

                  <details className="mt-4 rounded-xl bg-slate-50 p-3">
                    <summary className="cursor-pointer text-xs font-bold text-slate-600">
                      More block settings: width, spacing, background image, and
                      corners
                    </summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {isTextBlock(block) ? (
                        <>
                          <label>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Font
                            </span>
                            <select
                              value={style.fontFamily || "default"}
                              onChange={(event) =>
                                updateStyle(index, {
                                  fontFamily: event.target.value as NonNullable<
                                    BlogBlock["style"]
                                  >["fontFamily"],
                                })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            >
                              <option value="default">Site default</option>
                              <option value="sans">Clean sans</option>
                              <option value="display">Display</option>
                              <option value="serif">Editorial serif</option>
                              <option value="mono">Monospace</option>
                            </select>
                          </label>
                          <label>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Font size
                            </span>
                            <input
                              type="number"
                              min="12"
                              max="92"
                              value={style.fontSize || ""}
                              onChange={(event) =>
                                updateStyle(index, {
                                  fontSize: Number(event.target.value),
                                })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            />
                          </label>
                          <label>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Text color
                            </span>
                            <div className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2">
                              <input
                                type="color"
                                value={style.textColor || "#0f172a"}
                                onChange={(event) =>
                                  updateStyle(index, {
                                    textColor: event.target.value,
                                  })
                                }
                                className="h-7 w-9 border-0 bg-transparent"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateStyle(index, { textColor: undefined })
                                }
                                className="text-[10px] font-bold text-slate-400"
                              >
                                Reset
                              </button>
                            </div>
                          </label>
                          <label>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Background
                            </span>
                            <div className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2">
                              <input
                                type="color"
                                value={style.backgroundColor || "#ffffff"}
                                onChange={(event) =>
                                  updateStyle(index, {
                                    backgroundColor: event.target.value,
                                  })
                                }
                                className="h-7 w-9 border-0 bg-transparent"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateStyle(index, {
                                    backgroundColor: undefined,
                                  })
                                }
                                className="text-[10px] font-bold text-slate-400"
                              >
                                Clear
                              </button>
                            </div>
                          </label>
                        </>
                      ) : null}

                      <label>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Alignment
                        </span>
                        <select
                          value={style.textAlign || "left"}
                          onChange={(event) =>
                            updateStyle(index, {
                              textAlign: event.target.value as NonNullable<
                                BlogBlock["style"]
                              >["textAlign"],
                            })
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>

                      <label>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Width: {style.widthPercent || 100}%
                        </span>
                        <input
                          type="range"
                          min="35"
                          max="100"
                          step="5"
                          value={style.widthPercent || 100}
                          onChange={(event) =>
                            updateStyle(index, {
                              widthPercent: Number(event.target.value),
                            })
                          }
                          className="mt-3 w-full accent-amber-500"
                        />
                      </label>

                      <label>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Rounded corners
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="48"
                          value={style.borderRadius ?? 20}
                          onChange={(event) =>
                            updateStyle(index, {
                              borderRadius: Number(event.target.value),
                            })
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                        />
                      </label>

                      {isTextBlock(block) ? (
                        <>
                          <label>
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Vertical padding
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="96"
                              value={style.paddingY || 0}
                              onChange={(event) =>
                                updateStyle(index, {
                                  paddingY: Number(event.target.value),
                                })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            />
                          </label>
                          <label className="sm:col-span-2 lg:col-span-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                              Background image
                            </span>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600">
                                {style.backgroundImageUrl
                                  ? "Replace background"
                                  : "Upload background"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    const url = await onUpload(file);
                                    updateStyle(index, {
                                      backgroundImageUrl: url,
                                    });
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              {style.backgroundImageUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStyle(index, {
                                      backgroundImageUrl: undefined,
                                    })
                                  }
                                  className="text-[11px] font-bold text-red-500"
                                >
                                  Remove background
                                </button>
                              ) : null}
                            </div>
                          </label>
                          {style.backgroundImageUrl ? (
                            <label className="sm:col-span-2 lg:col-span-3">
                              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                Image overlay:{" "}
                                {Math.round(
                                  (style.overlayOpacity ?? 0.5) * 100,
                                )}
                                %
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="0.92"
                                step="0.05"
                                value={style.overlayOpacity ?? 0.5}
                                onChange={(event) =>
                                  updateStyle(index, {
                                    overlayOpacity: Number(event.target.value),
                                  })
                                }
                                className="mt-3 w-full accent-amber-500"
                              />
                            </label>
                          ) : null}
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-3">
                            <input
                              type="checkbox"
                              checked={Boolean(
                                "readAloud" in block && block.readAloud,
                              )}
                              onChange={(event) =>
                                update(index, {
                                  ...block,
                                  readAloud: event.target.checked,
                                } as BlogBlock)
                              }
                              className="h-4 w-4 accent-amber-500"
                            />
                            Show a listen button for this section
                          </label>
                        </>
                      ) : (
                        <label>
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                            Media fit
                          </span>
                          <select
                            value={style.mediaFit || "cover"}
                            onChange={(event) =>
                              updateStyle(index, {
                                mediaFit: event.target.value as NonNullable<
                                  BlogBlock["style"]
                                >["mediaFit"],
                              })
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                          >
                            <option value="cover">Fill area</option>
                            <option value="contain">Show full media</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          );
        })}

        {!blocks.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
            <p className="text-sm text-slate-400">
              Add the first content element from the toolbar above.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const BlogPreview: React.FC<{
  draft: BlogPostInput;
  compact?: boolean;
}> = ({ draft, compact = false }) => (
  <article className="overflow-hidden rounded-[1.5rem] border border-slate-900/10 bg-white shadow-sm">
    {draft.coverImageUrl ? (
      <img
        src={draft.coverImageUrl}
        alt=""
        className={`${compact ? "aspect-[16/7]" : "aspect-[16/8]"} w-full object-cover`}
      />
    ) : (
      <div
        className={`${compact ? "h-24" : "h-36"} bg-[linear-gradient(135deg,#0F172A,#F59E0B)]`}
      />
    )}
    <div className={compact ? "p-5" : "p-7 sm:p-9"}>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
        {draft.authorName || "Agently Team"}
      </p>
      <h1
        className={`${compact ? "mt-2 text-2xl" : "mt-3 text-[clamp(2.2rem,5vw,4.8rem)]"} font-medium leading-[0.96] tracking-[-0.06em] text-[#0F172A]`}
      >
        {draft.title || "Your article headline"}
      </h1>
      <p
        className={`${compact ? "mt-3 text-sm" : "mt-5 text-base"} leading-7 text-slate-500`}
      >
        {draft.excerpt || "The article summary will appear here."}
      </p>
      <div className={compact ? "mt-6" : "mt-9"}>
        <BlogContent
          blocks={draft.contentBlocks.filter(
            (block) =>
              (block.type !== "image" && block.type !== "video") ||
              Boolean(block.url),
          )}
          templateKey={draft.templateKey}
        />
      </div>
    </div>
  </article>
);

const FitBlogPreview: React.FC<{ draft: BlogPostInput }> = ({ draft }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const sourceWidth = 780;

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const availableWidth = Math.max(1, viewport.clientWidth - 16);
        const availableHeight = Math.max(1, viewport.clientHeight - 16);
        const pageHeight = Math.max(1, page.scrollHeight);
        const nextScale = Math.min(
          1,
          availableWidth / sourceWidth,
          availableHeight / pageHeight,
        );
        setScale(Number.isFinite(nextScale) ? Math.max(0.08, nextScale) : 0.5);
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(page);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [draft]);

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-0 overflow-hidden rounded-[1.4rem] bg-slate-200/70 p-2"
    >
      <div
        ref={pageRef}
        style={{
          width: `${sourceWidth}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <BlogPreview draft={draft} />
      </div>
      <span className="absolute bottom-2 right-2 rounded-full bg-[#0F172A]/80 px-2 py-1 text-[9px] font-bold text-white">
        Fit {Math.round(scale * 100)}%
      </span>
    </div>
  );
};

const SuperAdmin: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(Boolean(getAdminToken()));
  const [adminEmail, setAdminEmail] = useState("");
  const [tab, setTab] = useState<AdminTab>("overview");
  const [metrics, setMetrics] = useState<SuperAdminMetrics | null>(null);
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BlogPostInput>(() => emptyPost());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [blogWorkspaceTab, setBlogWorkspaceTab] =
    useState<BlogWorkspaceTab>("build");
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "pending" | "saved" | "local" | "error"
  >("idle");
  const autosaveTimerRef = useRef<number | null>(null);
  const saveBusyRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const [deleteTarget, setDeleteTarget] = useState<SuperAdminUser | null>(null);
  const [deleteScope, setDeleteScope] = useState<"user" | "organization">(
    "user",
  );
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [topUpTarget, setTopUpTarget] = useState<SuperAdminUser | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);
  const [topUpMessage, setTopUpMessage] = useState("");
  const [automationStatus, setAutomationStatus] = useState<{
    configured: boolean;
    webhookConfigured: boolean;
    secretConfigured: boolean;
    ingestUrl: string;
  } | null>(null);
  const [automationSubmitting, setAutomationSubmitting] = useState(false);
  const [automationWaitingSince, setAutomationWaitingSince] = useState<
    number | null
  >(null);
  const [automationMessage, setAutomationMessage] = useState("");
  const [automationForm, setAutomationForm] = useState({
    topic: "",
    keywords: "",
    templateKey: "product_update" as BlogTemplateKey,
    tone: "confident, plain-spoken",
    notes: "",
    autoPublish: false,
  });

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) || null,
    [posts, selectedPostId],
  );

  const handleAuthFailure = (err: unknown) => {
    const status = (err as Error & { status?: number })?.status;
    if (status === 401) {
      adminApi.logout();
      setAuthenticated(false);
    }
  };

  const loadOverview = async () => {
    try {
      setMetrics(await adminApi.overview());
    } catch (err) {
      handleAuthFailure(err);
      setError(err instanceof Error ? err.message : "Unable to load metrics.");
    }
  };

  const loadUsers = async (page = userPage, search = userSearch) => {
    try {
      const response = await adminApi.users(search, page, 25);
      setUsers(response.rows);
      setUserTotal(response.total);
      setUserPage(response.page);
    } catch (err) {
      handleAuthFailure(err);
      setError(err instanceof Error ? err.message : "Unable to load users.");
    }
  };

  const loadPosts = async () => {
    try {
      const nextPosts = await adminApi.blogPosts();
      setPosts(nextPosts);
      return nextPosts;
    } catch (err) {
      handleAuthFailure(err);
      setError(
        err instanceof Error ? err.message : "Unable to load blog posts.",
      );
      return [] as BlogPost[];
    }
  };

  const loadAutomationStatus = async () => {
    try {
      setAutomationStatus(await adminApi.blogAutomationStatus());
    } catch (err) {
      handleAuthFailure(err);
      // Non-fatal: the blog tab still works without n8n configured.
    }
  };

  const submitTopUp = async () => {
    if (!topUpTarget?.organizationId) {
      setTopUpMessage("This user has no organization to credit.");
      return;
    }
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpMessage("Enter an amount greater than zero.");
      return;
    }
    setTopUpSubmitting(true);
    setTopUpMessage("");
    try {
      await adminApi.topUpWallet(topUpTarget.organizationId, amount);
      setTopUpMessage(`Added ${money(amount)}.`);
      await loadUsers(userPage, userSearch);
      setTimeout(() => setTopUpTarget(null), 900);
    } catch (err) {
      handleAuthFailure(err);
      setTopUpMessage(
        err instanceof Error ? err.message : "Unable to add credit.",
      );
    } finally {
      setTopUpSubmitting(false);
    }
  };

  const triggerAutomation = async () => {
    if (!automationForm.topic.trim()) {
      setAutomationMessage("Add a topic or brief first.");
      return;
    }
    setAutomationSubmitting(true);
    setAutomationMessage("");
    try {
      const sentAt = Date.now();
      const response = await adminApi.triggerBlogAutomation({
        ...automationForm,
        authorName: draft.authorName || "Agently Team",
      });
      setAutomationWaitingSince(sentAt);
      setAutomationMessage(
        `${response.message} Agently is watching for the returned post.`,
      );
    } catch (err) {
      handleAuthFailure(err);
      setAutomationMessage(
        err instanceof Error ? err.message : "Unable to reach n8n.",
      );
    } finally {
      setAutomationSubmitting(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    adminApi
      .session()
      .then((session) => {
        setAdminEmail(session.email);
        void Promise.all([
          loadOverview(),
          loadUsers(1, ""),
          loadPosts(),
          loadAutomationStatus(),
        ]);
      })
      .catch(() => {
        adminApi.logout();
        setAuthenticated(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !automationWaitingSince) return;
    let cancelled = false;

    const checkForGeneratedPost = async () => {
      try {
        const nextPosts = await adminApi.blogPosts();
        if (cancelled) return;
        setPosts(nextPosts);
        const generated = nextPosts.find((post) => {
          const timestamp = new Date(
            post.createdAt || post.updatedAt,
          ).getTime();
          return (
            post.createdBy === "n8n-automation" &&
            Number.isFinite(timestamp) &&
            timestamp >= automationWaitingSince - 5000
          );
        });
        if (!generated) return;
        setSelectedPostId(generated.id);
        setBlogWorkspaceTab("build");
        setAutomationWaitingSince(null);
        setAutomationMessage(
          `Received “${generated.title}”. It is now open in Build page and remains editable even when published.`,
        );
      } catch {
        // A temporary database or network outage should not cancel the waiting state.
      }
    };

    void checkForGeneratedPost();
    const interval = window.setInterval(
      () => void checkForGeneratedPost(),
      5000,
    );
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setAutomationWaitingSince(null);
      setAutomationMessage(
        "The workflow was triggered, but no returned post was detected yet. Use Refresh posts after n8n finishes.",
      );
    }, 120000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [authenticated, automationWaitingSince]);

  useEffect(() => {
    if (!selectedPost) return;
    const nextDraft: BlogPostInput = {
      title: selectedPost.title,
      slug: selectedPost.slug,
      excerpt: selectedPost.excerpt,
      status: selectedPost.status || "draft",
      templateKey: selectedPost.templateKey,
      coverImageUrl: selectedPost.coverImageUrl,
      authorName: selectedPost.authorName,
      contentBlocks: selectedPost.contentBlocks || [],
      seoTitle: selectedPost.seoTitle || "",
      seoDescription: selectedPost.seoDescription || "",
    };
    lastSavedDraftRef.current = JSON.stringify(nextDraft);
    setDraft(nextDraft);
    setAutosaveState("saved");
  }, [selectedPost]);

  useEffect(() => {
    if (!authenticated || tab !== "blog" || typeof window === "undefined")
      return;
    const signature = JSON.stringify(draft);
    window.localStorage.setItem("agently:super-admin:blog-recovery", signature);

    if (!draft.title.trim()) {
      setAutosaveState("local");
      return;
    }
    if (signature === lastSavedDraftRef.current) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    setAutosaveState("pending");

    autosaveTimerRef.current = window.setTimeout(async () => {
      if (saveBusyRef.current) return;
      saveBusyRef.current = true;
      try {
        const input: BlogPostInput = {
          ...draft,
          status: draft.status || "draft",
        };
        const saved = selectedPostId
          ? await adminApi.updateBlogPost(selectedPostId, input)
          : await adminApi.createBlogPost(input);
        const nextDraft = { ...input, slug: saved.slug };
        lastSavedDraftRef.current = JSON.stringify(nextDraft);
        setSelectedPostId(saved.id);
        setDraft(nextDraft);
        setPosts((current) => [
          saved,
          ...current.filter((post) => post.id !== saved.id),
        ]);
        setAutosaveState("saved");
      } catch {
        setAutosaveState("error");
      } finally {
        saveBusyRef.current = false;
      }
    }, 2500);

    return () => {
      if (autosaveTimerRef.current)
        window.clearTimeout(autosaveTimerRef.current);
    };
  }, [authenticated, draft, selectedPostId, tab]);

  if (!authenticated)
    return (
      <AdminLogin
        onAuthenticated={(email) => {
          setAdminEmail(email);
          setAuthenticated(true);
        }}
      />
    );

  const savePost = async (status: BlogStatus) => {
    if (saveBusyRef.current) return;
    saveBusyRef.current = true;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const input: BlogPostInput = { ...draft, status };
      const saved = selectedPostId
        ? await adminApi.updateBlogPost(selectedPostId, input)
        : await adminApi.createBlogPost(input);
      const nextDraft = { ...input, slug: saved.slug };
      lastSavedDraftRef.current = JSON.stringify(nextDraft);
      setSelectedPostId(saved.id);
      setDraft(nextDraft);
      setPosts((current) => [
        saved,
        ...current.filter((post) => post.id !== saved.id),
      ]);
      await loadOverview();
      setAutosaveState("saved");
      setMessage(
        status === "published"
          ? "Blog post published to Supabase."
          : "Draft saved to Supabase.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save this post.",
      );
    } finally {
      saveBusyRef.current = false;
      setLoading(false);
    }
  };

  const upload = async (file: File) => {
    setLoading(true);
    setError("");
    try {
      return (await adminApi.uploadBlogImage(file)).url;
    } finally {
      setLoading(false);
    }
  };

  const startNewPost = (templateKey: BlogTemplateKey = "product_update") => {
    lastSavedDraftRef.current = "";
    setSelectedPostId(null);
    setDraft(emptyPost(templateKey));
    setAutosaveState("local");
    setTab("blog");
    setBlogWorkspaceTab("build");
    setMessage("");
    setError("");
  };

  const restoreLocalDraft = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(
        "agently:super-admin:blog-recovery",
      );
      if (!raw) return;
      const recovered = JSON.parse(raw) as BlogPostInput;
      if (!Array.isArray(recovered.contentBlocks)) return;
      lastSavedDraftRef.current = "";
      setSelectedPostId(null);
      setDraft(recovered);
      setAutosaveState("local");
      setMessage(
        "Recovered the last browser draft. It will autosave after a headline is present.",
      );
    } catch {
      setError("The browser recovery copy could not be restored.");
    }
  };

  const startFromCurrentTemplate = () => {
    lastSavedDraftRef.current = "";
    setSelectedPostId(null);
    setDraft({
      ...draft,
      title: "",
      slug: undefined,
      excerpt: "",
      status: "draft",
      coverImageUrl: draft.coverImageUrl || "",
      contentBlocks: draft.contentBlocks.map((block) => ({
        ...block,
        id: createId(),
      })) as BlogBlock[],
    });
    setAutosaveState("local");
    setMessage("A new post was created from the current layout.");
  };

  const duplicateCurrentPost = () => {
    lastSavedDraftRef.current = "";
    setSelectedPostId(null);
    setDraft({
      ...draft,
      title: draft.title ? `${draft.title} copy` : "",
      slug: undefined,
      status: "draft",
      contentBlocks: draft.contentBlocks.map((block) => ({
        ...block,
        id: createId(),
      })) as BlogBlock[],
    });
    setAutosaveState("pending");
    setMessage("Duplicated as a new draft.");
  };

  const archiveCurrentPost = async () => {
    if (!selectedPostId) return;
    await savePost("archived");
  };

  const deleteCurrentPost = async () => {
    if (!selectedPostId) return;
    const confirmed = window.confirm(
      "Permanently delete this blog post? This cannot be undone.",
    );
    if (!confirmed) return;
    setLoading(true);
    setError("");
    try {
      await adminApi.deleteBlogPost(selectedPostId);
      setPosts((current) =>
        current.filter((post) => post.id !== selectedPostId),
      );
      startNewPost();
      setMessage("Blog post permanently deleted.");
      await loadOverview();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete this post.",
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const required =
      deleteScope === "organization"
        ? "DELETE_ORGANIZATION_DATA"
        : "DELETE_USER_DATA";
    if (deleteConfirm !== required) return;
    setLoading(true);
    setError("");
    try {
      await adminApi.previewDeleteUser(deleteTarget.id, deleteScope);
      await adminApi.deleteUser(deleteTarget.id, deleteScope, deleteConfirm);
      setDeleteTarget(null);
      setDeleteConfirm("");
      await Promise.all([loadUsers(1, userSearch), loadOverview()]);
      setMessage("The selected account was permanently removed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete this account.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-[#0F172A]">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#0F172A] px-5 py-6 text-white lg:flex">
          <img
            src="/agently-reception-wordmark-light.png"
            alt="Agently"
            className="h-auto w-40"
          />
          <p className="mt-8 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            Owner workspace
          </p>
          <nav className="mt-3 space-y-1">
            {(["overview", "users", "blog"] as AdminTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`flex h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium capitalize transition ${tab === item ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
              >
                {item === "overview"
                  ? "Overview"
                  : item === "users"
                    ? "Users & credit"
                    : "Blog publishing"}
              </button>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/10 pt-5">
            <p className="truncate px-3 text-xs text-white/40">{adminEmail}</p>
            <button
              type="button"
              onClick={() => {
                adminApi.logout();
                setAuthenticated(false);
              }}
              className="mt-3 h-10 w-full rounded-xl bg-[#F59E0B] px-4 text-xs font-bold text-white"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F59E0B]">
                  Super admin
                </p>
                <h1 className="mt-1 text-2xl font-semibold capitalize tracking-[-0.045em]">
                  {tab === "blog" ? "Blog publishing" : tab}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={tab}
                  onChange={(event) => setTab(event.target.value as AdminTab)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm lg:hidden"
                >
                  <option value="overview">Overview</option>
                  <option value="users">Users & credit</option>
                  <option value="blog">Blog publishing</option>
                </select>
                <Link
                  to="/"
                  className="hidden h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 sm:inline-flex"
                >
                  View website
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {error ? (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {tab === "overview" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ["Registered users", metrics?.users ?? 0],
                    ["Organizations", metrics?.organizations ?? 0],
                    ["Published posts", metrics?.publishedPosts ?? 0],
                    ["Below $1 credit", metrics?.lowCreditOrganizations ?? 0],
                    [
                      "Customer credit",
                      money(metrics?.totalCustomerCreditUsd ?? 0),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-[-0.055em]">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTab("users")}
                    className="rounded-3xl bg-[#0F172A] p-7 text-left text-white shadow-sm transition hover:-translate-y-0.5"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F59E0B]">
                      Customer operations
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold">
                      Review users and wallet exposure
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-white/55">
                      Search every user, inspect the organization attached to
                      them, see remaining credit, and start a protected
                      account-deletion flow.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => startNewPost()}
                    className="rounded-3xl border border-slate-200 bg-white p-7 text-left shadow-sm transition hover:-translate-y-0.5"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F59E0B]">
                      Publishing
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold">
                      Create the next Agently update
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Choose a structured template, add images and sections,
                      preview the article, then save or publish it.
                    </p>
                  </button>
                </div>
              </div>
            ) : null}

            {tab === "users" ? (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadUsers(1, userSearch);
                    }}
                    placeholder="Search by name or email"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => void loadUsers(1, userSearch)}
                    className="h-11 rounded-xl bg-[#0F172A] px-5 text-xs font-bold text-white"
                  >
                    Search users
                  </button>
                </div>
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  Agently currently uses prepaid credit. “Trialing” and “active”
                  are legacy organization-status flags in the database, not
                  subscription plans. Trialing means the old default flag was
                  never migrated; active means the organization is enabled.
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        <tr>
                          <th className="px-5 py-4">User</th>
                          <th className="px-5 py-4">Organization</th>
                          <th className="px-5 py-4">Billing model</th>
                          <th className="px-5 py-4">Credit left</th>
                          <th className="px-5 py-4">Account state</th>
                          <th className="px-5 py-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-slate-50/60">
                            <td className="px-5 py-4">
                              <p className="text-sm font-bold">
                                {user.name || "Unnamed user"}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {user.email} · {user.role}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold">
                                {user.organizationName || "—"}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {user.onboarded
                                  ? "Onboarded"
                                  : "Setup incomplete"}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-700">
                                Prepaid credit
                              </p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                Usage deducted from wallet
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <p
                                className={`text-sm font-black ${user.walletBalanceUsd < 1 ? "text-red-600" : "text-emerald-600"}`}
                              >
                                {money(user.walletBalanceUsd)} left
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {money(user.walletCreditsAddedUsd)} added
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setTopUpTarget(user);
                                  setTopUpAmount("10");
                                  setTopUpMessage("");
                                }}
                                className="mt-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                              >
                                + Add credit
                              </button>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                title={
                                  accountStatusInfo(user.subscriptionStatus)
                                    .detail
                                }
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"
                              >
                                {
                                  accountStatusInfo(user.subscriptionStatus)
                                    .label
                                }
                              </span>
                              <p className="mt-2 max-w-48 text-[10px] leading-4 text-slate-400">
                                {
                                  accountStatusInfo(user.subscriptionStatus)
                                    .detail
                                }
                              </p>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteTarget(user);
                                  setDeleteScope(
                                    user.role === "Owner"
                                      ? "organization"
                                      : "user",
                                  );
                                  setDeleteConfirm("");
                                }}
                                className="rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                              >
                                Delete account
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!users.length ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-5 py-12 text-center text-sm text-slate-400"
                            >
                              No users found.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                    <span>{userTotal} users</span>
                    <div className="flex gap-2">
                      <button
                        disabled={userPage <= 1}
                        onClick={() => void loadUsers(userPage - 1, userSearch)}
                        className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-35"
                      >
                        Previous
                      </button>
                      <button
                        disabled={userPage * 25 >= userTotal}
                        onClick={() => void loadUsers(userPage + 1, userSearch)}
                        className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-35"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "blog" ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                        Blog workspace
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                        Build manually or generate through n8n
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        Every manual or automated post is stored in the same
                        Supabase table and remains editable after publishing.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void loadPosts()}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600"
                      >
                        Refresh posts
                      </button>
                      <button
                        type="button"
                        onClick={restoreLocalDraft}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600"
                      >
                        Restore browser draft
                      </button>
                      <button
                        type="button"
                        onClick={() => startNewPost()}
                        className="h-10 rounded-xl bg-[#F59E0B] px-5 text-xs font-black uppercase tracking-[0.1em] text-white"
                      >
                        + New blog post
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                    <div className="h-16 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0F172A,#F59E0B)]">
                      {selectedPost?.coverImageUrl ? (
                        <img
                          src={selectedPost.coverImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <label className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        Open a saved post
                      </span>
                      <select
                        value={selectedPostId || ""}
                        onChange={(event) => {
                          const postId = event.target.value || null;
                          setSelectedPostId(postId);
                          if (postId) setBlogWorkspaceTab("build");
                        }}
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-amber-400"
                      >
                        <option value="">Unsaved/new post</option>
                        {posts.map((post) => (
                          <option key={post.id} value={post.id}>
                            {post.createdBy === "n8n-automation"
                              ? "[n8n] "
                              : ""}
                            {post.title || "Untitled"} —{" "}
                            {post.status || "draft"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {selectedPost?.status || draft.status || "draft"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500">
                        {selectedPost?.createdBy === "n8n-automation"
                          ? "Generated by n8n"
                          : selectedPost
                            ? "Created in dashboard"
                            : "New draft"}
                      </span>
                    </div>
                  </div>
                </section>

                <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setBlogWorkspaceTab("build")}
                    className={`h-10 rounded-xl px-5 text-xs font-black transition ${
                      blogWorkspaceTab === "build"
                        ? "bg-[#0F172A] text-white"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Build page
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlogWorkspaceTab("automation")}
                    className={`h-10 rounded-xl px-5 text-xs font-black transition ${
                      blogWorkspaceTab === "automation"
                        ? "bg-[#0F172A] text-white"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Connect automation
                  </button>
                </div>

                {blogWorkspaceTab === "build" ? (
                  <div className="grid h-[calc(100vh-16rem)] min-h-[640px] max-h-[860px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
                    <div className="min-h-0 overflow-y-auto bg-slate-50/55 p-4 sm:p-5">
                      <div className="sticky top-0 z-30 mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F59E0B]">
                            {selectedPostId ? "Editing saved post" : "New post"}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {autosaveState === "pending"
                              ? "Saving changes…"
                              : autosaveState === "saved"
                                ? "Saved to Supabase"
                                : autosaveState === "error"
                                  ? "Autosave failed — use Save draft"
                                  : "Browser recovery active"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedPostId ? (
                            <>
                              <button
                                type="button"
                                onClick={duplicateCurrentPost}
                                className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={startFromCurrentTemplate}
                                className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600"
                              >
                                Use as template
                              </button>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => void archiveCurrentPost()}
                                className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600"
                              >
                                Archive
                              </button>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => void deleteCurrentPost()}
                                className="h-9 rounded-xl border border-red-100 px-3 text-[11px] font-bold text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void savePost("draft")}
                            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700"
                          >
                            Save draft
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void savePost("published")}
                            className="h-9 rounded-xl bg-[#0F172A] px-4 text-[11px] font-bold text-white"
                          >
                            {draft.status === "published"
                              ? "Update published"
                              : "Publish"}
                          </button>
                        </div>
                      </div>

                      <details
                        open
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <summary className="cursor-pointer text-sm font-black text-[#0F172A]">
                          Article setup
                        </summary>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="md:col-span-2">
                            <span className="text-xs font-bold text-slate-600">
                              Headline
                            </span>
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  title: event.target.value,
                                })
                              }
                              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                              placeholder="Write the blog headline"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              Author
                            </span>
                            <input
                              value={draft.authorName}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  authorName: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              URL slug
                            </span>
                            <input
                              value={draft.slug || ""}
                              onChange={(event) =>
                                setDraft({ ...draft, slug: event.target.value })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                              placeholder="created-from-the-headline"
                            />
                          </label>
                          <label className="md:col-span-2">
                            <span className="text-xs font-bold text-slate-600">
                              Article summary
                            </span>
                            <textarea
                              value={draft.excerpt}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  excerpt: event.target.value,
                                })
                              }
                              rows={3}
                              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-amber-400"
                              placeholder="A concise summary shown on the blog archive"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              Layout template
                            </span>
                            <select
                              value={draft.templateKey}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  templateKey: event.target
                                    .value as BlogTemplateKey,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-amber-400"
                            >
                              {(
                                Object.keys(
                                  TEMPLATE_PRESETS,
                                ) as BlogTemplateKey[]
                              ).map((key) => (
                                <option key={key} value={key}>
                                  {TEMPLATE_PRESETS[key].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  "Replace the current content blocks with this preset?",
                                );
                                if (!confirmed) return;
                                setDraft({
                                  ...draft,
                                  contentBlocks: TEMPLATE_PRESETS[
                                    draft.templateKey
                                  ].blocks.map((block) => ({
                                    ...block,
                                    id: createId(),
                                  })) as BlogBlock[],
                                });
                              }}
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600"
                            >
                              Apply selected preset
                            </button>
                          </div>
                          <div className="md:col-span-2 rounded-xl bg-slate-50 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              {draft.coverImageUrl ? (
                                <img
                                  src={draft.coverImageUrl}
                                  alt=""
                                  className="h-20 w-full rounded-xl object-cover sm:w-32"
                                />
                              ) : (
                                <div className="flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 sm:w-32">
                                  Cover image
                                </div>
                              )}
                              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-[#0F172A] px-4 text-xs font-bold text-white">
                                {draft.coverImageUrl
                                  ? "Replace cover"
                                  : "Upload cover"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      const url = await upload(file);
                                      setDraft((current) => ({
                                        ...current,
                                        coverImageUrl: url,
                                      }));
                                    } catch (err) {
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : "Image upload failed.",
                                      );
                                    }
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              {draft.coverImageUrl ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft({ ...draft, coverImageUrl: "" })
                                  }
                                  className="text-xs font-bold text-red-600"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              SEO title
                            </span>
                            <input
                              value={draft.seoTitle || ""}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  seoTitle: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              SEO description
                            </span>
                            <input
                              value={draft.seoDescription || ""}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  seoDescription: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                            />
                          </label>
                        </div>
                      </details>

                      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                            Visual page builder
                          </p>
                          <h3 className="mt-2 text-xl font-semibold">
                            Add and reposition content
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            The element, font, size, alignment, color, fill, and
                            Listen controls stay visible above the selected
                            block. Drag the ⋮⋮ handle to move a block.
                          </p>
                        </div>
                        <BlockEditor
                          blocks={draft.contentBlocks}
                          onChange={(contentBlocks) =>
                            setDraft({ ...draft, contentBlocks })
                          }
                          onUpload={upload}
                        />
                      </section>
                    </div>

                    <aside className="flex min-h-0 flex-col overflow-hidden border-l border-slate-200 bg-[#fbfaf4] p-4">
                      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                            Live preview
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            The complete article is scaled to fit—no preview
                            scrollbar.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewOpen(true)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"
                        >
                          Inspect full size
                        </button>
                      </div>
                      <div className="min-h-0 flex-1">
                        <FitBlogPreview draft={draft} />
                      </div>
                    </aside>
                  </div>
                ) : (
                  <div className="grid h-[calc(100vh-16rem)] min-h-[620px] max-h-[820px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-2">
                    <section className="min-h-0 overflow-y-auto border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                        n8n connection
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold">
                        Connect the automated blog workflow
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        This tab keeps workflow setup separate from the visual
                        builder. n8n returns its finished article to Agently,
                        where it can be opened, edited, republished, archived,
                        duplicated, or deleted.
                      </p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        {[
                          ["Webhook", automationStatus?.webhookConfigured],
                          ["Shared secret", automationStatus?.secretConfigured],
                          ["Connection", automationStatus?.configured],
                        ].map(([label, ready]) => (
                          <div
                            key={String(label)}
                            className="rounded-xl bg-slate-50 p-3"
                          >
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                              {label}
                            </p>
                            <p
                              className={`mt-2 text-sm font-black ${ready ? "text-emerald-600" : "text-amber-600"}`}
                            >
                              {ready ? "Ready" : "Not configured"}
                            </p>
                          </div>
                        ))}
                      </div>

                      <label className="mt-5 block">
                        <span className="text-xs font-bold text-slate-600">
                          Agently callback URL
                        </span>
                        <div className="mt-2 flex gap-2">
                          <input
                            readOnly
                            value={
                              automationStatus?.ingestUrl ||
                              "Load the connection status first"
                            }
                            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600"
                          />
                          <button
                            type="button"
                            disabled={!automationStatus?.ingestUrl}
                            onClick={() => {
                              if (automationStatus?.ingestUrl) {
                                void navigator.clipboard.writeText(
                                  automationStatus.ingestUrl,
                                );
                                setAutomationMessage("Callback URL copied.");
                              }
                            }}
                            className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-40"
                          >
                            Copy
                          </button>
                        </div>
                      </label>

                      <div className="mt-5 rounded-2xl bg-[#0F172A] p-5 text-white">
                        <p className="text-xs font-black text-[#F59E0B]">
                          Backend connection values
                        </p>
                        <div className="mt-3 space-y-2 font-mono text-[11px] leading-5 text-white/70">
                          <p>
                            N8N_BLOG_WEBHOOK_URL = your n8n production webhook
                          </p>
                          <p>
                            N8N_BLOG_INGEST_SECRET = one long random shared
                            secret
                          </p>
                        </div>
                        <ol className="mt-4 space-y-2 text-xs leading-5 text-white/65">
                          <li>
                            1. n8n receives the generation brief from Agently.
                          </li>
                          <li>
                            2. The workflow creates the title, excerpt, cover
                            URL, SEO fields, and content or contentBlocks.
                          </li>
                          <li>
                            3. n8n POSTs the result to the callback URL with
                            header x-agently-automation-secret.
                          </li>
                          <li>
                            4. Agently stores the returned article in blog_posts
                            and opens it in Build page.
                          </li>
                        </ol>
                      </div>
                    </section>

                    <section className="min-h-0 overflow-y-auto p-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                        Generate article
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold">
                        Send a structured brief
                      </h3>
                      <div className="mt-5 grid gap-4">
                        <label>
                          <span className="text-xs font-bold text-slate-600">
                            Topic or full brief
                          </span>
                          <textarea
                            value={automationForm.topic}
                            onChange={(event) =>
                              setAutomationForm({
                                ...automationForm,
                                topic: event.target.value,
                              })
                            }
                            rows={5}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                            placeholder="Describe the article, audience, goal, and facts the workflow should use"
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              Keywords
                            </span>
                            <input
                              value={automationForm.keywords}
                              onChange={(event) =>
                                setAutomationForm({
                                  ...automationForm,
                                  keywords: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                              placeholder="voice AI, lead response"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              Tone
                            </span>
                            <input
                              value={automationForm.tone}
                              onChange={(event) =>
                                setAutomationForm({
                                  ...automationForm,
                                  tone: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-amber-400"
                            />
                          </label>
                          <label>
                            <span className="text-xs font-bold text-slate-600">
                              Template
                            </span>
                            <select
                              value={automationForm.templateKey}
                              onChange={(event) =>
                                setAutomationForm({
                                  ...automationForm,
                                  templateKey: event.target
                                    .value as BlogTemplateKey,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-amber-400"
                            >
                              {(
                                Object.keys(
                                  TEMPLATE_PRESETS,
                                ) as BlogTemplateKey[]
                              ).map((key) => (
                                <option key={key} value={key}>
                                  {TEMPLATE_PRESETS[key].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-end">
                            <span className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600">
                              <input
                                type="checkbox"
                                checked={automationForm.autoPublish}
                                onChange={(event) =>
                                  setAutomationForm({
                                    ...automationForm,
                                    autoPublish: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 accent-amber-500"
                              />
                              Publish automatically after n8n returns it
                            </span>
                          </label>
                        </div>
                        <label>
                          <span className="text-xs font-bold text-slate-600">
                            Additional instructions
                          </span>
                          <textarea
                            value={automationForm.notes}
                            onChange={(event) =>
                              setAutomationForm({
                                ...automationForm,
                                notes: event.target.value,
                              })
                            }
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-400"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={
                            automationSubmitting ||
                            !automationStatus?.configured
                          }
                          onClick={() => void triggerAutomation()}
                          className="h-11 rounded-xl bg-[#0F172A] px-5 text-xs font-bold text-white disabled:opacity-40"
                        >
                          {automationSubmitting
                            ? "Sending…"
                            : automationWaitingSince
                              ? "Waiting for returned post…"
                              : "Generate with n8n"}
                        </button>
                        {automationMessage ? (
                          <div className="rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                            {automationMessage}
                          </div>
                        ) : null}
                        <p className="text-[11px] leading-5 text-slate-400">
                          Returned posts appear in the saved-post selector with
                          an [n8n] label. Published automation posts remain
                          editable from the same Build page.
                        </p>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-[70] bg-[#0F172A]/75 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-[#F1F5F9] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F59E0B]">
                  Full article preview
                </p>
                <p className="mt-1 text-sm font-semibold text-[#0F172A]">
                  {draft.title || "Untitled article"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="h-10 rounded-xl bg-[#0F172A] px-4 text-xs font-bold text-white"
              >
                Close preview
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
              <BlogPreview draft={draft} />
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-600">
              Permanent deletion
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Delete {deleteTarget.name || deleteTarget.email}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              This action uses the backend deletion audit and cannot be undone.
              Owner accounts default to deleting the organization and its tenant
              data.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteScope("user");
                  setDeleteConfirm("");
                }}
                className={`rounded-xl border p-3 text-left text-xs font-bold ${deleteScope === "user" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200"}`}
              >
                Delete this user only
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteScope("organization");
                  setDeleteConfirm("");
                }}
                className={`rounded-xl border p-3 text-left text-xs font-bold ${deleteScope === "organization" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200"}`}
              >
                Delete whole organization
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-bold text-slate-600">
                Type{" "}
                {deleteScope === "organization"
                  ? "DELETE_ORGANIZATION_DATA"
                  : "DELETE_USER_DATA"}
              </span>
              <input
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-red-400"
              />
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
                className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  loading ||
                  deleteConfirm !==
                    (deleteScope === "organization"
                      ? "DELETE_ORGANIZATION_DATA"
                      : "DELETE_USER_DATA")
                }
                onClick={() => void confirmDeleteUser()}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-40"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {topUpTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F59E0B]">
              Manual credit
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Add credit — {topUpTarget.organizationName || topUpTarget.email}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Current balance: {money(topUpTarget.walletBalanceUsd)}
            </p>
            <label className="mt-5 block">
              <span className="text-xs font-bold text-slate-600">
                Amount to add (USD)
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={topUpAmount}
                onChange={(event) => setTopUpAmount(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#F59E0B]"
              />
            </label>
            {topUpMessage ? (
              <p className="mt-3 text-xs font-semibold text-slate-600">
                {topUpMessage}
              </p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setTopUpTarget(null)}
                className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={topUpSubmitting}
                onClick={() => void submitTopUp()}
                className="h-11 flex-1 rounded-xl bg-[#0F172A] text-sm font-bold text-white disabled:opacity-40"
              >
                {topUpSubmitting ? "Adding…" : "Add credit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SuperAdmin;
