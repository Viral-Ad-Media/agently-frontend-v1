export const DEFAULT_WORKSPACE_TIMEZONE = "America/Chicago";

const FRIENDLY_TIMEZONE_LABELS: Record<string, string> = {
  "America/Chicago": "Central Time (US)",
  "America/New_York": "Eastern Time (US)",
  "America/Denver": "Mountain Time (US)",
  "America/Los_Angeles": "Pacific Time (US)",
  "America/Phoenix": "Arizona Time (US)",
  "America/Anchorage": "Alaska Time (US)",
  "Pacific/Honolulu": "Hawaii Time (US)",
  UTC: "UTC",
};

const FALLBACK_TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Adak",
  "America/Juneau",
  "America/Sitka",
  "America/Metlakatla",
  "America/Yakutat",
  "America/Nome",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Indiana/Knox",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Tell_City",
  "America/Indiana/Vevay",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Menominee",
  "America/North_Dakota/Beulah",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/Boise",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "UTC",
];

const getBrowserTimezones = (): string[] => {
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const zones = supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length > 0) return zones;
    }
  } catch {
    // Older browsers may not expose Intl.supportedValuesOf yet. The fallback list below keeps the UI usable.
  }
  return FALLBACK_TIMEZONES;
};


const LOCATION_TIMEZONE_RULES: Array<[RegExp, string]> = [
  [/\b(houston|texas|dallas|austin|san antonio|fort worth)\b/i, "America/Chicago"],
  [/\b(chicago|illinois|wisconsin|minnesota|louisiana|oklahoma|kansas|missouri|tennessee)\b/i, "America/Chicago"],
  [/\b(new york|brooklyn|queens|manhattan|new jersey|florida|miami|atlanta|georgia|boston|massachusetts|washington,?\s*dc|philadelphia|pennsylvania)\b/i, "America/New_York"],
  [/\b(denver|colorado|utah|wyoming|montana|new mexico)\b/i, "America/Denver"],
  [/\b(los angeles|california|san francisco|seattle|washington|oregon|portland|las vegas|nevada)\b/i, "America/Los_Angeles"],
  [/\b(phoenix|arizona)\b/i, "America/Phoenix"],
  [/\b(london|united kingdom|england)\b/i, "Europe/London"],
];

export const inferWorkspaceTimezoneFromLocation = (location?: string | null) => {
  const value = String(location || "").trim();
  if (!value) return null;
  const match = LOCATION_TIMEZONE_RULES.find(([pattern]) => pattern.test(value));
  return match?.[1] || null;
};

const normalizeTimezone = (timezone?: string | null) => String(timezone || "").trim();

export const resolveWorkspaceTimezone = (timezone?: string | null) => {
  const savedTimezone = normalizeTimezone(timezone);
  return savedTimezone || DEFAULT_WORKSPACE_TIMEZONE;
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

  zones.add(DEFAULT_WORKSPACE_TIMEZONE);
  if (selected) zones.add(selected);
  zones.add("UTC");

  const ordered = Array.from(zones).sort((a, b) => a.localeCompare(b));
  return [DEFAULT_WORKSPACE_TIMEZONE, ...ordered.filter((zone) => zone !== DEFAULT_WORKSPACE_TIMEZONE)];
};

export const resolveOrgTimezone = (org?: any) => {
  const locationTimezone = inferWorkspaceTimezoneFromLocation(
    org?.profile?.location || org?.location || org?.businessLocation || org?.settings?.location,
  );
  const savedTimezone = normalizeTimezone(
    org?.settings?.timezone ||
      org?.profile?.timezone ||
      org?.timezone ||
      org?.workspaceTimezone ||
      org?.defaultTimezone,
  );

  // Do not let a browser/device default such as Africa/Lagos override a selected US business location.
  if (locationTimezone && (!savedTimezone || savedTimezone === "Africa/Lagos")) {
    return locationTimezone;
  }

  if (!savedTimezone || savedTimezone === "Africa/Lagos") {
    return locationTimezone || DEFAULT_WORKSPACE_TIMEZONE;
  }

  return resolveWorkspaceTimezone(savedTimezone);
};
