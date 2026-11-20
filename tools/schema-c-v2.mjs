// Schema C v2 — extended stress harness (66 new scenarios).
// Run: node tools/schema-c-v2.mjs
//   (run it from a scratch copy of the entry repo to measure a frozen
//   build; see schema-c-v2-extended.md in the concept dir for the commands.)
//
// Families (each targets a measured v1 failure mode; see the report):
//   A satStop48   — bronze trophies stop growing after day 2, at frozen
//                   ceiling levels x1 / x3 / x10 (+ a no-freeze x10 control)
//   B refresh-end — pool x2 / x6 / x18 exactly 1h before the target
//   C lag x ref   — snapshot lag {0,12,24,48}h crossed with future
//                   refreshes {0,1,3}
//   D regime      — two-regime pool (launch spike vs steady) vs one-regime
//   E lowcount    — Poisson noise on the truth of 1-5 earner trophies
//   F nearsat     — near-saturated trophies (E/P >= 0.99) tracking the pool
//   G platinum    — platinum E=4 small-count noise
//   H gamma grid  — gamma {0,0.5,1} x pool cap {x20,x50,none}
//                   x refresh rate {0.5,1,3,5} per 4.6 days
//
// Families B and C reuse the v1 generator (tools/synth.mjs) unchanged;
// families A, D, E, F, G, H use the second generator in
// tools/schema-c-v2-gen.mjs, which expresses dimensions the v1 generator
// cannot. Scoring is the v1 pinball scorer (tools/score.mjs), i.e. RULES.
// The entry runner below is written here (not imported) so the build under
// test can be pointed at with SCHEMA_C_V2_ENTRY_ROOT instead of the
// directory this file happens to live in.
//
// Env: SCHEMA_C_V2_ENTRY_ROOT (default: the repo root above tools/),
//      SCHEMA_C_V2_OUT_JSON (optional path to also write the JSON summary).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSynthetic } from "./synth.mjs";
import { scoreForecast } from "./score.mjs";
import { buildSyntheticV2 } from "./schema-c-v2-gen.mjs";

const ENTRY_ROOT =
  process.env.SCHEMA_C_V2_ENTRY_ROOT ??
  new URL("..", import.meta.url).pathname;
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const CENTRAL_JUMPS = [0.57, 0.57, 0.57]; // pool x6 in 3 refreshes
const PAST = [0.6, 0.6]; // 2 past refreshes -> 3 epochs, gamma estimable

// Run `node main.ts` in ENTRY_ROOT against one input dir, twice, timing
// each run and comparing output bytes. Throws when the entry crashes or
// writes no output.
function runEntryTwice(inputDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const env = {
    ...process.env,
    MAKEFUN_INPUT_DIR: inputDir,
    MAKEFUN_OUTPUT_DIR: outputDir,
  };
  const hashes = [];
  const ms = [];
  for (let run = 0; run < 2; run++) {
    const t0 = process.hrtime.bigint();
    execFileSync("node", ["main.ts"], { cwd: ENTRY_ROOT, env, stdio: "pipe" });
    ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const outFile = join(outputDir, "f00.out");
    const bytes = readFileSync(outFile);
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }
  return { ms1: ms[0], ms2: ms[1], deterministic: hashes[0] === hashes[1] };
}

function kindOf(trophy) {
  const d = trophy.description || "";
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "bronze-story";
  if (/\d/.test(d)) return "bronze-grind";
  return "bronze-other";
}

function groupOf(trophy) {
  if (trophy.id === 2) return "#2 saturated";
  if (trophy.tier === "platinum") return "#1 platinum";
  if (trophy.tier === "gold") return "gold";
  if (trophy.tier === "silver") return "silver";
  return kindOf(trophy);
}

// Mean per-trophy pinball loss per group (own implementation of the RULES
// formula: clamp [0.01, 99.99], logit difference, 2*max(tau*d, (tau-1)*d)).
function groupLosses(truth, rows, trophies) {
  const acc = new Map();
  const clamp = (x) => Math.min(99.99, Math.max(0.01, x));
  const logit = (x) => Math.log(clamp(x) / (100 - clamp(x)));
  for (let i = 0; i < truth.length; i++) {
    const q = rows.find((r) => r.id === trophies[i].id)?.q;
    if (!q) continue;
    let tl = 0;
    for (let j = 0; j < LEVELS.length; j++) {
      const d = logit(truth[i]) - logit(q[j]);
      tl += 2 * Math.max(LEVELS[j] * d, (LEVELS[j] - 1) * d);
    }
    const g = groupOf(trophies[i]);
    const a = acc.get(g) ?? { sum: 0, n: 0 };
    a.sum += tl / LEVELS.length;
    a.n += 1;
    acc.set(g, a);
  }
  const out = {};
  for (const [g, a] of acc) out[g] = Math.round((a.sum / a.n) * 1e6) / 1e6;
  return out;
}

const root = mkdtempSync(join(tmpdir(), "trophy-schema-c-v2-"));
const results = [];
let seed = 1000;

function runOne(label, family, generator, opts) {
  const built = generator({
    seed: seed++,
    pastJumps: PAST,
    organicPerDay: 0.02,
    gammaTrue: 0.5,
    id: "f00",
    ...opts,
  });
  const { caseObj, truth, meta } = built;
  const n = results.length;
  const inDir = join(root, `in-${n}`);
  const outDir = join(root, `out-${n}`);
  mkdirSync(inDir, { recursive: true });
  writeFileSync(join(inDir, "f00.in"), JSON.stringify(caseObj));
  const run = runEntryTwice(inDir, outDir);
  const parsed = JSON.parse(readFileSync(join(outDir, "f00.out"), "utf8"));
  const scored = scoreForecast(truth, parsed.trophies);
  const rec = {
    scenario: label,
    family,
    loss: scored.loss,
    coverage90: Math.round(scored.coverage90 * 1000) / 1000,
    worstTrophyLoss: scored.worstTrophyLoss,
    worstTrophyId: scored.worstTrophyId,
    poolMultiple: Math.round(meta.poolMultiple * 100) / 100,
    epochs: meta.epochs,
    gammaTrue: opts.gammaTrue ?? 0.5,
    lagHours: opts.lagHours ?? 0,
    runtimeMs: Math.round(Math.max(run.ms1, run.ms2)),
    deterministic: run.deterministic,
    groupLosses: groupLosses(truth, parsed.trophies, caseObj.trophies),
  };
  results.push(rec);
  console.error(
    `${label.padEnd(34)} loss=${String(rec.loss).padEnd(9)} cov90=${rec.coverage90} ` +
      `worstTrophy=${rec.worstTrophyLoss} (id ${rec.worstTrophyId}) poolX=${rec.poolMultiple} ` +
      `story=${rec.groupLosses["bronze-story"]} plat=${rec.groupLosses["#1 platinum"]} ` +
      `sat#2=${rec.groupLosses["#2 saturated"]}`,
  );
  return rec;
}

// ---- Family A: saturation stop after day 2 (v2 generator) ----
for (const m of [1, 3, 10]) {
  runOne(`A satStop48/ceilx${m}`, "A", buildSyntheticV2, {
    futureJumps: CENTRAL_JUMPS,
    gammaTrue: 0.5,
    freezeAfterHour: 48,
    ceilMult: m,
  });
}
runOne("A satCeilx10/nofreeze", "A", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 0.5,
  ceilMult: 10,
});

// ---- Family B: refresh-end at several magnitudes (v1 generator) ----
for (const fj of [0.7, 1.8, 2.9]) {
  runOne(`B refresh-end/x${Math.round(Math.exp(fj))}@-1h`, "B", buildSynthetic, {
    futureJumps: CENTRAL_JUMPS,
    gammaTrue: 0.5,
    finalJumpLog: fj,
  });
}

// ---- Family C: lag {0,12,24,48}h x refresh {0,1,3} (v1 generator) ----
for (const lag of [0, 12, 24, 48]) {
  for (const ref of [0, 1, 3]) {
    const jumps = ref === 0 ? [] : ref === 1 ? [1.7] : CENTRAL_JUMPS;
    runOne(`C lag${lag}h/ref${ref}`, "C", buildSynthetic, {
      futureJumps: jumps,
      gammaTrue: 0.5,
      lagHours: lag,
    });
  }
}

// ---- Family D: two-regime vs one-regime pool (v2 generator) ----
runOne("D regime/one/gamma0.5", "D", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 0.5,
  twoRegime: false,
});
runOne("D regime/two/gamma0.5", "D", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 0.5,
  twoRegime: true,
});
runOne("D regime/two/gamma0", "D", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 0,
  twoRegime: true,
});
runOne("D regime/two/gamma1", "D", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 1,
  twoRegime: true,
});

// ---- Family E: low-count (1-5 earners) Poisson noise (v2 generator) ----
for (const s of [201, 202]) {
  runOne(`E lowcount-noise/central/seed${s}`, "E", buildSyntheticV2, {
    futureJumps: CENTRAL_JUMPS,
    gammaTrue: 0.5,
    smallCountNoise: true,
    seed: s,
  });
}
runOne("E lowcount-noise/norefresh/seed201", "E", buildSyntheticV2, {
  futureJumps: [],
  gammaTrue: 0.5,
  smallCountNoise: true,
  seed: 201,
});

// ---- Family F: near-saturated trophies tracking the pool (v2 generator) ----
runOne("F nearsat/central", "F", buildSyntheticV2, {
  futureJumps: CENTRAL_JUMPS,
  gammaTrue: 0.5,
  nearSat: true,
});
runOne("F nearsat/norefresh", "F", buildSyntheticV2, {
  futureJumps: [],
  gammaTrue: 0.5,
  nearSat: true,
});

// ---- Family G: platinum E=4 small-count noise (v2 generator) ----
for (const s of [301, 302]) {
  runOne(`G platinum-E4-noise/seed${s}`, "G", buildSyntheticV2, {
    futureJumps: CENTRAL_JUMPS,
    gammaTrue: 0.5,
    platinumNoise: true,
    seed: s,
  });
}

// ---- Family H: gamma x pool cap x refresh rate (v2 generator) ----
// Refresh rate per 4.6 days -> future jumps: 0.5 = one half-size jump,
// 1 = one x6 jump, 3 = three x6 jumps, 5 = five x6 jumps. The pool cap
// (x20 / x50 / none) shrinks the future jumps so the future pool multiple
// cannot exceed it.
const RATE_JUMPS = {
  0.5: [0.9],
  1: [1.8],
  3: [1.8, 1.8, 1.8],
  5: [1.8, 1.8, 1.8, 1.8, 1.8],
};
for (const g of [0, 0.5, 1]) {
  for (const cap of [20, 50, null]) {
    for (const rate of [0.5, 1, 3, 5]) {
      runOne(
        `H gamma${g}/cap${cap ?? "none"}/rate${rate}`,
        "H",
        buildSyntheticV2,
        {
          futureJumps: RATE_JUMPS[rate],
          gammaTrue: g,
          poolCap: cap,
        },
      );
    }
  }
}

// ---- Summary ----
const losses = results.map((r) => r.loss);
const mean = losses.reduce((a, b) => a + b, 0) / losses.length;
const worst = results.reduce((a, b) => (b.loss > a.loss ? b : a), results[0]);
const best = results.reduce((a, b) => (b.loss < a.loss ? b : a), results[0]);
const covMean =
  results.reduce((a, b) => a + b.coverage90, 0) / results.length;
const under005 = results.filter((r) => r.loss < 0.05).length;
const nonDeterministic = results.filter((r) => !r.deterministic).length;

const byFamily = {};
for (const fam of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
  const rows = results.filter((r) => r.family === fam);
  if (!rows.length) continue;
  const m = rows.reduce((a, b) => a + b.loss, 0) / rows.length;
  const w = rows.reduce((a, b) => (b.loss > a.loss ? b : a), rows[0]);
  byFamily[fam] = {
    scenarios: rows.length,
    meanLoss: Math.round(m * 1e6) / 1e6,
    worstLoss: w.loss,
    worstScenario: w.scenario,
  };
}

// Refresh-end family (B) on its own: K3's < 0.30 refresh-end criterion.
const refreshEnd = results
  .filter((r) => r.family === "B")
  .map((r) => ({ scenario: r.scenario, loss: r.loss }));

// K7-style gamma sensitivity inside family H: per (cap, rate), the
// relative |loss(gamma1) - loss(gamma0)| / loss(gamma0).
const k7 = [];
for (const cap of [20, 50, null]) {
  for (const rate of [0.5, 1, 3, 5]) {
    const g0 = results.find(
      (r) => r.scenario === `H gamma0/cap${cap ?? "none"}/rate${rate}`,
    );
    const g1 = results.find(
      (r) => r.scenario === `H gamma1/cap${cap ?? "none"}/rate${rate}`,
    );
    if (g0 && g1) {
      k7.push({
        cap: cap ?? "none",
        rate,
        lossGamma0: g0.loss,
        lossGamma1: g1.loss,
        relDiffPct:
          Math.round((Math.abs(g1.loss - g0.loss) / g0.loss) * 1000) / 10,
      });
    }
  }
}

const summary = {
  entryRoot: ENTRY_ROOT,
  scenarios: results.length,
  meanLoss: Math.round(mean * 1e6) / 1e6,
  worstLoss: worst.loss,
  worstScenario: worst.scenario,
  bestLoss: best.loss,
  bestScenario: best.scenario,
  coverage90Mean: Math.round(covMean * 1000) / 1000,
  scenariosUnder005: under005,
  nonDeterministicRuns: nonDeterministic,
  byFamily,
  refreshEnd,
  k7GammaSensitivityPct: k7,
  k7MaxRelDiffPct: Math.max(...k7.map((k) => k.relDiffPct)),
  results,
};
const json = JSON.stringify(summary, null, 2);
console.log(json);
if (process.env.SCHEMA_C_V2_OUT_JSON) {
  writeFileSync(process.env.SCHEMA_C_V2_OUT_JSON, json + "\n");
}
