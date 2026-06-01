import React, { useEffect, useMemo, useRef, useState } from "react";
import { Organization } from "../types";
import { api, ApiError } from "../services/api";

type VoiceOption = { id: string; name: string; tone?: string };
type TestStatus = {
  configured?: boolean;
  platformNumber?: string;
  usage?: {
    usedCalls: number;
    remainingCalls: number;
    maxCalls: number;
    maxRecipientsPerRequest: number;
    maxCallSeconds: number;
  };
  allowedVoices?: VoiceOption[];
  testAgent?: Record<string, any>;
  defaults?: {
    defaultCallPurpose?: string;
    defaultCustomInstructions?: string;
  };
};

type TestEvent = {
  id: string;
  type?: string;
  status?: string;
  recipient_name?: string;
  recipient_phone?: string;
  call_purpose?: string;
  twilio_call_sid?: string;
  created_at?: string;
};

type Recipient = { name: string; phone: string };

type FeedbackModalState = {
  type: "success" | "error" | "warning";
  title: string;
  message: string;
  actionLabel?: string;
} | null;

const defaultVoices: VoiceOption[] = [
  { id: "alloy", name: "Alloy", tone: "Balanced and neutral" },
  { id: "ash", name: "Ash", tone: "Calm and steady" },
  { id: "coral", name: "Coral", tone: "Bright and friendly" },
  { id: "echo", name: "Echo", tone: "Clear and professional" },
  { id: "sage", name: "Sage", tone: "Measured and helpful" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const nextHour = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    Math.ceil(date.getMinutes() / 5) * 5,
  ).padStart(2, "0")}`.replace(":60", ":55");
};

const formatDate = (value?: string) => {
  if (!value) return "Just now";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const phoneHint =
  "You can enter a US number like (123) 456-7890 or +1 123 456 7890.";

const normalizeCallablePhone = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
};

const isCallablePhone = (value = "") =>
  /^\+[1-9]\d{7,14}$/.test(normalizeCallablePhone(value));

const phoneValidationMessage = (value = "") => {
  if (!String(value || "").trim())
    return "Add a recipient phone number before starting the test call.";
  if (isCallablePhone(value)) return "";
  return "Enter a valid callable number. For US numbers, you can use formats like (123) 456-7890, 123-456-7890, or +1 123 456 7890.";
};

const SectionCard: React.FC<{
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, eyebrow, children, actions }) => (
  <section className="rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:p-6">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-indigo-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 font-display text-2xl text-slate-950">{title}</h2>
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const FeedbackModal: React.FC<{
  feedback: FeedbackModalState;
  onClose: () => void;
}> = ({ feedback, onClose }) => {
  if (!feedback) return null;

  const accentClass =
    feedback.type === "success"
      ? "bg-emerald-500"
      : feedback.type === "warning"
        ? "bg-amber-400"
        : "bg-red-500";

  const label = feedback.actionLabel || "Okay";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className={`h-1.5 ${accentClass}`} />
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div
              className={`mt-1 h-3 w-3 shrink-0 rounded-full ${accentClass}`}
            />
            <div className="min-w-0">
              <h3 className="font-display text-2xl leading-tight text-slate-950">
                {feedback.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {feedback.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-indigo-700"
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
};

const TestAgent: React.FC<{ org: Organization; onChanged?: () => void }> = ({
  org,
}) => {
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [events, setEvents] = useState<TestEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"now" | "schedule">("now");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackModalState>(null);

  const [agentName, setAgentName] = useState("Test Agent");
  const [voiceId, setVoiceId] = useState("alloy");
  const [greeting, setGreeting] = useState(
    "Hello, this is your Agently test agent. How can I help you today?",
  );
  const [defaultPurpose, setDefaultPurpose] = useState("");
  const [defaultInstructions, setDefaultInstructions] = useState("");
  const [textareaVersion, setTextareaVersion] = useState(0);

  const greetingRef = useRef<HTMLTextAreaElement | null>(null);
  const defaultPurposeRef = useRef<HTMLTextAreaElement | null>(null);
  const defaultInstructionsRef = useRef<HTMLTextAreaElement | null>(null);
  const callPurposeRef = useRef<HTMLTextAreaElement | null>(null);
  const customInstructionsRef = useRef<HTMLTextAreaElement | null>(null);
  const schedulePurposeRef = useRef<HTMLTextAreaElement | null>(null);
  const scheduleInstructionsRef = useRef<HTMLTextAreaElement | null>(null);

  const [callRecipient, setCallRecipient] = useState<Recipient>({
    name: "",
    phone: "",
  });
  const [callPurpose] = useState("");
  const [customInstructions] = useState("");

  const [scheduleName, setScheduleName] = useState("Test schedule");
  const [scheduleDate, setScheduleDate] = useState(todayIso());
  const [scheduleTime, setScheduleTime] = useState(nextHour());
  const [schedulePurpose] = useState("");
  const [scheduleInstructions] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([
    { name: "", phone: "" },
  ]);

  const limit = status?.usage;
  const allowedVoices = status?.allowedVoices?.length
    ? status.allowedVoices
    : defaultVoices;
  const remainingCalls = Number(limit?.remainingCalls ?? 0);
  const maxCalls = Number(limit?.maxCalls ?? 3);
  const usedCalls = Number(limit?.usedCalls ?? 0);
  const maxRecipients = Number(limit?.maxRecipientsPerRequest ?? 3);
  const maxMinutes = Math.max(
    1,
    Math.ceil(Number(limit?.maxCallSeconds ?? 300) / 60),
  );
  const usagePercent = Math.min(100, (usedCalls / Math.max(1, maxCalls)) * 100);
  const configured = Boolean(status?.configured);
  const canUse = configured && remainingCalls > 0;
  const timezone =
    org.profile?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/New_York";

  const defaultPurposeText = useMemo(
    () =>
      defaultPurpose ||
      "Test how this Agently voice agent handles a realistic lead conversation.",
    [defaultPurpose],
  );

  const readTextarea = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    fallback = "",
  ) => ref.current?.value ?? fallback;

  const clearTextarea = (ref: React.RefObject<HTMLTextAreaElement | null>) => {
    if (ref.current) ref.current.value = "";
  };

  const load = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
      setFeedback(null);
    }
    try {
      const [statusResponse, eventsResponse] = await Promise.all([
        api.getTestAgentStatus(),
        api.listTestAgentEvents(),
      ]);
      setStatus(statusResponse);
      setEvents(eventsResponse?.events || []);
      setAgentName(statusResponse?.testAgent?.name || "Test Agent");
      setVoiceId(
        statusResponse?.testAgent?.voiceId ||
          statusResponse?.testAgent?.voice ||
          "alloy",
      );
      const loadedGreeting =
        statusResponse?.testAgent?.greeting ||
        "Hello, this is your Agently test agent. How can I help you today?";
      const loadedDefaultPurpose =
        statusResponse?.defaults?.defaultCallPurpose || "";
      const loadedDefaultInstructions =
        statusResponse?.defaults?.defaultCustomInstructions || "";
      setGreeting(loadedGreeting);
      setDefaultPurpose(loadedDefaultPurpose);
      setDefaultInstructions(loadedDefaultInstructions);
      setTextareaVersion((version) => version + 1);
    } catch (err) {
      setFeedback({
        type: "error",
        title: "Could not load test agent",
        message:
          err instanceof Error
            ? err.message
            : "Could not load test agent status.",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const nextGreeting = readTextarea(greetingRef, greeting);
      const nextDefaultPurpose = readTextarea(
        defaultPurposeRef,
        defaultPurpose,
      );
      const nextDefaultInstructions = readTextarea(
        defaultInstructionsRef,
        defaultInstructions,
      );
      await api.updateTestAgentConfig({
        agentName,
        voiceId,
        greeting: nextGreeting,
        defaultCallPurpose: nextDefaultPurpose,
        defaultCustomInstructions: nextDefaultInstructions,
      });
      setGreeting(nextGreeting);
      setDefaultPurpose(nextDefaultPurpose);
      setDefaultInstructions(nextDefaultInstructions);
      await load({ silent: true });
      setFeedback({
        type: "success",
        title: "Test agent saved",
        message:
          "Your test agent has been saved. You can now place a trial call without leaving this page.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        title: "Could not save test agent",
        message:
          err instanceof Error ? err.message : "Could not save the test agent.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitCallNow = async () => {
    const normalizedPhone = normalizeCallablePhone(callRecipient.phone);
    const validation = phoneValidationMessage(callRecipient.phone);
    if (validation) {
      setFeedback({
        type: "warning",
        title: "Check recipient number",
        message: validation,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await api.callNowWithTestAgent({
        recipient: {
          name: callRecipient.name || "Test Recipient",
          phone: normalizedPhone,
        },
        callPurpose:
          readTextarea(callPurposeRef, callPurpose) || defaultPurposeText,
        customInstructions: readTextarea(
          customInstructionsRef,
          customInstructions,
        ),
      });
      setFeedback({
        type: "success",
        title: "Trial call started",
        message:
          "Your trial call has started. It will appear in your activity list shortly.",
      });
      setCallRecipient({ name: "", phone: "" });
      clearTextarea(callPurposeRef);
      clearTextarea(customInstructionsRef);
      await load({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not start the trial call.";
      setFeedback({
        type: "error",
        title: "Could not start trial call",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitSchedule = async () => {
    const filledRecipients = recipients.filter((recipient) =>
      recipient.phone.trim(),
    );
    if (!filledRecipients.length) {
      setFeedback({
        type: "warning",
        title: "Add a recipient",
        message:
          "Add at least one recipient phone number before scheduling a test call.",
      });
      return;
    }

    const invalidRecipient = filledRecipients.find((recipient) =>
      phoneValidationMessage(recipient.phone),
    );
    if (invalidRecipient) {
      setFeedback({
        type: "warning",
        title: "Check recipient number",
        message: `${invalidRecipient.name || "One recipient"} has an invalid phone number. You can enter US numbers like (123) 456-7890 or +1 123 456 7890.`,
      });
      return;
    }

    const validRecipients = filledRecipients.map((recipient) => ({
      name: recipient.name || "Test Recipient",
      phone: normalizeCallablePhone(recipient.phone),
    }));

    setSubmitting(true);
    setFeedback(null);
    try {
      await api.scheduleTestAgentCall({
        name: scheduleName,
        scheduleType: "one_time_batch",
        startLocalDate: scheduleDate,
        startTimes: [scheduleTime],
        timezone,
        recipients: validRecipients,
        directRecipients: validRecipients,
        callPurpose:
          readTextarea(schedulePurposeRef, schedulePurpose) ||
          defaultPurposeText,
        customInstructions: readTextarea(
          scheduleInstructionsRef,
          scheduleInstructions,
        ),
      });
      setFeedback({
        type: "success",
        title: "Trial schedule created",
        message:
          "Your test schedule has been created. The selected recipients now count toward your free trial calls.",
      });
      setRecipients([{ name: "", phone: "" }]);
      await load({ silent: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create the test schedule.";
      setFeedback({
        type: "error",
        title: "Could not schedule trial call",
        message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateRecipient = (index: number, patch: Partial<Recipient>) => {
    setRecipients((current) =>
      current.map((recipient, rowIndex) =>
        rowIndex === index ? { ...recipient, ...patch } : recipient,
      ),
    );
  };

  const addRecipient = () => {
    if (
      recipients.length >=
      Math.min(maxRecipients, Math.max(1, remainingCalls || maxRecipients))
    )
      return;
    setRecipients((current) => [...current, { name: "", phone: "" }]);
  };

  const removeRecipient = (index: number) => {
    setRecipients((current) =>
      current.filter((_, rowIndex) => rowIndex !== index),
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center rounded-[2rem] border border-white/80 bg-white/80 text-sm font-bold text-slate-500 shadow-sm">
        Loading your test line…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="overflow-hidden rounded-[2.25rem] border border-white/75 bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.36em] text-amber-300">
              Test Your Agent
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight lg:text-5xl">
              Test Your Agent Before Going Live
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Use this test area to experience how your agent handles real calls
              before setting up your own business number. You can make up to{" "}
              {maxCalls} free trial calls to check your agent’s voice, greeting,
              call purpose, and overall conversation flow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-black uppercase tracking-[0.22em]">
              <span className="rounded-full bg-white/10 px-4 py-2 text-white">
                {status?.platformNumber || "No number set"}
              </span>
              <span className="rounded-full bg-amber-300 px-4 py-2 text-slate-950">
                {remainingCalls} calls left
              </span>
              <span className="rounded-full bg-white/10 px-4 py-2 text-white">
                5 voice choices
              </span>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">
              Trial usage
            </p>
            <div className="mt-4 flex items-end gap-2">
              <span className="font-display text-6xl">{usedCalls}</span>
              <span className="pb-2 text-sm font-bold text-slate-300">
                / {maxCalls} used
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-300">
              Each test call can last up to {maxMinutes} minutes. After your
              free trials are used, you’ll need to connect a dedicated business
              number to continue making live calls.
            </p>
          </div>
        </div>
      </div>

      <FeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
      {!configured ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
          The shared test line is not ready yet. Please contact support before
          placing a test call.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Test agent setup" eyebrow="Limited configuration">
          <div className="space-y-4">
            <label className="block text-sm font-bold text-slate-700">
              Agent name
              <input
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-300"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Voice
              <select
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-300"
              >
                {allowedVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} — {voice.tone}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Opening greeting
              <textarea
                key={`greeting-${textareaVersion}`}
                ref={greetingRef}
                defaultValue={greeting}
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-300"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Default call purpose
              <textarea
                key={`default-purpose-${textareaVersion}`}
                ref={defaultPurposeRef}
                defaultValue={defaultPurpose}
                rows={3}
                placeholder="Example: qualify the lead and confirm their interest in the product."
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-300"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Default custom instructions
              <textarea
                key={`default-instructions-${textareaVersion}`}
                ref={defaultInstructionsRef}
                defaultValue={defaultInstructions}
                rows={3}
                placeholder="Optional guardrails for the trial agent."
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-300"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveConfig()}
              className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save test agent"}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Place trial calls"
          eyebrow="Call now or schedule"
          actions={
            <div className="rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-black uppercase tracking-[0.18em]">
              <button
                type="button"
                onClick={() => setActiveTab("now")}
                className={`rounded-full px-3 py-2 ${activeTab === "now" ? "bg-slate-950 text-white" : "text-slate-500"}`}
              >
                Call now
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("schedule")}
                className={`rounded-full px-3 py-2 ${activeTab === "schedule" ? "bg-slate-950 text-white" : "text-slate-500"}`}
              >
                Schedule
              </button>
            </div>
          }
        >
          {activeTab === "now" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700">
                  Recipient name
                  <input
                    value={callRecipient.name}
                    onChange={(event) =>
                      setCallRecipient((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Recipient phone
                  <input
                    value={callRecipient.phone}
                    onBlur={(event) =>
                      setCallRecipient((current) => ({
                        ...current,
                        phone:
                          normalizeCallablePhone(event.target.value) ||
                          event.target.value,
                      }))
                    }
                    onChange={(event) =>
                      setCallRecipient((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="(123) 456-7890"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                  />
                </label>
              </div>
              <p className="text-xs font-semibold text-slate-400">
                {phoneHint}
              </p>
              <label className="block text-sm font-bold text-slate-700">
                Call purpose
                <textarea
                  ref={callPurposeRef}
                  rows={4}
                  placeholder={defaultPurposeText}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Extra instructions
                <textarea
                  ref={customInstructionsRef}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                />
              </label>
              <button
                type="button"
                disabled={!canUse || submitting}
                onClick={() => void submitCallNow()}
                className="w-full rounded-2xl bg-indigo-600 px-5 py-3.5 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Starting…" : "Start trial call"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-bold text-slate-700 sm:col-span-1">
                  Name
                  <input
                    value={scheduleName}
                    onChange={(event) => setScheduleName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Date
                  <input
                    type="date"
                    min={todayIso()}
                    value={scheduleDate}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Time
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => setScheduleTime(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                  />
                </label>
              </div>
              <p className="text-xs font-semibold text-slate-400">
                Timezone: {timezone}. You can add up to{" "}
                {Math.min(maxRecipients, remainingCalls || maxRecipients)} test
                recipients based on remaining trial calls.
              </p>
              <div className="space-y-3">
                {recipients.map((recipient, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      value={recipient.name}
                      onChange={(event) =>
                        updateRecipient(index, { name: event.target.value })
                      }
                      placeholder="Recipient name"
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
                    />
                    <input
                      value={recipient.phone}
                      onBlur={(event) =>
                        updateRecipient(index, {
                          phone:
                            normalizeCallablePhone(event.target.value) ||
                            event.target.value,
                        })
                      }
                      onChange={(event) =>
                        updateRecipient(index, { phone: event.target.value })
                      }
                      placeholder="(123) 456-7890"
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeRecipient(index)}
                      disabled={recipients.length === 1}
                      className="rounded-xl border border-slate-200 px-3 text-xs font-black uppercase tracking-widest text-slate-500 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRecipient}
                  disabled={
                    recipients.length >=
                    Math.min(
                      maxRecipients,
                      Math.max(1, remainingCalls || maxRecipients),
                    )
                  }
                  className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add recipient
                </button>
              </div>
              <label className="block text-sm font-bold text-slate-700">
                Call purpose
                <textarea
                  ref={schedulePurposeRef}
                  rows={3}
                  placeholder={defaultPurposeText}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Extra instructions
                <textarea
                  ref={scheduleInstructionsRef}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300"
                />
              </label>
              <button
                type="button"
                disabled={!canUse || submitting}
                onClick={() => void submitSchedule()}
                className="w-full rounded-2xl bg-indigo-600 px-5 py-3.5 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Scheduling…" : "Schedule trial call"}
              </button>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent test activity" eyebrow="Audit trail">
        {events.length ? (
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {event.recipient_name || "Test recipient"}{" "}
                    <span className="font-semibold text-slate-400">
                      {event.recipient_phone}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {event.call_purpose || "No purpose captured"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                    {event.type || "call"}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-600">
                    {event.status || "queued"}
                  </span>
                  <span className="text-slate-400">
                    {formatDate(event.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">
            No test calls have been created yet.
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default TestAgent;
