# Model Inventory — agently-frontend-v1

Framework: Federal Reserve / OCC **SR 11-7** (*Supervisory Guidance on Model Risk Management*).
SR 11-7 defines a model as a quantitative method that turns inputs into estimates people act on. Under that definition, this inventory covers every estimate the frontend **computes itself**. It also lists the models the frontend only **displays**, because those carry risk that someone has to own.

Last reviewed: 2026-09-24 · Validation evidence: [`VALIDATION_REPORT.md`](./VALIDATION_REPORT.md) · Suite: `npm run test:mrm`

## In scope: computed in this repository

| ID | Model | Location | What it estimates | Consumers | Tier | Status |
|---|---|---|---|---|---|---|
| MRM-001 | Industry matcher | `lib/industries.ts` → `searchIndustries` | Ranked industry match plus a 0–100 relevance score from free text. Uses tiered lexical rules with a bigram-Dice fuzzy fallback. | Onboarding industry picker. The stored industry seeds agent persona and reporting rollups by NAICS sector. | Low–Medium | Validated with findings |
| MRM-002 | Gross-margin price multiple | `lib/pricingMath.ts` | Price multiple = 1 / (1 − margin) | Owner-only Billing Pricing and Tenant Economics screens. Owners use it to decide platform pricing. | Medium (pricing decision support) | Validated with findings |
| MRM-003 | Dashboard usage & conversion metrics | `pages/Dashboard.tsx` → `normalizeDashboardMetrics` | Minutes used and remaining, % of plan used, lead conversion rate | Every customer dashboard. Customers use these numbers to decide on top-ups and upgrades. | Medium (customer-facing financial signal) | Validated with findings |

Tier rationale: no model here moves money directly. The server charges and meters. MRM-002 and MRM-003 are rated Medium because a human makes a financial decision from their output.

## Out of scope for this repo: model runs server-side, frontend displays or relays the output

These still need an owner and a validation home. The natural home is `agently-server`.

| Model | Frontend touchpoint | Why it matters | Recommended validation |
|---|---|---|---|
| Lead AI scoring (`ai_score`, `lead_temperature`, `ai_confidence`, `needs_human_review`) | `types/lead-crm.ts`, `lib/leadCrmApi.ts#refreshLeadAiScore` | Drives lead prioritisation and the "hot leads" KPI. The frontend never shows the score or its confidence, so users can't see how certain a classification is. | Labelled back-test (precision/recall per temperature), calibration of `ai_confidence`, drift monitoring on score distribution |
| Knowledge-page priority scoring (`priorityScore`) | `components/PageSelector.tsx`: pre-selects pages scoring ≥ 60, badges pages scoring ≥ 80 | The frontend hard-codes cut-offs against a score it doesn't define. A change in the server's scale silently changes which pages get ingested. | Put the thresholds in a contract (served, or shared constants). Benchmark selection against human picks. |
| Voice / chat agent (OpenAI Realtime, ElevenLabs TTS) | `services/voiceCallsApi.ts`, `lib/webcallClient.ts`, `components/CallSimulator.tsx` | Vendor (third-party) models talk to end customers on the tenant's behalf | SR 11-7 vendor-model controls: conversation eval set, hallucination/escalation rate, change log on vendor model IDs |
| Onboarding FAQ generation, Platform Assistant | `pages/Onboarding.tsx`, `components/PlatformAssistant.tsx` | Generated content goes live on the agent | Golden-set review, factuality spot checks per release |
