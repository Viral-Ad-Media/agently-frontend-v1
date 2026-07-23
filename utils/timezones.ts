/**
 * agently/utils/timezones.ts — FULL REPLACEMENT
 *
 * ISSUE 7: "why will I pick Abuja, Nigeria and my timezone is central time us"
 *
 * TWO ROOT CAUSES, both in this file.
 *
 * 1. Africa/Lagos was on a BLACKLIST.
 *      const legacyAutoDefaults = new Set(["", "Africa/Lagos", "America/Chicago", ...]);
 *      if (!savedTimezone || savedTimezone === "Africa/Lagos") { ...discard... }
 *    Someone had hardcoded Africa/Lagos as a junk value to scrub — presumably
 *    it once leaked in as a bad default. The effect: a Nigerian business
 *    CANNOT save a Nigerian timezone. The moment it is written it is thrown
 *    away and replaced with America/New_York. That is why Abuja gave you a US
 *    zone, and no amount of re-picking would have helped.
 *
 * 2. LOCATION_TIMEZONE_RULES covered seven US regions and London. Nothing else
 *    on earth matched, so everywhere else fell through to the US default.
 *
 * To answer your question directly — no, the API is not missing timezones. It
 * has all ~600. We were never asking it. This resolves by ISO country code,
 * which Nominatim already returns and the old code ignored.
 */

export const DEFAULT_WORKSPACE_TIMEZONE = "UTC";

export const COUNTRY_TIMEZONES: Record<string, string> = {
  ng: "Africa/Lagos", gh: "Africa/Accra", ke: "Africa/Nairobi",
  za: "Africa/Johannesburg", eg: "Africa/Cairo", ma: "Africa/Casablanca",
  tz: "Africa/Dar_es_Salaam", ug: "Africa/Kampala", et: "Africa/Addis_Ababa",
  ci: "Africa/Abidjan", sn: "Africa/Dakar", cm: "Africa/Douala",
  dz: "Africa/Algiers", tn: "Africa/Tunis", ly: "Africa/Tripoli",
  zw: "Africa/Harare", zm: "Africa/Lusaka", rw: "Africa/Kigali",
  bw: "Africa/Gaborone", mz: "Africa/Maputo", ao: "Africa/Luanda",
  na: "Africa/Windhoek", mw: "Africa/Blantyre", bj: "Africa/Porto-Novo",
  bf: "Africa/Ouagadougou", ml: "Africa/Bamako", ne: "Africa/Niamey",
  td: "Africa/Ndjamena", so: "Africa/Mogadishu", sd: "Africa/Khartoum",
  ss: "Africa/Juba", cd: "Africa/Kinshasa", cg: "Africa/Brazzaville",
  ga: "Africa/Libreville", gn: "Africa/Conakry", sl: "Africa/Freetown",
  lr: "Africa/Monrovia", tg: "Africa/Lome", gm: "Africa/Banjul",
  mu: "Indian/Mauritius", mg: "Indian/Antananarivo",

  gb: "Europe/London", ie: "Europe/Dublin", fr: "Europe/Paris",
  de: "Europe/Berlin", es: "Europe/Madrid", it: "Europe/Rome",
  pt: "Europe/Lisbon", nl: "Europe/Amsterdam", be: "Europe/Brussels",
  ch: "Europe/Zurich", at: "Europe/Vienna", se: "Europe/Stockholm",
  no: "Europe/Oslo", dk: "Europe/Copenhagen", fi: "Europe/Helsinki",
  pl: "Europe/Warsaw", cz: "Europe/Prague", sk: "Europe/Bratislava",
  gr: "Europe/Athens", ro: "Europe/Bucharest", hu: "Europe/Budapest",
  bg: "Europe/Sofia", hr: "Europe/Zagreb", rs: "Europe/Belgrade",
  ua: "Europe/Kyiv", by: "Europe/Minsk", lt: "Europe/Vilnius",
  lv: "Europe/Riga", ee: "Europe/Tallinn", is: "Atlantic/Reykjavik",
  lu: "Europe/Luxembourg", mt: "Europe/Malta", cy: "Asia/Nicosia",
  tr: "Europe/Istanbul",

  ae: "Asia/Dubai", sa: "Asia/Riyadh", qa: "Asia/Qatar",
  kw: "Asia/Kuwait", bh: "Asia/Bahrain", om: "Asia/Muscat",
  jo: "Asia/Amman", lb: "Asia/Beirut", il: "Asia/Jerusalem",
  iq: "Asia/Baghdad", ir: "Asia/Tehran", ye: "Asia/Aden",

  in: "Asia/Kolkata", pk: "Asia/Karachi", bd: "Asia/Dhaka",
  lk: "Asia/Colombo", np: "Asia/Kathmandu", af: "Asia/Kabul",
  cn: "Asia/Shanghai", hk: "Asia/Hong_Kong", tw: "Asia/Taipei",
  mo: "Asia/Macau", jp: "Asia/Tokyo", kr: "Asia/Seoul",
  sg: "Asia/Singapore", my: "Asia/Kuala_Lumpur", th: "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh", id: "Asia/Jakarta", ph: "Asia/Manila",
  kh: "Asia/Phnom_Penh", la: "Asia/Vientiane", mm: "Asia/Yangon",
  kz: "Asia/Almaty", uz: "Asia/Tashkent", az: "Asia/Baku",
  ge: "Asia/Tbilisi", am: "Asia/Yerevan",

  au: "Australia/Sydney", nz: "Pacific/Auckland", fj: "Pacific/Fiji",
  pg: "Pacific/Port_Moresby",

  us: "America/New_York", ca: "America/Toronto", mx: "America/Mexico_City",
  br: "America/Sao_Paulo", ar: "America/Argentina/Buenos_Aires",
  cl: "America/Santiago", co: "America/Bogota", pe: "America/Lima",
  ve: "America/Caracas", ec: "America/Guayaquil", bo: "America/La_Paz",
  py: "America/Asuncion", uy: "America/Montevideo", cr: "America/Costa_Rica",
  pa: "America/Panama", gt: "America/Guatemala", do: "America/Santo_Domingo",
  jm: "America/Jamaica", tt: "America/Port_of_Spain", bs: "America/Nassau",
  bb: "America/Barbados", cu: "America/Havana", hn: "America/Tegucigalpa",
  ni: "America/Managua", sv: "America/El_Salvador",
};

const FRIENDLY_TIMEZONE_LABELS: Record<string, string> = {
  "America/Chicago": "Central Time (US)",
  "America/New_York": "Eastern Time (US)",
  "America/Denver": "Mountain Time (US)",
  "America/Los_Angeles": "Pacific Time (US)",
  "America/Phoenix": "Arizona Time (US)",
  "America/Anchorage": "Alaska Time (US)",
  "Pacific/Honolulu": "Hawaii Time (US)",
  "Africa/Lagos": "West Africa Time",
  "Africa/Nairobi": "East Africa Time",
  "Africa/Johannesburg": "South Africa Time",
  "Africa/Cairo": "Egypt Time",
  "Africa/Accra": "Ghana Time",
  "Europe/London": "UK Time",
  "Europe/Dublin": "Ireland Time",
  "Europe/Paris": "Central European Time",
  "Asia/Dubai": "Gulf Time",
  "Asia/Kolkata": "India Time",
  "Asia/Singapore": "Singapore Time",
  "Australia/Sydney": "Sydney Time",
  "Pacific/Auckland": "New Zealand Time",
  UTC: "UTC",
};

const REGION_TIMEZONE_RULES: Array<[RegExp, string]> = [
  [/\b(houston|texas|dallas|austin|san antonio|fort worth)\b/i, "America/Chicago"],
  [/\b(chicago|illinois|wisconsin|minnesota|louisiana|oklahoma|kansas|missouri|tennessee|nebraska|iowa|arkansas|alabama|mississippi)\b/i, "America/Chicago"],
  [/\b(new york|brooklyn|queens|manhattan|new jersey|florida|miami|atlanta|georgia|boston|massachusetts|washington,?\s*dc|philadelphia|pennsylvania|ohio|michigan|virginia|maryland|north carolina|south carolina)\b/i, "America/New_York"],
  [/\b(denver|colorado|utah|wyoming|montana|new mexico|idaho)\b/i, "America/Denver"],
  [/\b(los angeles|california|san francisco|san diego|seattle|oregon|portland|las vegas|nevada)\b/i, "America/Los_Angeles"],
  [/\b(phoenix|arizona)\b/i, "America/Phoenix"],
  [/\b(anchorage|alaska)\b/i, "America/Anchorage"],
  [/\b(honolulu|hawaii)\b/i, "Pacific/Honolulu"],
  [/\b(vancouver|british columbia)\b/i, "America/Vancouver"],
  [/\b(calgary|edmonton|alberta)\b/i, "America/Edmonton"],
  [/\b(winnipeg|manitoba|saskatchewan)\b/i, "America/Winnipeg"],
  [/\b(toronto|ottawa|ontario|quebec|montreal)\b/i, "America/Toronto"],
  [/\b(halifax|nova scotia|new brunswick)\b/i, "America/Halifax"],
  [/\b(perth|western australia)\b/i, "Australia/Perth"],
  [/\b(adelaide|south australia)\b/i, "Australia/Adelaide"],
  [/\b(brisbane|queensland)\b/i, "Australia/Brisbane"],
  [/\b(darwin|northern territory)\b/i, "Australia/Darwin"],
  [/\b(sydney|melbourne|canberra|new south wales|victoria|tasmania|hobart)\b/i, "Australia/Sydney"],
  [/\b(manaus|amazonas)\b/i, "America/Manaus"],
  [/\b(sao paulo|rio de janeiro|brasilia)\b/i, "America/Sao_Paulo"],
  [/\b(moscow|saint petersburg)\b/i, "Europe/Moscow"],
  [/\b(novosibirsk)\b/i, "Asia/Novosibirsk"],
  [/\b(vladivostok)\b/i, "Asia/Vladivostok"],
];

const FALLBACK_TIMEZONES = [
  "UTC",
  ...Array.from(new Set(Object.values(COUNTRY_TIMEZONES))),
  "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax",
  "Australia/Perth", "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin",
  "Europe/Moscow",
];

const getBrowserTimezones = (): string[] => {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const zones = supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length) return zones;
    }
  } catch {
    // Older browsers do not expose Intl.supportedValuesOf.
  }
  return FALLBACK_TIMEZONES;
};

export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const normalizeTimezone = (timezone?: string | null) =>
  String(timezone || "").trim();

export const inferWorkspaceTimezoneFromLocation = (
  location?: string | null,
  countryCode?: string | null,
): string | null => {
  const value = String(location || "").trim();
  const iso = String(countryCode || "").trim().toLowerCase();

  if (value) {
    const region = REGION_TIMEZONE_RULES.find(([pattern]) => pattern.test(value));
    if (region) return region[1];
  }
  if (iso && COUNTRY_TIMEZONES[iso]) return COUNTRY_TIMEZONES[iso];

  if (value) {
    const lower = value.toLowerCase();
    for (const zone of Object.values(COUNTRY_TIMEZONES)) {
      const city = zone.split("/")[1]?.replace(/_/g, " ").toLowerCase();
      if (city && lower.includes(city)) return zone;
    }
  }
  return null;
};

export const resolveWorkspaceTimezone = (timezone?: string | null) => {
  const saved = normalizeTimezone(timezone);
  return saved || getBrowserTimezone() || DEFAULT_WORKSPACE_TIMEZONE;
};

export const getTimezoneShortLabel = (timezone?: string | null) => {
  const resolved = resolveWorkspaceTimezone(timezone);
  if (FRIENDLY_TIMEZONE_LABELS[resolved]) return FRIENDLY_TIMEZONE_LABELS[resolved];
  const parts = resolved.split("/");
  return (parts[parts.length - 1] || resolved).replace(/_/g, " ");
};

export const formatTimezoneOptionLabel = (timezone?: string | null) => {
  const resolved = resolveWorkspaceTimezone(timezone);
  const label = getTimezoneShortLabel(resolved);
  return label === resolved ? resolved : `${label} — ${resolved}`;
};

export const getAvailableTimezones = (selectedTimezone?: string | null) => {
  const selected = normalizeTimezone(selectedTimezone);
  const zones = new Set<string>(getBrowserTimezones());
  if (selected) zones.add(selected);
  zones.add("UTC");
  const browser = getBrowserTimezone();
  if (browser) zones.add(browser);

  const ordered = Array.from(zones).sort((a, b) => a.localeCompare(b));
  const priority = Array.from(new Set([selected, browser].filter(Boolean) as string[]));
  return [...priority, ...ordered.filter((zone) => !priority.includes(zone))];
};

/**
 * The old version discarded any saved value on a "legacy junk" blacklist that
 * included Africa/Lagos. Removed. A timezone the tenant explicitly chose is now
 * ALWAYS honoured; we only infer when nothing has been saved at all.
 */
export const resolveOrgTimezone = (org?: any) => {
  const saved = normalizeTimezone(
    org?.settings?.timezone ||
      org?.profile?.timezone ||
      org?.timezone ||
      org?.workspaceTimezone ||
      org?.defaultTimezone,
  );

  if (saved) return saved;

  const inferred = inferWorkspaceTimezoneFromLocation(
    org?.profile?.location ||
      org?.location ||
      org?.businessLocation ||
      org?.settings?.location,
    org?.profile?.countryCode || org?.countryCode || org?.settings?.countryCode,
  );

  return inferred || getBrowserTimezone() || DEFAULT_WORKSPACE_TIMEZONE;
};
