// Independent synthetic generator for the v1 harness + Schema C.
//
// Deliberately a DIFFERENT functional form from the entry's model, so a
// good Schema C score is not the model agreeing with itself:
//   - earners grow LOGISTICALLY toward a ceiling (share of the pool),
//     the entry models them log-linear in log(1 + t);
//   - refreshes arrive at seeded jittered times (Poisson-like), the entry
//     treats them as level shifts fitted from epochs;
//   - the pool has TWO regimes (fast launch growth, then steady), the entry
//     fits one log-time slope (v1);
//   - the scored truth is the latent rate at (target - lag), the entry
//     forecasts at the target with no lag model (v1).
// Parameters come from RULES / verified kit numbers (refresh 638 -> 3868,
// jump log 1.80; horizon 6510 min), never from the entry's fitted values.
//
// Observed reads freeze between refreshes: Exophase only changes its page
// when it refreshes, so the synthetic history shows the latent state at the
// last refresh, not the live latent state.

import { readFileSync } from "node:fs";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIT_P00 = new URL(
  "../../gta6-trophy-rarity-forecast-01-kit/gta6-trophy-rarity-forecast-01-kit/input/p00.in",
  import.meta.url,
);

export function loadKitBase() {
  const c = JSON.parse(readFileSync(KIT_P00, "utf8"));
  return c;
}

function groupOf(trophy) {
  const d = trophy.description;
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "story";
  if (/\d/.test(d)) return "grind";
  return "other";
}

// Saturation share of the pool each group tends toward (ceiling), and the
// logistic speed toward it. Story trophies saturate high and fast; grind
// and platinum stay rare. Trophy #2 is saturated at 100% by construction.
function satParams(trophy, e0) {
  if (trophy.id === 2) return { share: 1.0, speed: 3.0 };
  const g = groupOf(trophy);
  if (trophy.tier === "platinum") return { share: 0.004, speed: 0.3 };
  if (trophy.tier === "gold") return { share: 0.008, speed: 0.4 };
  if (trophy.tier === "silver") return { share: 0.03, speed: 0.6 };
  if (g === "story") return { share: 0.35, speed: 1.2 };
  if (g === "grind") return { share: 0.08, speed: 0.5 };
  return { share: 0.15, speed: 0.8 };
}

function isoAt(hoursSinceLaunch) {
  const ms = Date.parse("2026-11-19T00:00:00Z") + hoursSinceLaunch * 3600000;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

// opts:
//   seed, pastJumps (log sizes, visible in history), futureJumps (log
//   sizes, between deadline and target — invisible to the entry),
//   organicPerDay, gammaTrue, lagHours, finalJumpLog (0 = none),
//   satOff (bool), trophyCount (default 55), zeroIds, nullAllIds,
//   nullSome, p0 (default 638).
// The scenario pool multiple is P_final / P_deadline, so the jumps that
// set it are the FUTURE ones; past jumps exist so the entry can see
// refreshes, estimate gamma and segment epochs.
export function buildSynthetic(opts) {
  const base = loadKitBase();
  const nT = opts.trophyCount ?? 55;
  const trophies = base.trophies.slice(0, nT);
  const p0 = opts.p0 ?? 638;
  const rates0 = base.history[0].rates.slice(0, nT);
  const rng = mulberry32(opts.seed ?? 1);

  const tStart = 2.5; // last kit read 02:30Z, hours since launch midnight
  const tDeadline = 59.5; // 2026-11-21T11:30:00Z
  const tTarget = 168; // 2026-11-26T00:00:00Z
  const dt = 0.5; // simulation step, hours

  // Latent state.
  let pLat = p0;
  const eLat = rates0.map((r, i) => {
    if ((opts.zeroIds ?? []).includes(trophies[i].id)) return 0;
    return Math.max(0, Math.round(((r ?? 0) / 100) * p0));
  });
  const params = trophies.map((t, i) => {
    const sp = satParams(t, eLat[i]);
    if ((opts.zeroIds ?? []).includes(t.id)) return { share: 0, speed: 0 };
    if (opts.satOff) return { share: sp.share * 10, speed: sp.speed };
    return sp;
  });

  // Refresh times: past jumps spread over [tStart, tDeadline], future
  // jumps over (tDeadline, tTarget], both jittered. A final jump lands
  // exactly 1h before the target when finalJumpLog is set.
  const pastJumps = opts.pastJumps ?? opts.jumps ?? [];
  const futureJumps = opts.futureJumps ?? [];
  const jumpTimes = [
    ...pastJumps.map((_, j) => {
      const k = pastJumps.length;
      const frac = (j + 0.5) / k + (rng() - 0.5) * (0.6 / k);
      return tStart + Math.min(0.95, Math.max(0.05, frac)) * (tDeadline - tStart);
    }),
    ...futureJumps.map((_, j) => {
      const k = futureJumps.length;
      const frac = (j + 0.5) / k + (rng() - 0.5) * (0.6 / k);
      return tDeadline + Math.min(0.98, Math.max(0.02, frac)) * (tTarget - tDeadline);
    }),
  ];
  const jumpSizes = [...pastJumps, ...futureJumps];
  if (opts.finalJumpLog) {
    jumpTimes.push(tTarget - 1);
    jumpSizes.push(opts.finalJumpLog);
  }
  const satIdx = trophies.findIndex((t) => t.id === 2);

  // Trajectory of the latent state, for the truth lookup.
  const traj = [];
  const snap = (t) => {
    traj.push({ t, p: pLat, e: [...eLat] });
  };
  snap(tStart);

  // Observed (frozen-at-last-refresh) state, advanced at refresh times.
  let pObs = pLat;
  let eObs = [...eLat];
  const refreshMoments = []; // {t, p, e} snapshots at each refresh
  const reads = [];
  let jumpIdx = 0;
  const sortedJumps = jumpTimes
    .map((t, j) => ({ t, size: jumpSizes[j] }))
    .sort((a, b) => a.t - b.t);

  const totalSteps = Math.round((tTarget - tStart) / dt);
  for (let s = 0; s <= totalSteps; s++) {
    const t = tStart + s * dt;
    // Apply refreshes whose time falls in this step.
    while (jumpIdx < sortedJumps.length && sortedJumps[jumpIdx].t <= t) {
      const j = sortedJumps[jumpIdx];
      pLat *= Math.exp(j.size);
      for (let i = 0; i < nT; i++) {
        eLat[i] *= Math.exp((opts.gammaTrue ?? 0.5) * j.size);
      }
      // The trivial trophy stays saturated through the jump as well.
      if (satIdx >= 0) eLat[satIdx] = pLat;
      pObs = pLat;
      eObs = [...eLat];
      refreshMoments.push({ t: j.t, p: pObs, e: [...eObs] });
      jumpIdx++;
    }
    // Organic pool growth.
    pLat *= Math.exp(((opts.organicPerDay ?? 0.02) / 24) * dt);
    // Logistic earner growth toward share * current pool.
    for (let i = 0; i < nT; i++) {
      const { share, speed } = params[i];
      const k = share * pLat;
      if (k <= 0 || speed <= 0) continue;
      const de = (speed / 24) * dt * eLat[i] * (1 - eLat[i] / k);
      // Euler step on dE/dt = (speed/day) * E * (1 - E/K); guard overshoot.
      // Earners can never exceed players, whatever the ceiling says.
      eLat[i] = Math.min(k, pLat, Math.max(0, eLat[i] + de));
    }
    // The trivial trophy (#2) is earned by every tracked player: it stays
    // saturated (E == P) through refreshes and growth alike.
    if (satIdx >= 0) eLat[satIdx] = pLat;
    if (s % 1 === 0) snap(t);
    // Emit a read every 30 minutes up to the deadline.
    if (t <= tDeadline + 1e-9 && Math.abs(t * 2 - Math.round(t * 2)) < 1e-9) {
      const pInt = Math.max(1, Math.round(pObs));
      const eInt = eObs.map((e) => Math.max(0, Math.round(e)));
      const total = eInt.reduce((a, b) => a + b, 0);
      const rates = eInt.map((e) => Math.round((e / pInt) * 100 * 100) / 100);
      reads.push({
        slot: isoAt(t),
        at: isoAt(t),
        players_tracked: pInt,
        trophies_earned: total,
        rates,
      });
    }
  }

  // Truth = latent rate at (target - lag), read off the trajectory. Future
  // jumps (including a final jump 1h before the target) are already in the
  // trajectory; a lagged truth simply stops before them.
  const tTruth = tTarget - (opts.lagHours ?? 0);
  let truthState = traj[traj.length - 1];
  for (const point of traj) {
    if (point.t <= tTruth + 1e-9) truthState = point;
    else break;
  }
  const truthP = truthState.p;
  const truthE = truthState.e;
  // Zero / null edge handling in the truth as well.
  const truth = truthE.map((e, i) =>
    (opts.zeroIds ?? []).includes(trophies[i].id)
      ? 0
      : Math.min(100, (100 * e) / Math.max(1, truthP)),
  );

  // Post-process reads for the null edge cases.
  const nullAll = new Set(opts.nullAllIds ?? []);
  const nullSome = opts.nullSome ?? {};
  const epochStarts = [];
  {
    let prev = null;
    for (let r = 0; r < reads.length; r++) {
      const cur = reads[r];
      const same =
        prev !== null &&
        prev.players_tracked === cur.players_tracked &&
        prev.rates.every((v, i) => v === cur.rates[i]);
      if (!same) epochStarts.push(r);
      prev = cur;
    }
  }
  for (let r = 0; r < reads.length; r++) {
    for (let i = 0; i < nT; i++) {
      const id = trophies[i].id;
      if (nullAll.has(id)) reads[r].rates[i] = null;
    }
  }
  for (const [idStr, epochs] of Object.entries(nullSome)) {
    const id = Number(idStr);
    const idx = trophies.findIndex((t) => t.id === id);
    if (idx < 0) continue;
    for (const ep of epochs) {
      const start = epochStarts[ep];
      const end = ep + 1 < epochStarts.length ? epochStarts[ep + 1] : reads.length;
      for (let r = start; r < end; r++) reads[r].rates[idx] = null;
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
    notes: "Synthetic f00 for the v1 harness / Schema C (generator independent of the entry model).",
  };

  return {
    caseObj,
    truth,
    meta: {
      epochs: epochStarts.length,
      reads: reads.length,
      refreshes: pastJumps.length,
      futureRefreshes: futureJumps.length + (opts.finalJumpLog ? 1 : 0),
      pDeadline: reads[reads.length - 1].players_tracked,
      pTargetLatent: Math.round(truthP),
      poolMultiple: truthP / reads[reads.length - 1].players_tracked,
      lagHours: opts.lagHours ?? 0,
    },
  };
}
