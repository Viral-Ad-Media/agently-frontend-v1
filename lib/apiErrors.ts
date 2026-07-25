/**
 * agently/lib/apiErrors.ts
 *
 * Single source of truth for turning an HTTP failure into a sentence a
 * non-technical customer can act on.
 *
 * Both services/api.ts and services/knowledgeScrapeApi.ts import
 * `humanizeApiError` and use it ONLY as a fallback — if the server sent
 * `error.message`, that always wins. This file covers the case where the
 * server sent nothing useful (proxy 502, Vercel 405 on a static host, an
 * aborted fetch) and the alternative would be showing the user a bare status
 * code.
 */

export interface HumanizeArgs {
  /** HTTP status. 0 / undefined means the request never reached the server. */
  status?: number | null;
  /** Machine code from `error.code`, when the API sent one. */
  code?: string | null;
  /** Optional context, e.g. 'knowledge base' — used to sharpen 404 copy. */
  resource?: string | null;
}

/**
 * Codes that carry their own meaning regardless of status. Checked first so a
 * 400 that is really a credit block does not read as "something was wrong with
 * that request".
 */
const CODE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDIT:
    'You need usage credit before running this. Add credit to continue.',
  CREDIT_REQUIRED:
    'You need usage credit before running this. Add credit to continue.',
  WALLET_INSUFFICIENT:
    'Your usage wallet balance is too low for this action.',
  WALLET_LOCKED:
    'Your usage wallet is temporarily locked while another charge settles. Try again in a moment.',
  JOB_ALREADY_RUNNING:
    'That job is already running. We reconnected you to the one in progress.',
  RATE_LIMITED:
    'That was a lot of requests in a short time. Wait a few seconds and try again.',
  TOKEN_EXPIRED: 'Your session expired. Sign in again to continue.',
  INVALID_TOKEN: 'Your session is no longer valid. Sign in again to continue.',
  ORG_REQUIRED: 'Pick a workspace before running this.',
  NOT_FOUND: 'We could not find that.',
  VALIDATION_ERROR: 'Some of the details submitted were not valid.',
  TWILIO_ERROR:
    'The phone provider rejected that request. Check the number and try again.',
  UPSTREAM_TIMEOUT:
    'The service took too long to answer. Nothing was charged — try again.',
};

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Something in that request was not valid. Check the details and try again.',
  401: 'Your session expired. Sign in again to continue.',
  402: 'You need usage credit before running this. Add credit to continue.',
  403: 'You do not have permission to do that on this workspace.',
  404: 'We could not find that.',
  405: 'That request went to the wrong address. Refresh the page and try again — if it keeps happening the app is pointing at the wrong API URL.',
  408: 'The request timed out before the server answered. Try again.',
  409: 'That conflicts with something that already exists.',
  413: 'That file or payload is too large.',
  415: 'That file type is not supported.',
  422: 'Some of the details submitted were not valid.',
  429: 'That was a lot of requests in a short time. Wait a few seconds and try again.',
  500: 'Something went wrong on our side. Nothing was charged — try again in a moment.',
  502: 'We could not reach the service. Try again in a moment.',
  503: 'The service is temporarily unavailable. Try again in a moment.',
  504: 'The service took too long to answer. Try again in a moment.',
};

/**
 * Never throws, never returns an empty string. Safe to call with anything.
 */
export function humanizeApiError(args: HumanizeArgs = {}): string {
  const status =
    typeof args.status === 'number' && Number.isFinite(args.status)
      ? args.status
      : 0;
  const code = String(args.code || '').trim().toUpperCase();

  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  // Pattern match on families of codes the backend generates dynamically.
  if (code) {
    if (/INSUFFICIENT|NO_CREDIT|BALANCE/.test(code)) {
      return CODE_MESSAGES.INSUFFICIENT_CREDIT;
    }
    if (/RATE_?LIMIT|TOO_MANY/.test(code)) return CODE_MESSAGES.RATE_LIMITED;
    if (/TIMEOUT/.test(code)) return CODE_MESSAGES.UPSTREAM_TIMEOUT;
    if (/NOT_FOUND|MISSING/.test(code)) {
      return args.resource
        ? `We could not find that ${args.resource}.`
        : CODE_MESSAGES.NOT_FOUND;
    }
  }

  if (status === 404 && args.resource) {
    return `We could not find that ${args.resource}.`;
  }

  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];

  if (status === 0) {
    return 'We could not reach the server. Check your connection and try again.';
  }

  if (status >= 500) return STATUS_MESSAGES[500];
  if (status >= 400) return STATUS_MESSAGES[400];

  return 'Something went wrong. Try again in a moment.';
}

/** Convenience wrapper for callers holding a thrown error object. */
export function humanizeThrown(err: any, resource?: string): string {
  if (!err) return humanizeApiError({ resource });
  const direct = err?.message || err?.error?.message;
  if (direct && typeof direct === 'string') return direct;
  return humanizeApiError({
    status: err?.status ?? err?.statusCode ?? 0,
    code: err?.code ?? err?.error?.code ?? null,
    resource,
  });
}

export default humanizeApiError;
