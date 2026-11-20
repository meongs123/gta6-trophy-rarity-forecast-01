// Schema C v2 — independent synthetic generator (SECOND generator).
//
// Why a second generator: the v1 generator (tools/synth.mjs) only offers a
// boolean saturation switch, a single organic pool rate, and no count noise,
// so it cannot express the v2 stress families: trophies that STOP growing
// after day 2 at a graded frozen level, a two-regime pool (launch spike vs
// steady state), Poisson noise on 1-5 earner trophies, near-saturated
// trophies tracking the pool, a small-count platinum, or a cap on the future
// pool multiple. This file implements those dimensions from scratch.
//
// Independence (R-7): the functional form differs from the entry model AND
// from the v1 generator — ceilings are derived from each trophy's own
// starting rate in the kit data (not from the v1 generator's constants),
// the pool is two-regime with a switch hour, jumps are placed by a
// different jitter rule, and small-count truth is a Poisson draw. All
// parameters come from RULES / verified kit numbers (refresh 638 -> 3868,
// jump log 1.80; horizon 6510 min; deadline 2026-11-21T11:30:00Z; target
// 2026-11-26T00:00:00Z). Nothing here reads the entry model.
//
// Interface: buildSyntheticV2(opts) -> { caseObj, truth, meta }, the same
// shape the v1 generator returns, so one runner can score both.
//
// opts:
//   seed, pastJumps (log sizes, visible in history), futureJumps (log sizes,
//   deadline -> target, invisible to the entry), gammaTrue, lagHours,
//   finalJumpLog (0 = none; jump lands 1h before target),
//   organicPerDay (steady organic pool growth), launchPerDay (organic pool
//   growth before switchHour), switchHour (launch -> steady switch, hours
//   since 2026-11-19T00:00:00Z), twoRegime (false = one organic rate),
//   ceilMult (multiplier on every trophy's ceiling share),
//   freezeAfterHour (null = no freeze; else bronze earners stop growing
//   after this hour — the "stop after day 2" family),
//   nearSat (true = the 3 highest-rate bronze story trophies get a 0.995
//   ceiling and track the pool), smallCountNoise (true = Poisson jitter on
//   the truth for trophies with <= 5 latent earners),
//   platinumNoise (true = Poisson jitter on trophy #1's truth only),
//   poolCap (null = none; else the future pool multiple P_target/P_deadline
//   is capped by shrinking future jump sizes), p0, trophyCount, id.

import { readFileSync } from "node:fs";

const KIT_P00 = new URL(
  "../../gta6-trophy-rarity-forecast-01-kit/gta6-trophy-rarity-forecast-01-kit/input/p00.in",
  import.meta.url,
);

export function loadKitBaseV2() {
  return JSON.parse(readFileSync(KIT_P00, "utf8"));
}

// Small deterministic RNG (LCG) — seeded, no Math.random anywhere.
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Knuth's algorithm for a Poisson draw (lambda small here, <= ~5).
function poissonDraw(rng, lambda) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

const LAUNCH0 = Date.parse("2026-11-19T00:00:00Z");

function isoAt(hoursSinceLaunch) {
  const ms = LAUNCH0 + hoursSinceLaunch * 3600000;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

function kindOf(trophy) {
  const d = trophy.description || "";
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "story";
  if (/\d/.test(d)) return "grind";
  return "other";
}

// Ceiling share + logistic speed, derived from the trophy's OWN starting
// rate in the kit data: ceiling = mult * initial share, so a trophy that
// starts rare stays rare and a trophy that starts common can climb. The
// multipliers below are generator parameters (documented, tunable), not
// model parameters.
const CEIL_MULT = {
  story: 6,
  grind: 3,
  other: 4,
  silver: 2,
  gold: 1.5,
  platinum: 1.2,
};
const SPEED_DAY = {
  story: 1.0,
  grind: 0.4,
  other: 0.6,
  silver: 0.5,
  gold: 0.35,
  platinum: 0.25,
};

function ceilingFor(trophy, rate0, ceilMult) {
  if (trophy.id === 2) return { share: 1.0, speed: 3.0 };
  let key = kindOf(trophy);
  if (trophy.tier === "platinum") key = "platinum";
  else if (trophy.tier === "gold") key = "gold";
  else if (trophy.tier === "silver") key = "silver";
  const share = Math.min(0.995, CEIL_MULT[key] * (rate0 / 100) * ceilMult);
  return { share, speed: SPEED_DAY[key] };
}

export function buildSyntheticV2(opts) {
  const base = loadKitBaseV2();
  const nT = opts.trophyCount ?? 55;
  const trophies = base.trophies.slice(0, nT);
  const p0 = opts.p0 ?? 638;
  const rates0 = base.history[0].rates.slice(0, nT);
  const rng = makeRng(opts.seed ?? 1);

  const tStart = 2.5; // last kit read 02:30Z, hours since launch midnight
  const tDeadline = 59.5; // 2026-11-21T11:30:00Z
  const tTarget = 168; // 2026-11-26T00:00:00Z
  const dt = 0.5; // simulation step, hours
  const gamma = opts.gammaTrue ?? 0.5;
  const steadyPerDay = opts.organicPerDay ?? 0.02;
  const launchPerDay = opts.launchPerDay ?? 0.25;
  const switchHour = opts.switchHour ?? 48; // launch spike ends 21 Nov 00:00Z
  const twoRegime = opts.twoRegime ?? false;
  const ceilMult = opts.ceilMult ?? 1;
  const freezeAfter = opts.freezeAfterHour ?? null;

  // Latent state.
  let pLat = p0;
  const eLat = rates0.map((r) => Math.max(0, Math.round(((r ?? 0) / 100) * p0)));
  const params = trophies.map((t, i) => ceilingFor(t, rates0[i] ?? 0, ceilMult));

  // Near-saturated family: the 3 highest-rate bronze story trophies get a
  // 0.995 ceiling and a fast approach, so E/P >= 0.99 by the target and the
  // forecast must track the pool instead of its own trend.
  if (opts.nearSat) {
    const cands = trophies
      .map((t, i) => ({ t, i, r: rates0[i] ?? 0 }))
      .filter((c) => c.t.tier === "bronze" && kindOf(c.t) === "story")
      .sort((a, b) => b.r - a.r)
      .slice(0, 3);
    for (const c of cands) params[c.i] = { share: 0.995, speed: 2.0 };
  }

  const satIdx = trophies.findIndex((t) => t.id === 2);
  const platIdx = trophies.findIndex((t) => t.id === 1);

  // Pool cap: shrink FUTURE jump sizes (before the sim) so the future pool
  // multiple cannot exceed poolCap. The future organic leg is steady-rate
  // in both regimes (the switch hour precedes the deadline), so it is
  // accounted for exactly here.
  const pastJumps = opts.pastJumps ?? [];
  let futureJumps = [...(opts.futureJumps ?? [])];
  if (opts.finalJumpLog) futureJumps = [...futureJumps, opts.finalJumpLog];
  if (opts.poolCap) {
    const futureDays = (tTarget - tDeadline) / 24;
    const organicFutureLog = steadyPerDay * futureDays;
    const rawLog = futureJumps.reduce((a, b) => a + b, 0);
    const allowed = Math.log(opts.poolCap) - organicFutureLog;
    if (rawLog > 0 && allowed < rawLog) {
      const f = Math.max(0, allowed / rawLog);
      futureJumps = futureJumps.map((j) => j * f);
    }
  }

  // Refresh times: past jumps spread over [tStart, tDeadline], future over
  // (tDeadline, tTarget], evenly spaced with seeded jitter. A final jump
  // lands exactly 1h before the target when finalJumpLog is set.
  const jumpTimes = [];
  const jumpSizes = [];
  const place = (sizes, from, to) => {
    const k = sizes.length;
    sizes.forEach((size, j) => {
      const frac = (j + 0.5) / k + (rng() - 0.5) * (0.6 / k);
      const t = from + Math.min(0.95, Math.max(0.05, frac)) * (to - from);
      jumpTimes.push(t);
      jumpSizes.push(size);
    });
  };
  place(pastJumps, tStart, tDeadline);
  {
    const fut = opts.futureJumps ?? [];
    place(fut.map((_, j) => futureJumps[j]), tDeadline, tTarget);
  }
  if (opts.finalJumpLog) {
    jumpTimes.push(tTarget - 1);
    jumpSizes.push(futureJumps[futureJumps.length - 1]);
  }
  const sortedJumps = jumpTimes
    .map((t, j) => ({ t, size: jumpSizes[j] }))
    .sort((a, b) => a.t - b.t);

  // Frozen trophies (bronze) stop gaining earners entirely after the freeze
  // hour: no logistic growth and no jump scaling past that point.
  const frozenAt = (t, i) => {
    if (freezeAfter === null || t <= freezeAfter) return false;
    return trophies[i].tier === "bronze";
  };

  const traj = [];
  let pObs = pLat;
  let eObs = [...eLat];
  const reads = [];
  let jumpIdx = 0;
  const totalSteps = Math.round((tTarget - tStart) / dt);
  for (let s = 0; s <= totalSteps; s++) {
    const t = tStart + s * dt;
    while (jumpIdx < sortedJumps.length && sortedJumps[jumpIdx].t <= t) {
      const j = sortedJumps[jumpIdx];
      pLat *= Math.exp(j.size);
      for (let i = 0; i < nT; i++) {
        if (frozenAt(j.t, i)) continue;
        eLat[i] *= Math.exp(gamma * j.size);
      }
      if (satIdx >= 0) eLat[satIdx] = pLat;
      pObs = pLat;
      eObs = [...eLat];
      jumpIdx++;
    }
    // Organic pool growth: two regimes (fast launch, slow steady) or one.
    const rateToday =
      twoRegime && t < switchHour ? launchPerDay : steadyPerDay;
    pLat *= Math.exp((rateToday / 24) * dt);
    // Logistic earner growth toward share * current pool.
    for (let i = 0; i < nT; i++) {
      if (frozenAt(t, i)) continue;
      const { share, speed } = params[i];
      const k = share * pLat;
      if (k <= 0 || speed <= 0) continue;
      const de = (speed / 24) * dt * eLat[i] * (1 - eLat[i] / k);
      eLat[i] = Math.min(k, pLat, Math.max(0, eLat[i] + de));
    }
    if (satIdx >= 0) eLat[satIdx] = pLat;
    traj.push({ t, p: pLat, e: [...eLat] });
    // Emit a read every 30 minutes up to the deadline (frozen state only).
    if (t <= tDeadline + 1e-9) {
      const pInt = Math.max(1, Math.round(pObs));
      const eInt = eObs.map((e) => Math.max(0, Math.round(e)));
      const total = eInt.reduce((a, b) => a + b, 0);
      reads.push({
        slot: isoAt(t),
        at: isoAt(t),
        players_tracked: pInt,
        trophies_earned: total,
        rates: eInt.map((e) => Math.round((e / pInt) * 100 * 100) / 100),
      });
    }
  }

  // Truth = latent rate at (target - lag), read off the trajectory.
  const tTruth = tTarget - (opts.lagHours ?? 0);
  let truthState = traj[traj.length - 1];
  for (const point of traj) {
    if (point.t <= tTruth + 1e-9) truthState = point;
    else break;
  }
  const truthP = truthState.p;
  let truthE = [...truthState.e];
  // Small-count noise: the realised truth for trophies with <= 5 latent
  // earners is a Poisson draw around the latent value (the model cannot
  // know the draw). Platinum-only noise jitters trophy #1 alone.
  if (opts.smallCountNoise || opts.platinumNoise) {
    truthE = truthE.map((e, i) => {
      if (i === satIdx) return e;
      if (opts.platinumNoise) return i === platIdx ? poissonDraw(rng, e) : e;
      return e <= 5 ? poissonDraw(rng, e) : e;
    });
    truthE = truthE.map((e) => Math.min(Math.max(0, e), truthP));
  }
  const truth = truthE.map((e) =>
    Math.min(100, (100 * e) / Math.max(1, truthP)),
  );

  let epochs = 0;
  {
    let prev = null;
    for (const cur of reads) {
      const same =
        prev !== null &&
        prev.players_tracked === cur.players_tracked &&
        prev.rates.every((v, i) => v === cur.rates[i]);
      if (!same) epochs++;
      prev = cur;
    }
  }

  const caseObj = {
    schema: "makefun/gta6-trophies-case/v1",
    id: opts.id ?? "f00",
    at: isoAt(tDeadline),
    horizon_minutes: Math.round((tTarget - tDeadline) * 60),
    target: isoAt(tTarget),
    levels: [0.05, 0.25, 0.5, 0.75, 0.95],
    game: base.game,
    trophies,
    history: reads,
    notes:
      "Synthetic f00 for Schema C v2 (second independent generator: two-regime pool, graded freeze/ceilings, count noise, pool cap).",
  };

  return {
    caseObj,
    truth,
    meta: {
      epochs,
      reads: reads.length,
      refreshes: pastJumps.length,
      futureRefreshes:
        (opts.futureJumps ?? []).length + (opts.finalJumpLog ? 1 : 0),
      pDeadline: reads[reads.length - 1].players_tracked,
      pTargetLatent: Math.round(truthP),
      poolMultiple: truthP / reads[reads.length - 1].players_tracked,
      lagHours: opts.lagHours ?? 0,
      twoRegime,
      freezeAfterHour: freezeAfter,
      ceilMult,
      nearSat: !!opts.nearSat,
      smallCountNoise: !!opts.smallCountNoise,
      platinumNoise: !!opts.platinumNoise,
      poolCap: opts.poolCap ?? null,
    },
  };
}
