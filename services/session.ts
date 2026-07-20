const SESSION_TOKEN_KEY = 'agently.auth.token';

const hasWindow = () => typeof window !== 'undefined';

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const getSessionToken = (): string | null => {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
};

export const setSessionToken = (token: string) => {
  if (!hasWindow()) return;
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
};

export const clearSessionToken = () => {
  if (!hasWindow()) return;
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
};

export const isSessionTokenExpired = (token = getSessionToken()): boolean => {
  if (!token || !hasWindow()) return !token;
  const payload = decodeJwtPayload(token);
  const expiresAtSeconds = Number(payload?.exp || 0);
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return false;
  return Date.now() >= expiresAtSeconds * 1000;
};
