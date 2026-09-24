/**
 * Deterministic synthetic data for mock and performance tests.
 *
 * Seeded so every run sees byte-identical payloads: a performance number is
 * only comparable across runs if the input is identical, and a mock test is only
 * meaningful if a failure reproduces.
 */

export const seeded = (seed = 42) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
};

const FIRST = ["Ada", "Ben", "Chi", "Dee", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jo"];
const LAST = ["Okafor", "Smith", "Nguyen", "Garcia", "Khan", "Rossi", "Silva", "Kim"];
const STATUSES = ["completed", "completed", "completed", "failed", "no-answer", "busy", "canceled", "in-progress"];

/** A call row shaped like /api/calls, mixing camelCase and snake_case the way the real API does. */
export const makeCalls = (n: number, agentIds = ["agent-1", "agent-2"], seed = 7) => {
  const rnd = seeded(seed);
  const base = Date.UTC(2026, 8, 1);
  return Array.from({ length: n }, (_, i) => {
    const status = STATUSES[Math.floor(rnd() * STATUSES.length)];
    const duration = status === "completed" ? Math.round(20 + rnd() * 400) : 0;
    const row: Record<string, unknown> = {
      id: `call-${i}`,
      voice_agent_id: agentIds[i % agentIds.length],
      caller_name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
      caller_phone: `+1555${String(1000000 + i).slice(-7)}`,
      status,
      duration_seconds: duration,
      created_at: new Date(base + i * 3_600_000).toISOString(),
    };
    if (i % 3 === 0) row.direction = "outbound";
    else if (i % 3 === 1) row.direction = "inbound";
    else row.metadata = { source: "web" };
    return row;
  });
};

export const makeMetricsPayload = (opts: { minutes?: number; limit?: number; leads?: number; converted?: number } = {}) => ({
  metrics: {
    usage: { totalCallMinutes: opts.minutes ?? 123.4, minuteLimit: opts.limit ?? 500 },
    chatbot: { messagesAnswered: 88, totalMessages: 120, leadsCaptured: 9 },
    leads: { total: opts.leads ?? 40, converted: opts.converted ?? 10, callLeadsCaptured: 31 },
    knowledge: { chunks: 240, estimatedStorageBytes: 3_400_000 },
  },
});

export const makeOrg = (agentCount = 2) =>
  ({
    id: "org-1",
    name: "Acme Dental",
    subscription: { usage: { minuteLimit: 500 } },
    voiceAgents: Array.from({ length: agentCount }, (_, i) => ({ id: `agent-${i + 1}`, name: `Agent ${i + 1}` })),
  }) as never;

export const makeDashboardProp = () =>
  ({
    stats: { totalCalls: 0, leadsCaptured: 0, missedCalls: 0, avgDurationMinutes: 0 },
    weeklyFlow: [],
    outcomeBreakdown: [],
    recentCalls: [],
    recentLeads: [],
    usage: { minuteLimit: 500 },
    agentStatus: { online: true, agentName: "Agent 1", phoneNumber: "+15550000000", direction: "inbound" },
  }) as never;
