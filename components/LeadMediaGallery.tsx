import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import type { LeadMedia } from "../types";

/**
 * Photos and short video clips the customer sent through the chat widget,
 * with what the assistant saw in them. Renders nothing when the lead has no
 * media, so ordinary leads look exactly as before.
 */

const URGENCY_STYLE: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function fmtDuration(ms?: number | null) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `0:${String(s).padStart(2, "0")}`;
}

interface Props {
  leadId: string;
  onMessage?: (msg: string, ok?: boolean) => void;
}

const LeadMediaGallery: React.FC<Props> = ({ leadId, onMessage }) => {
  const [media, setMedia] = useState<LeadMedia[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMedia(null);
    api
      .listLeadMedia(leadId)
      .then((r) => {
        if (!cancelled) setMedia(Array.isArray(r?.media) ? r.media : []);
      })
      .catch(() => {
        if (!cancelled) setMedia([]);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (!media || media.length === 0) return null;

  const remove = async (m: LeadMedia) => {
    if (!window.confirm(`Delete this ${m.kind === "video" ? "video" : "photo"}? This can't be undone.`)) return;
    setBusyId(m.id);
    try {
      await api.deleteLeadMedia(leadId, m.id);
      setMedia((list) => (list || []).filter((x) => x.id !== m.id));
      onMessage?.("Deleted.");
    } catch {
      onMessage?.("Delete failed.", false);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Photos &amp; videos from chat ({media.length})
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {media.map((m) => {
          const a = m.analysis || {};
          return (
            <div
              key={m.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="relative bg-slate-900">
                {m.kind === "video" ? (
                  <video
                    src={m.url || undefined}
                    poster={m.posterUrl || undefined}
                    controls
                    playsInline
                    preload="none"
                    className="aspect-video w-full object-contain"
                  />
                ) : m.url ? (
                  <a href={m.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={m.url}
                      alt={a.subject || "Customer photo"}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="flex aspect-video items-center justify-center text-xs text-slate-400">
                    File unavailable
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                  <i
                    className={`fa-sharp fa-solid ${m.kind === "video" ? "fa-video" : "fa-camera"} mr-1`}
                  />
                  {m.kind === "video" ? `Video ${fmtDuration(m.durationMs)}` : "Photo"}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.urgency && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${URGENCY_STYLE[a.urgency] || URGENCY_STYLE.low}`}
                    >
                      {a.urgency} urgency
                    </span>
                  )}
                  {a.needs_human && (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                      Follow up
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-semibold text-slate-400">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                {m.analysisStatus === "failed" && (
                  <p className="text-xs text-slate-500">The assistant couldn't read this one.</p>
                )}
                {a.summary && (
                  <p className="text-sm font-semibold text-slate-800">{a.summary}</p>
                )}
                {Array.isArray(a.observations) && a.observations.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                    {a.observations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                )}
                {m.note && (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                    “{m.note}”
                  </p>
                )}
                {a.reply && (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer font-semibold">What the assistant replied</summary>
                    <p className="mt-1 whitespace-pre-wrap">{a.reply}</p>
                  </details>
                )}
                <div className="flex items-center justify-between pt-1">
                  {typeof a.confidence === "number" ? (
                    <span className="text-[10px] font-semibold text-slate-400">
                      AI confidence {Math.round(a.confidence * 100)}%
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={busyId === m.id}
                    onClick={() => void remove(m)}
                    className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    {busyId === m.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadMediaGallery;
