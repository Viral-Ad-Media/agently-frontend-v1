#!/usr/bin/env node
/**
 * Bundle-size metrics for the test report: raw, gzip and brotli size of every
 * file vite emitted into dist/. Transfer size (gzip/brotli) is what a tenant on
 * a phone actually downloads; raw size is what the browser has to parse.
 *
 * Usage: node scripts/bundle-report.mjs [outFile]   (run after `vite build`)
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";

const out = process.argv[2] || "reports/metrics/bundle.json";
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk("dist")
  .filter((p) => /\.(js|css|html)$/.test(p))
  .map((p) => {
    const buf = readFileSync(p);
    return {
      file: relative("dist", p),
      type: p.split(".").pop(),
      rawKb: buf.length / 1024,
      gzipKb: gzipSync(buf, { level: 9 }).length / 1024,
      brotliKb: brotliCompressSync(buf).length / 1024,
    };
  })
  .sort((a, b) => b.rawKb - a.rawKb);

const sum = (type, key) => files.filter((f) => !type || f.type === type).reduce((s, f) => s + f[key], 0);
const report = {
  files,
  totals: {
    jsRawKb: sum("js", "rawKb"),
    jsGzipKb: sum("js", "gzipKb"),
    jsBrotliKb: sum("js", "brotliKb"),
    cssRawKb: sum("css", "rawKb"),
    cssGzipKb: sum("css", "gzipKb"),
    chunkCount: files.filter((f) => f.type === "js").length,
    largestJs: files.find((f) => f.type === "js"),
  },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`JS ${report.totals.jsRawKb.toFixed(0)} KB raw / ${report.totals.jsGzipKb.toFixed(0)} KB gzip across ${report.totals.chunkCount} chunks → ${out}`);
