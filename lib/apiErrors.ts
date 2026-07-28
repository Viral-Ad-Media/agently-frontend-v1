export function humanizeApiError(input: { status?: number; code?: string | null } = {}) {
  const status = Number(input.status || 0);
  const code = String(input.code || "").toUpperCase();

  if (code === "AUTH_REQUIRED" || status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested resource could not be found.";
  if (status === 409) return "This record already exists or conflicts with another record.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 503 || code.includes("UNAVAILABLE")) {
    return "Agently could not reach its data service. Your session is still valid; please retry.";
  }
  if (status >= 500) return "Agently ran into a server error. Please try again.";
  if (status >= 400) return "We could not complete that request. Please check the details and try again.";
  return "Something went wrong. Please try again.";
}
