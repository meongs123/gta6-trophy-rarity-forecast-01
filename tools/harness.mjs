// v1 harness (GATE): synthetic multi-epoch f00 cases + edge cases.
// One case failing = STOP, do not bundle. Run:
//   node tools/harness.mjs
// Exit code 0 only when every case is valid, deterministic and fast.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSynthetic } from "./synth.mjs";
import { scoreForecast, validateOutput } from "./score.mjs";
import { runEntry } from "./util.mjs";

const BASE = { seed: 7, organicPerDay: 0.02, gammaTrue: 0.5 };

const CASES = [
  {
    name: "H1 multi-epoch f00 (2 past refreshes, future pool x6)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85] },
  },
  {
    name: "H2 null trophies (one null in epoch 1, one null everywhere)",
    opts: {
      ...BASE,
      id: "f00",
      pastJumps: [0.6, 0.6],
      futureJumps: [0.85, 0.85],
      nullAllIds: [55],
      nullSome: { 20: [1] },
    },
  },
  {
    name: "H3 rate 0% (trophy 14 forced to zero earners)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85], zeroIds: [14] },
  },
  {
    name: "H4 large pool P0=100000 (inversion ambiguity)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85], p0: 100000 },
  },
  {
    name: "H5 one past refresh x6 + future pool x2",
    opts: { ...BASE, id: "f00", pastJumps: [1.8], futureJumps: [0.6] },
  },
  {
    name: "H6 no refresh at all (single epoch, 2 days)",
    opts: { ...BASE, id: "f00", pastJumps: [], futureJumps: [] },
  },
  {
    name: "H7 only 10 trophies (no hardcoding of 55)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85], trophyCount: 10 },
  },
  {
    name: "H8 gamma=0 world (earners ignore refreshes)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85], gammaTrue: 0 },
  },
  {
    name: "H9 gamma=1 world (earners follow pool fully)",
    opts: { ...BASE, id: "f00", pastJumps: [0.6, 0.6], futureJumps: [0.85, 0.85], gammaTrue: 1 },
  },
];

let failures = 0;
const root = mkdtempSync(join(tmpdir(), "trophy-harness-"));
for (const { name, opts } of CASES) {
  const { caseObj, truth, meta } = buildSynthetic(opts);
  const inDir = join(root, opts.id + "-in-" + name.replace(/[^A-Za-z0-9]+/g, "-"));
  const outDir = join(root, opts.id + "-out-" + name.replace(/[^A-Za-z0-9]+/g, "-"));
  mkdirSync(inDir, { recursive: true });
  writeFileSync(join(inDir, `${caseObj.id}.in`), JSON.stringify(caseObj));
  let result;
  try {
    result = runEntry(inDir, outDir);
  } catch (e) {
    console.log(`FAIL ${name}: entry crashed: ${e.message}`);
    failures++;
    continue;
  }
  const outFile = join(outDir, `${caseObj.id}.out`);
  const bytes = readFileSync(outFile);
  const parsed = JSON.parse(bytes.toString("utf8"));
  const problems = validateOutput(
    parsed,
    caseObj.trophies.length,
    caseObj.trophies.map((t) => t.id),
  );
  if (bytes.length > 65536) problems.push(`output ${bytes.length} bytes > 65536`);
  const scored = scoreForecast(truth, parsed.trophies);
  const satRow = parsed.trophies.find((r) => r.id === 2);
  const satOk =
    caseObj.trophies.some((t) => t.id === 2) &&
    satRow !== undefined &&
    satRow.q[2] === 99.99;
  if (!satOk) problems.push("saturated trophy #2 median is not 99.99");
  const slow = Math.max(result.ms1, result.ms2) > 8000;
  if (slow) problems.push(`runtime ${result.ms1.toFixed(0)}/${result.ms2.toFixed(0)} ms > 8000`);
  if (!result.deterministic) problems.push("non-deterministic output");
  const status = problems.length === 0 ? "PASS" : "FAIL";
  if (problems.length > 0) failures++;
  console.log(
    `${status} ${name} | epochs=${meta.epochs} refreshes=${meta.refreshes} ` +
      `poolMultiple=${meta.poolMultiple.toFixed(2)} loss=${scored.loss} ` +
      `cov90=${scored.coverage90.toFixed(2)} runtime=${result.ms1.toFixed(0)}/${result.ms2.toFixed(0)}ms ` +
      `deterministic=${result.deterministic} bytes=${bytes.length}` +
      (problems.length ? ` | ${problems.join("; ")}` : ""),
  );
}

console.log(
  failures === 0
    ? `\nHARNESS GREEN: ${CASES.length}/${CASES.length} cases passed`
    : `\nHARNESS RED: ${failures}/${CASES.length} cases failed — STOP, do not bundle`,
);
process.exit(failures === 0 ? 0 : 1);
