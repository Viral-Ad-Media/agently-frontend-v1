const DEFAULT_BACKEND_URL = "https://agently-server-v1.vercel.app";
const LOCAL_BACKEND_URL = "http://localhost:4000";

const FRONTEND_ONLY_HOSTS = new Set([
  "www.agentlycall.com",
  "agentlycall.com",
  "agentlycall.vercel.app",
]);

function cleanBaseUrl(value?: string | null): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function originFromUrl(value: string): string {
  const cleaned = cleanBaseUrl(value);
  if (!cleaned) return "";
  try {
    return new URL(cleaned).origin;
  } catch {
    return cleaned;
  }
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function isFrontendOnlyUrl(value: string): boolean {
  const host = hostFromUrl(value);
  return Boolean(
    host &&
      (FRONTEND_ONLY_HOSTS.has(host) ||
        /^agently-frontend(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(host)),
  );
}

function getWindowOrigin(): string {
  if (typeof window === "undefined") return "";
  return originFromUrl(window.location.origin);
}

function getWindowHost(): string {
  if (typeof window === "undefined") return "";
  return String(window.location.hostname || "").toLowerCase();
}

function firstUsableBackendUrl(candidates: Array<string | undefined | null>): string {
  const frontendOrigin = getWindowOrigin();
  for (const candidate of candidates) {
    const cleaned = cleanBaseUrl(candidate);
    if (!cleaned) continue;

    const origin = originFromUrl(cleaned);
    if (!origin) continue;

    // agentlycall.com is the frontend app only. It does not serve /api,
    // /chatbot-widget, /chatbot-avatar, or /chatbot-avatars.
    if (frontendOrigin && origin === frontendOrigin) continue;
    if (isFrontendOnlyUrl(origin)) continue;

    return origin;
  }
  return "";
}

export function resolveApiBaseUrl(): string {
  const host = getWindowHost();
  const isLocal = isLocalHost(host);

  const configured = firstUsableBackendUrl([
    import.meta.env.VITE_API_BASE_URL,
  ]);
  if (configured) return configured;

  if (import.meta.env.DEV && isLocal) {
    return firstUsableBackendUrl([
      import.meta.env.VITE_API_PROXY_TARGET,
      LOCAL_BACKEND_URL,
    ]) || LOCAL_BACKEND_URL;
  }

  return DEFAULT_BACKEND_URL;
}

export function resolveChatbotWidgetBaseUrl(): string {
  return firstUsableBackendUrl([
    import.meta.env.VITE_CHATBOT_WIDGET_BASE_URL,
    import.meta.env.VITE_API_BASE_URL,
    resolveApiBaseUrl(),
    DEFAULT_BACKEND_URL,
  ]) || DEFAULT_BACKEND_URL;
}

export function resolveAppBaseUrl(): string {
  const origin = getWindowOrigin();
  const host = getWindowHost();

  // In production the domain in the address bar is the source of truth. This
  // prevents an old VITE_APP_URL from reviving a retired Vercel hostname after
  // the canonical domain changes. Local development may still use VITE_APP_URL.
  if (origin && !isLocalHost(host)) return origin;

  const configured = cleanBaseUrl(import.meta.env.VITE_APP_URL);
  if (configured) return originFromUrl(configured);
  return origin;
}

export { DEFAULT_BACKEND_URL };
