// Schema C — stress refresh / horizon-panjang (GENERATOR INDEPENDEN).
// Run: node tools/schema-c.mjs
// Grid: future pool multiple {~1.1, 2, 6, 20} x future refreshes {0,1,3}
//   x gammaTrue {0, 0.5, 1}, plus lag sweep {12,24,48}h, saturation-off,
//   and a refresh-akhir case (pool x6 one hour before the target).
// Past history is fixed at 2 refreshes ([0.6, 0.6]) so every scenario has
// 3 epochs and an estimable gamma. Truth is the latent rate at
// (target - lag). Prints a JSON summary to stdout and a table to stderr.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSynthetic } from "./synth.mjs";
import { scoreForecast } from "./score.mjs";
import { runEntry } from "./util.mjs";

const POOL_COMBOS = [
  { name: "pool~1.1/ref0", futureJumps: [] },
  { name: "poolx2/ref1", futureJumps: [0.6] },
  { name: "poolx6/ref1", futureJumps: [1.7] },
  { name: "poolx6/ref3", futureJumps: [0.57, 0.57, 0.57] },
  { name: "poolx20/ref1", futureJumps: [2.91] },
  { name: "poolx20/ref3", futureJumps: [0.97, 0.97, 0.97] },
];

function groupOf(trophy) {
  if (trophy.id === 2) return "saturated #2";
  if (trophy.tier === "platinum") return "platinum #1";
  if (trophy.tier === "gold") return "gold";
  if (trophy.tier === "silver") return "silver";
  const d = trophy.description;
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "bronze story";
  if (/\d/.test(d)) return "bronze grind";
  return "bronze other";
}

function groupLosses(truth, rows, trophies) {
  const acc = new Map();
  for (let i = 0; i < truth.length; i++) {
    const q = rows.find((r) => r.id === trophies[i].id)?.q;
    if (!q) continue;
    const g = groupOf(trophies[i]);
    const a = acc.get(g) ?? { sum: 0, n: 0 };
    // Reuse the pinball mean over taus for this trophy.
    let tl = 0;
    for (let j = 0; j < 5; j++) {
      const tau = [0.05, 0.25, 0.5, 0.75, 0.95][j];
      const clamp = (x) => Math.min(99.99, Math.max(0.01, x));
      const d =
        Math.log(clamp(truth[i]) / (100 - clamp(truth[i]))) -
        Math.log(clamp(q[j]) / (100 - clamp(q[j])));
      tl += 2 * Math.max(tau * d, (tau - 1) * d);
    }
    a.sum += tl / 5;
    a.n += 1;
    acc.set(g, a);
  }
  const out = {};
  for (const [g, a] of acc) out[g] = Math.round((a.sum / a.n) * 1e6) / 1e6;
  return out;
}

const root = mkdtempSync(join(tmpdir(), "trophy-schema-c-"));
const results = [];
let seed = 100;

function runOne(label, opts) {
  const { caseObj, truth, meta } = buildSynthetic({
    seed: seed++,
    pastJumps: [0.6, 0.6],
    organicPerDay: 0.02,
    gammaTrue: 0.5,
    id: "f00",
    ...opts,
  });
  const inDir = join(root, `in-${results.length}`);
  const outDir = join(root, `out-${results.length}`);
  mkdirSync(inDir, { recursive: true });
  writeFileSync(join(inDir, "f00.in"), JSON.stringify(caseObj));
  const run = runEntry(inDir, outDir);
  const parsed = JSON.parse(readFileSync(join(outDir, "f00.out"), "utf8"));
  const scored = scoreForecast(truth, parsed.trophies);
  const rec = {
    scenario: label,
    loss: scored.loss,
    coverage90: Math.round(scored.coverage90 * 1000) / 1000,
    worstTrophyLoss: scored.worstTrophyLoss,
    worstTrophyId: scored.worstTrophyId,
    poolMultiple: Math.round(meta.poolMultiple * 100) / 100,
    epochs: meta.epochs,
    gammaTrue: opts.gammaTrue ?? 0.5,
    lagHours: opts.lagHours ?? 0,
    satOff: !!opts.satOff,
    finalJump: !!opts.finalJumpLog,
    runtimeMs: Math.round(Math.max(run.ms1, run.ms2)),
    groupLosses: groupLosses(truth, parsed.trophies, caseObj.trophies),
  };
  results.push(rec);
  console.error(
    `${label.padEnd(28)} loss=${String(rec.loss).padEnd(9)} cov90=${rec.coverage90} ` +
      `worstTrophy=${rec.worstTrophyLoss} (id ${rec.worstTrophyId}) poolX=${rec.poolMultiple} ` +
      `sat#2loss=${rec.groupLosses["saturated #2"]}`,
  );
  return rec;
}

// Core grid: pool x gamma.
for (const combo of POOL_COMBOS) {
  for (const g of [0, 0.5, 1]) {
    runOne(`${combo.name}/gamma${g}`, {
      futureJumps: combo.futureJumps,
      gammaTrue: g,
    });
  }
}
// Lag sweep on the central scenario (poolx6/ref3, gamma 0.5).
for (const lag of [12, 24, 48]) {
  runOne(`poolx6/ref3/gamma0.5/lag${lag}h`, {
    futureJumps: [0.57, 0.57, 0.57],
    gammaTrue: 0.5,
    lagHours: lag,
  });
}
// Saturation off on the central scenario.
runOne("poolx6/ref3/gamma0.5/satOff", {
  futureJumps: [0.57, 0.57, 0.57],
  gammaTrue: 0.5,
  satOff: true,
});
// Refresh-akhir: pool x6 one hour before the target.
runOne("refresh-akhir poolx6@-1h", {
  futureJumps: [0.57, 0.57, 0.57],
  gammaTrue: 0.5,
  finalJumpLog: 1.8,
});

const losses = results.map((r) => r.loss);
const mean = losses.reduce((a, b) => a + b, 0) / losses.length;
const worst = results.reduce((a, b) => (b.loss > a.loss ? b : a), results[0]);
const covMean =
  results.reduce((a, b) => a + b.coverage90, 0) / results.length;
const under005 = results.filter((r) => r.loss < 0.05).length;
// K7: gamma sensitivity per pool combo (relative |loss g1 - loss g0| / loss g0).
const k7 = [];
for (const combo of POOL_COMBOS) {
  const g0 = results.find(
    (r) => r.scenario === `${combo.name}/gamma0`,
  );
  const g1 = results.find(
    (r) => r.scenario === `${combo.name}/gamma1`,
  );
  if (g0 && g1) {
    k7.push({
      combo: combo.name,
      lossGamma0: g0.loss,
      lossGamma1: g1.loss,
      relDiff: Math.round((Math.abs(g1.loss - g0.loss) / g0.loss) * 1000) / 10,
    });
  }
}
const summary = {
  scenarios: results.length,
  meanLoss: Math.round(mean * 1e6) / 1e6,
  worstLoss: worst.loss,
  worstScenario: worst.scenario,
  worstGroupLosses: worst.groupLosses,
  coverage90Mean: Math.round(covMean * 1000) / 1000,
  scenariosUnder005: under005,
  k7GammaSensitivityPct: k7,
  k7MaxRelDiffPct: Math.max(...k7.map((k) => k.relDiff)),
  results,
};
console.log(JSON.stringify(summary, null, 2));
