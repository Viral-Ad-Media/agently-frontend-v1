import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, NETWORK_OFFLINE_MESSAGE, REQUEST_TIMEOUT_MESSAGE } from "../../services/api";
import { humanizeApiError } from "../../lib/apiErrors";

/*
 * Mock tests for the HTTP client every screen goes through (services/api.ts).
 *
 * `fetch` is replaced with a scripted double so each backend behaviour — auth
 * expiry, the top-up gate, outages, timeouts, going offline — can be produced
 * on demand and the client's reaction asserted. None of these can be exercised
 * against a real server on demand, and each one maps to something a tenant
 * sees on screen.
 */

const fetchMock = vi.fn();
const json = (status: number, body: unknown) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const captured = (type: string) => {
  const events: CustomEvent[] = [];
  const handler = (e: Event) => events.push(e as CustomEvent);
  window.addEventListener(type, handler);
  return { events, stop: () => window.removeEventListener(type, handler) };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("API client — request shaping", () => {
  it("sends the session token as a bearer header on authenticated calls", async () => {
    window.localStorage.setItem("agently.auth.token", "tok-123");
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.bootstrap();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/bootstrap$/);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok-123");
    expect(init.cache).toBe("no-store");
  });

  it("never sends a token on public endpoints", async () => {
    window.localStorage.setItem("agently.auth.token", "tok-123");
    fetchMock.mockResolvedValue(json(200, { otpRequired: true, pendingToken: "p", email: "a@b.c", expiresInSeconds: 600 }));
    await api.login("a@b.c", "pw");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBeNull();
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.c", password: "pw", client: "web" });
  });
});

describe("API client — backend failure modes", () => {
  it("401 raises ApiError and broadcasts auth expiry so the shell can sign out", async () => {
    const ev = captured("agently:auth-expired");
    fetchMock.mockResolvedValue(json(401, { error: { code: "AUTH_REQUIRED" } }));
    const err = await api.bootstrap().catch((e) => e);
    ev.stop();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Your session has expired. Please sign in again.");
    expect(ev.events).toHaveLength(1);
  });

  it("402 CARD_REQUIRED opens the shared top-up gate", async () => {
    const ev = captured("agently:card-required");
    fetchMock.mockResolvedValue(json(402, { error: { code: "CARD_REQUIRED", message: "Add a card first." } }));
    const err = await api.restartAgent().catch((e) => e);
    ev.stop();
    expect(err.code).toBe("CARD_REQUIRED");
    expect(ev.events[0].detail).toEqual({ message: "Add a card first." });
  });

  it("server messages win over the generic fallback, and retryable is carried through", async () => {
    fetchMock.mockResolvedValue(json(503, { error: { code: "DB_UNAVAILABLE", message: "Database is waking up", retryable: true } }));
    const err = await api.bootstrap().catch((e) => e);
    expect(err.message).toBe("Database is waking up");
    expect(err.retryable).toBe(true);
  });

  it("a 500 with a non-JSON body still produces a readable message", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const err = await api.bootstrap().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Agently ran into a server error. Please try again.");
  });

  it("a dropped connection reports offline, not a crash", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.bootstrap().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe(NETWORK_OFFLINE_MESSAGE);
  });

  it("a hung backend is aborted at the timeout and reported as such", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    );
    const pending = api.bootstrap().catch((e) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    const err = await pending;
    expect(err.message).toBe(REQUEST_TIMEOUT_MESSAGE);
  });
});

describe("API client — success side effects", () => {
  it("a successful mutation refreshes the wallet with the balance the server returned", async () => {
    const ev = captured("agently:wallet-refresh");
    fetchMock.mockResolvedValue(json(200, { success: true, billing: { walletBalanceUsd: "12.50" } }));
    await api.restartAgent();
    ev.stop();
    expect(ev.events[0].detail).toEqual({ balanceUsd: 12.5 });
  });

  it("a read never triggers a wallet refresh", async () => {
    const ev = captured("agently:wallet-refresh");
    fetchMock.mockResolvedValue(json(200, { walletBalanceUsd: 5 }));
    await api.bootstrap();
    ev.stop();
    expect(ev.events).toHaveLength(0);
  });

  it("204 No Content resolves to null", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.restartAgent()).resolves.toBeNull();
  });
});

describe("humanizeApiError — message table", () => {
  it.each([
    [{ status: 401 }, /session has expired/],
    [{ status: 403 }, /permission/],
    [{ status: 404 }, /could not be found/],
    [{ status: 409 }, /already exists/],
    [{ status: 429 }, /Too many requests/],
    [{ status: 500, code: "STRIPE_NOT_CONFIGURED" }, /Nothing has been charged/],
    [{ status: 504, code: "STRIPE_TIMEOUT" }, /payment provider/],
    [{ status: 503 }, /data service/],
    [{ status: 500 }, /server error/],
    [{ status: 422 }, /check the details/],
    [{}, /Something went wrong/],
  ])("%j → %s", (input, expected) => {
    expect(humanizeApiError(input)).toMatch(expected);
  });
});
