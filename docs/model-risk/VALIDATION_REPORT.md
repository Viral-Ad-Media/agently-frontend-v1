# Model Validation Report — agently-frontend-v1

| | |
|---|---|
| Framework | SR 11-7: conceptual soundness, outcomes analysis (incl. benchmarking), ongoing monitoring |
| Date | 2026-09-24 |
| Scope | MRM-001, MRM-002, MRM-003 (see [`MODEL_INVENTORY.md`](./MODEL_INVENTORY.md)) |
| Evidence | `test/model-validation/*.validation.test.ts`, run in CI on every push via `npm test` |
| Reproduce | `MRM_REPORT=1 npm run test:mrm` prints the benchmark table |
| Independence | This validation changed **no model behaviour**. The only refactor moved the two margin formulas into `lib/pricingMath.ts` so they could be tested, and exported `normalizeDashboardMetrics`. Remediation belongs to the model owner. |

## Summary

| Model | Verdict | Open findings |
|---|---|---|
| MRM-001 Industry matcher | **Fit for purpose, with limitations.** Strong on the input it was designed for (aliases, typos). Weak on paraphrase. | F-01 – F-04 (all Low/Medium) |
| MRM-002 Margin multiple | **Formula sound. Controls need fixing.** The previews don't match what gets saved. | F-05a, F-05b (Medium) |
| MRM-003 Usage metrics | **Sound for well-formed input.** Edge cases can mislead customers. | F-06 (Medium), F-07, F-08 (Low) |

Each open finding is pinned by an `it.fails` test. The test passes while the defect exists and goes red when someone fixes it. The finding can't be closed silently: whoever fixes it must flip the test to a plain `it` and update this report.

---

## MRM-001 Industry matcher

### Conceptual soundness
The design is tiered lexical scoring: exact label 100 > label prefix 92 > label contains 84 > token prefix 78 > exact alias 96 > alias prefix 88 > alias contains 80 > query contains alias 74. When nothing lexical matches, a bigram-Dice fuzzy fallback scores `round(60 × Dice)` with a 0.34 floor. The suite checks that the implementation holds to this design:

- Every one of the 124 labels ranks first for itself with score 100.
- Every one of the 722 aliases puts its owning industry in the top-scoring group.
- Scores stay in [0, 100]. No fuzzy score falls between 60 and 74, so a fuzzy match can never outrank a lexical one.
- Output is deterministic, sorted, respects the limit, and ignores case, padding and punctuation.
- Taxonomy data: labels are unique, every entry has a valid NAICS sector, no entry repeats an alias. Three aliases are shared across industries (`bootcamp`, `exhibition`, `nursery`). These were reviewed as genuinely ambiguous, and the suite fails if a new shared alias appears without review.

### Outcomes analysis: benchmark
The benchmark has 128 labelled queries in `test/model-validation/fixtures/industryBenchmark.ts`. They were written independently of the alias lists, because a benchmark built from the model's own vocabulary only proves the model agrees with itself.

**Challenger model:** naive substring over label + aliases. This is the obvious simpler alternative, and the champion has to beat it to justify its complexity.

| Bucket | n | Top-1 | Top-3 | MRR | Challenger Top-1 | CI floor (Top-1 / Top-3) |
|---|---|---|---|---|---|---|
| alias | 47 | 1.000 | 1.000 | 1.000 | 0.872 | 1.00 / 1.00 |
| typo | 20 | 0.950 | 1.000 | 0.975 | 0.000 | 0.90 / 1.00 |
| sentence | 15 | 0.733 | 1.000 | 0.856 | 0.000 | 0.65 / 0.95 |
| paraphrase | 33 | 0.545 | 0.788 | 0.680 | 0.091 | 0.50 / 0.75 |
| ambiguous | 3 | 1.000 | 1.000 | 1.000 | 0.333 | — |
| **All in-domain** | **118** | **0.831** | **0.941** | **0.888** | **0.381** | 0.80 / 0.92 |

- **Out-of-domain (10 noise queries):** the highest score any of them reached was 40 ("test test" → Tutoring). CI fails above 50. Every real alias hit scores ≥ 74, so noise and real hits are cleanly separated.
- **Tie sensitivity:** 14 of 118 queries (11.9%) have a tied top score. In 4 of those, the correct answer ranked first only because of the alphabetical tie-break. Top-1 accuracy with those lucky ties removed is about 0.80.
- **Latency:** about 2 ms per query in jsdom. CI fails above a mean of 10 ms (headroom for slower runners).
- **Interpretation:** the model does its job, because the picker shows a list and top-3 accuracy is 0.94. Paraphrase is the weak bucket. Top-1 is the risk that matters, because the first suggestion is the one users accept.

### Findings
| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-01 | Medium | Short prefixes collide with unrelated aliases. `spa` ties Electrical Services at 88 via "sparky". `bar` hands Legal an 88 via "barrister". | Require a whole-token match for alias prefix hits when the query is shorter than 4 characters. |
| F-02 | Medium | Generic aliases (`shop`, `store`, `studio`, `school`) hijack sentence input at tier 74, and the tie is settled alphabetically. Examples: "tire shop" → Specialty Retail, "yoga studio" → Film. | Score by the longest or most specific contained alias. Break ties by match length, not alphabet. Consider demoting generic aliases. |
| F-03 | Low | Containment ignores the more specific phrase. "physical therapist" → Mental Health, "eye doctor" → Medical Practice. | Same fix as F-02: prefer the longest match. |
| F-04 | Low | Common verticals have no coverage and return only fuzzy noise: locksmith, towing, urgent care, dermatologist, tax preparation. The `tax` alias exists but is below the 4-character containment floor. | Add aliases, or add Locksmith and Towing entries. Lower the containment floor for exact whole tokens. |
| O-01 | Observation | Punctuation-only input (`!!!!`) normalises to empty and returns the full taxonomy, ignoring `limit`. This is intended browse behaviour, documented here for completeness. | None required. |

### Ongoing monitoring
- CI runs the whole suite on every push. Thresholds are one-way ratchets: raise them when the model improves, never lower them without a report entry.
- Recommended production monitor: the rate of industries saved as custom free text (`isCustomIndustry`). If that rate rises, the taxonomy is missing what customers actually type.

---

## MRM-002 Gross-margin price multiple
**Soundness:** price = cost / (1 − m), verified at the reference points the UI copy quotes (40% → 1.667×, 70% → 3.333×). A round-trip check confirms a price built with the multiple leaves exactly m of revenue as margin. The multiple is strictly increasing from 0% to 95%, never NaN or Infinity, and both screens agree to display precision everywhere in (0, 95].

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-05a | Medium | Tenant Economics previews a multiple for margins its own save rejects: 99% shows 100×, but `saveMargin` refuses anything above 95. | Return `null` (or an error) above 95 so the preview matches save validation. |
| F-05b | Medium | Billing Pricing clamps the preview to 95% (99% shows 20×) while `save()` sends the raw value unvalidated. The owner sees a price that isn't the one submitted. | Validate 0–95 before save and show the error inline. Confirm the server enforces the same bound (agently-server). |

## MRM-003 Dashboard usage & conversion metrics
**Soundness:** minutes are derived from seconds when minutes are absent. camelCase, snake_case, nested and flat payloads give identical output. Numeric strings are accepted and junk falls back cleanly. Usage is capped at 100% and remaining minutes are floored at 0. The invariant `remaining + min(used, limit) = limit` holds across a sweep of 36 input pairs.

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-06 | Medium | An explicit `minuteLimit: 0` is treated as missing (`\|\|` chain), so a plan with no included minutes shows "490 of 500 remaining". | Use `??` for the limit, or check `Number.isFinite` explicitly. |
| F-07 | Low | Conversion rate isn't bounded. 6 converted out of 4 total shows 150%. | Clamp to [0, 100] and log the inconsistency. |
| F-08 | Low | Negative usage from the API gives a negative % used and more minutes remaining than the plan includes. | Floor usage at 0. |

---

## Limitations of this validation
- It covers only models computed in this repo. The server-side and vendor models listed in the inventory (lead scoring, page priority scoring, voice and LLM agents) carry the higher inherent risk and need their own validation in `agently-server`.
- The benchmark labels are one reviewer's judgement. Where more than one answer is defensible, the case accepts several labels. Expand the set with real (anonymised) onboarding entries once available.
