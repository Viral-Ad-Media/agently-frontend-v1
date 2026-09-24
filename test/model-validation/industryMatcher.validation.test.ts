import { describe, it, expect } from "vitest";
import { INDUSTRIES, searchIndustries, type IndustryMatch } from "../../lib/industries";
import { INDUSTRY_BENCHMARK, type BenchmarkBucket, type BenchmarkCase } from "./fixtures/industryBenchmark";
import { record } from "../performance/metrics";

/*
 * MRM-001 — Industry matcher (lib/industries.ts → searchIndustries).
 *
 * Validation in the SR 11-7 sense: conceptual soundness (does the scoring do
 * what its design says), outcomes analysis against a labelled benchmark, a
 * challenger comparison, and a register of known limitations. Thresholds are
 * the accepted baseline recorded in docs/model-risk/VALIDATION_REPORT.md; a
 * drop below any of them is a model regression and blocks CI.
 *
 * `it.fails` marks a documented finding. It passes while the defect exists and
 * turns red the moment someone fixes it — that is the prompt to move the
 * finding to "closed" in the report and flip the test to a plain `it`.
 */

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Challenger: the obvious naive alternative — plain substring over label + aliases, no scoring. */
const challenger = (query: string): IndustryMatch[] => {
  const q = norm(query);
  if (!q) return [];
  return INDUSTRIES.filter((i) => [i.label, ...i.aliases].some((t) => norm(t).includes(q))).map((industry) => ({
    industry,
    score: 1,
  }));
};

type Metrics = { n: number; top1: number; top3: number; mrr: number };

const evaluate = (model: (q: string) => IndustryMatch[], cases: BenchmarkCase[]): Metrics => {
  let top1 = 0;
  let top3 = 0;
  let rr = 0;
  for (const c of cases) {
    const rank = model(c.query).findIndex((m) => c.accept.includes(m.industry.label));
    if (rank === 0) top1 += 1;
    if (rank >= 0 && rank < 3) top3 += 1;
    if (rank >= 0) rr += 1 / (rank + 1);
  }
  const n = cases.length;
  return { n, top1: top1 / n, top3: top3 / n, mrr: rr / n };
};

const inDomain = INDUSTRY_BENCHMARK.filter((c) => c.bucket !== "ood");
const bucket = (b: BenchmarkBucket) => INDUSTRY_BENCHMARK.filter((c) => c.bucket === b);
const champion = (q: string) => searchIndustries(q);

/** Accepted baseline (2026-09-24). Lower bounds, set a little under the measured value. */
const THRESHOLDS: Record<string, Pick<Metrics, "top1" | "top3">> = {
  ALL: { top1: 0.8, top3: 0.92 },
  alias: { top1: 1.0, top3: 1.0 },
  typo: { top1: 0.9, top3: 1.0 },
  sentence: { top1: 0.65, top3: 0.95 },
  paraphrase: { top1: 0.5, top3: 0.75 },
};
/** Highest score any out-of-domain query may reach. Alias hits start at 74. */
const OOD_SCORE_CEILING = 50;

describe("MRM-001 industry matcher — benchmark integrity", () => {
  it("every accepted label in the benchmark exists in the taxonomy", () => {
    const labels = new Set(INDUSTRIES.map((i) => i.label));
    const unknown = INDUSTRY_BENCHMARK.flatMap((c) => c.accept.filter((l) => !labels.has(l)).map((l) => `${c.query} → ${l}`));
    expect(unknown).toEqual([]);
  });

  it("covers every bucket with enough cases to mean something", () => {
    for (const b of ["alias", "paraphrase", "typo", "sentence", "ood"] as const) {
      expect(bucket(b).length, b).toBeGreaterThanOrEqual(10);
    }
    expect(new Set(INDUSTRY_BENCHMARK.map((c) => norm(c.query))).size).toBe(INDUSTRY_BENCHMARK.length);
  });
});

describe("MRM-001 industry matcher — taxonomy data quality", () => {
  it("labels are unique and every entry has a NAICS sector and aliases", () => {
    expect(new Set(INDUSTRIES.map((i) => i.label)).size).toBe(INDUSTRIES.length);
    for (const i of INDUSTRIES) {
      expect(i.sector, i.label).toMatch(/^\d{2}(-\d{2})?$/);
      expect(i.aliases.length, i.label).toBeGreaterThan(0);
    }
  });

  it("no alias is repeated inside a single entry", () => {
    for (const i of INDUSTRIES) {
      const a = i.aliases.map(norm);
      expect(new Set(a).size, i.label).toBe(a.length);
    }
  });

  it("aliases shared across industries stay at the reviewed set", () => {
    // Shared aliases make the top result depend on alphabetical tie-breaks.
    // These were reviewed and accepted as genuinely ambiguous (a "nursery"
    // sells plants or minds children); a new one needs a reviewer.
    const owners = new Map<string, string[]>();
    for (const i of INDUSTRIES) for (const a of i.aliases) owners.set(norm(a), [...(owners.get(norm(a)) ?? []), i.label]);
    const shared = [...owners].filter(([, v]) => v.length > 1).map(([k]) => k).sort();
    expect(shared).toEqual(["bootcamp", "exhibition", "nursery"]);
  });
});

describe("MRM-001 industry matcher — conceptual soundness", () => {
  it("every label, typed exactly, ranks itself first with the maximum score", () => {
    for (const i of INDUSTRIES) {
      const [top] = searchIndustries(i.label);
      expect(top.industry.label, i.label).toBe(i.label);
      expect(top.score).toBe(100);
    }
  });

  it("every alias, typed exactly, puts its owning industry in the top-scoring group", () => {
    for (const i of INDUSTRIES) {
      for (const alias of i.aliases) {
        const results = searchIndustries(alias);
        const own = results.find((m) => m.industry.label === i.label);
        expect(own, `${alias} → ${i.label}`).toBeDefined();
        expect(own!.score, `${alias} → ${i.label}`).toBe(results[0].score);
      }
    }
  });

  it("scores stay in [0, 100] and fuzzy-only matches stay below every lexical tier", () => {
    for (const c of INDUSTRY_BENCHMARK) {
      for (const m of searchIndustries(c.query)) {
        expect(m.score).toBeGreaterThanOrEqual(0);
        expect(m.score).toBeLessThanOrEqual(100);
        // 60 × Dice ≤ 60 < 74, the lowest lexical tier. Nothing lands in between.
        expect(m.score <= 60 || m.score >= 74, `${c.query}: ${m.industry.label}=${m.score}`).toBe(true);
      }
    }
  });

  it("results are sorted by score and respect the limit", () => {
    for (const c of INDUSTRY_BENCHMARK.filter((x) => norm(x.query))) {
      const r = searchIndustries(c.query, 5);
      expect(r.length).toBeLessThanOrEqual(5);
      for (let k = 1; k < r.length; k += 1) expect(r[k - 1].score).toBeGreaterThanOrEqual(r[k].score);
    }
  });

  it("is deterministic and invariant to case, padding and punctuation", () => {
    for (const c of inDomain) {
      const base = searchIndustries(c.query).map((m) => `${m.industry.label}:${m.score}`);
      expect(searchIndustries(c.query).map((m) => `${m.industry.label}:${m.score}`)).toEqual(base);
      expect(searchIndustries(`  ${c.query.toUpperCase()}!  `).map((m) => `${m.industry.label}:${m.score}`)).toEqual(base);
    }
  });

  it("an empty query returns the full taxonomy unscored, in taxonomy order", () => {
    // Browsing mode: the limit is ignored on purpose so the picker can list
    // everything. Punctuation-only input ("!!!!") normalises to empty and lands
    // here too — observation O-01 in the validation report.
    for (const q of ["", "   ", "!!!!"]) {
      const r = searchIndustries(q, 5);
      expect(r.map((m) => m.industry.label)).toEqual(INDUSTRIES.map((i) => i.label));
      expect(r.every((m) => m.score === 0)).toBe(true);
    }
  });
});

describe("MRM-001 industry matcher — outcomes analysis (benchmark)", () => {
  for (const [name, t] of Object.entries(THRESHOLDS)) {
    it(`${name}: top-1 ≥ ${t.top1}, top-3 ≥ ${t.top3}`, () => {
      const m = evaluate(champion, name === "ALL" ? inDomain : bucket(name as BenchmarkBucket));
      expect(m.top1).toBeGreaterThanOrEqual(t.top1);
      expect(m.top3).toBeGreaterThanOrEqual(t.top3);
    });
  }

  it(`out-of-domain noise never scores above ${OOD_SCORE_CEILING}`, () => {
    for (const c of bucket("ood")) {
      const top = searchIndustries(c.query)[0];
      expect(top?.score ?? 0, c.query).toBeLessThanOrEqual(OOD_SCORE_CEILING);
    }
  });

  it("beats the naive substring challenger on every in-domain metric", () => {
    const champ = evaluate(champion, inDomain);
    const chall = evaluate(challenger, inDomain);
    expect(champ.top1).toBeGreaterThan(chall.top1);
    expect(champ.top3).toBeGreaterThan(chall.top3);
    expect(champ.mrr).toBeGreaterThan(chall.mrr);
    const rows: Record<string, { champion: Metrics; challenger: Metrics }> = {};
    for (const b of ["alias", "paraphrase", "typo", "sentence", "ambiguous"] as const) {
      rows[b] = { champion: evaluate(champion, bucket(b)), challenger: evaluate(challenger, bucket(b)) };
    }
    rows.ALL = { champion: champ, challenger: chall };
    const tied = inDomain.filter((c) => {
      const r = searchIndustries(c.query);
      return r[1] && r[0].score === r[1].score;
    }).length;
    const oodMax = Math.max(...bucket("ood").map((c) => searchIndustries(c.query)[0]?.score ?? 0));
    record("industryBenchmark", { buckets: rows, tiedTop1: tied, inDomain: inDomain.length, oodMaxScore: oodMax, thresholds: THRESHOLDS });
    if (process.env.MRM_REPORT) {
      console.table(
        Object.fromEntries(
          Object.entries(rows).map(([k, v]) => [k, { n: v.champion.n, top1: v.champion.top1.toFixed(3), top3: v.champion.top3.toFixed(3), mrr: v.champion.mrr.toFixed(3), challengerTop1: v.challenger.top1.toFixed(3) }]),
        ),
      );
    }
  });

  it("answers a query in well under a keystroke (mean < 10 ms)", () => {
    const start = performance.now();
    const rounds = 10;
    for (let k = 0; k < rounds; k += 1) for (const c of INDUSTRY_BENCHMARK) searchIndustries(c.query);
    expect((performance.now() - start) / (rounds * INDUSTRY_BENCHMARK.length)).toBeLessThan(10);
  });
});

describe("MRM-001 industry matcher — known limitations (open findings)", () => {
  const topLabel = (q: string) => searchIndustries(q)[0]?.industry.label;

  it.fails("F-01: short prefixes collide with unrelated aliases ('spa' vs 'sparky', 'bar' vs 'barrister')", () => {
    // Alias startsWith fires for any 3-char query, so the Spa query ties
    // Electrical Services at 88 via "sparky", and "bar" hands Legal an 88.
    for (const [q, owner] of [["spa", "Spa, Massage & Wellness"], ["bar", "Bar, Pub & Nightlife"]] as const) {
      const r = searchIndustries(q);
      expect(r[0].industry.label).toBe(owner);
      expect(r.filter((m) => m.score >= 80).map((m) => m.industry.label)).toEqual([owner]);
    }
  });

  it.fails("F-02: generic aliases ('shop', 'studio', 'school') hijack sentence input via alphabetical tie-breaks", () => {
    expect(topLabel("tire shop")).toBe("Auto Repair & Mechanic");
    expect(topLabel("yoga studio")).toBe("Fitness, Gym & Personal Training");
    expect(topLabel("boutique fitness studio")).toBe("Fitness, Gym & Personal Training");
  });

  it.fails("F-03: containment ignores the more specific phrase ('physical therapist' → Mental Health)", () => {
    expect(topLabel("physical therapist")).toBe("Physiotherapy & Rehab");
    expect(topLabel("eye doctor")).toBe("Optometry & Eye Care");
  });

  it.fails("F-04: common verticals with no coverage return only fuzzy noise", () => {
    expect(topLabel("urgent care")).toBe("Medical Practice & Clinic");
    expect(topLabel("tax preparation")).toBe("Accounting & Bookkeeping");
    expect(topLabel("locksmith")).toBeDefined();
    expect(searchIndustries("locksmith")[0].score).toBeGreaterThanOrEqual(74);
  });
});
