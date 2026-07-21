import React, { useEffect, useMemo, useRef, useState } from "react";
import { BusinessProfile, FAQ, AgentConfig } from "../types";

interface OnboardingProps {
  onGenerateFaqs: (website: string) => Promise<FAQ[]>;
  onComplete: (profile: BusinessProfile, agent: AgentConfig) => Promise<void>;
}

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

const STEP_META = [
  {
    title: "Workspace",
    description:
      "Set the basic details your agents will use to introduce the organization.",
    icon: "fa-building",
  },
  {
    title: "Knowledge",
    description:
      "Connect a website so Agently can prepare the first Knowledge Base draft.",
    icon: "fa-sparkles",
  },
  {
    title: "Review",
    description:
      "Preview the starter answers before your agent begins using them.",
    icon: "fa-list-check",
  },
  {
    title: "Persona",
    description:
      "Choose the voice, tone, escalation hours, and captured caller details.",
    icon: "fa-user-headset",
  },
  {
    title: "Launch",
    description: "Confirm the setup and enter the workspace.",
    icon: "fa-rocket-launch",
  },
];

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
  const haystack = `${city.display_name || ""} ${address.city || ""} ${address.town || ""} ${address.state || ""} ${address.country || ""}`;
  const match = LOCATION_TIMEZONE_FALLBACKS.find(([pattern]) =>
    pattern.test(haystack),
  );
  return match?.[1] || "America/New_York";
};

const inferTimezoneFromLocationText = (location: string) => {
  const match = LOCATION_TIMEZONE_FALLBACKS.find(([pattern]) =>
    pattern.test(location),
  );
  return match?.[1];
};

const CLIP_ARTS = [
  {
    label: "Workspace",
    tone: "#FF5527",
    caption: "Create the place your agents will work from.",
  },
  {
    label: "Website scan",
    tone: "#2563EB",
    caption: "Scan pages, policies, services, and useful details.",
  },
  {
    label: "Review answers",
    tone: "#16A34A",
    caption: "Approve the first answers before agents use them.",
  },
  {
    label: "Agent persona",
    tone: "#8B5CF6",
    caption: "Tune voice, tone, hours, and caller details.",
  },
  {
    label: "Launch",
    tone: "#F59E0B",
    caption: "Send your first agent into the control room.",
  },
];

const OnboardingClipArt: React.FC<{ step: number; compact?: boolean }> = ({
  step,
  compact = false,
}) => {
  const art = CLIP_ARTS[Math.max(0, Math.min(CLIP_ARTS.length - 1, step - 1))];
  const sizeClass = compact ? "h-20 w-28" : "h-44 w-full max-w-[300px]";

  const shell = (children: React.ReactNode) => (
    <div className={`relative mx-auto ${sizeClass}`} aria-hidden="true">
      <div
        className="absolute -left-3 top-4 h-12 w-12 rounded-[1.25rem] blur-xl"
        style={{ backgroundColor: `${art.tone}26` }}
      />
      <div className="absolute -right-2 bottom-2 h-12 w-12 rounded-full bg-[#ffd166]/25 blur-xl" />
      <svg
        viewBox="0 0 320 230"
        className="relative z-10 h-full w-full drop-shadow-sm"
      >
        {children}
        {!compact && (
          <g>
            <rect
              x="70"
              y="197"
              width="180"
              height="25"
              rx="12.5"
              fill="#232F3E"
              fillOpacity="0.08"
            />
            <text
              x="160"
              y="213"
              textAnchor="middle"
              fill="#232F3E"
              fillOpacity="0.62"
              fontSize="10.5"
              fontWeight="500"
            >
              {art.caption}
            </text>
          </g>
        )}
      </svg>
    </div>
  );

  if (step === 1) {
    return shell(
      <>
        <rect
          x="54"
          y="48"
          width="212"
          height="132"
          rx="30"
          fill="#FBFAF4"
          stroke="#232F3E"
          strokeOpacity="0.12"
        />
        <rect
          x="82"
          y="75"
          width="156"
          height="74"
          rx="24"
          fill="#fff"
          stroke="#232F3E"
          strokeOpacity="0.1"
        />
        <circle cx="118" cy="111" r="20" fill={art.tone} fillOpacity="0.15" />
        <path
          d="M107 113c7 8 17 8 24 0"
          stroke={art.tone}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="111" cy="105" r="2.4" fill="#232F3E" />
        <circle cx="125" cy="105" r="2.4" fill="#232F3E" />
        <rect
          x="153"
          y="93"
          width="60"
          height="8"
          rx="4"
          fill="#232F3E"
          fillOpacity="0.16"
        />
        <rect
          x="153"
          y="112"
          width="74"
          height="8"
          rx="4"
          fill="#232F3E"
          fillOpacity="0.1"
        />
        <rect
          x="153"
          y="131"
          width="45"
          height="8"
          rx="4"
          fill={art.tone}
          fillOpacity="0.3"
        />
        <rect
          x="65"
          y="158"
          width="56"
          height="22"
          rx="11"
          fill={art.tone}
          fillOpacity="0.14"
        />
        <rect
          x="132"
          y="158"
          width="56"
          height="22"
          rx="11"
          fill="#232F3E"
          fillOpacity="0.07"
        />
        <rect
          x="199"
          y="158"
          width="56"
          height="22"
          rx="11"
          fill="#232F3E"
          fillOpacity="0.07"
        />
        <text
          x="93"
          y="172"
          textAnchor="middle"
          fill="#232F3E"
          fontSize="9.5"
          fontWeight="500"
        >
          Org
        </text>
        <text
          x="160"
          y="172"
          textAnchor="middle"
          fill="#232F3E"
          fontSize="9.5"
          fontWeight="500"
        >
          Team
        </text>
        <text
          x="227"
          y="172"
          textAnchor="middle"
          fill="#232F3E"
          fontSize="9.5"
          fontWeight="500"
        >
          Line
        </text>
        <circle cx="250" cy="62" r="17" fill={art.tone} />
        <path
          d="M242 62h16M250 54v16"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <rect x="42" y="29" width="98" height="29" rx="14.5" fill="#232F3E" />
        <text x="60" y="47" fill="#fff" fontSize="10.5" fontWeight="500">
          Workspace
        </text>
      </>,
    );
  }

  if (step === 2) {
    return shell(
      <>
        <rect
          x="48"
          y="50"
          width="224"
          height="138"
          rx="28"
          fill="#FBFAF4"
          stroke="#232F3E"
          strokeOpacity="0.12"
        />
        <rect
          x="70"
          y="73"
          width="180"
          height="95"
          rx="18"
          fill="#fff"
          stroke="#232F3E"
          strokeOpacity="0.1"
        />
        <rect
          x="70"
          y="73"
          width="180"
          height="24"
          rx="18"
          fill={art.tone}
          fillOpacity="0.12"
        />
        <circle cx="89" cy="85" r="3" fill={art.tone} />
        <circle cx="101" cy="85" r="3" fill="#232F3E" fillOpacity="0.24" />
        <circle cx="113" cy="85" r="3" fill="#232F3E" fillOpacity="0.16" />
        <rect
          x="91"
          y="114"
          width="76"
          height="7"
          rx="3.5"
          fill="#232F3E"
          fillOpacity="0.18"
        />
        <rect
          x="91"
          y="132"
          width="104"
          height="7"
          rx="3.5"
          fill="#232F3E"
          fillOpacity="0.1"
        />
        <rect
          x="91"
          y="150"
          width="62"
          height="7"
          rx="3.5"
          fill={art.tone}
          fillOpacity="0.28"
        />
        <circle cx="211" cy="136" r="27" fill={art.tone} fillOpacity="0.14" />
        <circle
          cx="211"
          cy="136"
          r="15"
          stroke={art.tone}
          strokeWidth="5"
          fill="none"
        />
        <path
          d="M223 148l20 20"
          stroke={art.tone}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M44 44c22-22 59-26 84-9"
          stroke={art.tone}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="2 11"
          fill="none"
        />
        <rect x="46" y="27" width="94" height="29" rx="14.5" fill="#232F3E" />
        <text x="63" y="45" fill="#fff" fontSize="10.5" fontWeight="500">
          Scan site
        </text>
      </>,
    );
  }

  if (step === 3) {
    return shell(
      <>
        <rect
          x="72"
          y="42"
          width="176"
          height="146"
          rx="30"
          fill="#FBFAF4"
          stroke="#232F3E"
          strokeOpacity="0.12"
        />
        <rect
          x="95"
          y="68"
          width="130"
          height="22"
          rx="11"
          fill={art.tone}
          fillOpacity="0.14"
        />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x="94"
              y={105 + i * 27}
              width="132"
              height="18"
              rx="9"
              fill="#fff"
              stroke="#232F3E"
              strokeOpacity="0.08"
            />
            <circle
              cx="108"
              cy={114 + i * 27}
              r="6"
              fill={art.tone}
              fillOpacity="0.18"
            />
            <path
              d={`M105 ${114 + i * 27}l3 3 6-7`}
              stroke={art.tone}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <rect
              x="123"
              y={110 + i * 27}
              width={68 + i * 10}
              height="7"
              rx="3.5"
              fill="#232F3E"
              fillOpacity="0.14"
            />
          </g>
        ))}
        <circle cx="235" cy="62" r="18" fill={art.tone} />
        <path
          d="M225 62l7 7 15-17"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <rect x="54" y="25" width="108" height="29" rx="14.5" fill="#232F3E" />
        <text x="73" y="43" fill="#fff" fontSize="10.5" fontWeight="500">
          Review FAQ
        </text>
      </>,
    );
  }

  if (step === 4) {
    return shell(
      <>
        <rect
          x="54"
          y="52"
          width="212"
          height="128"
          rx="32"
          fill="#FBFAF4"
          stroke="#232F3E"
          strokeOpacity="0.12"
        />
        <circle cx="117" cy="112" r="34" fill={art.tone} fillOpacity="0.14" />
        <circle
          cx="117"
          cy="101"
          r="12"
          fill="#fff"
          stroke={art.tone}
          strokeWidth="4"
        />
        <path
          d="M92 139c12-23 38-23 50 0"
          stroke={art.tone}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M78 105c5-29 23-45 46-45 25 0 44 18 48 47"
          stroke={art.tone}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <rect
          x="164"
          y="83"
          width="68"
          height="13"
          rx="6.5"
          fill="#232F3E"
          fillOpacity="0.12"
        />
        <circle cx="206" cy="89.5" r="8" fill={art.tone} />
        <rect
          x="164"
          y="116"
          width="68"
          height="13"
          rx="6.5"
          fill="#232F3E"
          fillOpacity="0.12"
        />
        <circle cx="184" cy="122.5" r="8" fill={art.tone} />
        <rect
          x="164"
          y="149"
          width="68"
          height="13"
          rx="6.5"
          fill="#232F3E"
          fillOpacity="0.12"
        />
        <circle cx="218" cy="155.5" r="8" fill={art.tone} />
        <rect x="52" y="28" width="112" height="29" rx="14.5" fill="#232F3E" />
        <text x="70" y="46" fill="#fff" fontSize="10.5" fontWeight="500">
          Tune agent
        </text>
      </>,
    );
  }

  return shell(
    <>
      <rect
        x="54"
        y="122"
        width="212"
        height="45"
        rx="22.5"
        fill="#FBFAF4"
        stroke="#232F3E"
        strokeOpacity="0.12"
      />
      <path
        d="M160 55c32 25 45 60 32 104-34-7-55-28-64-63 6-17 16-31 32-41z"
        fill={art.tone}
        fillOpacity="0.18"
        stroke={art.tone}
        strokeWidth="4"
      />
      <circle
        cx="163"
        cy="95"
        r="12"
        fill="#fff"
        stroke={art.tone}
        strokeWidth="4"
      />
      <path
        d="M134 139l-25 23 35-6M186 139l25 23-35-6"
        stroke={art.tone}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M151 167c-2 17-11 28-28 33 5-15 12-25 23-31M171 167c2 17 11 28 28 33-5-15-12-25-23-31"
        fill="#FFD166"
        fillOpacity="0.75"
      />
      <path
        d="M159 161c-1 20-8 34-20 45M164 161c1 20 8 34 20 45"
        stroke="#FF5527"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="66" y="36" width="82" height="29" rx="14.5" fill="#232F3E" />
      <text x="84" y="54" fill="#fff" fontSize="10.5" fontWeight="500">
        Launch
      </text>
      <circle cx="232" cy="70" r="17" fill={art.tone} />
      <path
        d="M232 60l5 11-5 11-5-11 5-11z"
        stroke="#fff"
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />
    </>,
  );
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
  const [industryOpen, setIndustryOpen] = useState(false);
  const industryRef = useRef<HTMLDivElement>(null);
  const [citySearch, setCitySearch] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<NominatimResult[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const cityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (citySearch.length < 3) {
      setCitySuggestions([]);
      setCityOpen(false);
      return;
    }
    if (cityDebounce.current) clearTimeout(cityDebounce.current);
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

  const filteredIndustries = useMemo(
    () =>
      INDUSTRIES.filter((i) =>
        i.toLowerCase().includes(industrySearch.toLowerCase()),
      ),
    [industrySearch],
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

  const growTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const inputClass =
    "w-full rounded-[1.1rem] border border-[#0F172A]/10 bg-white/85 px-4 py-3 text-[14px] font-normal text-[#0F172A] outline-none transition-all placeholder:text-[#0F172A]/35 focus:border-[#F59E0B]/60 focus:bg-white focus:ring-4 focus:ring-[#F59E0B]/10";
  const labelClass =
    "mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-[#0F172A]/55";

  return (
    <div className="ag-onboarding-no-callout min-h-screen overflow-x-hidden bg-[#F1F5F9] px-3 py-3 text-[#0F172A] sm:px-4 lg:px-5">
      <div className="mx-auto grid min-h-[calc(100svh-1.5rem)] w-full max-w-6xl items-center gap-4 lg:grid-cols-[0.48fr_1.52fr]">
        <aside className="relative hidden overflow-hidden rounded-[2rem] border border-[#0F172A]/10 bg-[#0F172A] p-5 text-white shadow-2xl lg:flex lg:h-[calc(100svh-1.5rem)] lg:max-h-[720px] lg:min-h-[560px] lg:flex-col">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F59E0B]/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 flex items-center justify-between gap-4">
            <img
              src="/agently-reception-wordmark-light.png"
              alt="Agently Reception Ops"
              className="h-7 w-auto object-contain"
            />
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/75">
              5 steps
            </span>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-6 text-center">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-white/55">
              Welcome to Agently
            </p>
            <h1 className="max-w-[285px] text-[clamp(1.55rem,2.15vw,2.05rem)] font-medium leading-[1.04] tracking-[-0.048em] text-white">
              Build your first agent without the clutter.
            </h1>
            <p className="mt-3 max-w-[285px] text-[12.5px] font-normal leading-[1.55] text-white/70">
              Add the essentials, review knowledge, choose the tone, then enter
              your control room.
            </p>
            <div className="mt-7 w-full">
              <OnboardingClipArt step={step} />
            </div>
          </div>

          <div className="relative z-10 rounded-[1.35rem] border border-white/10 bg-white/[0.07] px-4 py-3 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
              Current step
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {step} of {TOTAL_STEPS} · {currentStep.title}
            </p>
            <p className="mt-1 text-[12px] leading-4 text-white/55">
              {currentStep.description}
            </p>
          </div>
        </aside>

        <main className="overflow-hidden rounded-[1.65rem] border border-[#0F172A]/10 bg-[#F8FAFC]/95 shadow-2xl shadow-[#0F172A]/10 backdrop-blur md:rounded-[2.25rem] lg:h-[calc(100svh-1.5rem)] lg:max-h-[720px] lg:min-h-[560px]">
          <div className="border-b border-[#0F172A]/10 bg-white/55 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center lg:hidden">
                <img
                  src="/agently-reception-wordmark-dark.png"
                  alt="Agently Reception Ops"
                  className="h-6 w-auto object-contain"
                />
              </div>
              <div className="hidden lg:block">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/45">
                  Step {step} of {TOTAL_STEPS}
                </p>
                <h2 className="mt-0.5 text-[1.35rem] font-medium leading-none tracking-[-0.045em] text-[#0F172A]">
                  {currentStep.title}
                </h2>
              </div>
              <div className="flex min-w-[170px] flex-1 items-center gap-1.5 lg:max-w-[260px]">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step > i ? "bg-[#F59E0B]" : "bg-[#0F172A]/10"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-5 lg:flex lg:h-[calc(100%-126px)] lg:flex-col lg:justify-center lg:overflow-hidden lg:px-8 lg:py-7">
            <div className="mb-5 lg:hidden">
              <div className="flex items-start justify-between gap-4 rounded-[1.35rem] border border-[#0F172A]/10 bg-white/65 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#0F172A]/45">
                    Step {step} of {TOTAL_STEPS}
                  </p>
                  <h1 className="mt-1 text-[1.55rem] font-medium leading-[1] tracking-[-0.05em] text-[#0F172A]">
                    {currentStep.title}
                  </h1>
                  <p className="mt-1.5 text-[13px] leading-[1.4] text-[#0F172A]/65">
                    {currentStep.description}
                  </p>
                </div>
                <OnboardingClipArt step={step} compact />
              </div>
            </div>

            {step === 1 && (
              <section className="mx-auto w-full max-w-[860px] space-y-6">
                <div className="hidden lg:block">
                  <h1 className="text-[2.15rem] font-medium leading-[0.98] tracking-[-0.058em] text-[#0F172A]">
                    Tell us what your agents represent.
                  </h1>
                  <p className="mt-2 max-w-[520px] text-[14px] leading-[1.42] text-[#0F172A]/70">
                    These details help Agently personalize greetings, routing,
                    lead capture, and handoff context.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Organization name</label>
                    <input
                      type="text"
                      placeholder="Your company name"
                      className={inputClass}
                      value={profile.name}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, name: e.target.value }))
                      }
                    />
                  </div>
                  <div ref={industryRef}>
                    <label className={labelClass}>Industry</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={profile.industry || "Search industry"}
                        className={`${inputClass} cursor-pointer pr-10`}
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
                      <i className="fa-sharp fa-solid fa-chevron-down pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#0F172A]/35" />
                      {industryOpen && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-y-auto rounded-[1.35rem] border border-[#0F172A]/10 bg-white p-1 shadow-xl">
                          {filteredIndustries.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-[#0F172A]/45">
                              No match
                            </p>
                          ) : (
                            filteredIndustries.map((ind) => (
                              <button
                                key={ind}
                                type="button"
                                className={`w-full rounded-2xl px-4 py-2.5 text-left text-sm transition-colors ${profile.industry === ind ? "bg-[#F59E0B]/10 font-medium text-[#F59E0B]" : "text-[#0F172A]/75 hover:bg-[#F1F5F9]"}`}
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
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="relative">
                    <label className={labelClass}>City / Location</label>
                    <input
                      type="text"
                      placeholder="City, country"
                      className={inputClass}
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
                    {cityOpen &&
                      (citySuggestions.length > 0 || cityLoading) && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-52 overflow-y-auto rounded-[1.35rem] border border-[#0F172A]/10 bg-white p-1 shadow-xl">
                          {cityLoading ? (
                            <div className="px-4 py-3 text-sm text-[#0F172A]/45">
                              Searching...
                            </div>
                          ) : (
                            citySuggestions.map((city) => (
                              <button
                                key={city.place_id}
                                type="button"
                                className="w-full rounded-2xl px-4 py-2.5 text-left text-sm text-[#0F172A]/75 transition-colors hover:bg-[#F1F5F9]"
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
                    <label className={labelClass}>
                      Website for Knowledge Base
                    </label>
                    <input
                      type="url"
                      placeholder="https://yourwebsite.com"
                      className={inputClass}
                      value={profile.website}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, website: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 rounded-[1.6rem] border border-[#0F172A]/10 bg-white/70 p-4 sm:grid-cols-3">
                  {[
                    ["Greeting", "Personalized caller welcome"],
                    ["Routing", "Cleaner handoff context"],
                    ["Knowledge", "Website-backed answers"],
                  ].map(([title, copy]) => (
                    <div key={title}>
                      <p className="text-sm font-medium text-[#0F172A]">
                        {title}
                      </p>
                      <p className="mt-1 text-[12px] leading-4 text-[#0F172A]/55">
                        {copy}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="mx-auto grid w-full max-w-[860px] gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
                <div>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[1.5rem] bg-[#F59E0B]/10 text-[#F59E0B]">
                    <i className="fa-sharp fa-solid fa-brain text-xl" />
                  </div>
                  <h1 className="text-[2rem] font-medium leading-[0.98] tracking-[-0.058em] text-[#0F172A]">
                    Prepare your agent knowledge.
                  </h1>
                  <p className="mt-2 text-[14px] leading-[1.42] text-[#0F172A]/70">
                    Agently can scan your website and generate starter FAQs. You
                    can edit everything before launch.
                  </p>
                </div>
                <div className="rounded-[1.65rem] border border-[#0F172A]/10 bg-white p-4 shadow-xl shadow-[#0F172A]/5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#0F172A]/45">
                    Website to scan
                  </p>
                  <p className="mt-3 break-all rounded-[1.35rem] bg-[#F1F5F9] px-4 py-4 font-mono text-sm text-[#0F172A]/75">
                    {profile.website ||
                      "No website added. You can continue and add knowledge later."}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Pages", "Discover"],
                      ["FAQs", "Draft"],
                      ["Answers", "Review"],
                    ].map(([top, bottom]) => (
                      <div
                        key={top}
                        className="rounded-[1.25rem] bg-[#F8FAFC] p-3 text-center"
                      >
                        <p className="text-sm font-medium text-[#0F172A]">
                          {top}
                        </p>
                        <p className="text-[12px] text-[#0F172A]/50">
                          {bottom}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[13px] leading-5 text-[#0F172A]/55">
                    Continue to generate the starter Knowledge Base. This may
                    take a few seconds.
                  </p>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="mx-auto w-full max-w-[860px] space-y-5">
                <div>
                  <h1 className="text-[1.95rem] font-medium leading-[0.98] tracking-[-0.058em] text-[#0F172A]">
                    Review starter answers.
                  </h1>
                  <p className="mt-2 text-[14px] leading-[1.42] text-[#0F172A]/70">
                    These FAQs become the first draft your agent can use. You
                    can keep improving them later.
                  </p>
                </div>
                <div className="ag-onboarding-faq-list space-y-3 overflow-y-auto pr-1">
                  {agent.faqs.length === 0 ? (
                    <div className="rounded-[2rem] border border-dashed border-[#0F172A]/15 bg-white/65 px-5 py-8 text-center text-sm text-[#0F172A]/55">
                      No FAQs were generated yet. You can add Knowledge Base
                      content later inside the workspace.
                    </div>
                  ) : (
                    agent.faqs.map((faq, i) => (
                      <div
                        key={faq.id}
                        className="ag-onboarding-faq-card rounded-[1.6rem] border border-[#0F172A]/10 bg-white p-4 shadow-sm"
                      >
                        <div className="mb-3 flex items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[#F59E0B]/12 text-sm font-semibold text-[#D97706]">
                            {i + 1}
                          </span>
                          <label className="min-w-0 flex-1">
                            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-[#0F172A]/42">
                              Question
                            </span>
                            <textarea
                              rows={1}
                              value={faq.question}
                              onInput={(e) => growTextarea(e.currentTarget)}
                              onFocus={(e) => growTextarea(e.currentTarget)}
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
                              className="ag-onboarding-faq-question w-full resize-none overflow-hidden bg-transparent text-[15px] font-semibold leading-[1.35] text-[#0F172A] outline-none placeholder:text-[#0F172A]/35"
                            />
                          </label>
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.16em] text-[#0F172A]/42">
                            Answer
                          </span>
                          <textarea
                            rows={4}
                            value={faq.answer}
                            onInput={(e) => growTextarea(e.currentTarget)}
                            onFocus={(e) => growTextarea(e.currentTarget)}
                            onChange={(e) =>
                              setAgent((a) => ({
                                ...a,
                                faqs: a.faqs.map((f, j) =>
                                  j === i
                                    ? { ...f, answer: e.target.value }
                                    : f,
                                ),
                              }))
                            }
                            className="ag-onboarding-faq-answer w-full resize-none overflow-hidden rounded-[1.15rem] border border-[#0F172A]/8 bg-[#F8FAFC] px-4 py-3 text-[14px] leading-[1.55] text-[#0F172A]/78 outline-none transition-all placeholder:text-[#0F172A]/35 focus:border-[#F59E0B]/45 focus:bg-white focus:ring-4 focus:ring-[#F59E0B]/10"
                          />
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="mx-auto w-full max-w-[860px] space-y-5">
                <div>
                  <h1 className="text-[1.95rem] font-medium leading-[0.98] tracking-[-0.058em] text-[#0F172A]">
                    Shape your agent persona.
                  </h1>
                  <p className="mt-2 text-[14px] leading-[1.42] text-[#0F172A]/70">
                    Set the name, tone, escalation window, and caller details
                    the agent should capture.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[0.86fr_1.14fr]">
                  <div>
                    <label className={labelClass}>Agent name</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={agent.name}
                      onChange={(e) =>
                        setAgent((a) => ({ ...a, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="rounded-[1.35rem] bg-[#0F172A] p-3.5 text-white">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
                      Live greeting
                    </p>
                    <p className="text-sm leading-5 text-white/78">
                      {agent.greeting}
                    </p>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Communication tone</label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TONE_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAgent((a) => ({ ...a, tone: t.id }))}
                        className={`rounded-[1.25rem] border p-3 text-left transition-all ${agent.tone === t.id ? "border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#0F172A]" : "border-[#0F172A]/10 bg-white text-[#0F172A]/70 hover:border-[#0F172A]/18"}`}
                      >
                        <span
                          className={`mb-2 flex h-8 w-8 items-center justify-center rounded-2xl ${agent.tone === t.id ? "bg-[#F59E0B] text-white" : "bg-[#F1F5F9] text-[#0F172A]/65"}`}
                        >
                          <i className={`fa-sharp fa-solid ${t.icon}`} />
                        </span>
                        <span className="block text-[12px] font-medium">
                          {t.id}
                        </span>
                        <span className="mt-1 block text-[12px] leading-4 text-[#0F172A]/55">
                          {t.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelClass}>Manager opens</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={hours.start}
                      onChange={(e) =>
                        setHours((h) => ({ ...h, start: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Manager closes</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={hours.end}
                      onChange={(e) =>
                        setHours((h) => ({ ...h, end: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Escalation number</label>
                    <input
                      type="tel"
                      placeholder="Optional"
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
                  <label className={labelClass}>Capture from callers</label>
                  <div className="flex flex-wrap gap-2">
                    {CAPTURE_FIELDS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => toggleField(f)}
                        className={`ag-capture-field-chip rounded-full border px-3 py-1.5 text-[11px] font-semibold capitalize transition-all ${agent.dataCaptureFields.includes(f) ? "ag-capture-field-chip--active border-[#F59E0B]/70 bg-[#F59E0B]/25 text-[#9A5B00]" : "ag-capture-field-chip--inactive border-[#0F172A]/10 bg-white text-[#0F172A]/55 hover:border-[#0F172A]/20"}`}
                      >
                        {agent.dataCaptureFields.includes(f) && "✓ "}
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="mx-auto grid w-full max-w-[860px] gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
                <div>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[1.65rem] bg-emerald-500 text-white shadow-xl shadow-emerald-500/20">
                    <i className="fa-sharp fa-solid fa-check text-2xl" />
                  </div>
                  <h1 className="text-[2rem] font-medium leading-[0.98] tracking-[-0.058em] text-[#0F172A]">
                    Ready to launch your workspace.
                  </h1>
                  <p className="mt-2 text-[14px] leading-[1.42] text-[#0F172A]/70">
                    Everything is prepared. You can adjust agents, knowledge,
                    phone numbers, and campaigns after entering the dashboard.
                  </p>
                </div>
                <div className="rounded-[1.65rem] border border-[#0F172A]/10 bg-white p-4 shadow-xl shadow-[#0F172A]/5">
                  {[
                    ["Organization", profile.name || "Not set"],
                    ["Industry", profile.industry || "Not set"],
                    ["Agent", agent.name],
                    ["Tone", agent.tone],
                    ["Escalation hours", `${hours.start} - ${hours.end}`],
                    ["Starter FAQs", `${agent.faqs.length} entries`],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-4 border-b border-[#0F172A]/8 py-3 first:pt-0 last:border-0 last:pb-0"
                    >
                      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#0F172A]/45">
                        {k}
                      </span>
                      <span className="max-w-[55%] truncate text-right text-sm font-medium text-[#0F172A]">
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {error && (
              <div className="mt-5 flex items-center gap-2 rounded-[1.35rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                <i className="fa-sharp fa-solid fa-circle-exclamation" />{" "}
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-[#0F172A]/10 bg-white/55 px-4 py-3 sm:px-6">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
                className="flex-1 rounded-[1.1rem] border border-[#0F172A]/10 bg-white px-4 py-2.5 text-sm font-medium text-[#0F172A]/65 transition-all hover:border-[#0F172A]/20 hover:text-[#0F172A] disabled:opacity-60"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-[2] rounded-[1.1rem] bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#F59E0B] disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <i className="fa-sharp fa-solid fa-spinner fa-spin" />{" "}
                  Processing...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {step === TOTAL_STEPS ? "Launch workspace" : "Continue"}
                  <i className="fa-sharp fa-solid fa-arrow-right" />
                </span>
              )}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Onboarding;
