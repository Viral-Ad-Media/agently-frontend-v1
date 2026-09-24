#!/usr/bin/env bash
# Runs every test layer, collects the metrics, and renders the PDF test report.
#
#   npm run report      →  reports/agently-test-report.pdf
#
# Needs Python 3 with reportlab and matplotlib for the PDF step
# (pip install reportlab matplotlib).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf reports && mkdir -p reports/metrics

echo "▶ 1/4 unit, mock, model-validation and performance tests"
PERF_REPORT=1 npx vitest run --reporter=default --reporter=json --outputFile.json=reports/metrics/tests.json

echo "▶ 2/4 micro-benchmarks"
npx vitest bench --run --outputJson reports/metrics/bench.json >/dev/null

echo "▶ 3/4 production build + bundle size"
start=$(date +%s.%N)
npm run build >/dev/null
end=$(date +%s.%N)
node scripts/bundle-report.mjs reports/metrics/bundle.json
python3 -c "import json,sys;d=json.load(open('reports/metrics/bundle.json'));d['buildSeconds']=float(sys.argv[2])-float(sys.argv[1]);json.dump(d,open('reports/metrics/bundle.json','w'),indent=2)" "$start" "$end"

echo "▶ 4/4 PDF"
python3 scripts/make_test_report_pdf.py reports/metrics reports/agently-test-report.pdf
echo "✓ reports/agently-test-report.pdf"
