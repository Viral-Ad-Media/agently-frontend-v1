import React, { useState } from "react";
import { BusinessProfile, FAQ, AgentConfig } from "../types";

interface OnboardingProps {
  onGenerateFaqs: (website: string) => Promise<FAQ[]>;
  onComplete: (profile: BusinessProfile, agent: AgentConfig) => Promise<void>;
}

const TONE_PREVIEWS = {
  Professional:
    "Greetings. I'm Maya, your dedicated receptionist. I'm here to ensure your inquiry is handled with the utmost efficiency and precision. How may I direct your call?",
  Friendly:
    "Hi there! I'm Maya. I'm so glad you called! I'd love to help you out with whatever you need today. What's on your mind?",
  Empathetic:
    "Hello, I'm Maya. I understand you're calling, and I'm here to listen and help in any way I can. We truly value your time. How are you doing today?",
};

const TONE_OPTIONS: { id: AgentConfig["tone"]; icon: string; desc: string }[] =
  [
    { id: "Professional", icon: "👔", desc: "Precise" },
    { id: "Friendly", icon: "👋", desc: "Bubbly" },
    { id: "Empathetic", icon: "❤️", desc: "Caring" },
  ];

const Onboarding: React.FC<OnboardingProps> = ({
  onGenerateFaqs,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    voice: "Zephyr",
    language: "English",
    greeting: "",
    tone: "Professional",
    businessHours: "9:00 AM - 5:00 PM",
    faqs: [],
    escalationPhone: "",
    voicemailFallback: true,
    dataCaptureFields: ["name", "phone", "reason"],
    rules: {
      autoBook: true,
      autoEscalate: true,
      captureAllLeads: true,
    },
  });

  const [hours, setHours] = useState({ start: "09:00", end: "17:00" });

  const TOTAL_STEPS = 6;

  const handleNext = async () => {
    setError("");

    try {
      if (step === 2) {
        setLoading(true);
        const generated = await onGenerateFaqs(profile.website.trim());
        // LIMIT: only keep the first 4 FAQs
        const limitedFaqs = generated.slice(0, 4);
        setAgent((prev) => ({ ...prev, faqs: limitedFaqs }));
        setStep(3);
      } else if (step === TOTAL_STEPS) {
        setLoading(true);
        await onComplete(profile, {
          ...agent,
          businessHours: `${hours.start} - ${hours.end}`,
          greeting: `Hello, thank you for calling ${profile.name}! This is ${agent.name}. How can I help you today?`,
        });
      } else {
        setStep(step + 1);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to continue right now.",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleCaptureField = (field: string) => {
    setAgent((prev) => ({
      ...prev,
      dataCaptureFields: prev.dataCaptureFields.includes(field)
        ? prev.dataCaptureFields.filter((f) => f !== field)
        : [...prev.dataCaptureFields, field],
    }));
  };

  const addFaqEntry = () => {
    setAgent((prev) => ({
      ...prev,
      faqs: [
        ...prev.faqs,
        {
          id: `faq_${Date.now()}`,
          question: "New FAQ question",
          answer: "Add the answer your agent should use.",
        },
      ],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-inter">
      <div className="max-w-2xl w-full">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">
              Phase {step} of {TOTAL_STEPS}
            </h2>
            <p className="text-xs font-bold text-slate-400">
              {step === 1 && "The Workplace"}
              {step === 2 && "Knowledge Extraction"}
              {step === 3 && "Training Manual"}
              {step === 4 && "Recruiting Persona"}
              {step === 5 && "Operational Rules"}
              {step === 6 && "Deployment"}
            </p>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-700 ${step > i ? "bg-indigo-600" : "bg-slate-200"}`}
              ></div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 p-10 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700 overflow-hidden relative">
          {/* Step 1: Business Details */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="text-center md:text-left">
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  The Workplace
                </h1>
                <p className="text-slate-500 text-lg">
                  Where will your new AI receptionist be "working"?
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bright Path Dental"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all text-lg font-medium"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Industry
                  </label>
                  <select
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all font-medium appearance-none"
                    value={profile.industry}
                    onChange={(e) =>
                      setProfile({ ...profile, industry: e.target.value })
                    }
                  >
                    <option value="">Select industry...</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Legal">Legal</option>
                    <option value="Home Services">Home Services</option>
                    <option value="SaaS">Software / SaaS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Base City
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. New York, NY"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all font-medium"
                    value={profile.location}
                    onChange={(e) =>
                      setProfile({ ...profile, location: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Knowledge Extraction */}
          {step === 2 && (
            <div className="space-y-8 text-center md:text-left">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  Onboarding Data
                </h1>
                <p className="text-slate-500 text-lg">
                  Point your agent to your website so they can learn your
                  business "manual".
                </p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Corporate Website
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 font-bold">
                      https://
                    </div>
                    <input
                      type="text"
                      placeholder="www.yourbusiness.com"
                      className="w-full pl-[4.5rem] pr-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all text-lg font-medium"
                      value={profile.website}
                      onChange={(e) =>
                        setProfile({ ...profile, website: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 flex items-start gap-4">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2v8" />
                      <path d="m16 6-4 4-4-4" />
                      <rect width="20" height="8" x="2" y="14" rx="2" />
                      <path d="M6 18h.01" />
                      <path d="M10 18h.01" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-1">
                      Deep Analysis
                    </h4>
                    <p className="text-sm text-indigo-700 leading-relaxed">
                      Our AI will scan your site to understand your tone,
                      services, and pricing so you don't have to write a single
                      script.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: FAQ Review (Employee Handbook) – max 5 cards visible */}
          {step === 3 && (
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  Employee Handbook
                </h1>
                <p className="text-slate-500 text-lg">
                  Review and edit the knowledge your agent has acquired.
                </p>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
                {/* Show only first 5 FAQs (generation already limited to 4, so safe) */}
                {agent.faqs.slice(0, 5).map((faq, i) => (
                  <div
                    key={faq.id}
                    className="group p-6 rounded-[2rem] border-2 border-slate-50 bg-slate-50 hover:bg-white hover:border-indigo-100 transition-all relative"
                  >
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-12 bg-indigo-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <input
                      className="block w-full bg-transparent font-black text-slate-900 mb-2 outline-none border-none p-0 focus:ring-0"
                      value={faq.question}
                      onChange={(e) => {
                        const newFaqs = [...agent.faqs];
                        newFaqs[i].question = e.target.value;
                        setAgent({ ...agent, faqs: newFaqs });
                      }}
                    />
                    <textarea
                      className="block w-full bg-transparent text-sm text-slate-500 leading-relaxed outline-none border-none p-0 focus:ring-0 resize-none"
                      rows={2}
                      value={faq.answer}
                      onChange={(e) => {
                        const newFaqs = [...agent.faqs];
                        newFaqs[i].answer = e.target.value;
                        setAgent({ ...agent, faqs: newFaqs });
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={addFaqEntry}
                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-bold hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300 transition-all"
              >
                + Add Custom FAQ Entry
              </button>
            </div>
          )}

          {/* Step 4: Persona & Tone */}
          {step === 4 && (
            <div className="space-y-10">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  Recruiting Persona
                </h1>
                <p className="text-slate-500 text-lg">
                  How should your new hire sound to your customers?
                </p>
              </div>

              <div className="space-y-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    Office Name for Agent
                  </label>
                  <input
                    type="text"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none transition-all text-xl font-bold"
                    value={agent.name}
                    onChange={(e) =>
                      setAgent({ ...agent, name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    Select Voice Vibe
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {TONE_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setAgent({ ...agent, tone: t.id })}
                        className={`p-5 rounded-3xl border-2 transition-all flex flex-col items-center text-center gap-2 ${
                          agent.tone === t.id
                            ? "border-indigo-600 bg-indigo-50 shadow-xl shadow-indigo-100 scale-105"
                            : "border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200"
                        }`}
                      >
                        <span className="text-3xl mb-1">{t.icon}</span>
                        <span className="font-black text-slate-900 text-sm">
                          {t.id}
                        </span>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                          {t.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone Preview Bubble */}
                <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-2xl shadow-indigo-200 relative animate-in fade-in slide-in-from-top-4">
                  <div className="absolute -top-3 left-10 w-6 h-6 bg-indigo-600 rotate-45"></div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-xs">
                      {agent.name[0]}
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest opacity-70">
                      How I'll sound
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed italic">
                    "{TONE_PREVIEWS[agent.tone]}"
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    Typical Shift (Business Hours)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="time"
                      className="flex-1 px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold"
                      value={hours.start}
                      onChange={(e) =>
                        setHours({ ...hours, start: e.target.value })
                      }
                    />
                    <span className="font-bold text-slate-300">to</span>
                    <input
                      type="time"
                      className="flex-1 px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold"
                      value={hours.end}
                      onChange={(e) =>
                        setHours({ ...hours, end: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Handling Rules */}
          {step === 5 && (
            <div className="space-y-10">
              <div>
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  Standard Procedures
                </h1>
                <p className="text-slate-500 text-lg">
                  Define the protocols for transfers and data capture.
                </p>
              </div>

              <div className="space-y-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Escalation Manager Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold"
                    value={agent.escalationPhone}
                    onChange={(e) =>
                      setAgent({ ...agent, escalationPhone: e.target.value })
                    }
                  />
                </div>

                <div className="p-6 rounded-[2rem] bg-slate-50 border-2 border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                  <div>
                    <h4 className="font-black text-slate-900 flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20v-6h4V8h-4V2" />
                        <path d="m9 20 3-3-3-3" />
                      </svg>
                      Voicemail Fallback
                    </h4>
                    <p className="text-xs text-slate-500">
                      Record messages if transfer fails.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setAgent({
                        ...agent,
                        voicemailFallback: !agent.voicemailFallback,
                      })
                    }
                    className={`w-14 h-8 rounded-full transition-all relative px-1 flex items-center ${agent.voicemailFallback ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full transition-all shadow-md ${agent.voicemailFallback ? "translate-x-6" : "translate-x-0"}`}
                    ></div>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                    Lead Capture Requirements
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      "name",
                      "phone",
                      "email",
                      "reason",
                      "budget",
                      "timeline",
                    ].map((field) => (
                      <button
                        key={field}
                        onClick={() => toggleCaptureField(field)}
                        className={`px-5 py-2.5 rounded-full border-2 text-xs font-black transition-all flex items-center gap-2 ${
                          agent.dataCaptureFields.includes(field)
                            ? "border-indigo-600 bg-indigo-50 text-indigo-600 shadow-md shadow-indigo-50"
                            : "border-slate-100 text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        {agent.dataCaptureFields.includes(field) && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {field.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-10 text-center">
              <div>
                <div className="w-24 h-24 bg-green-500 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">
                  Recruitment Complete!
                </h1>
                <p className="text-slate-500 text-lg">
                  Your agent is fully briefed and ready for their first call.
                </p>
              </div>

              <div className="bg-slate-50 p-10 rounded-[2.5rem] border-2 border-slate-100 space-y-6 text-left relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-full -mr-16 -mt-16"></div>

                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Selected Employee
                  </span>
                  <span className="font-black text-slate-900">
                    {agent.name} (Virtual Agent)
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Business HQ
                  </span>
                  <span className="font-black text-slate-900">
                    {profile.name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Shift Hours
                  </span>
                  <span className="font-black text-slate-900">
                    {hours.start} — {hours.end}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Communication Style
                  </span>
                  <span className="font-black text-indigo-600">
                    {agent.tone} Persona
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-12 flex gap-4">
            {error && (
              <div className="absolute left-10 right-10 bottom-28 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 px-8 py-5 rounded-[1.5rem] font-black text-slate-400 border-2 border-slate-100 hover:bg-slate-50 transition-all active:scale-95 uppercase tracking-widest text-xs"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className={`flex-[2] bg-indigo-600 text-white px-8 py-5 rounded-[1.5rem] font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-xs ${loading ? "opacity-70 pointer-events-none" : ""}`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Scoping Website...</span>
                </>
              ) : (
                <>
                  <span>
                    {step === TOTAL_STEPS ? "Deploy to Office" : "Next Step"}
                  </span>
                  {step !== TOTAL_STEPS && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-center gap-8 opacity-40 grayscale group hover:grayscale-0 transition-all">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/b/b9/Stripe_Logo%2C_revised_2016.svg"
            alt="Stripe"
            className="h-5"
          />
          <div className="h-4 w-px bg-slate-300"></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
            Encrypted & Secure
          </p>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
