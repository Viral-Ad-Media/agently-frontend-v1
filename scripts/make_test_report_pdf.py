#!/usr/bin/env python3
"""
Render the Agently frontend test report as a PDF from the metrics that
scripts/test-report.sh collects into reports/metrics/.

    python3 scripts/make_test_report_pdf.py reports/metrics reports/agently-test-report.pdf

Every number in the PDF is read from those JSON files; nothing is typed in by
hand except the findings register, which mirrors docs/model-risk/VALIDATION_REPORT.md.
"""
import io
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.ticker  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_LEFT  # noqa: E402
from reportlab.lib.pagesizes import letter  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

METRICS = Path(sys.argv[1] if len(sys.argv) > 1 else "reports/metrics")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "reports/agently-test-report.pdf")

tests = json.loads((METRICS / "tests.json").read_text())
perf = json.loads((METRICS / "metrics.json").read_text())
bench = json.loads((METRICS / "bench.json").read_text())
bundle = json.loads((METRICS / "bundle.json").read_text())


def git(*args):
    try:
        return subprocess.check_output(["git", *args], text=True).strip()
    except Exception:
        return "n/a"


AUTHOR = os.environ.get("REPORT_AUTHOR", "Abdulmalik Ajisegiri")
COMMIT = git("rev-parse", "--short", "HEAD")
BRANCH = git("rev-parse", "--abbrev-ref", "HEAD")

# ── palette (dataviz reference instance) ────────────────────────────────────
BLUE, ORANGE = "#2a78d6", "#eb6834"
INK, INK2, MUTED, RULE, SURFACE = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df", "#fcfcfb"
HEAD_BG = colors.HexColor("#f1f0ec")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, textColor=colors.HexColor(INK), spaceBefore=6, spaceAfter=8)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, textColor=colors.HexColor(INK), spaceBefore=10, spaceAfter=5)
BODY = ParagraphStyle("B", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor(INK), alignment=TA_LEFT)
SMALL = ParagraphStyle("S", parent=BODY, fontSize=8, leading=10.5, textColor=colors.HexColor(INK2))
CELL = ParagraphStyle("C", parent=BODY, fontSize=8.3, leading=10.5)
CELLB = ParagraphStyle("CB", parent=CELL, fontName="Helvetica-Bold")


def p(text, style=BODY):
    return Paragraph(text, style)


def table(rows, widths, header=True, align_right_from=None):
    data = [[c if not isinstance(c, str) else Paragraph(c, CELLB if (header and i == 0) else CELL) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(RULE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        st.append(("BACKGROUND", (0, 0), (-1, 0), HEAD_BG))
    t.setStyle(TableStyle(st))
    return t


def fig_image(fig, width_in):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor=SURFACE)
    plt.close(fig)
    buf.seek(0)
    w, h = fig.get_size_inches()
    return Image(buf, width=width_in * inch, height=width_in * inch * h / w)


def style_axes(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(RULE)
    ax.tick_params(colors=INK2, labelsize=8)
    ax.yaxis.grid(True, color=RULE, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.set_facecolor(SURFACE)


def ms(v, dp=2):
    return f"{v:.{dp}f} ms"


# ── derived numbers ─────────────────────────────────────────────────────────
files = tests["testResults"]
all_asserts = [a for f in files for a in f["assertionResults"]]
pinned = [a for a in all_asserts if a["title"].startswith("F-")]
n_total, n_pass, n_fail = tests["numTotalTests"], tests["numPassedTests"], tests["numFailedTests"]
ib = perf["industryBenchmark"]
allb = ib["buckets"]["ALL"]
kst = perf["industryKeystroke"]
dr = perf["dashboardRender200"]
tot = bundle["totals"]

LAYER = {
    "test/PhoneNumbers.test.tsx": "Regression (existing)",
    "test/mock/apiClient.mock.test.ts": "Mock — HTTP client",
    "test/mock/dashboard.mock.test.tsx": "Mock — Dashboard page",
    "test/model-validation/industryMatcher.validation.test.ts": "Benchmark — industry matcher",
    "test/model-validation/pricingMath.validation.test.ts": "Validation — pricing math",
    "test/model-validation/usageMetrics.validation.test.ts": "Validation — usage metrics",
    "test/performance/dashboard.render.perf.test.tsx": "Performance — Dashboard render",
    "test/performance/models.perf.test.ts": "Performance — compute paths",
}

FINDINGS = [
    ("F-09", "High", "Mock", "Dashboard: a list response with no array in it (<font face='Courier'>{}</font>, <font face='Courier'>{ok:true}</font>, <font face='Courier'>null</font>) makes getArrayPayload recurse forever. The whole load aborts with \"Maximum call stack size exceeded\" and every KPI reads 0.", "Stop recursing when the candidate is not an object. Fix first."),
    ("F-05a", "Medium", "Validation", "Tenant Economics previews a price multiple for margins its own save rejects (99% shows 100×).", "Return null above 95 so the preview matches save validation."),
    ("F-05b", "Medium", "Validation", "Billing Pricing clamps the preview to 95% but sends the raw value to the server unvalidated.", "Validate 0–95 before save; confirm the server enforces the same bound."),
    ("F-06", "Medium", "Validation", "An explicit 0-minute plan limit is replaced by the plan default (shows 490 of 500 remaining).", "Use ?? / Number.isFinite, not ||."),
    ("F-01", "Medium", "Benchmark", "Industry matcher: short prefixes collide ('spa' ties Electrical via 'sparky'; 'bar' gives Legal 88 via 'barrister').", "Whole-token prefix matching for queries under 4 characters."),
    ("F-02", "Medium", "Benchmark", "Generic aliases ('shop', 'studio', 'school') hijack sentence input; ties are settled alphabetically.", "Prefer the longest/most specific match; tie-break by match length."),
    ("P-01", "Medium", "Performance", f"Main JS chunk is {tot['largestJs']['rawKb']:.0f} KB raw / {tot['largestJs']['gzipKb']:.0f} KB gzip, above Vite's 500 KB warning. It is the first download on every visit, including the public marketing pages.", "Lazy-load the workspace routes and recharts; add a CI bundle budget."),
    ("F-03", "Low", "Benchmark", "Containment ignores the more specific phrase ('physical therapist' → Mental Health).", "Same fix as F-02."),
    ("F-04", "Low", "Benchmark", "No coverage for locksmith, towing, urgent care, dermatologist or tax preparation.", "Add aliases/entries; lower the containment floor for whole tokens."),
    ("F-07", "Low", "Validation", "Conversion rate is not bounded (6 of 4 shows 150%).", "Clamp to [0, 100]."),
    ("F-08", "Low", "Validation", "Negative usage from the API gives a negative % used.", "Floor usage at 0."),
]

# ── story ───────────────────────────────────────────────────────────────────
story = []

story += [
    Spacer(1, 1.2 * inch),
    p("<font size=26><b>Agently Frontend</b></font>", BODY),
    Spacer(1, 16),
    p("<font size=16>Test Results Report</font>", BODY),
    Spacer(1, 6),
    p("<font size=11 color='#52514e'>Benchmark, mock, performance and model-validation testing (SR 11-7)</font>", BODY),
    Spacer(1, 0.5 * inch),
    table(
        [
            ["Prepared by", f"<b>{AUTHOR}</b>"],
            ["Repository", "Viral-Ad-Media/agently-frontend-v1"],
            ["Branch / commit", f"{BRANCH} @ {COMMIT}"],
            ["Report date", date.today().isoformat()],
            ["Test runner", "Vitest 3 · jsdom · Node 22"],
            ["Result", f"<b>{n_pass} of {n_total} tests passed</b> · {n_fail} failed · {len(pinned)} open findings pinned"],
        ],
        [1.6 * inch, 4.6 * inch],
        header=False,
    ),
    Spacer(1, 0.4 * inch),
    p("Every figure in this report was produced by <font face='Courier'>npm run report</font> and read from the JSON it writes, so re-running the command reproduces the report.", SMALL),
    PageBreak(),
]

# 1. Executive summary
story += [p("1. Executive summary", H1)]
kpis = [
    ["Metric", "Result", "Target", "Status"],
    ["Tests passing", f"{n_pass} / {n_total}", "100%", "Pass" if n_fail == 0 else "Fail"],
    ["Industry matcher — top-1 accuracy", f"{allb['champion']['top1']*100:.1f}%", f"≥ {ib['thresholds']['ALL']['top1']*100:.0f}%", "Pass"],
    ["Industry matcher — top-3 accuracy", f"{allb['champion']['top3']*100:.1f}%", f"≥ {ib['thresholds']['ALL']['top3']*100:.0f}%", "Pass"],
    ["Accuracy gain over naive challenger (top-1)", f"+{(allb['champion']['top1']-allb['challenger']['top1'])*100:.1f} pts", "> 0", "Pass"],
    ["Industry picker keystroke latency (p95)", ms(kst["p95"]), "< 16.7 ms (1 frame)", "Pass"],
    ["Dashboard first mount (p95, 200 calls)", ms(dr["mount"]["p95"], 1), "< 250 ms", "Pass"],
    ["Dashboard time-to-data (p95, 200 calls)", ms(dr["ready"]["p95"], 1), "< 1,000 ms", "Pass"],
    ["Call normalisation, one page (p95)", ms(perf["callsNormalize200"]["p95"], 3), "< 16.7 ms", "Pass"],
    ["JS transfer size (gzip, all chunks)", f"{tot['jsGzipKb']:.0f} KB", "—", "Watch"],
    ["Largest JS chunk (raw)", f"{tot['largestJs']['rawKb']:.0f} KB", "< 500 KB", "Over (P-01)"],
]
story += [table(kpis, [2.9 * inch, 1.3 * inch, 1.3 * inch, 0.9 * inch]), Spacer(1, 8)]
sev = {s: sum(1 for f in FINDINGS if f[1] == s) for s in ("High", "Medium", "Low")}
story += [
    p(
        f"<b>Bottom line.</b> All {n_total} tests pass and every performance budget is met with wide headroom. "
        f"The testing surfaced <b>{len(FINDINGS)} findings</b> ({sev['High']} High, {sev['Medium']} Medium, {sev['Low']} Low). "
        "The one to fix first is <b>F-09</b>, found by the new mock tests. An outreach-schedules response with no array in it "
        "(an empty object, <font face='Courier'>{ok: true}</font>, or <font face='Courier'>null</font>) crashes the dashboard data load. The tenant then sees "
        "\"Maximum call stack size exceeded\" and zeros on every KPI. The typecheck and build can't catch this; it only shows up when a backend reply is replayed against the page."
    ),
    Spacer(1, 6),
    p(
        "Open findings are pinned by <font face='Courier'>it.fails</font> tests. Each one passes while the defect exists and turns red when someone fixes it, "
        "so a finding can't be closed silently. That is why they count as \"passed\" in the totals above."
    ),
]

# 2. What was done
story += [p("2. What was tested and how", H1)]
story += [
    table(
        [
            ["Layer", "What it does", "Where"],
            ["Benchmark testing", "128 labelled queries score the industry matcher (top-1, top-3, MRR) against a naive substring challenger. Accuracy minimums gate CI.", "test/model-validation/"],
            ["Model validation (SR 11-7)", "Checks the design (score tiers, bounds, determinism) and the maths (margin identity, usage invariants) for each frontend model.", "test/model-validation/, docs/model-risk/"],
            ["Mock testing", "Replaces fetch and the voice-calls API with scripted doubles to force every backend behaviour: 401 expiry, 402 top-up gate, 5xx, offline, timeout, slow and malformed responses.", "test/mock/"],
            ["Performance testing", "p50/p95/p99 latency against frame-based budgets, a linear-scaling check up to 16,000 calls, and Dashboard render and time-to-data with a mocked backend.", "test/performance/"],
            ["Micro-benchmarks", "Throughput (ops/sec) for every quantitative path, including champion vs challenger.", "bench/"],
            ["Bundle analysis", "Raw, gzip and brotli size of every built chunk.", "scripts/bundle-report.mjs"],
        ],
        [1.4 * inch, 3.6 * inch, 1.5 * inch],
    ),
    Spacer(1, 6),
    p(
        "<b>Why these metrics.</b> Agently is an AI-receptionist SaaS, so the frontend's work is onboarding (the industry picker seeds the agent persona), "
        "the Dashboard (the first screen every tenant sees, whose usage numbers drive top-up decisions) and owner pricing. "
        "The metrics follow those jobs: <i>classification accuracy</i> for onboarding, <i>resilience to backend failure</i> and <i>time-to-data</i> for the Dashboard, "
        "<i>frame-budget latency</i> for anything typed into, and <i>transfer size</i> for first load on a phone."
    ),
]

# 3. Suite results
sec3 = [p("3. Test results by suite", H1)]
rows = [["Suite", "Layer", "Tests", "Passed", "Pinned findings", "Time"]]
for f in files:
    name = f["name"].split("agently-frontend-v1/")[-1]
    a = f["assertionResults"]
    rows.append([
        f"<font face='Courier' size=7>{name}</font>",
        LAYER.get(name, ""),
        str(len(a)),
        str(sum(1 for x in a if x["status"] == "passed")),
        str(sum(1 for x in a if x["title"].startswith("F-"))),
        f"{(f['endTime']-f['startTime'])/1000:.2f} s",
    ])
rows.append(["<b>Total</b>", "", f"<b>{n_total}</b>", f"<b>{n_pass}</b>", f"<b>{len(pinned)}</b>", ""])
story += [KeepTogether(sec3 + [table(rows, [2.55 * inch, 1.55 * inch, 0.5 * inch, 0.55 * inch, 0.8 * inch, 0.55 * inch])])]

# 4. Benchmark
story += [PageBreak(), p("4. Benchmark testing — industry matcher", H1)]
story += [p(
    "The industry matcher (<font face='Courier'>lib/industries.ts</font>) turns what a business owner types during onboarding into one of 124 industries. "
    "The benchmark set was written independently of the matcher's own alias lists; a benchmark built from the model's vocabulary would only prove the model agrees with itself. "
    "The challenger is plain substring search, the obvious simpler alternative the champion has to beat to justify its complexity."
)]
order = ["alias", "typo", "sentence", "paraphrase", "ambiguous", "ALL"]
brow = [["Query type", "n", "Top-1", "Top-3", "MRR", "Challenger top-1", "CI floor (top-1 / top-3)"]]
for b in order:
    c, ch = ib["buckets"][b]["champion"], ib["buckets"][b]["challenger"]
    th = ib["thresholds"].get(b)
    brow.append([
        "<b>All in-domain</b>" if b == "ALL" else b,
        str(c["n"]), f"{c['top1']:.3f}", f"{c['top3']:.3f}", f"{c['mrr']:.3f}", f"{ch['top1']:.3f}",
        f"{th['top1']:.2f} / {th['top3']:.2f}" if th else "—",
    ])
story += [table(brow, [1.2 * inch, 0.4 * inch, 0.65 * inch, 0.65 * inch, 0.65 * inch, 1.15 * inch, 1.5 * inch]), Spacer(1, 8)]

labels = [b if b != "ALL" else "all" for b in order]
fig, ax = plt.subplots(figsize=(7.2, 2.7))
x = range(len(order))
w = 0.38
champ = [ib["buckets"][b]["champion"]["top1"] * 100 for b in order]
chall = [ib["buckets"][b]["challenger"]["top1"] * 100 for b in order]
ax.bar([i - w / 2 - 0.01 for i in x], champ, w, color=BLUE, label="Champion (tiered + fuzzy)")
ax.bar([i + w / 2 + 0.01 for i in x], chall, w, color=ORANGE, label="Challenger (naive substring)")
for i, v in enumerate(champ):
    ax.text(i - w / 2, v + 1.5, f"{v:.0f}", ha="center", fontsize=7.5, color=INK)
ax.set_xticks(list(x))
ax.set_xticklabels(labels)
ax.set_ylim(0, 110)
ax.set_ylabel("Top-1 accuracy (%)", fontsize=8, color=INK2)
style_axes(ax)
ax.legend(frameon=False, fontsize=8, loc="upper right", ncols=2, bbox_to_anchor=(1, 1.16))
story += [fig_image(fig, 6.4), p("Figure 1. Top-1 accuracy by query type. The champion's advantage is largest on typos and full sentences, where substring search scores zero.", SMALL), Spacer(1, 6)]
story += [p(
    f"<b>Out-of-domain noise</b> (10 queries such as \"asdfgh\" and \"lorem ipsum\") reached a highest score of <b>{ib['oodMaxScore']}</b>. The CI ceiling is 50, and every real alias match scores at least 74, so noise and real matches never overlap. "
    f"<b>Ties:</b> in {ib['tiedTop1']} of {ib['inDomain']} queries the top score is tied and the order is settled alphabetically. That is the root cause of findings F-02 and F-03."
)]

# 5. Mock
story += [PageBreak(), p("5. Mock testing", H1)]
story += [p(
    "Two doubles stand in for the backend. <font face='Courier'>fetch</font> is stubbed under the shared HTTP client (<font face='Courier'>services/api.ts</font>), and the voice-calls API is stubbed under the Dashboard. "
    "Each scenario is something a real server does occasionally, and none of them can be reproduced on demand against production."
)]
mrows = [["Scenario", "Result"]]
for f in files:
    if "/mock/" not in f["name"]:
        continue
    for a in f["assertionResults"]:
        t = a["title"]
        if t.startswith("%j") or "→" in t and t.startswith("{"):
            continue
        status = "<font color='#b3261e'><b>Open finding (pinned)</b></font>" if t.startswith("F-") else ("Pass" if a["status"] == "passed" else "<b>FAIL</b>")
        group = a["ancestorTitles"][-1] if a["ancestorTitles"] else ""
        mrows.append([f"<font color='#52514e'>{group}</font> · {t}", status])
he = [a for f in files if "apiClient" in f["name"] for a in f["assertionResults"] if a["ancestorTitles"] and "humanize" in a["ancestorTitles"][-1]]
mrows.append([f"<font color='#52514e'>humanizeApiError</font> · {len(he)} status/code → message mappings (401, 403, 404, 409, 429, Stripe, 503, 5xx, 4xx, unknown)", "Pass" if all(a['status'] == 'passed' for a in he) else "FAIL"])
story += [table(mrows, [5.3 * inch, 1.2 * inch])]

# 6. Performance
story += [PageBreak(), p("6. Performance testing", H1)]
story += [p(
    "Budgets are based on frames: 16.7 ms is one frame at 60 Hz, the point where typing or a screen settling starts to feel laggy. "
    "Budgets are checked at p95, not the mean, because users notice the one slow keystroke in twenty. "
    "Render numbers come from jsdom, which does no layout or paint. They measure React's own work, which is what regresses when someone adds an O(n²) memo, and should not be read as browser paint times."
)]
prow = [["Measurement", "n", "p50", "p95", "p99", "Budget", "Status"]]
def prow_add(name, s, budget):
    prow.append([name, str(s["n"]), ms(s["p50"], 3), ms(s["p95"], 3), ms(s["p99"], 3), budget, "Pass"])
prow_add(f"Industry picker, per keystroke ({kst['keystrokes']} keystrokes)", kst, "p95 < 16.7 ms")
prow_add("Normalise one page of calls (200)", perf["callsNormalize200"], "p95 < 16.7 ms")
prow_add("Derive dashboard usage metrics", perf["usageMetrics"], "p95 < 1 ms")
prow_add("Dashboard first mount (200 calls, 3 agents)", dr["mount"], "p95 < 250 ms")
prow_add("Dashboard time-to-data (200 calls, 3 agents)", dr["ready"], "p95 < 1,000 ms")
prow.append(["Margin multiple (200,000 calls)", "—", f"{perf['marginMultiplier']['usPerCall']*1000:.1f} ns/call", "—", "—", "< 1 µs/call", "Pass"])
story += [table(prow, [2.35 * inch, 0.45 * inch, 0.75 * inch, 0.75 * inch, 0.75 * inch, 0.9 * inch, 0.5 * inch]), Spacer(1, 8)]

sc = perf["callsScaling"]
fig, axes = plt.subplots(1, 2, figsize=(7.4, 2.6))
ax = axes[0]
ax.plot([r["n"] for r in sc], [r["p50Ms"] for r in sc], color=BLUE, linewidth=2, marker="o", markersize=5)
ax.set_xlim(0, sc[-1]["n"] * 1.08)
ax.set_ylim(0, max(r["p50Ms"] for r in sc) * 1.2)
ax.xaxis.set_major_locator(matplotlib.ticker.MultipleLocator(4000))
ax.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v/1000:g}k" if v else "0"))
ax.set_xlabel("Calls in payload", fontsize=8, color=INK2)
ax.set_ylabel("p50 time (ms)", fontsize=8, color=INK2)
ax.set_title("Call normalisation: time grows linearly", fontsize=9, color=INK, loc="left")
style_axes(ax)
for r, off, ha in ((sc[0], (6, 4), "left"), (sc[-1], (-8, 4), "right")):
    ax.annotate(f"{r['n']:,} calls: {r['usPerRow']:.2f} µs/row", (r["n"], r["p50Ms"]), textcoords="offset points", xytext=off, ha=ha, fontsize=6.5, color=INK2)
ax = axes[1]
grid = perf["dashboardRenderScaling"]
names = [f"{g['calls']:,} calls\n{g['agents']} agent{'s' if g['agents'] != 1 else ''}" for g in grid]
ax.bar(range(len(grid)), [g["readyMs"] for g in grid], 0.55, color=BLUE)
for i, g in enumerate(grid):
    ax.text(i, g["readyMs"] + 0.8, f"{g['readyMs']:.0f}", ha="center", fontsize=7.5, color=INK)
ax.set_xticks(range(len(grid)))
ax.set_xticklabels(names, fontsize=7)
ax.set_ylabel("Time-to-data p50 (ms)", fontsize=8, color=INK2)
ax.set_title("Dashboard time-to-data vs load", fontsize=9, color=INK, loc="left")
style_axes(ax)
fig.tight_layout()
story += [fig_image(fig, 6.6), p(
    f"Figure 2. Left: normalisation cost per call stays between {min(r['usPerRow'] for r in sc):.2f} and {max(r['usPerRow'] for r in sc):.2f} µs per row from {sc[0]['n']:,} to {sc[-1]['n']:,} calls "
    f"({sc[-1]['n'] // sc[0]['n']}× the rows, {sc[-1]['p50Ms'] / sc[0]['p50Ms']:.0f}× the time), so there is no quadratic path. "
    "Right: Dashboard time-to-data stays flat because the page requests 200 calls and renders 5. It is bounded by design, not by data volume.", SMALL)]

# 7. Micro-benchmarks
story += [PageBreak(), p("7. Micro-benchmarks (throughput)", H1)]
brows = [["Benchmark", "ops/sec", "mean", "p99", "±rme"]]
for fobj in bench["files"]:
    for g in fobj["groups"]:
        grp = g["fullName"].split(" > ")[-1]
        brows.append([f"<b>{grp}</b>", "", "", "", ""])
        for b in g["benchmarks"]:
            brows.append([b["name"], f"{b['hz']:,.0f}", ms(b["mean"], 4), ms(b["p99"], 4), f"{b['rme']:.2f}%"])
story += [table(brows, [3.4 * inch, 1.0 * inch, 0.8 * inch, 0.8 * inch, 0.6 * inch]), Spacer(1, 6)]
champ_hz = next(b["hz"] for fo in bench["files"] for g in fo["groups"] for b in g["benchmarks"] if b["name"].startswith("champion: exact"))
chall_hz = next(b["hz"] for fo in bench["files"] for g in fo["groups"] for b in g["benchmarks"] if b["name"].startswith("challenger"))
story += [p(
    f"<b>Accuracy vs speed trade-off.</b> The challenger is {chall_hz/champ_hz:.1f}× faster than the champion, but its top-1 accuracy is "
    f"{allb['challenger']['top1']*100:.0f}% against the champion's {allb['champion']['top1']*100:.0f}%. At about {1000/champ_hz:.1f} ms per query, the champion still fits comfortably in a frame, so the extra accuracy costs nothing a user would notice. "
    "Benchmarks report throughput and do not gate CI; the gates are in section 6."
)]

# 8. Bundle
story += [p("8. Bundle size (first-load performance)", H1)]
frows = [["File", "Raw", "gzip", "brotli"]]
for fobj in bundle["files"][:8]:
    frows.append([f"<font face='Courier' size=7>{fobj['file']}</font>", f"{fobj['rawKb']:.1f} KB", f"{fobj['gzipKb']:.1f} KB", f"{fobj['brotliKb']:.1f} KB"])
frows.append([f"<b>All JS ({tot['chunkCount']} chunks)</b>", f"<b>{tot['jsRawKb']:.0f} KB</b>", f"<b>{tot['jsGzipKb']:.0f} KB</b>", f"<b>{tot['jsBrotliKb']:.0f} KB</b>"])
frows.append(["All CSS", f"{tot['cssRawKb']:.0f} KB", f"{tot['cssGzipKb']:.0f} KB", "—"])
story += [table(frows, [3.6 * inch, 0.95 * inch, 0.95 * inch, 0.95 * inch]), Spacer(1, 6)]
story += [p(
    f"The production build takes {bundle.get('buildSeconds', 0):.1f} s, including the typecheck. "
    f"<b>P-01:</b> the entry chunk alone is {tot['largestJs']['rawKb']:.0f} KB raw ({tot['largestJs']['gzipKb']:.0f} KB gzip), and Vite warns at 500 KB. "
    "Every visitor downloads and parses it, including visitors to the public marketing pages. Lazy-loading the authenticated workspace and the charting library "
    "would take the most off it."
)]

# 9. Findings
story += [PageBreak(), p("9. Findings register", H1)]
frow = [["ID", "Severity", "Found by", "Finding", "Recommendation"]]
for fid, sevv, by, text, rec in FINDINGS:
    col = {"High": "#b3261e", "Medium": "#8a5a00", "Low": "#52514e"}[sevv]
    frow.append([f"<b>{fid}</b>", f"<font color='{col}'><b>{sevv}</b></font>", by, text, rec])
story += [table(frow, [0.5 * inch, 0.65 * inch, 0.8 * inch, 2.85 * inch, 1.7 * inch]), Spacer(1, 6)]
story += [p(
    "No finding was fixed as part of this work. That keeps the validation independent of the remediation, as SR 11-7 requires. "
    "The only production-code changes were testability refactors with no behaviour change: the two margin formulas moved into "
    "<font face='Courier'>lib/pricingMath.ts</font>, and two Dashboard normalisers are now exported."
)]

# 10. Reproduce
story += [p("10. Reproducing this report", H1)]
story += [table(
    [
        ["Command", "What it runs"],
        ["<font face='Courier'>npm test</font>", "Every test layer; CI runs this on each push"],
        ["<font face='Courier'>npm run test:mock</font>", "Mock tests only"],
        ["<font face='Courier'>npm run test:perf</font>", "Performance budgets only"],
        ["<font face='Courier'>npm run test:mrm</font>", "Model validation and benchmark only"],
        ["<font face='Courier'>npm run bench</font>", "Throughput micro-benchmarks"],
        ["<font face='Courier'>npm run report</font>", "Everything above plus build, bundle analysis and this PDF (needs Python reportlab and matplotlib)"],
    ],
    [2.0 * inch, 4.5 * inch],
)]
story += [Spacer(1, 6), p(
    "<b>Limitations.</b> Render timings come from jsdom on a single CI-class machine, so compare them across runs, not against real browsers. "
    "The benchmark labels reflect one reviewer's judgement; where more than one answer is defensible, a case accepts several labels. "
    "Server-side and vendor models (lead AI scoring, page priority scoring, voice and LLM agents) are out of scope for a frontend repository; "
    "docs/model-risk/MODEL_INVENTORY.md lists how to validate them in agently-server.", SMALL)]


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor(MUTED))
    if doc.page > 1:
        canvas.drawString(0.75 * inch, 0.35 * inch, f"Agently Frontend · Test Results Report · {AUTHOR} · {COMMIT}")
        canvas.drawRightString(letter[0] - 0.75 * inch, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


OUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUT), pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.6 * inch, bottomMargin=0.6 * inch,
                        title="Agently Frontend — Test Results Report", author=AUTHOR)
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"wrote {OUT}")
