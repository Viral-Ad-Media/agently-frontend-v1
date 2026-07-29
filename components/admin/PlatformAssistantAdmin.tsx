import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  platformAssistantApi,
  type AssistantConfig,
  type AssistantMessage,
} from '../services/platformAssistantApi';

/**
 * agently/components/PlatformAssistant.tsx   <-- NEW FILE
 *
 * The floating Agently assistant, mounted inside the authenticated dashboard.
 *
 * DESIGN INTENT
 * The launcher is the one place this component spends any boldness: the
 * Agently mark on a deep navy disc, lifted on a soft shadow, with a slow
 * four-second breath that says "live" without ever pulling the eye away from
 * the work. Everything else — the panel, the bubbles, the escalation form —
 * stays in the existing dashboard vocabulary (#0F172A / #F59E0B, rounded-2xl,
 * slate borders) so it reads as part of the product rather than a bolted-on
 * chat vendor.
 *
 * BEHAVIOUR
 * - Draggable anywhere on screen; position persists across sessions.
 * - Dismissible to a slim edge tab, so it can be got out of the way without
 *   being lost. There is deliberately no permanent dismissal: this is the
 *   support channel, and a support channel that can be turned off forever is
 *   a support ticket waiting to happen.
 * - Respects prefers-reduced-motion: the breath and shimmer stop entirely.
 */

const POSITION_KEY = 'agently.assistant.position';
const HIDDEN_KEY = 'agently.assistant.hidden';

const LAUNCHER_SIZE = 60;
const EDGE_PADDING = 16;
const DRAG_THRESHOLD_PX = 4; // below this a pointer-up is a click, not a drag

type Point = { x: number; y: number };

const clampToViewport = (point: Point): Point => {
  if (typeof window === 'undefined') return point;
  return {
    x: Math.min(
      Math.max(point.x, EDGE_PADDING),
      window.innerWidth - LAUNCHER_SIZE - EDGE_PADDING,
    ),
    y: Math.min(
      Math.max(point.y, EDGE_PADDING),
      window.innerHeight - LAUNCHER_SIZE - EDGE_PADDING,
    ),
  };
};

const defaultPosition = (): Point => {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  return {
    x: window.innerWidth - LAUNCHER_SIZE - 24,
    y: window.innerHeight - LAUNCHER_SIZE - 24,
  };
};

const readStoredPosition = (): Point | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Point;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') {
      return null;
    }
    return clampToViewport(parsed);
  } catch {
    return null;
  }
};

/** Renders assistant text: paragraphs, bullets, **bold** and [links](url). */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = text.split(/\n{2,}/).filter(Boolean);

  const inline = (value: string, keyPrefix: string): React.ReactNode[] =>
    value
      .split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|\/)[^)]+\))/g)
      .filter(Boolean)
      .map((part, index) => {
        const key = `${keyPrefix}-${index}`;
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        if (bold) return <strong key={key}>{bold[1]}</strong>;

        const link = /^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)]+)\)$/.exec(part);
        if (link) {
          return (
            <a
              key={key}
              href={link[2]}
              target={link[2].startsWith('http') ? '_blank' : undefined}
              rel="noreferrer"
              className="font-semibold text-[#B45309] underline underline-offset-2"
            >
              {link[1]}
            </a>
          );
        }
        return <React.Fragment key={key}>{part}</React.Fragment>;
      });

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n');
        const isList = lines.every((line) => /^\s*[-*\d]+[.)]?\s+/.test(line));

        if (isList) {
          return (
            <ul
              key={blockIndex}
              className="my-1.5 list-disc space-y-1 pl-4 marker:text-[#F59E0B]"
            >
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {inline(
                    line.replace(/^\s*[-*\d]+[.)]?\s+/, ''),
                    `${blockIndex}-${lineIndex}`,
                  )}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="my-1.5 first:mt-0 last:mb-0">
            {inline(block, String(blockIndex))}
          </p>
        );
      })}
    </>
  );
};

const PlatformAssistant: React.FC = () => {
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.localStorage.getItem(HIDDEN_KEY) === '1',
  );
  const [position, setPosition] = useState<Point>(defaultPosition);
  const [dragging, setDragging] = useState(false);

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalationNote, setEscalationNote] = useState('');
  const [banner, setBanner] = useState('');

  const dragState = useRef<{ dx: number; dy: number; moved: number } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* ── Load config ────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    platformAssistantApi
      .config()
      .then((result) => {
        if (cancelled || !result?.enabled) return;
        setConfig(result);
        setMessages([{ role: 'assistant', text: result.welcomeMessage }]);
      })
      .catch(() => {
        // Assistant unavailable: stay silent and unmounted. A support widget
        // announcing its own outage is noise the user cannot act on.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Restore + keep position inside the viewport on resize ──────────── */
  useEffect(() => {
    const stored = readStoredPosition();
    if (stored) setPosition(stored);

    const onResize = () => setPosition((current) => clampToViewport(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── Drag ───────────────────────────────────────────────────────────── */
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragState.current = {
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
      moved: 0,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state) return;
    const next = clampToViewport({
      x: event.clientX - state.dx,
      y: event.clientY - state.dy,
    });
    state.moved += Math.abs(next.x - position.x) + Math.abs(next.y - position.y);
    setPosition(next);
  };

  const onPointerUp = () => {
    const state = dragState.current;
    dragState.current = null;
    setDragging(false);
    if (!state) return;

    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      /* storage disabled — position simply resets next session */
    }

    // A drag should never also open the panel.
    if (state.moved <= DRAG_THRESHOLD_PX) setOpen(true);
  };

  /* ── Hide / restore ─────────────────────────────────────────────────── */
  const setHiddenPersisted = useCallback((value: boolean) => {
    setHidden(value);
    try {
      window.localStorage.setItem(HIDDEN_KEY, value ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  }, []);

  /* ── Scroll to newest ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* ── Send ───────────────────────────────────────────────────────────── */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;

      const history = messages;
      setMessages((current) => [...current, { role: 'user', text }]);
      setInput('');
      setSending(true);

      try {
        const result = await platformAssistantApi.chat(text, history);
        setMessages((current) => [
          ...current,
          { role: 'assistant', text: result.response },
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            text: `I couldn't reach the assistant just then. Try again in a moment — or email ${
              config?.supportEmail || 'agentlycallsupport@gmail.com'
            } and the team will pick it up.`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [config?.supportEmail, messages, sending],
  );

  const submitEscalation = useCallback(async () => {
    const body = escalationNote.trim();
    if (!body) return;
    try {
      const result = await platformAssistantApi.escalate({
        body,
        history: messages,
      });
      setBanner(result.message);
      setEscalationNote('');
      setEscalating(false);
    } catch {
      setBanner(
        `Couldn't log that. Email ${
          config?.supportEmail || 'agentlycallsupport@gmail.com'
        } directly and the team will help.`,
      );
    }
  }, [config?.supportEmail, escalationNote, messages]);

  if (!config) return null;

  /* ── Hidden: slim edge tab ──────────────────────────────────────────── */
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenPersisted(false)}
        aria-label="Show the Agently assistant"
        className="fixed right-0 top-1/2 z-[70] -translate-y-1/2 rounded-l-xl border border-r-0 border-[#0F172A]/12 bg-[#0F172A] py-4 pl-2.5 pr-2 shadow-[0_8px_28px_rgba(15,23,42,0.24)] transition hover:pl-3"
      >
        <img
          src="/agently-mark.png"
          alt=""
          className="h-5 w-5 object-contain opacity-90"
        />
      </button>
    );
  }

  const panelRight = position.x > (window.innerWidth || 1200) / 2;

  return (
    <>
      {/*
        Scoped keyframes. The launcher breathes once every 4s and a highlight
        sweeps across the disc on the same cycle — enough to read as live,
        slow enough to ignore. Both stop dead under prefers-reduced-motion.
      */}
      <style>{`
        @keyframes agently-breathe {
          0%, 72%, 100% { transform: translateY(0) scale(1); }
          78%           { transform: translateY(-7px) scale(1.045); }
          84%           { transform: translateY(0) scale(0.985); }
          89%           { transform: translateY(-2.5px) scale(1.008); }
          94%           { transform: translateY(0) scale(1); }
        }
        @keyframes agently-sheen {
          0%, 70%  { transform: translateX(-135%) rotate(18deg); opacity: 0; }
          76%      { opacity: 0.5; }
          88%      { transform: translateX(135%) rotate(18deg); opacity: 0; }
          100%     { transform: translateX(135%) rotate(18deg); opacity: 0; }
        }
        @keyframes agently-halo {
          0%, 72%, 100% { opacity: 0.28; transform: scale(1); }
          80%           { opacity: 0;    transform: scale(1.55); }
        }
        @keyframes agently-panel-in {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .agently-breathe { animation: agently-breathe 4s ease-in-out infinite; }
        .agently-sheen   { animation: agently-sheen   4s ease-in-out infinite; }
        .agently-halo    { animation: agently-halo    4s ease-in-out infinite; }
        .agently-panel   { animation: agently-panel-in 180ms cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .agently-breathe, .agently-sheen, .agently-halo, .agently-panel {
            animation: none !important;
          }
        }
      `}</style>

      {/* ── Launcher ───────────────────────────────────────────────────── */}
      {!open ? (
        <div
          className="fixed z-[70]"
          style={{ left: position.x, top: position.y }}
        >
          {/* Expanding halo, behind the disc — the "live" signal. */}
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-full bg-[#F59E0B]/45 ${
              dragging ? '' : 'agently-halo'
            }`}
          />

          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={`Open ${config.name}`}
            style={{ width: LAUNCHER_SIZE, height: LAUNCHER_SIZE }}
            className={`group relative flex touch-none items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#0F172A] shadow-[0_14px_38px_rgba(15,23,42,0.34)] outline-none transition-shadow duration-200 hover:shadow-[0_18px_46px_rgba(15,23,42,0.42)] focus-visible:ring-4 focus-visible:ring-[#F59E0B]/45 ${
              dragging ? 'cursor-grabbing scale-105' : 'cursor-grab agently-breathe'
            }`}
          >
            <img
              src="/agently-mark.png"
              alt=""
              draggable={false}
              className="pointer-events-none h-7 w-7 select-none object-contain"
            />
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent ${
                dragging ? '' : 'agently-sheen'
              }`}
            />
            {/* Live dot */}
            <span
              aria-hidden
              className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0F172A] bg-[#34D399]"
            />
          </button>

          <button
            type="button"
            onClick={() => setHiddenPersisted(true)}
            aria-label="Hide the assistant"
            className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[13px] leading-none text-slate-400 opacity-0 shadow-sm transition hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0 md:hover:opacity-100"
            style={{ opacity: dragging ? 0 : undefined }}
          >
            ×
          </button>
        </div>
      ) : null}

      {/* ── Panel ──────────────────────────────────────────────────────── */}
      {open ? (
        <div
          className={`agently-panel fixed bottom-4 z-[71] flex w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.26)] sm:bottom-6 ${
            panelRight ? 'right-4 sm:right-6' : 'left-4 sm:left-6'
          }`}
          style={{ height: 'min(560px, calc(100vh - 6rem))' }}
          role="dialog"
          aria-label={config.headerTitle}
        >
          <header className="flex items-center gap-3 border-b border-slate-200 bg-[#0F172A] px-4 py-3.5">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
              <img
                src="/agently-mark.png"
                alt=""
                className="h-4.5 w-[18px] object-contain"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {config.headerTitle}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/55">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                Here to help — ask as much as you like
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-[#F8FAFC] px-4 py-4"
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-[#0F172A] text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <RichText text={message.text} />
                  ) : (
                    message.text
                  )}
                </div>
              </div>
            ))}

            {sending ? (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: `${dot * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {messages.length <= 1 && config.suggestedPrompts.length ? (
              <div className="space-y-2 pt-1">
                {config.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-600 transition hover:border-[#F59E0B] hover:text-[#0F172A]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}

            {banner ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800">
                {banner}
              </div>
            ) : null}
          </div>

          {escalating ? (
            <div className="border-t border-slate-200 bg-white px-4 py-3.5">
              <p className="text-[12px] font-semibold text-slate-700">
                Send this to the Agently team
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                They'll reply to your account email. Goes to{' '}
                {config.supportEmail}.
              </p>
              <textarea
                value={escalationNote}
                onChange={(event) => setEscalationNote(event.target.value)}
                rows={3}
                placeholder="What's happening? Include anything you've already tried."
                className="mt-2.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#F59E0B]"
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEscalating(false)}
                  className="h-9 flex-1 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!escalationNote.trim()}
                  onClick={() => void submitEscalation()}
                  className="h-9 flex-1 rounded-xl bg-[#0F172A] text-[12px] font-bold text-white disabled:opacity-40"
                >
                  Send to support
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-200 bg-white px-3 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder={config.placeholder}
                  className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none transition focus:border-[#F59E0B]"
                />
                <button
                  type="button"
                  disabled={!input.trim() || sending}
                  onClick={() => void send(input)}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B] text-white transition disabled:opacity-35"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M22 2 11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setEscalating(true)}
                className="mt-2 text-[11px] font-semibold text-slate-400 transition hover:text-[#0F172A]"
              >
                Still stuck? Send this to the Agently team
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};

export default PlatformAssistant;
