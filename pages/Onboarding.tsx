import { searchIndustries } from "../lib/industries";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BusinessProfile, FAQ, AgentConfig } from "../types";
import { readThemeChoice } from "../lib/theme";

interface OnboardingProps {
  onGenerateFaqs: (website: string) => Promise<FAQ[]>;
  onComplete: (profile: BusinessProfile, agent: AgentConfig) => Promise<void>;
}

/**
 * Industry selection.
 *
 * People type what they call their business, not our category names: "sport",
 * "nursing", "clothing". The taxonomy and the ranked matcher both live in
 * lib/industries.ts — NAICS-derived categories with real-world aliases, plus a
 * bigram-similarity fallback so typos still land. When nothing scores at all
 * the picker offers to store the user's own words rather than forcing a wrong
 * pick.
 */


/* Industry taxonomy now lives in lib/industries.ts (NAICS-based, 124
   entries with aliases + fuzzy matching). */

const TONE_OPTIONS = [
  {
    id: "Professional" as const,
    desc: "Precise and composed",
    icon: "fa-briefcase",
  },
  {
    id: "Friendly" as const,
    desc: "Warm and conversational",
    icon: "fa-face-smile",
  },
  {
    id: "Empathetic" as const,
    desc: "Patient and reassuring",
    icon: "fa-heart",
  },
];

const CAPTURE_FIELDS = [
  "name",
  "phone",
  "email",
  "reason",
  "budget",
  "timeline",
];

/* One short heading and one line of context per step: the screen itself
   carries the rest. */
const STEP_META = [
  {
    title: "Business",
    heading: "Tell us about your business.",
    sub: "Your agent uses this to introduce you to callers.",
  },
  {
    title: "Website",
    heading: "Where should your agent learn?",
    sub: "Agently reads your homepage and drafts starter answers.",
  },
  {
    title: "Answers",
    heading: "Check your starter answers.",
    sub: "This is what your agent tells callers. Click any line to edit it.",
  },
  {
    title: "Agent",
    heading: "Set up your agent.",
    sub: "Its name, its tone, and when a call goes to a person.",
  },
  {
    title: "Launch",
    heading: "Ready to launch.",
    sub: "You can change any of this later in Settings.",
  },
];

/* Same palette, fonts and theme rules as the landing page, scoped to the
   onboarding screen so nothing leaks into the dashboard behind it. */
const ONBOARDING_CSS = `
.ob-scope{--bg:#111419;--surface:#171b21;--ink:#f3f1eb;--muted:#afb3ba;--line:#33373d;--warm:#24272b;--orange:#ff6a32;--orange-deep:#ff7a45;--orange-soft:rgba(255,106,50,.14);--focus:rgba(255,106,50,.25);--glow:rgba(255,106,50,.17);--glow2:rgba(70,110,255,.10);--dot:rgba(255,255,255,.07);--card-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 30px 80px rgba(0,0,0,.45);color-scheme:dark}
.ob-scope.ob-light{--bg:#f6f5f1;--surface:#ffffff;--ink:#101216;--muted:#5a5b61;--line:#d9d7d0;--warm:#ece9e1;--orange:#f15a24;--orange-deep:#b63a0e;--orange-soft:#fdebe2;--focus:rgba(241,90,36,.18);--glow:rgba(241,90,36,.13);--glow2:rgba(70,110,255,.08);--dot:rgba(16,18,22,.08);--card-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 24px 60px rgba(16,18,22,.10);color-scheme:light}
.ob-scope{position:relative;isolation:isolate;background:radial-gradient(1100px 560px at 50% -8%,var(--glow),transparent 62%),radial-gradient(760px 520px at 104% 104%,var(--glow2),transparent 60%),radial-gradient(600px 420px at -6% 70%,var(--glow2),transparent 60%),var(--bg)}
.ob-scope::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:radial-gradient(var(--dot) 1px,transparent 1.2px);background-size:24px 24px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 30%,transparent 80%);mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 30%,transparent 80%)}
.ob-scope .ob-card{box-shadow:var(--card-shadow)}
.ob-bar{background:linear-gradient(100deg,#07101c 0%,#0d1724 55%,#1c130e 100%);box-shadow:inset 0 -1px 0 rgba(255,106,50,.55),0 10px 30px rgba(7,16,28,.25);color:#f7f5ef}
.ob-bar .ob-step{background:rgba(255,106,50,.16);color:#ffb08c;border:1px solid rgba(255,106,50,.35)}
.ob-faqs{max-height:clamp(180px,calc(100svh - 470px),440px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.ob-faqs textarea{white-space:pre-wrap;overflow-wrap:anywhere}
@media (max-height:720px){.ob-scope .ob-main{padding-top:12px;padding-bottom:12px}.ob-scope .ob-steps{margin-bottom:12px}.ob-scope .ob-card{padding:22px 28px}.ob-scope .ob-card h1{font-size:26px;letter-spacing:-.9px}.ob-scope .ob-body{margin-top:16px}.ob-scope .ob-foot{margin-top:18px;padding-top:14px}.ob-scope .ob-stack{row-gap:14px}.ob-scope .ob-card input{height:40px}.ob-scope .ob-greet{padding-top:8px;padding-bottom:8px}.ob-faqs{max-height:clamp(160px,calc(100svh - 400px),440px)}}
`;

const ChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-4 w-4">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-4 w-4">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

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
    country_code?: string;
  };
}

const US_STATE_TIMEZONES: Record<string, string> = {
  alabama: "America/Chicago",
  alaska: "America/Anchorage",
  arizona: "America/Phoenix",
  arkansas: "America/Chicago",
  california: "America/Los_Angeles",
  colorado: "America/Denver",
  connecticut: "America/New_York",
  delaware: "America/New_York",
  florida: "America/New_York",
  georgia: "America/New_York",
  hawaii: "Pacific/Honolulu",
  idaho: "America/Denver",
  illinois: "America/Chicago",
  indiana: "America/New_York",
  iowa: "America/Chicago",
  kansas: "America/Chicago",
  kentucky: "America/New_York",
  louisiana: "America/Chicago",
  maine: "America/New_York",
  maryland: "America/New_York",
  massachusetts: "America/New_York",
  michigan: "America/New_York",
  minnesota: "America/Chicago",
  mississippi: "America/Chicago",
  missouri: "America/Chicago",
  montana: "America/Denver",
  nebraska: "America/Chicago",
  nevada: "America/Los_Angeles",
  "new hampshire": "America/New_York",
  "new jersey": "America/New_York",
  "new mexico": "America/Denver",
  "new york": "America/New_York",
  "north carolina": "America/New_York",
  "north dakota": "America/Chicago",
  ohio: "America/New_York",
  oklahoma: "America/Chicago",
  oregon: "America/Los_Angeles",
  pennsylvania: "America/New_York",
  "rhode island": "America/New_York",
  "south carolina": "America/New_York",
  "south dakota": "America/Chicago",
  tennessee: "America/Chicago",
  texas: "America/Chicago",
  utah: "America/Denver",
  vermont: "America/New_York",
  virginia: "America/New_York",
  washington: "America/Los_Angeles",
  "west virginia": "America/New_York",
  wisconsin: "America/Chicago",
  wyoming: "America/Denver",
};

const LOCATION_TIMEZONE_FALLBACKS: Array<[RegExp, string]> = [
  [
    /\b(houston|texas|dallas|austin|san antonio|fort worth)\b/i,
    "America/Chicago",
  ],
  [
    /\b(new york|brooklyn|queens|manhattan|new jersey|miami|florida|atlanta|boston|washington,?\s*dc|philadelphia)\b/i,
    "America/New_York",
  ],
  [
    /\b(los angeles|california|san francisco|seattle|oregon|portland|las vegas|nevada)\b/i,
    "America/Los_Angeles",
  ],
  [/\b(denver|colorado|utah|wyoming|montana|new mexico)\b/i, "America/Denver"],
  [/\b(phoenix|arizona)\b/i, "America/Phoenix"],
  [/\b(london|england|united kingdom)\b/i, "Europe/London"],
];

const getConciseLocationLabel = (city: NominatimResult) => {
  const address = city.address || {};
  const locality =
    address.city ||
    address.town ||
    address.village ||
    city.display_name.split(",")[0];
  return [locality, address.state, address.country].filter(Boolean).join(", ");
};

/**
 * FIX: selecting Lagos produced "Eastern Time (US)".
 *
 * The old chain was: US states -> a small regex fallback list -> hardcoded
 * "America/New_York". Nigeria matched nothing, so every non-US, non-listed
 * city on earth silently became New York. Defaulting a timezone to the
 * author's own is a bug that only shows up for everyone else.
 *
 * New order:
 *   1. US states (unchanged — the US genuinely needs sub-country resolution)
 *   2. ISO country code -> capital timezone. Covers every country Nominatim
 *      returns, which is the actual signal we already had and were ignoring.
 *   3. The existing regex list, for sub-country cases outside the US.
 *   4. The browser's own timezone — a far better guess than New York, because
 *      most people set up their workspace from where they operate.
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  ng: "Africa/Lagos",
  gh: "Africa/Accra",
  ke: "Africa/Nairobi",
  za: "Africa/Johannesburg",
  eg: "Africa/Cairo",
  ma: "Africa/Casablanca",
  tz: "Africa/Dar_es_Salaam",
  ug: "Africa/Kampala",
  et: "Africa/Addis_Ababa",
  ci: "Africa/Abidjan",
  sn: "Africa/Dakar",
  cm: "Africa/Douala",
  dz: "Africa/Algiers",
  tn: "Africa/Tunis",
  zw: "Africa/Harare",
  zm: "Africa/Lusaka",
  rw: "Africa/Kigali",
  bw: "Africa/Gaborone",
  gb: "Europe/London",
  ie: "Europe/Dublin",
  fr: "Europe/Paris",
  de: "Europe/Berlin",
  es: "Europe/Madrid",
  it: "Europe/Rome",
  pt: "Europe/Lisbon",
  nl: "Europe/Amsterdam",
  be: "Europe/Brussels",
  ch: "Europe/Zurich",
  at: "Europe/Vienna",
  se: "Europe/Stockholm",
  no: "Europe/Oslo",
  dk: "Europe/Copenhagen",
  fi: "Europe/Helsinki",
  pl: "Europe/Warsaw",
  cz: "Europe/Prague",
  gr: "Europe/Athens",
  ro: "Europe/Bucharest",
  hu: "Europe/Budapest",
  ua: "Europe/Kyiv",
  ru: "Europe/Moscow",
  tr: "Europe/Istanbul",
  ae: "Asia/Dubai",
  sa: "Asia/Riyadh",
  qa: "Asia/Qatar",
  il: "Asia/Jerusalem",
  in: "Asia/Kolkata",
  pk: "Asia/Karachi",
  bd: "Asia/Dhaka",
  lk: "Asia/Colombo",
  cn: "Asia/Shanghai",
  hk: "Asia/Hong_Kong",
  tw: "Asia/Taipei",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  sg: "Asia/Singapore",
  my: "Asia/Kuala_Lumpur",
  th: "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh",
  id: "Asia/Jakarta",
  ph: "Asia/Manila",
  au: "Australia/Sydney",
  nz: "Pacific/Auckland",
  br: "America/Sao_Paulo",
  ar: "America/Argentina/Buenos_Aires",
  cl: "America/Santiago",
  co: "America/Bogota",
  pe: "America/Lima",
  mx: "America/Mexico_City",
  jm: "America/Jamaica",
  tt: "America/Port_of_Spain",
  ca: "America/Toronto",
};

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const inferTimezoneFromNominatim = (city: NominatimResult) => {
  const address = city.address || {};
  const state = String(address.state || "")
    .trim()
    .toLowerCase();
  const countryCode = String(address.country_code || "")
    .trim()
    .toLowerCase();

  if (countryCode === "us" && state && US_STATE_TIMEZONES[state])
    return US_STATE_TIMEZONES[state];

  if (countryCode && COUNTRY_TIMEZONES[countryCode])
    return COUNTRY_TIMEZONES[countryCode];

  const haystack = `${city.display_name || ""} ${address.city || ""} ${address.town || ""} ${address.state || ""} ${address.country || ""}`;
  const match = LOCATION_TIMEZONE_FALLBACKS.find(([pattern]) =>
    pattern.test(haystack),
  );
  return match?.[1] || browserTimezone();
};

const inferTimezoneFromLocationText = (location: string) => {
  const match = LOCATION_TIMEZONE_FALLBACKS.find(([pattern]) =>
    pattern.test(location),
  );
  return match?.[1];
};

const Onboarding: React.FC<OnboardingProps> = ({
  onGenerateFaqs,
  onComplete,
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const TOTAL_STEPS = 5;
  const currentStep = STEP_META[step - 1];

  const [profile, setProfile] = useState<BusinessProfile>({
    name: "",
    industry: "",
    website: "",
    location: "",
    onboarded: false,
    timezone: "America/New_York",
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
    rules: { autoBook: false, autoEscalate: false, captureAllLeads: true },
  });

  const [hours, setHours] = useState({ start: "09:00", end: "17:00" });
  const [industrySearch, setIndustrySearch] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [industryOpen, setIndustryOpen] = useState(false);
  const industryRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);
  const [citySearch, setCitySearch] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<NominatimResult[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const cityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX: selecting a city called setCitySearch(displayName), which re-fired the
  // effect keyed on [citySearch], refetched Nominatim and reopened the panel —
  // which is why it popped up a second and third time after a selection.
  // This flag suppresses exactly one search cycle after a deliberate pick.
  const citySelectedRef = useRef(false);
  const cityAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const orgName = profile.name || "your team";
    const agentName = agent.name || "Maya";
    setAgent((a) => ({
      ...a,
      greeting: `Hello, thank you for calling ${orgName}. This is ${agentName}. How can I help you today?`,
    }));
  }, [agent.name, profile.name]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        industryRef.current &&
        !industryRef.current.contains(e.target as Node)
      ) {
        setIndustryOpen(false);
      }
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    // Consume the suppression flag set by a deliberate selection.
    if (citySelectedRef.current) {
      citySelectedRef.current = false;
      return;
    }
    if (citySearch.length < 3) {
      setCitySuggestions([]);
      setCityOpen(false);
      return;
    }
    if (cityDebounce.current) clearTimeout(cityDebounce.current);
    cityAbortRef.current?.abort();

    cityDebounce.current = setTimeout(async () => {
      const controller = new AbortController();
      cityAbortRef.current = controller;
      setCityLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(citySearch)}&format=json&limit=8&addressdetails=1&featuretype=city`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (Array.isArray(data)) {
          setCitySuggestions(data);
          setCityOpen(data.length > 0);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("City lookup failed:", err);
        setCitySuggestions([]);
      } finally {
        if (!controller.signal.aborted) setCityLoading(false);
      }
    }, 400);

    return () => {
      if (cityDebounce.current) clearTimeout(cityDebounce.current);
    };
  }, [citySearch]);

  /*
   * Ranked against the NAICS-based taxonomy in lib/industries.ts. The old
   * substring+synonym pass could not answer "clothing" at all, because no
   * apparel or retail category existed; the list now covers 19 NAICS sectors
   * and the matcher falls back to bigram similarity, so typos still land.
   */
  const filteredIndustries = useMemo(
    () => searchIndustries(industrySearch).map((m) => m.industry.label),
    [industrySearch],
  );

  /** Nothing sensible matched, so offer to take the user's own words. */
  const showCustomIndustry =
    industrySearch.trim().length >= 2 && filteredIndustries.length === 0;

  /*
   * C4 — required-field validation.
   *
   * Step 1 previously accepted an entirely empty form: Continue was always
   * enabled and handleNext just incremented the step, so an org could be
   * created with no name, no industry and no location. Returns a per-field
   * map so the UI can disable Continue AND show which field is missing,
   * rather than only one of the two.
   */
  const stepErrors = useMemo<Record<string, string>>(() => {
    const errors: Record<string, string> = {};
    if (step === 1) {
      if (!profile.name.trim()) errors.name = "Add your business name.";
      if (!profile.industry.trim()) errors.industry = "Choose or type your industry.";
      if (!profile.location.trim()) errors.location = "Add your city or location.";
    }
    if (step === 2) {
      const website = profile.website.trim();
      if (!website) errors.website = "Add your website so Agently can read it.";
      else if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(website))
        errors.website = "That does not look like a website address.";
    }
    return errors;
  }, [step, profile]);

  const stepIsValid = Object.keys(stepErrors).length === 0;

  const handleNext = async () => {
    setError("");
    if (!stepIsValid) {
      setError(Object.values(stepErrors)[0]);
      return;
    }
    try {
      if (step === 2) {
        setLoading(true);
        const website = profile.website.trim();

        // Onboarding deliberately reads only the homepage. Full sitemap and
        // route discovery happens later from Settings -> Knowledge Bases, where
        // the tenant can choose multiple pages or Select all before scraping.
        const generated = await onGenerateFaqs(website);
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

  const growTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const inputClass =
    "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] placeholder:opacity-70 focus:border-[var(--orange)] focus:shadow-[0_0_0_4px_var(--focus)]";
  const labelClass = "mb-2 block text-[13px] font-medium text-[var(--ink)]";
  const menuClass =
    "absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.12)]";
  const menuItemClass =
    "w-full rounded-lg px-3 py-2 text-left text-[14px] transition-colors hover:bg-[var(--warm)]";
  const BTN =
    "h-11 rounded-xl px-5 inline-flex items-center justify-center gap-2 text-sm font-medium border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  /* Inline, per-field. A disabled Continue on its own does not tell anyone
     WHICH field is missing. */
  const FieldError: React.FC<{ name: string }> = ({ name }) =>
    touched[name] && stepErrors[name] ? (
      <p className="mt-1.5 text-[12px] text-[#b63d28]">{stepErrors[name]}</p>
    ) : null;

  const selectedTone =
    TONE_OPTIONS.find((t) => t.id === agent.tone) ?? TONE_OPTIONS[0];

  return (
    <div className={`ob-scope ${readThemeChoice() === "light" ? "ob-light" : ""} ag-onboarding-no-callout flex min-h-svh flex-col font-['Manrope',sans-serif] text-[var(--ink)]`}>
      <style>{ONBOARDING_CSS}</style>

      {/* Header: the landing page's bar, logo left and progress right. */}
      <header className="ob-bar relative z-10 h-[65px] shrink-0 max-[699px]:h-[60px]">
        <div className="mx-auto flex h-full w-[min(calc(100%-36px),1296px)] items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2.5 font-['DM_Sans',sans-serif] text-[24px] font-semibold tracking-[-1px] max-[699px]:text-[21px]">
            <img
              src="/landing/logo.png"
              alt=""
              className="h-8 w-8 object-contain"
            />
            Agently
          </span>
          <span className="ob-step rounded-full px-3 py-1 font-['IBM_Plex_Mono',monospace] text-[12px] uppercase tracking-[1px]">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>
      </header>

      <main className="ob-main flex flex-1 items-center justify-center px-[18px] py-[clamp(18px,4vh,44px)]">
        <div className="w-full max-w-[720px]">
          {/* Progress: one bar per step, named on wider screens. */}
          <ol
            className="ob-steps mb-[clamp(16px,3vh,28px)] grid grid-cols-5 gap-2 sm:grid-cols-5"
            aria-label="Setup progress"
          >
            {STEP_META.map((meta, i) => (
              <li
                key={meta.title}
                aria-current={step === i + 1 ? "step" : undefined}
              >
                <span
                  className={`block h-[3px] rounded-full transition-colors duration-500 ${
                    step > i ? "bg-[var(--orange)]" : "bg-[var(--line)]"
                  }`}
                />
                <span
                  className={`mt-2 block font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.9px] max-[599px]:hidden ${
                    step === i + 1 ? "text-[var(--ink)]" : "text-[var(--muted)]"
                  }`}
                >
                  {meta.title}
                </span>
              </li>
            ))}
          </ol>

          <section className="ob-card rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-[clamp(20px,3.6vw,36px)]">
            <h1 className="m-0 font-['DM_Sans',sans-serif] text-[32px] font-medium leading-[1.05] tracking-[-1.4px] max-[699px]:text-[26px] max-[699px]:tracking-[-0.9px]">
              {currentStep.heading}
            </h1>
            <p className="m-0 mt-2 text-[15px] leading-[1.5] text-[var(--muted)]">
              {currentStep.sub}
            </p>

            <div className="ob-body mt-[clamp(20px,3.5vh,30px)]">
              {step === 1 && (
                <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="ob-name">
                      Business name
                    </label>
                    <input
                      id="ob-name"
                      type="text"
                      placeholder="Your company name"
                      autoComplete="organization"
                      className={inputClass}
                      value={profile.name}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, name: e.target.value }))
                      }
                    />
                    <FieldError name="name" />
                  </div>

                  <div ref={industryRef}>
                    <label className={labelClass} htmlFor="ob-industry">
                      Industry
                    </label>
                    <div className="relative">
                      <input
                        id="ob-industry"
                        type="text"
                        placeholder={profile.industry || "Search industries"}
                        autoComplete="off"
                        className={`${inputClass} cursor-pointer pr-10`}
                        value={
                          industryOpen ? industrySearch : profile.industry || ""
                        }
                        onFocus={() => {
                          setIndustryOpen(true);
                          setIndustrySearch("");
                        }}
                        onBlur={() =>
                          setTouched((t) => ({ ...t, industry: true }))
                        }
                        onChange={(e) => {
                          setIndustrySearch(e.target.value);
                          setIndustryOpen(true);
                        }}
                      />
                      <span className="pointer-events-none absolute right-3.5 top-[22px] -translate-y-1/2 text-[var(--muted)]">
                        <ChevronDown />
                      </span>
                      {industryOpen && (
                        <div className={menuClass}>
                          {showCustomIndustry ? (
                            /* Nothing matched, so take their own words
                               rather than forcing a wrong pick. */
                            <button
                              type="button"
                              className={`${menuItemClass} text-[var(--muted)]`}
                              onClick={() => {
                                setProfile((p) => ({
                                  ...p,
                                  industry: industrySearch.trim(),
                                }));
                                setIndustryOpen(false);
                                setIndustrySearch("");
                              }}
                            >
                              Use “
                              <span className="font-medium text-[var(--ink)]">
                                {industrySearch.trim()}
                              </span>
                              ”
                            </button>
                          ) : filteredIndustries.length === 0 ? (
                            <p className="m-0 px-3 py-2 text-[14px] text-[var(--muted)]">
                              Start typing to search industries
                            </p>
                          ) : (
                            filteredIndustries.map((ind) => (
                              <button
                                key={ind}
                                type="button"
                                className={`${menuItemClass} ${
                                  profile.industry === ind
                                    ? "font-medium text-[var(--orange-deep)]"
                                    : "text-[var(--ink)]"
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setProfile((p) => ({ ...p, industry: ind }));
                                  setTouched((t) => ({ ...t, industry: true }));
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
                    <FieldError name="industry" />
                  </div>

                  <div className="relative" ref={cityRef}>
                    <label className={labelClass} htmlFor="ob-location">
                      City
                    </label>
                    <input
                      id="ob-location"
                      type="text"
                      placeholder="City, country"
                      autoComplete="off"
                      className={inputClass}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, location: true }))
                      }
                      value={citySearch || profile.location}
                      onChange={(e) => {
                        const nextLocation = e.target.value;
                        setCitySearch(nextLocation);
                        const inferredTimezone =
                          inferTimezoneFromLocationText(nextLocation);
                        setProfile((p) => ({
                          ...p,
                          location: nextLocation,
                          ...(inferredTimezone
                            ? { timezone: inferredTimezone }
                            : {}),
                        }));
                      }}
                      onFocus={() =>
                        citySearch.length >= 3 && setCityOpen(true)
                      }
                    />
                    <FieldError name="location" />
                    {cityOpen &&
                      (citySuggestions.length > 0 || cityLoading) && (
                        <div className={menuClass}>
                          {cityLoading ? (
                            <p className="m-0 px-3 py-2 text-[14px] text-[var(--muted)]">
                              Searching…
                            </p>
                          ) : (
                            citySuggestions.map((city) => (
                              <button
                                key={city.place_id}
                                type="button"
                                className={`${menuItemClass} text-[var(--ink)]`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const displayName =
                                    getConciseLocationLabel(city);
                                  const inferredTimezone =
                                    inferTimezoneFromNominatim(city);
                                  setProfile((p) => ({
                                    ...p,
                                    location: displayName,
                                    timezone: inferredTimezone,
                                  }));
                                  // Suppress the search cycle this state
                                  // change would otherwise trigger.
                                  citySelectedRef.current = true;
                                  setCitySearch(displayName);
                                  setCityOpen(false);
                                  setCitySuggestions([]);
                                }}
                              >
                                {city.display_name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <label className={labelClass} htmlFor="ob-website">
                    Website
                  </label>
                  <input
                    id="ob-website"
                    type="url"
                    inputMode="url"
                    placeholder="https://yourwebsite.com"
                    autoComplete="url"
                    className={inputClass}
                    value={profile.website}
                    onBlur={() => setTouched((t) => ({ ...t, website: true }))}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, website: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && stepIsValid && !loading)
                        void handleNext();
                    }}
                  />
                  <FieldError name="website" />
                  <p className="m-0 mt-3 text-[13px] leading-[1.5] text-[var(--muted)]">
                    Takes a few seconds. You can add more pages later from
                    Settings → Knowledge Bases.
                  </p>
                </div>
              )}

              {step === 3 &&
                (agent.faqs.length === 0 ? (
                  <p className="m-0 rounded-xl bg-[var(--warm)] px-4 py-6 text-center text-[14px] text-[var(--muted)]">
                    No answers could be drafted from your homepage. Add
                    knowledge later from Settings → Knowledge Bases.
                  </p>
                ) : (
                  <ol className="ob-faqs m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] p-0">
                    {agent.faqs.map((faq, i) => (
                      <li
                        key={faq.id}
                        className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 px-4 py-3"
                      >
                        <span className="pt-[3px] font-['IBM_Plex_Mono',monospace] text-[12px] text-[var(--orange-deep)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <textarea
                            rows={1}
                            value={faq.question}
                            aria-label={`Question ${i + 1}`}
                            ref={(el) => {
                              if (el) growTextarea(el);
                            }}
                            onInput={(e) => growTextarea(e.currentTarget)}
                            onChange={(e) =>
                              setAgent((a) => ({
                                ...a,
                                faqs: a.faqs.map((f, j) =>
                                  j === i
                                    ? { ...f, question: e.target.value }
                                    : f,
                                ),
                              }))
                            }
                            className="block w-full resize-none overflow-hidden rounded-md border-transparent bg-transparent px-1 text-[14px] font-semibold leading-[1.4] text-[var(--ink)] outline-none transition-colors focus:bg-[var(--orange-soft)]"
                          />
                          <textarea
                            rows={1}
                            value={faq.answer}
                            aria-label={`Answer ${i + 1}`}
                            ref={(el) => {
                              if (el) growTextarea(el);
                            }}
                            onInput={(e) => growTextarea(e.currentTarget)}
                            onChange={(e) =>
                              setAgent((a) => ({
                                ...a,
                                faqs: a.faqs.map((f, j) =>
                                  j === i ? { ...f, answer: e.target.value } : f,
                                ),
                              }))
                            }
                            className="mt-0.5 block w-full resize-none overflow-hidden rounded-md border-transparent bg-transparent px-1 text-[13px] leading-[1.5] text-[var(--muted)] outline-none transition-colors focus:bg-[var(--orange-soft)]"
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                ))}

              {step === 4 && (
                <div className="ob-stack grid gap-y-5">
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div>
                      <label className={labelClass} htmlFor="ob-agent-name">
                        Agent name
                      </label>
                      <input
                        id="ob-agent-name"
                        type="text"
                        className={inputClass}
                        value={agent.name}
                        onChange={(e) =>
                          setAgent((a) => ({ ...a, name: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <span className={labelClass} id="ob-tone-label">
                        Tone
                      </span>
                      <div
                        role="radiogroup"
                        aria-labelledby="ob-tone-label"
                        className="grid h-11 grid-cols-3 gap-1 rounded-xl border border-[var(--line)] p-1 sm:grid-cols-3"
                      >
                        {TONE_OPTIONS.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={agent.tone === t.id}
                            title={t.desc}
                            onClick={() =>
                              setAgent((a) => ({ ...a, tone: t.id }))
                            }
                            className={`rounded-lg text-[13px] font-medium transition-colors ${
                              agent.tone === t.id
                                ? "bg-[var(--ink)] text-[var(--bg)]"
                                : "text-[var(--muted)] hover:text-[var(--ink)]"
                            }`}
                          >
                            {t.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="ob-greet m-0 rounded-xl bg-[var(--warm)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--ink)]">
                    <span className="mb-1 block font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.9px] text-[var(--muted)]">
                      Greeting · {selectedTone.desc}
                    </span>
                    “{agent.greeting}”
                  </p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-[1fr_1fr_1.4fr]">
                    <div>
                      <label className={labelClass} htmlFor="ob-from">
                        Staff available from
                      </label>
                      <input
                        id="ob-from"
                        type="time"
                        className={inputClass}
                        value={hours.start}
                        onChange={(e) =>
                          setHours((h) => ({ ...h, start: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ob-until">
                        Until
                      </label>
                      <input
                        id="ob-until"
                        type="time"
                        className={inputClass}
                        value={hours.end}
                        onChange={(e) =>
                          setHours((h) => ({ ...h, end: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelClass} htmlFor="ob-transfer">
                        Transfer calls to{" "}
                        <span className="font-normal text-[var(--muted)]">
                          (optional)
                        </span>
                      </label>
                      <input
                        id="ob-transfer"
                        type="tel"
                        placeholder="Phone number"
                        autoComplete="tel"
                        className={inputClass}
                        value={agent.escalationPhone}
                        onChange={(e) =>
                          setAgent((a) => ({
                            ...a,
                            escalationPhone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <span className={labelClass}>Collect from callers</span>
                    <div className="flex flex-wrap gap-2">
                      {CAPTURE_FIELDS.map((f) => {
                        const on = agent.dataCaptureFields.includes(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleField(f)}
                            className={`h-8 rounded-full border px-3.5 text-[13px] font-medium capitalize transition-colors ${
                              on
                                ? "border-[var(--orange)] bg-[var(--orange-soft)] text-[var(--orange-deep)]"
                                : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                            }`}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <dl className="m-0 grid gap-x-8 sm:grid-cols-2">
                  {[
                    ["Business", profile.name || "Not set"],
                    ["Industry", profile.industry || "Not set"],
                    ["City", profile.location || "Not set"],
                    ["Website", profile.website || "Not set"],
                    ["Agent", `${agent.name} · ${agent.tone}`],
                    ["Staff hours", `${hours.start} – ${hours.end}`],
                    ["Starter answers", String(agent.faqs.length)],
                    [
                      "Collects",
                      agent.dataCaptureFields.length
                        ? agent.dataCaptureFields.join(", ")
                        : "Nothing",
                    ],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-3"
                    >
                      <dt className="shrink-0 text-[13px] text-[var(--muted)]">
                        {k}
                      </dt>
                      <dd className="m-0 min-w-0 truncate text-right text-[14px] font-medium">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="m-0 mt-5 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-[#b63d28]"
              >
                {error}
              </p>
            )}

            <div className="ob-foot mt-[clamp(22px,3.5vh,32px)] flex items-center justify-between gap-3 border-t border-[var(--line)] pt-[clamp(18px,3vh,24px)]">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep((s) => s - 1);
                  }}
                  disabled={loading}
                  className={`${BTN} bg-[var(--warm)] text-[var(--ink)]`}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={loading || !stepIsValid}
                title={stepIsValid ? undefined : Object.values(stepErrors)[0]}
                className={`${BTN} min-w-[160px] max-[479px]:flex-1 ${
                  step === TOTAL_STEPS
                    ? "bg-[var(--orange)] text-[#160802] hover:brightness-95"
                    : "bg-[var(--ink)] text-[var(--bg)] hover:opacity-90"
                }`}
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {step === 2
                      ? "Reading your site…"
                      : step === TOTAL_STEPS
                        ? "Launching…"
                        : "Working…"}
                  </>
                ) : (
                  <>
                    {step === TOTAL_STEPS ? "Launch workspace" : "Continue"}
                    <ArrowRight />
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
