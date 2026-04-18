import React, { useState, useEffect, useRef } from "react";
import { BusinessProfile, FAQ, AgentConfig } from "../types";

interface OnboardingProps {
  onGenerateFaqs: (website: string) => Promise<FAQ[]>;
  onComplete: (profile: BusinessProfile, agent: AgentConfig) => Promise<void>;
}

// Comprehensive industry list
const INDUSTRIES = [
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
  "Flooring & Tiling",
  "Food & Restaurant",
  "Freight & Logistics",
  "Funeral Services",
  "General Contracting",
  "Healthcare & Medical",
  "Home Services",
  "Hotel & Hospitality",
  "HVAC Services",
  "Insurance",
  "Interior Design",
  "IT & Technology",
  "Landscaping & Lawn Care",
  "Legal / Law Firm",
  "Manufacturing",
  "Marketing Agency",
  "Massage Therapy",
  "Mortgage & Lending",
  "Moving Services",
  "Non-Profit",
  "Optometry",
  "Painting Services",
  "Pest Control",
  "Pet Services",
  "Photography",
  "Physiotherapy",
  "Plumbing",
  "Printing & Signage",
  "Property Management",
  "Real Estate",
  "Recruitment",
  "Roofing",
  "SaaS / Software",
  "Security Services",
  "Solar Energy",
  "Spa & Skincare",
  "Tailoring & Alterations",
  "Tattoo Studio",
  "Transportation",
  "Travel Agency",
  "Trucking",
  "Tutoring",
  "Veterinary",
  "Wedding Services",
  "Other",
];

const TONE_OPTIONS = [
  { id: "Professional" as const, desc: "Precise & formal" },
  { id: "Friendly" as const, desc: "Warm & bubbly" },
  { id: "Empathetic" as const, desc: "Caring & patient" },
];

// Nominatim result type
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

const Onboarding: React.FC<OnboardingProps> = ({
  onGenerateFaqs,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const TOTAL_STEPS = 5;

  const [profile, setProfile] = useState<BusinessProfile>({
    name: "",
    industry: "",
    website: "",
    location: "",
    onboarded: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  const [agent, setAgent] = useState<AgentConfig>({
    id: "voice_agent_onboarding",
    name: "Maya",
    direction: "inbound",
    twilioPhoneNumber: "",
    twilioPhoneSid: "",
    voice: "Rachel",
    language: "English",
    greeting: "",
    tone: "Professional",
    businessHours: "9:00 AM - 5:00 PM",
    faqs: [],
    escalationPhone: "",
    voicemailFallback: true,
    isActive: false,
    dataCaptureFields: ["name", "phone", "email", "reason"],
    rules: { autoBook: false, autoEscalate: true, captureAllLeads: true },
  });

  const [hours, setHours] = useState({ start: "09:00", end: "17:00" });

  // Industry search
  const [industrySearch, setIndustrySearch] = useState("");
  const [industryOpen, setIndustryOpen] = useState(false);
  const industryRef = useRef<HTMLDivElement>(null);

  // City search (Nominatim)
  const [citySearch, setCitySearch] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<NominatimResult[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const cityDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Auto-update greeting when agent name or business name changes
  useEffect(() => {
    const biz = profile.name || "our business";
    const agentN = agent.name || "Maya";
    setAgent((a) => ({
      ...a,
      greeting: `Hello, thank you for calling ${biz}! This is ${agentN}. How can I help you today?`,
    }));
  }, [agent.name, profile.name]);

  // Close industry dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        industryRef.current &&
        !industryRef.current.contains(e.target as Node)
      ) {
        setIndustryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // City search using Nominatim (free, no API key)
  useEffect(() => {
    if (citySearch.length < 3) {
      setCitySuggestions([]);
      setCityOpen(false);
      return;
    }
    clearTimeout(cityDebounce.current);
    cityDebounce.current = setTimeout(async () => {
      setCityLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(citySearch)}&format=json&limit=8&addressdetails=1&featuretype=city`;
        const res = await fetch(url, {
          headers: { "User-Agent": "AgentlyOnboarding/1.0" },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setCitySuggestions(data);
          setCityOpen(data.length > 0);
        }
      } catch (err) {
        console.error("Nominatim search failed:", err);
        setCitySuggestions([]);
      } finally {
        setCityLoading(false);
      }
    }, 400);
  }, [citySearch]);

  const filteredIndustries = INDUSTRIES.filter((i) =>
    i.toLowerCase().includes(industrySearch.toLowerCase()),
  );

  const handleNext = async () => {
    setError("");
    try {
      if (step === 2) {
        setLoading(true);
        const generated = await onGenerateFaqs(profile.website.trim());
        setAgent((a) => ({ ...a, faqs: generated.slice(0, 5) }));
        setStep(3);
      } else if (step === TOTAL_STEPS) {
        setLoading(true);
        await onComplete(profile, {
          ...agent,
          businessHours: `${hours.start} - ${hours.end}`,
        });
      } else {
        setStep((s) => s + 1);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to continue. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (field: string) => {
    setAgent((a) => ({
      ...a,
      dataCaptureFields: a.dataCaptureFields.includes(field)
        ? a.dataCaptureFields.filter((f) => f !== field)
        : [...a.dataCaptureFields, field],
    }));
  };

  const inp =
    "w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all font-medium text-base";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-700 ${step > i ? "bg-amber-500" : "bg-slate-200"}`}
            />
          ))}
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mb-2">
          Step {step} of {TOTAL_STEPS}
        </p>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 p-8 md:p-10 relative overflow-hidden">
          {/* ── Step 1: Business Details ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">
                  Your Business
                </h1>
                <p className="text-slate-400 text-sm">
                  Tell us about your workplace.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bright Path Dental"
                  className={inp}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              {/* Industry dropdown */}
              <div ref={industryRef}>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Industry
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={profile.industry || "Search industry..."}
                    className={inp + " cursor-pointer"}
                    value={
                      industryOpen ? industrySearch : profile.industry || ""
                    }
                    onFocus={() => {
                      setIndustryOpen(true);
                      setIndustrySearch("");
                    }}
                    onChange={(e) => {
                      setIndustrySearch(e.target.value);
                      setIndustryOpen(true);
                    }}
                  />
                  <i className="fa-sharp fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
                  {industryOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-52 overflow-y-auto">
                      {filteredIndustries.length === 0 ? (
                        <p className="text-sm text-slate-400 px-4 py-3">
                          No match
                        </p>
                      ) : (
                        filteredIndustries.map((ind) => (
                          <button
                            key={ind}
                            type="button"
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 transition-colors ${profile.industry === ind ? "font-black text-amber-600 bg-amber-50" : "text-slate-700"}`}
                            onClick={() => {
                              setProfile((p) => ({ ...p, industry: ind }));
                              setIndustryOpen(false);
                              setIndustrySearch("");
                            }}
                          >
                            {ind}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* City search with Nominatim */}
              <div className="relative">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  City / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lagos, Nigeria"
                  className={inp}
                  value={citySearch || profile.location}
                  onChange={(e) => {
                    setCitySearch(e.target.value);
                    setProfile((p) => ({ ...p, location: e.target.value }));
                  }}
                  onFocus={() => citySearch.length >= 3 && setCityOpen(true)}
                />
                {cityOpen && (citySuggestions.length > 0 || cityLoading) && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-52 overflow-y-auto">
                    {cityLoading ? (
                      <div className="px-4 py-3 text-sm text-slate-400">
                        Loading...
                      </div>
                    ) : (
                      citySuggestions.map((city) => (
                        <button
                          key={city.place_id}
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 text-slate-700 transition-colors"
                          onClick={() => {
                            const displayName = city.display_name.split(",")[0]; // first part is city/town
                            setProfile((p) => ({
                              ...p,
                              location: displayName,
                            }));
                            setCitySearch(displayName);
                            setCityOpen(false);
                          }}
                        >
                          {city.display_name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Website{" "}
                  <span className="text-slate-300">(for AI training)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://yourwebsite.com"
                  className={inp}
                  value={profile.website}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, website: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Knowledge ── */}
          {step === 2 && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto">
                <i className="fa-sharp fa-solid fa-brain text-2xl text-amber-600" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 mb-1">
                  Training Your Agent
                </h1>
                <p className="text-slate-400 text-sm">
                  We'll scrape your website to build your agent's knowledge
                  base.
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-5 text-left space-y-2">
                <p className="text-sm font-black text-slate-700">
                  Website to scan:
                </p>
                <p className="text-sm text-slate-500 font-mono break-all">
                  {profile.website || "Not set — you can skip"}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Click <strong>Next</strong> to scan your website and
                auto-generate FAQs. This takes ~10 seconds.
              </p>
            </div>
          )}

          {/* ── Step 3: FAQ Review ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl font-black text-slate-900 mb-1">
                  Knowledge Base
                </h1>
                <p className="text-slate-400 text-sm">
                  Review and edit the FAQs your agent will know.
                </p>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {agent.faqs.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No FAQs generated — you can add them later in Agent
                    Settings.
                  </div>
                ) : (
                  agent.faqs.map((faq, i) => (
                    <div
                      key={faq.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2"
                    >
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) =>
                          setAgent((a) => ({
                            ...a,
                            faqs: a.faqs.map((f, j) =>
                              j === i ? { ...f, question: e.target.value } : f,
                            ),
                          }))
                        }
                        className="w-full text-sm font-bold bg-transparent outline-none border-b border-slate-200 pb-1 focus:border-amber-400"
                      />
                      <textarea
                        rows={2}
                        value={faq.answer}
                        onChange={(e) =>
                          setAgent((a) => ({
                            ...a,
                            faqs: a.faqs.map((f, j) =>
                              j === i ? { ...f, answer: e.target.value } : f,
                            ),
                          }))
                        }
                        className="w-full text-sm bg-transparent outline-none resize-none text-slate-600"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Agent Persona ── */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-black text-slate-900 mb-1">
                  Agent Persona
                </h1>
                <p className="text-slate-400 text-sm">
                  Configure how your AI receptionist sounds.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Agent Name
                </label>
                <input
                  type="text"
                  className={inp}
                  value={agent.name}
                  onChange={(e) =>
                    setAgent((a) => ({ ...a, name: e.target.value }))
                  }
                />
              </div>
              {/* Live greeting preview */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white text-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Live Greeting Preview
                </p>
                <p className="italic text-white/80">
                  {agent.greeting ||
                    `Hello, thank you for calling ${profile.name || "your business"}! This is ${agent.name}. How can I help you today?`}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Communication Tone
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAgent((a) => ({ ...a, tone: t.id }))}
                      className={`p-4 rounded-2xl border-2 transition-all text-center ${agent.tone === t.id ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"}`}
                    >
                      <p className="font-black text-sm">{t.id}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Open
                  </label>
                  <input
                    type="time"
                    className={inp}
                    value={hours.start}
                    onChange={(e) =>
                      setHours((h) => ({ ...h, start: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Close
                  </label>
                  <input
                    type="time"
                    className={inp}
                    value={hours.end}
                    onChange={(e) =>
                      setHours((h) => ({ ...h, end: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Escalation Number{" "}
                  <span className="text-slate-300">(optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+1 555 000 0000"
                  className={inp}
                  value={agent.escalationPhone}
                  onChange={(e) =>
                    setAgent((a) => ({ ...a, escalationPhone: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Capture from callers
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "name",
                    "phone",
                    "email",
                    "reason",
                    "budget",
                    "timeline",
                  ].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleField(f)}
                      className={`px-4 py-2 rounded-full border-2 text-xs font-black uppercase tracking-wider transition-all ${agent.dataCaptureFields.includes(f) ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-100 text-slate-400 hover:border-slate-200"}`}
                    >
                      {agent.dataCaptureFields.includes(f) && "✓ "}
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Confirm ── */}
          {step === 5 && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 bg-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-100">
                <i className="fa-sharp fa-solid fa-check text-white text-3xl" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 mb-1">
                  Ready to Deploy!
                </h1>
                <p className="text-slate-400 text-sm">
                  Your AI agent is configured and ready.
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-6 text-left space-y-4 border border-slate-100">
                {[
                  ["Business", profile.name],
                  ["Industry", profile.industry || "—"],
                  ["Agent", agent.name],
                  ["Tone", agent.tone],
                  ["Hours", `${hours.start} – ${hours.end}`],
                  ["FAQs", `${agent.faqs.length} entries`],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between items-center border-b border-slate-200 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {k}
                    </span>
                    <span className="font-black text-slate-900 text-sm">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
              <i className="fa-sharp fa-solid fa-circle-exclamation" /> {error}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-400 border-2 border-slate-100 hover:bg-slate-50 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-[2] bg-slate-900 text-white px-6 py-4 rounded-2xl font-black hover:bg-amber-600 transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-60"
            >
              {loading ? (
                <>
                  <i className="fa-sharp fa-solid fa-spinner fa-spin" />{" "}
                  Processing…
                </>
              ) : (
                <>
                  {step === TOTAL_STEPS ? "Launch Agent" : "Continue"}{" "}
                  <i className="fa-sharp fa-solid fa-arrow-right" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
