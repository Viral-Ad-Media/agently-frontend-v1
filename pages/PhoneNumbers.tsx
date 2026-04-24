import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Organization,
  AvailablePhoneNumber,
  OwnedPhoneNumber,
  PhoneCountry,
  AgentConfig,
} from "../types";
import { twilioApi } from "../services/api";

const Inp = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...p}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all ${p.className ?? ""}`}
  />
);
const Sel = (
  p: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: React.ReactNode;
  },
) => (
  <select
    {...p}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all ${p.className ?? ""}`}
  >
    {p.children}
  </select>
);
const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
    {children}
  </p>
);

interface ErrBoxProps {
  title: string;
  body: string;
  showPurchaseLink: boolean;
  onPurchase?: () => void;
}
const ErrBox = ({ title, body, showPurchaseLink, onPurchase }: ErrBoxProps) => (
  <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
    <p className="text-sm font-black text-red-700 mb-1">{title}</p>
    <p className="text-xs text-red-600 leading-relaxed">{body}</p>
    {showPurchaseLink && onPurchase && (
      <p className="text-xs text-red-500 mt-2">
        Need a number that works fully?{" "}
        <button
          onClick={onPurchase}
          className="underline font-bold hover:text-red-700"
        >
          Purchase a Twilio number here →
        </button>
      </p>
    )}
  </div>
);

interface PhoneNumbersProps {
  org: Organization;
  onAgentUpdated: (updates: Partial<AgentConfig>) => void;
}
type Tab = "assigned" | "search" | "owned" | "verify";
type VerifyMode = "voice" | "sms";
type VerifyStep = "input" | "calling" | "sms-sent" | "done";
interface VErr {
  title: string;
  body: string;
  showPurchaseLink: boolean;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  GB: "🇬🇧",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  ES: "🇪🇸",
  IT: "🇮🇹",
  BR: "🇧🇷",
  MX: "🇲🇽",
  IN: "🇮🇳",
  JP: "🇯🇵",
  SG: "🇸🇬",
  NL: "🇳🇱",
  SE: "🇸🇪",
  NO: "🇳🇴",
  DK: "🇩🇰",
  PL: "🇵🇱",
  NZ: "🇳🇿",
  ZA: "🇿🇦",
  IE: "🇮🇪",
  CH: "🇨🇭",
  AT: "🇦🇹",
  BE: "🇧🇪",
  PT: "🇵🇹",
  FI: "🇫🇮",
  NG: "🇳🇬",
  GH: "🇬🇭",
  KE: "🇰🇪",
};

const PhoneNumbers: React.FC<PhoneNumbersProps> = ({ org, onAgentUpdated }) => {
  const [tab, setTab] = useState<Tab>("assigned");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // search
  const [countries, setCountries] = useState<PhoneCountry[]>([]);
  const [country, setCountry] = useState("US");
  const [numberType, setNumberType] = useState<"Local" | "TollFree" | "Mobile">(
    "Local",
  );
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [searchResults, setSearchResults] = useState<AvailablePhoneNumber[]>(
    [],
  );
  const [searchDone, setSearchDone] = useState(false);

  // owned
  const [ownedNumbers, setOwnedNumbers] = useState<OwnedPhoneNumber[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);

  // agent selector
  const [targetAgentId, setTargetAgentId] = useState(
    org.activeVoiceAgentId || org.agent?.id || "",
  );

  // verify
  const [vMode, setVMode] = useState<VerifyMode>("voice");
  const [vStep, setVStep] = useState<VerifyStep>("input");
  const [vPhone, setVPhone] = useState("");
  const [vCode, setVCode] = useState("");
  const [vCallSid, setVCallSid] = useState("");
  const [vAttempt, setVAttempt] = useState(1);
  const [vOtp, setVOtp] = useState("");
  const [vDoneMsg, setVDoneMsg] = useState("");
  const [vInbound, setVInbound] = useState(false);
  const [vErr, setVErr] = useState<VErr | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    twilioApi
      .listCountries()
      .then((r) => setCountries(r.countries || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "owned" && !ownedLoaded) {
      setBusy("owned");
      twilioApi
        .listOwned()
        .then((r) => {
          setOwnedNumbers(r.numbers || []);
          setOwnedLoaded(true);
        })
        .catch((e) => showToast(e.message, false))
        .finally(() => setBusy(null));
    }
  }, [tab, ownedLoaded]);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const resetV = () => {
    stopPoll();
    setVMode("voice");
    setVStep("input");
    setVPhone("");
    setVCode("");
    setVCallSid("");
    setVAttempt(1);
    setVOtp("");
    setVDoneMsg("");
    setVInbound(false);
    setVErr(null);
  };

  useEffect(() => {
    if (tab !== "verify") resetV();
  }, [tab]); // eslint-disable-line
  useEffect(() => () => stopPoll(), []);

  const startPoll = (callSid: string, attempt: number) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await twilioApi.verifyNumberStatus(callSid);
        if (r.status === "pending") return;
        stopPoll();
        if (r.status === "success") {
          setVDoneMsg(
            r.message ||
              `${r.phoneNumber} verified and added to Owned Numbers!`,
          );
          setVInbound(r.canReceiveInbound ?? false);
          setVStep("done");
          if (r.agentId) onAgentUpdated({ twilioPhoneNumber: r.phoneNumber });
          setOwnedLoaded(false);
          showToast(`✓ ${r.phoneNumber} verified and added to Owned Numbers!`);
        } else {
          const next = attempt + 1;
          if (next > 3) {
            setVErr({
              title: "Unable to verify after 3 attempts",
              body:
                r.status === "no-answer"
                  ? "The call went unanswered 3 times. Make sure the number can receive voice calls and is not going straight to voicemail. For virtual or internet-only numbers, try SMS verification instead."
                  : r.status === "busy"
                    ? "The number was busy each time. Please wait a moment and retry, or try SMS verification."
                    : "The call failed to connect 3 times. This number may not support voice verification. Try SMS verification instead.",
              showPurchaseLink: true,
            });
            setVStep("input");
            setVAttempt(1);
          } else {
            showToast(
              `Call attempt ${attempt} ${r.status} — retrying (${next}/3)…`,
              false,
            );
            void doVoiceStart(vPhone, next);
          }
        }
      } catch {
        /* keep polling on network blip */
      }
    }, 3000);
  };

  const doVoiceStart = async (phone: string, attempt: number) => {
    setBusy("verify-start");
    try {
      const r = await twilioApi.verifyNumberStart(
        phone,
        targetAgentId || undefined,
        attempt,
      );
      setVCode(r.validationCode);
      setVCallSid(r.callSid);
      setVAttempt(r.attempt ?? attempt);
      setVErr(null);
      setVStep("calling");
      startPoll(r.callSid, r.attempt ?? attempt);
    } catch (e: any) {
      const code = (e as any).code || "";
      const msg: string = e.message || "Verification failed to start.";
      if (code === "GEO_BLOCKED") {
        setVErr({
          title: "Country not enabled for outbound calls",
          body: "Go to Twilio Console → Voice → Settings → Geo Permissions and enable this country. Or try SMS verification.",
          showPurchaseLink: false,
        });
      } else if (code === "MAX_RETRIES_EXCEEDED") {
        setVErr({
          title: "Maximum attempts reached",
          body: "Could not reach this number via voice call after 3 attempts. Try SMS verification or purchase a dedicated Twilio number.",
          showPurchaseLink: true,
        });
      } else {
        setVErr({
          title: "Verification could not start",
          body: msg,
          showPurchaseLink: true,
        });
      }
      setVStep("input");
    } finally {
      setBusy(null);
    }
  };

  const handleVoiceStart = async () => {
    if (!vPhone.trim()) {
      showToast("Please enter a phone number.", false);
      return;
    }
    setVErr(null);
    await doVoiceStart(vPhone.trim(), 1);
  };

  const handleSmsStart = async () => {
    if (!vPhone.trim()) {
      showToast("Please enter a phone number.", false);
      return;
    }
    setBusy("verify-sms-start");
    setVErr(null);
    try {
      await twilioApi.verifyNumberSmsStart(vPhone.trim());
      setVStep("sms-sent");
    } catch (e: any) {
      const msg: string = e.message || "Could not send SMS.";
      setVErr({
        title: "SMS verification failed",
        body: msg.includes("not configured")
          ? "SMS verification is not set up on this service. Use voice verification or contact support."
          : msg + " Make sure the number can receive SMS.",
        showPurchaseLink: !msg.includes("not configured"),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSmsConfirm = async () => {
    if (!vOtp.trim()) {
      showToast("Please enter the 6-digit code.", false);
      return;
    }
    setBusy("verify-sms-confirm");
    setVErr(null);
    try {
      const r = await twilioApi.verifyNumberSmsConfirm(
        vPhone.trim(),
        vOtp.trim(),
        targetAgentId || undefined,
      );
      setVDoneMsg(r.message || `${r.phoneNumber} verified and added!`);
      setVInbound(r.canReceiveInbound ?? false);
      setVStep("done");
      if (r.agentId) onAgentUpdated({ twilioPhoneNumber: r.phoneNumber });
      setOwnedLoaded(false);
      showToast(
        `✓ ${r.phoneNumber} verified via SMS and added to Owned Numbers!`,
      );
    } catch (e: any) {
      setVErr({
        title: "Incorrect code",
        body: (e.message || "Code not accepted.") + " Check and try again.",
        showPurchaseLink: false,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSearch = useCallback(async () => {
    setBusy("search");
    setSearchDone(false);
    setSearchResults([]);
    try {
      const r = await twilioApi.searchNumbers({
        country,
        type: numberType,
        areaCode: areaCode || undefined,
        contains: contains || undefined,
        limit: 20,
      });
      setSearchResults(r.numbers || []);
      setSearchDone(true);
    } catch (e: any) {
      showToast(e.message || "Search failed", false);
    } finally {
      setBusy(null);
    }
  }, [country, numberType, areaCode, contains]);

  const handlePurchase = async (num: AvailablePhoneNumber) => {
    if (
      !window.confirm(
        `Purchase ${num.friendlyName}? This charges your Twilio account.`,
      )
    )
      return;
    setBusy(`buy-${num.phoneNumber}`);
    try {
      await twilioApi.purchaseNumber(
        num.phoneNumber,
        targetAgentId || undefined,
      );
      onAgentUpdated({ twilioPhoneNumber: num.phoneNumber });
      showToast(`✓ ${num.friendlyName} purchased and assigned!`);
      setOwnedLoaded(false);
    } catch (e: any) {
      showToast(e.message || "Purchase failed", false);
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = async (owned: OwnedPhoneNumber) => {
    setBusy(`assign-${owned.sid}`);
    try {
      await twilioApi.assignNumber(
        owned.sid,
        owned.phoneNumber,
        targetAgentId || undefined,
      );
      onAgentUpdated({
        twilioPhoneNumber: owned.phoneNumber,
        twilioPhoneSid: owned.sid,
      });
      showToast(`✓ ${owned.phoneNumber} assigned!`);
    } catch (e: any) {
      showToast(e.message || "Assign failed", false);
    } finally {
      setBusy(null);
    }
  };

  const handleRelease = async (owned: OwnedPhoneNumber) => {
    if (!window.confirm(`Release ${owned.phoneNumber}? Cannot be undone.`))
      return;
    setBusy(`release-${owned.sid}`);
    try {
      await twilioApi.releaseNumber(owned.sid);
      setOwnedNumbers((prev) => prev.filter((n) => n.sid !== owned.sid));
      showToast(`${owned.phoneNumber} released.`);
    } catch (e: any) {
      showToast(e.message || "Release failed", false);
    } finally {
      setBusy(null);
    }
  };

  const TABS = [
    { id: "assigned" as Tab, label: "Agent Numbers", icon: "📱" },
    { id: "search" as Tab, label: "Get a Number", icon: "🔍" },
    { id: "owned" as Tab, label: "All Owned", icon: "🗂️" },
    { id: "verify" as Tab, label: "Verify Existing", icon: "✅" },
  ];

  const activeAgent =
    org.voiceAgents?.find((a) => a.id === targetAgentId) || org.agent;

  return (
    <div className="animate-fade-up space-y-6">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2.5 ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Phone Numbers</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Provision Twilio numbers — or verify a number you already own
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab !== "assigned" && (org.voiceAgents?.length ?? 0) > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center text-white text-sm">
            📞
          </div>
          <div className="flex-1">
            <Label>Assign number to agent</Label>
            <Sel
              value={targetAgentId}
              onChange={(e) => setTargetAgentId(e.target.value)}
            >
              {(org.voiceAgents ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.direction})
                </option>
              ))}
            </Sel>
          </div>
        </div>
      )}

      {/* ASSIGNED */}
      {tab === "assigned" && (
        <div className="space-y-4">
          {(org.voiceAgents ?? []).map((agent) => {
            const isActive = agent.id === org.activeVoiceAgentId;
            return (
              <div
                key={agent.id}
                className={`bg-white rounded-3xl border-2 shadow-card p-6 ${isActive ? "border-amber-300" : "border-slate-100"}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${isActive ? "bg-amber-100" : "bg-slate-100"}`}
                  >
                    {agent.direction === "inbound" ? "📥" : "📤"}
                  </div>
                  <div>
                    <p className="font-black text-slate-900">{agent.name}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">
                      {agent.direction} · {agent.voice}
                    </p>
                  </div>
                  {isActive && (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                      Active
                    </span>
                  )}
                </div>
                {agent.twilioPhoneNumber ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 rounded-2xl p-4">
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                        Assigned Number
                      </p>
                      <p className="text-xl font-black text-slate-900 tracking-tight">
                        {agent.twilioPhoneNumber}
                      </p>
                      {agent.twilioPhoneSid && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          SID: {agent.twilioPhoneSid}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-black">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      Ready for calls
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4">
                    <div className="text-2xl">📵</div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-500">
                        No number assigned
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Purchase one, or verify a number you already own
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setTargetAgentId(agent.id);
                          setTab("search");
                        }}
                        className="shrink-0 rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                      >
                        Get Number →
                      </button>
                      <button
                        onClick={() => {
                          setTargetAgentId(agent.id);
                          setTab("verify");
                        }}
                        className="shrink-0 rounded-xl border border-slate-200 text-slate-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-400 hover:text-amber-600 transition-all"
                      >
                        Verify Existing →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SEARCH */}
      {tab === "search" && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            <h3 className="text-base font-black text-slate-900 mb-5">
              Search Available Numbers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <Label>Country</Label>
                <Sel
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {countries.length > 0 ? (
                    countries.map((c) => (
                      <option key={c.country} value={c.country}>
                        {FLAG_MAP[c.country] || "🌍"} {c.countryName} (
                        {c.country})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="US">🇺🇸 United States</option>
                      <option value="GB">🇬🇧 United Kingdom</option>
                      <option value="CA">🇨🇦 Canada</option>
                      <option value="NG">🇳🇬 Nigeria</option>
                      <option value="GH">🇬🇭 Ghana</option>
                      <option value="ZA">🇿🇦 South Africa</option>
                    </>
                  )}
                </Sel>
              </div>
              <div>
                <Label>Number Type</Label>
                <Sel
                  value={numberType}
                  onChange={(e) => setNumberType(e.target.value as any)}
                >
                  <option value="Local">Local</option>
                  <option value="TollFree">Toll Free</option>
                  <option value="Mobile">Mobile</option>
                </Sel>
              </div>
              <div>
                <Label>Area Code (US/CA)</Label>
                <Inp
                  placeholder="e.g. 212"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  maxLength={3}
                />
              </div>
              <div>
                <Label>Contains digits</Label>
                <Inp
                  placeholder="e.g. 555"
                  value={contains}
                  onChange={(e) => setContains(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={busy === "search"}
              className="w-full sm:w-auto rounded-2xl bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {busy === "search" ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Searching…
                </>
              ) : (
                <>🔍 Search Numbers</>
              )}
            </button>
          </div>
          {searchDone && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-slate-900">
                  {searchResults.length > 0
                    ? `${searchResults.length} numbers available`
                    : "No numbers found"}
                </h3>
                {(org.voiceAgents?.length ?? 0) > 1 && (
                  <p className="text-xs text-slate-400">
                    Assigning to: <strong>{activeAgent?.name}</strong>
                  </p>
                )}
              </div>
              {searchResults.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <div className="text-3xl mb-3">🔭</div>
                  <p className="text-sm font-bold text-slate-400">
                    No numbers found. Try different filters.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {searchResults.map((num) => (
                    <div
                      key={num.phoneNumber}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-amber-300 hover:bg-amber-50/20 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-base font-black text-slate-900">
                            {num.friendlyName}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {num.phoneNumber}
                          </p>
                        </div>
                        <span className="text-lg">
                          {FLAG_MAP[num.isoCountry] || "🌍"}
                        </span>
                      </div>
                      {(num.locality || num.region) && (
                        <p className="text-xs text-slate-500 mb-3">
                          {[num.locality, num.region]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      <div className="flex gap-1.5 mb-3">
                        {num.capabilities.voice && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                            Voice
                          </span>
                        )}
                        {num.capabilities.sms && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                            SMS
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handlePurchase(num)}
                        disabled={!!busy}
                        className="w-full rounded-xl bg-slate-900 text-white py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all active:scale-95"
                      >
                        {busy === `buy-${num.phoneNumber}`
                          ? "Purchasing…"
                          : "Purchase & Assign"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* OWNED */}
      {tab === "owned" && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-black text-slate-900">
              Your Numbers
            </h3>
            <button
              onClick={() => setOwnedLoaded(false)}
              className="text-[10px] font-black text-slate-400 hover:text-amber-600 uppercase tracking-widest"
            >
              ↻ Refresh
            </button>
          </div>
          {busy === "owned" ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading your numbers…</p>
            </div>
          ) : ownedNumbers.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-sm font-bold text-slate-400">
                No numbers on your account yet.
              </p>
              <div className="flex gap-3 justify-center mt-4">
                <button
                  onClick={() => setTab("search")}
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                >
                  Get a Number
                </button>
                <button
                  onClick={() => setTab("verify")}
                  className="rounded-xl border border-slate-200 text-slate-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-amber-400 hover:text-amber-600 transition-all"
                >
                  Verify Existing
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedNumbers.map((num) => {
                const assignedTo = (org.voiceAgents ?? []).find(
                  (a) => a.twilioPhoneNumber === num.phoneNumber,
                );
                return (
                  <div
                    key={num.sid}
                    className="flex flex-col sm:flex-row sm:items-center gap-4 border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-all"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-base font-black text-slate-900">
                          {num.phoneNumber}
                        </p>
                        {assignedTo && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black">
                            {assignedTo.name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        {num.sid}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!assignedTo && (
                        <button
                          onClick={() => handleAssign(num)}
                          disabled={!!busy}
                          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-all"
                        >
                          {busy === `assign-${num.sid}`
                            ? "Assigning…"
                            : "Assign to Agent"}
                        </button>
                      )}
                      <button
                        onClick={() => handleRelease(num)}
                        disabled={!!busy}
                        className="rounded-xl border border-red-200 text-red-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-300 disabled:opacity-40 transition-all"
                      >
                        {busy === `release-${num.sid}`
                          ? "Releasing…"
                          : "Release"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VERIFY */}
      {tab === "verify" && (
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-3xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-2xl shrink-0">
                ✅
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 mb-1">
                  Already own a verified number?
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Verify any phone number you own — mobile, landline, VoIP, or
                  another Twilio number — and assign it to an agent without
                  purchasing a new one.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-sky-700">
                  {[
                    "Physical SIM",
                    "Twilio numbers",
                    "Google Voice",
                    "VoIP / virtual",
                    "Landlines",
                  ].map((t) => (
                    <span key={t} className="bg-sky-100 px-2 py-1 rounded-lg">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6">
            {/* INPUT */}
            {vStep === "input" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-black text-slate-900 mb-1">
                    Enter your number
                  </h3>
                  <p className="text-xs text-slate-400">
                    Use international format — start with + and your country
                    code.
                  </p>
                </div>
                {vErr && (
                  <ErrBox
                    {...vErr}
                    onPurchase={() => {
                      setTab("search");
                      setVErr(null);
                    }}
                  />
                )}
                <div>
                  <Label>Phone number</Label>
                  <Inp
                    placeholder="+2349084467821"
                    value={vPhone}
                    onChange={(e) => setVPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && vMode === "voice")
                        void handleVoiceStart();
                      if (e.key === "Enter" && vMode === "sms")
                        void handleSmsStart();
                    }}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Examples: +12125550100 (US) · +442071234567 (UK) ·
                    +2349084467821 (Nigeria)
                  </p>
                </div>
                <div>
                  <Label>Verification method</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setVMode("voice")}
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${vMode === "voice" ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="text-2xl mb-1">📞</div>
                      <p className="text-sm font-black text-slate-900">
                        Voice call
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Twilio calls your number and reads a code. Best for
                        SIMs, landlines, and most physical numbers.
                      </p>
                    </button>
                    <button
                      onClick={() => setVMode("sms")}
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${vMode === "sms" ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="text-2xl mb-1">💬</div>
                      <p className="text-sm font-black text-slate-900">
                        SMS code
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        A 6-digit code sent via SMS. Best for virtual numbers,
                        Google Voice, TextNow, or internet-only numbers.
                      </p>
                    </button>
                  </div>
                </div>
                {vMode === "voice" ? (
                  <button
                    onClick={handleVoiceStart}
                    disabled={busy === "verify-start" || !vPhone.trim()}
                    className="w-full rounded-2xl bg-sky-600 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {busy === "verify-start" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>📞 Start Verification Call</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSmsStart}
                    disabled={busy === "verify-sms-start" || !vPhone.trim()}
                    className="w-full rounded-2xl bg-sky-600 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {busy === "verify-sms-start" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Sending SMS…
                      </>
                    ) : (
                      <>💬 Send SMS Code</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* CALLING */}
            {vStep === "calling" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900">
                    Verification call in progress…
                  </h3>
                  <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
                    Attempt {vAttempt} / 3
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Calling <strong>{vPhone}</strong>. Please answer — Twilio will
                  read your code out loud. This page updates automatically.
                </p>
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">
                    Your validation code (for reference)
                  </p>
                  <p className="text-5xl font-black text-amber-700 tracking-[0.2em] font-mono">
                    {vCode}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    Twilio reads this code to you on the call. You don't need to
                    type it anywhere.
                  </p>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-xs text-slate-600">
                    Waiting for call result — this page will update
                    automatically once the call ends. No button to click.
                  </p>
                </div>
                {vErr && (
                  <ErrBox
                    {...vErr}
                    onPurchase={() => {
                      resetV();
                      setTab("search");
                    }}
                  />
                )}
                <div className="flex gap-3">
                  <button
                    onClick={resetV}
                    disabled={!!busy}
                    className="flex-1 rounded-2xl border border-slate-200 text-slate-500 px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 disabled:opacity-40 transition-all"
                  >
                    ← Cancel
                  </button>
                  <button
                    onClick={() => {
                      setVMode("sms");
                      resetV();
                    }}
                    className="flex-1 rounded-2xl border border-sky-200 text-sky-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-sky-50 transition-all"
                  >
                    Try SMS instead →
                  </button>
                </div>
              </div>
            )}

            {/* SMS SENT */}
            {vStep === "sms-sent" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-black text-slate-900 mb-1">
                    Enter the SMS code
                  </h3>
                  <p className="text-sm text-slate-600">
                    A 6-digit code was sent to <strong>{vPhone}</strong>.
                  </p>
                </div>
                {vErr && (
                  <ErrBox
                    {...vErr}
                    onPurchase={() => {
                      resetV();
                      setTab("search");
                    }}
                  />
                )}
                <div>
                  <Label>6-digit code</Label>
                  <Inp
                    placeholder="123456"
                    value={vOtp}
                    onChange={(e) =>
                      setVOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSmsConfirm();
                    }}
                    maxLength={6}
                    className="text-center text-2xl tracking-widest font-black"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resetV}
                    disabled={!!busy}
                    className="rounded-2xl border border-slate-200 text-slate-500 px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 disabled:opacity-40 transition-all"
                  >
                    ← Start over
                  </button>
                  <button
                    onClick={handleSmsConfirm}
                    disabled={
                      busy === "verify-sms-confirm" || vOtp.length !== 6
                    }
                    className="flex-1 rounded-2xl bg-emerald-600 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    {busy === "verify-sms-confirm" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Confirming…
                      </>
                    ) : (
                      <>✓ Confirm Code</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Didn't receive it?{" "}
                  <button
                    onClick={() => {
                      setVStep("input");
                      setVOtp("");
                    }}
                    className="underline hover:text-slate-600"
                  >
                    Resend
                  </button>{" "}
                  or{" "}
                  <button
                    onClick={() => {
                      setVMode("voice");
                      setVStep("input");
                      setVOtp("");
                    }}
                    className="underline hover:text-slate-600"
                  >
                    switch to voice call
                  </button>
                </p>
              </div>
            )}

            {/* DONE */}
            {vStep === "done" && (
              <div className="space-y-5 text-center py-4">
                <div className="text-5xl">🎉</div>
                <h3 className="text-lg font-black text-slate-900">
                  Number verified and added to Owned Numbers!
                </h3>
                <p className="text-sm text-slate-600 max-w-sm mx-auto">
                  {vDoneMsg}
                </p>
                {!vInbound && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left max-w-md mx-auto">
                    <p className="text-sm font-black text-amber-700 mb-1">
                      ⚠ Outbound calls only
                    </p>
                    <p className="text-xs text-amber-600 leading-relaxed">
                      This number can be used as your agent's caller ID on
                      outbound calls. It{" "}
                      <strong>cannot receive incoming calls</strong> from
                      customers. For full inbound + outbound capability, you
                      need a dedicated Twilio number.
                    </p>
                    <p className="text-xs text-amber-500 mt-2">
                      <button
                        onClick={() => setTab("search")}
                        className="underline font-bold hover:text-amber-700"
                      >
                        Purchase a Twilio number here →
                      </button>
                    </p>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={resetV}
                    className="rounded-2xl border border-slate-200 text-slate-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:border-amber-400 hover:text-amber-600 transition-all"
                  >
                    Verify another number
                  </button>
                  <button
                    onClick={() => setTab("assigned")}
                    className="rounded-2xl bg-slate-900 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                  >
                    View Agent Numbers →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneNumbers;
