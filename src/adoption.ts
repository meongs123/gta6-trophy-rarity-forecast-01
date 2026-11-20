// Adoption-curve earners model (v2 — the structural break from v1).
//
// v1 modelled log(E) as a power law in log(1+t). Over a 4.5-day horizon
// that grows far too slowly: log(1+t) rises ~25% from deadline to
// target while real trophy adoption is an S-curve in TIME — a trophy
// goes from a handful of speedrunners to a substantial share of the
// pool in days. v2 models the RATE as a logistic adoption curve:
//
//   R_i(t) = c_g / (1 + B_i * exp(-s_i * (t - t0)))
//
// with a per-group ceiling c_g (the saturation share) and a per-trophy
// speed s_i. In the transformed coordinate Y = log(c/R - 1) the curve
// is a straight line in t, so speeds and the refresh share gamma are
// estimated JOINTLY by weighted least squares over the epoch intervals:
//
//   dY = -s_g * dt + (1 - gamma) * j * c / (c - Rbar)
//
// The second term is the jump dilution: at a refresh the pool jumps by
// j, earners by gamma*j, so the rate falls by (1-gamma)*j — amplified
// by c/(c-Rbar) in Y-space when the rate is near its ceiling. v1
// estimated gamma from aggregate totals and therefore counted organic
// adoption growth as refresh-following; the joint fit separates the
// two, which is what makes gamma estimable from a handful of epochs —
// BUT only when the interval design identifies it. When the interval
// vectors (dt, jump) are nearly proportional, speed and gamma are
// confounded and the joint fit lands on an extreme corner, so the fit
// is gated: gamma is then held at its prior and only the speeds are
// fitted (see designIdentified). The expected future jump total that
// dilutes the median is likewise shrunk toward a prior total, because
// one huge past jump must not forecast several more huge ones.
//
// Ceilings: when CEILING_GRID is on, each group's ceiling is chosen
// from a fixed grid by penalised least squares (the penalty keeps the
// prior ceiling unless the trajectory shows real curvature — with two
// intervals the ceiling is weakly identified, so the prior dominates
// unless the data insists). When off, the ceiling is the prior, lifted
// if the last observed rate already sits above 70% of it. Per-trophy
// speeds are shrunk toward their group speed with kappa.
//
// The forecast evaluates the adoption curve at (target - median lag),
// not at the target: the answer is a snapshot from Exophase's last
// refresh, and under a Poisson refresh process the median staleness
// is ln(2)/lambda. Future jumps before that snapshot dilute the rate
// by exp(-(1-gamma) * J_exp), with J_exp the expected jump total over
// the remaining horizon. Saturated trophies (E == P in every epoch)
// forecast earners identical to the pool; near-saturated ones track
// their last rate.

import type { Epoch, TrophyInfo } from "./types.ts";
import type { PoolFit } from "./pool.ts";
import {
  CEILING_GRID,
  CEILING_GRID_VALUES,
  CEILING_PENALTY,
  CEILING_PRIOR,
  CEILING_RANGE_HI,
  CEILING_RANGE_LO,
  CEIL_LIFT,
  COUNT_C,
  FIT_COLLINEAR_RATIO,
  GAMMA_FORCE,
  GAMMA_PER_TIER,
  GAMMA_PRIOR,
  GAMMA_PRIOR_SD,
  J_PRIOR_TOTAL,
  J_PRIOR_WEIGHT,
  KAPPA,
  LAG_CAP_HOURS,
  LAG_SD_MAX_DAYS,
  LAG_SD_MIN_DAYS,
  NEAR_SAT_SIGMA,
  NEAR_SATURATED,
  RATE_CEIL_PCT,
  RATE_FLOOR_PCT,
  SAT_SIGMA,
  SPEED_MAX,
  SPEED_PRIOR,
  S_TREND,
} from "./params.ts";

export const GROUP_KEYS = [
  "bronze-story",
  "bronze-grind",
  "bronze-other",
  "silver",
  "gold",
  "platinum",
];

export function groupKey(t: TrophyInfo): string {
  if (t.tier !== "bronze") return t.tier;
  const d = t.description;
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "bronze-story";
  if (/\d/.test(d)) return "bronze-grind";
  return "bronze-other";
}

export interface EarnerForecast {
  // Forecast rate in percent (0.01..99.99).
  ratePct: number;
  eHat: number;
  saturated: boolean;
  nearSaturated: boolean;
  // Adoption speed used for this trophy (logit per day).
  speed: number;
  // Total logit sigma before the calibration multiplier.
  sigmaRaw: number;
}

export interface AdoptionFit {
  gamma: number;
  gammaSd: number;
  lambdaPerDay: number;
  lagMedianHours: number;
  lagSdDays: number;
  jumpExp: number;
  ceilings: Record<string, number>;
  speeds: Record<string, number>;
  pHat: number;
}

// --- small dense linear algebra (deterministic, no dependencies) ---

function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    const tmp = m[col];
    m[col] = m[piv];
    m[piv] = tmp;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(m[i][n] / m[i][i]);
  return out;
}

function invertMatrix(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    const tmp = m[col];
    m[col] = m[piv];
    m[piv] = tmp;
    const div = m[col][col];
    for (let c = 0; c < 2 * n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = 0; c < 2 * n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row.slice(n));
}

// One interval observation for the joint fit.
interface Obs {
  trophy: number;
  group: number; // index into GROUP_KEYS
  dtDays: number;
  jumpLog: number;
  // Transformed rates at both ends (filled per ceiling candidate).
  rPrev: number;
  rCur: number;
  ePrev: number;
  eCur: number;
}

function buildObservations(
  trophies: TrophyInfo[],
  epochs: Epoch[],
  pool: PoolFit,
): { obs: Obs[]; saturated: boolean[]; nearSaturated: boolean[] } {
  const nT = trophies.length;
  const last = epochs[epochs.length - 1];
  const jumpByEpoch = new Map<number, number>();
  for (const r of pool.refreshes) jumpByEpoch.set(r.epochIndex, r.jumpLog);
  const saturated: boolean[] = [];
  const nearSaturated: boolean[] = [];
  for (let i = 0; i < nT; i++) {
    saturated.push(epochs.every((ep) => ep.earners[i] === ep.players));
    nearSaturated.push(
      !saturated[i] && last.earners[i] / last.players >= NEAR_SATURATED,
    );
  }
  const obs: Obs[] = [];
  for (let k = 1; k < epochs.length; k++) {
    const dtDays = (epochs[k].tHours - epochs[k - 1].tHours) / 24;
    const jumpLog = jumpByEpoch.get(k) ?? 0;
    for (let i = 0; i < nT; i++) {
      if (saturated[i] || nearSaturated[i]) continue;
      const ePrev = epochs[k - 1].earners[i];
      const eCur = epochs[k].earners[i];
      if (ePrev === 0 && eCur === 0) continue;
      obs.push({
        trophy: i,
        group: GROUP_KEYS.indexOf(groupKey(trophies[i])),
        dtDays,
        jumpLog,
        rPrev: Math.max(ePrev, 0.5) / epochs[k - 1].players,
        rCur: Math.max(eCur, 0.5) / epochs[k].players,
        ePrev,
        eCur,
      });
    }
  }
  return { obs, saturated, nearSaturated };
}

// Weighted least squares for (speeds per group, u = 1 - gamma) given a
// ceiling per group. When uFixed is not null, gamma is held at the
// prior (the design is collinear — see designIdentified) and only the
// speeds are fitted, with the fixed dilution term moved to the target.
// Returns the solution, the weighted SSE, and the standard error of u
// (from the normal-equation inverse; the prior SD when u is fixed).
function jointFit(
  obs: Obs[],
  ceilings: number[],
  uFixed: number | null,
): {
  speeds: number[];
  u: number;
  uPerGroup: number[];
  sse: number;
  seU: number;
} | null {
  const nG = GROUP_KEYS.length;
  const nPar = GAMMA_PER_TIER && uFixed === null ? 2 * nG : nG + 1;
  // When u is fixed there is no u unknown: the parameter vector is the
  // group speeds plus a dummy slot that stays zero.
  const nUnknowns = uFixed === null ? nPar : nG;
  // Normal equations: A^T W A x = A^T W y.
  const ata: number[][] = Array.from({ length: nUnknowns }, () =>
    new Array<number>(nUnknowns).fill(0),
  );
  const aty: number[] = new Array<number>(nUnknowns).fill(0);
  let sse = 0;
  let used = 0;
  for (const o of obs) {
    const c = ceilings[o.group];
    if (o.rPrev >= c || o.rCur >= c) continue;
    const yPrev = Math.log(c / o.rPrev - 1);
    const yCur = Math.log(c / o.rCur - 1);
    const dy = yCur - yPrev;
    const rBar = (o.rPrev + o.rCur) / 2;
    const amp = Math.min(5, c / Math.max(1e-9, c - rBar));
    const wBase =
      1 / (1 / (o.ePrev + 1) + 1 / (o.eCur + 1));
    const w = Math.min(50, wBase / (amp * amp));
    const target = uFixed === null ? dy : dy - uFixed * o.jumpLog * amp;
    const row: number[] = new Array<number>(nUnknowns).fill(0);
    row[o.group] = -o.dtDays;
    if (uFixed === null) {
      const uIdx = GAMMA_PER_TIER ? nG + o.group : nG;
      row[uIdx] = o.jumpLog * amp;
    }
    for (let a = 0; a < nUnknowns; a++) {
      if (row[a] === 0) continue;
      for (let b = 0; b < nUnknowns; b++) {
        if (row[b] === 0) continue;
        ata[a][b] += w * row[a] * row[b];
      }
      aty[a] += w * row[a] * target;
    }
    used++;
  }
  if (used < 2) return null;
  // Ridge the diagonal a touch so a group with no data does not
  // singularise the system; its speed then falls back to the prior.
  for (let a = 0; a < nUnknowns; a++) ata[a][a] += 1e-9;
  const sol = solveLinear(ata, aty);
  if (sol === null) return null;
  const inv = uFixed === null ? invertMatrix(ata) : null;
  // Residual SSE and the standard error of u.
  let dof = 0;
  for (const o of obs) {
    const c = ceilings[o.group];
    if (o.rPrev >= c || o.rCur >= c) continue;
    const yPrev = Math.log(c / o.rPrev - 1);
    const yCur = Math.log(c / o.rCur - 1);
    const dy = yCur - yPrev;
    const rBar = (o.rPrev + o.rCur) / 2;
    const amp = Math.min(5, c / Math.max(1e-9, c - rBar));
    const wBase = 1 / (1 / (o.ePrev + 1) + 1 / (o.eCur + 1));
    const w = Math.min(50, wBase / (amp * amp));
    let pred = -sol[o.group] * o.dtDays;
    if (uFixed === null) {
      const uIdx = GAMMA_PER_TIER ? nG + o.group : nG;
      pred += sol[uIdx] * o.jumpLog * amp;
    } else {
      pred += uFixed * o.jumpLog * amp;
    }
    const res = dy - pred;
    sse += w * res * res;
    dof++;
  }
  const residVar =
    dof > nUnknowns ? sse / (dof - nUnknowns) : sse / Math.max(1, dof);
  const uIdx0 = nG;
  const seU =
    inv !== null && uFixed === null
      ? Math.sqrt(Math.max(0, inv[uIdx0][uIdx0] * residVar))
      : GAMMA_PRIOR_SD;
  const speeds: number[] = [];
  for (let g = 0; g < nG; g++) speeds.push(sol[g]);
  const uPerGroup: number[] = [];
  for (let g = 0; g < nG; g++) {
    if (uFixed !== null) uPerGroup.push(uFixed);
    else if (GAMMA_PER_TIER) uPerGroup.push(sol[nG + g]);
    else uPerGroup.push(sol[nG]);
  }
  return {
    speeds,
    u: uFixed !== null ? uFixed : sol[nG],
    uPerGroup,
    sse,
    seU: Number.isFinite(seU) ? seU : GAMMA_PRIOR_SD,
  };
}

// Is (speed, gamma) identified from the interval design? The two
// regressors are -dt and j*amp; when the interval vectors (dt, j)
// are nearly proportional across intervals, speed and gamma are
// confounded and the joint fit lands on an extreme corner (speed 0,
// gamma 0 or 1). The gate measures the eigenvalue ratio of the Gram
// matrix of the scaled interval vectors and returns false when the
// design is too collinear — or when there are fewer than two
// intervals, or no jump at all (gamma then has no lever).
function designIdentified(epochs: Epoch[], pool: PoolFit): boolean {
  const jumpByEpoch = new Map<number, number>();
  for (const r of pool.refreshes) jumpByEpoch.set(r.epochIndex, r.jumpLog);
  const vecs: Array<[number, number]> = [];
  for (let k = 1; k < epochs.length; k++) {
    vecs.push([
      (epochs[k].tHours - epochs[k - 1].tHours) / 24,
      jumpByEpoch.get(k) ?? 0,
    ]);
  }
  if (vecs.length < 2) return false;
  let meanDt = 0;
  let meanJ = 0;
  for (const [dt, j] of vecs) {
    meanDt += dt;
    meanJ += j;
  }
  meanDt /= vecs.length;
  meanJ /= vecs.length;
  if (meanDt <= 0 || meanJ <= 0) return false;
  let g11 = 0;
  let g12 = 0;
  let g22 = 0;
  for (const [dt, j] of vecs) {
    const a = dt / meanDt;
    const b = j / meanJ;
    g11 += a * a;
    g12 += a * b;
    g22 += b * b;
  }
  const tr = g11 + g22;
  const det = g11 * g22 - g12 * g12;
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const lMax = (tr + disc) / 2;
  const lMin = (tr - disc) / 2;
  if (lMax <= 0) return false;
  return lMin / lMax >= FIT_COLLINEAR_RATIO;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function fitAdoption(
  trophies: TrophyInfo[],
  epochs: Epoch[],
  pool: PoolFit,
  pHat: number,
  tTargetHours: number,
): { rows: EarnerForecast[]; fit: AdoptionFit } {
  const nT = trophies.length;
  const last = epochs[epochs.length - 1];
  const horizonDays = (tTargetHours - last.tHours) / 24;
  const { obs, saturated, nearSaturated } = buildObservations(
    trophies,
    epochs,
    pool,
  );

  // Largest observed rate per group (ceilings must sit above it).
  // Saturated trophies are excluded: their rate is 1.0 by construction
  // and would lift every ceiling in their group to 0.99.
  const rMax: number[] = new Array<number>(GROUP_KEYS.length).fill(0);
  for (let i = 0; i < nT; i++) {
    if (saturated[i]) continue;
    const g = GROUP_KEYS.indexOf(groupKey(trophies[i]));
    for (const ep of epochs) {
      const r = ep.earners[i] / ep.players;
      if (r > rMax[g]) rMax[g] = r;
    }
  }

  // Ceiling per group: prior, lifted if the highest observed rate
  // already sits near it — a ceiling cannot sit below CEIL_LIFT x the
  // highest rate already observed, or the logistic would claim the
  // trophy is nearly done while the data still shows it climbing fast.
  const baseCeilings: number[] = GROUP_KEYS.map((g) => {
    const prior = CEILING_PRIOR[g] ?? 0.1;
    const lifted = Math.max(prior, rMax[GROUP_KEYS.indexOf(g)] * CEIL_LIFT);
    return Math.min(0.99, Math.max(lifted, rMax[GROUP_KEYS.indexOf(g)] * 1.05));
  });

  let ceilings = [...baseCeilings];
  // Gamma is estimated jointly with the speeds ONLY when the interval
  // design identifies it; otherwise it is held at the prior and the
  // speeds are fitted with the fixed dilution term. (With one interval,
  // or intervals whose (dt, jump) vectors are nearly proportional,
  // speed and gamma are confounded and the joint fit lands on a
  // corner: speed 0, gamma 0 or 1.)
  const identified = designIdentified(epochs, pool);
  const uFixed =
    GAMMA_FORCE !== null
      ? 1 - GAMMA_FORCE
      : identified
        ? null
        : 1 - GAMMA_PRIOR;
  let fitted = obs.length >= 2 ? jointFit(obs, ceilings, uFixed) : null;
  if (CEILING_GRID && fitted !== null && epochs.length >= 3) {
    // Coordinate descent: two passes over groups, each trying every
    // grid value and keeping the penalised-SSE winner. The grid stays
    // within [prior/3, prior*3.5] so an unidentified ceiling cannot
    // run away to 0.99 on two intervals of data. Crucially, the grid
    // search holds gamma FIXED at the joint fit's value: refitting
    // gamma per ceiling candidate lets (speed, gamma) compensate for
    // the ceiling change and erases the curvature signal the grid is
    // supposed to read.
    const uGrid = fitted.u;
    for (let pass = 0; pass < 2; pass++) {
      for (let g = 0; g < GROUP_KEYS.length; g++) {
        const lo = Math.max(
          rMax[g] * 1.02,
          baseCeilings[g] * CEILING_RANGE_LO,
        );
        const hi = Math.min(0.99, baseCeilings[g] * CEILING_RANGE_HI);
        const cands = CEILING_GRID_VALUES.filter(
          (c) => c > lo && c <= hi,
        );
        if (!cands.includes(baseCeilings[g])) cands.push(baseCeilings[g]);
        cands.sort((a, b) => a - b);
        let bestC = ceilings[g];
        let bestScore = Infinity;
        for (const c of cands) {
          const trial = [...ceilings];
          trial[g] = c;
          const f = jointFit(obs, trial, uGrid);
          if (f === null) continue;
          const score =
            f.sse +
            CEILING_PENALTY * Math.pow(Math.log(c / baseCeilings[g]), 2);
          if (score < bestScore - 1e-12) {
            bestScore = score;
            bestC = c;
          }
        }
        ceilings[g] = bestC;
      }
      fitted = jointFit(obs, ceilings, uFixed);
      if (fitted === null) break;
    }
  }

  // Group speeds: fitted, shrunk toward the prior by interval count.
  const intervalsPerGroup: number[] = new Array<number>(
    GROUP_KEYS.length,
  ).fill(0);
  for (const o of obs) intervalsPerGroup[o.group]++;
  const speeds: Record<string, number> = {};
  for (let g = 0; g < GROUP_KEYS.length; g++) {
    const key = GROUP_KEYS[g];
    const prior = SPEED_PRIOR[key] ?? 0.5;
    if (fitted === null) {
      speeds[key] = prior;
      continue;
    }
    const raw = fitted.speeds[g];
    const n = intervalsPerGroup[g];
    const w = n / (n + KAPPA);
    const shrunk = w * raw + (1 - w) * prior;
    speeds[key] = Math.min(SPEED_MAX, Math.max(0, shrunk));
  }
  const gamma =
    fitted === null ? GAMMA_PRIOR : clamp01(1 - fitted.u);
  const gammaSd =
    GAMMA_FORCE !== null
      ? 0.05
      : fitted === null
        ? GAMMA_PRIOR_SD
        : Math.min(0.45, Math.max(0.05, fitted.seU));
  const uByGroup: number[] =
    fitted === null
      ? GROUP_KEYS.map(() => 1 - GAMMA_PRIOR)
      : fitted.uPerGroup.map((u) => clamp01(u));

  // Lag: the answer is a snapshot, so evaluate at target minus the
  // MEDIAN staleness under a Poisson refresh process, ln(2)/lambda.
  const lambda = pool.lambdaPerDay;
  const lagMedianHours = Math.min(
    LAG_CAP_HOURS,
    (24 * Math.LN2) / Math.max(0.05, lambda),
  );
  const lagSdDays = Math.min(
    LAG_SD_MAX_DAYS,
    Math.max(LAG_SD_MIN_DAYS, 1 / Math.max(0.05, lambda)),
  );
  const tEvalHours = tTargetHours - lagMedianHours;
  const hEffDays = Math.max(0, (tEvalHours - last.tHours) / 24);
  // Expected future jump total, shrunk toward a prior: with one or two
  // past jumps the raw Poisson extrapolation (rate x horizon x mean
  // size) is a wild bet — one huge past jump would forecast several
  // more huge ones. The shrink mixes the data total with a prior total
  // of J_PRIOR_TOTAL log over the horizon, weighted by
  // J_PRIOR_WEIGHT pseudo-refreshes.
  const spanDays = Math.max(
    0.5,
    (last.readEndHours - epochs[0].readStartHours) / 24,
  );
  const nRef = pool.refreshCount;
  const jData =
    (nRef / spanDays) * hEffDays * pool.jumpMean;
  const jumpExp =
    (nRef * jData + J_PRIOR_WEIGHT * J_PRIOR_TOTAL) /
    (nRef + J_PRIOR_WEIGHT);

  // Per-trophy speeds: own-interval estimate shrunk toward the group.
  const perTrophySpeed: number[] = [];
  for (let i = 0; i < nT; i++) {
    const key = groupKey(trophies[i]);
    const g = GROUP_KEYS.indexOf(key);
    if (fitted === null || obs.length === 0) {
      perTrophySpeed.push(speeds[key]);
      continue;
    }
    const c = ceilings[g];
    const u = uByGroup[g];
    let num = 0;
    let den = 0;
    let nI = 0;
    for (const o of obs) {
      if (o.trophy !== i) continue;
      if (o.rPrev >= c || o.rCur >= c) continue;
      const yPrev = Math.log(c / o.rPrev - 1);
      const yCur = Math.log(c / o.rCur - 1);
      const dy = yCur - yPrev;
      const rBar = (o.rPrev + o.rCur) / 2;
      const amp = Math.min(5, c / Math.max(1e-9, c - rBar));
      const wBase = 1 / (1 / (o.ePrev + 1) + 1 / (o.eCur + 1));
      const w = Math.min(50, wBase / (amp * amp));
      const x = -o.dtDays;
      num += w * x * (dy - u * o.jumpLog * amp);
      den += w * x * x;
      nI++;
    }
    if (den <= 1e-12 || nI === 0) {
      perTrophySpeed.push(speeds[key]);
      continue;
    }
    const raw = num / den;
    const wShrink = nI / (nI + KAPPA);
    const shrunk = wShrink * raw + (1 - wShrink) * speeds[key];
    perTrophySpeed.push(Math.min(SPEED_MAX, Math.max(0, shrunk)));
  }

  const ceilRecord: Record<string, number> = {};
  for (let g = 0; g < GROUP_KEYS.length; g++) {
    ceilRecord[GROUP_KEYS[g]] = ceilings[g];
  }

  const rows: EarnerForecast[] = [];
  for (let i = 0; i < nT; i++) {
    const key = groupKey(trophies[i]);
    const g = GROUP_KEYS.indexOf(key);
    const rLast = last.earners[i] / last.players;
    if (saturated[i]) {
      rows.push({
        ratePct: RATE_CEIL_PCT,
        eHat: pHat,
        saturated: true,
        nearSaturated: false,
        speed: pool.bSteady,
        sigmaRaw: SAT_SIGMA,
      });
      continue;
    }
    if (nearSaturated[i]) {
      const ratePct = Math.min(
        RATE_CEIL_PCT,
        Math.max(RATE_FLOOR_PCT, rLast * 100),
      );
      rows.push({
        ratePct,
        eHat: (rLast * pHat),
        saturated: false,
        nearSaturated: true,
        speed: pool.bSteady,
        sigmaRaw: NEAR_SAT_SIGMA,
      });
      continue;
    }
    const c = ceilings[g];
    const s = perTrophySpeed[i];
    const u = uByGroup[g];
    const rStart = Math.max(rLast, 0.5 / last.players);
    const b = c / Math.min(rStart, c * 0.999) - 1;
    const dtEvalDays = Math.max(0, (tEvalHours - last.tHours) / 24);
    const rAdopt =
      c / (1 + b * Math.exp(-s * dtEvalDays));
    const rHat = Math.min(
      0.9999,
      Math.max(0.0001, rAdopt * Math.exp(-u * jumpExp)),
    );
    const eHat = rHat * pHat;
    // Five spread components (logit), before the calibration multiplier.
    const sigmaTrend = S_TREND * Math.sqrt(Math.max(0, horizonDays));
    // Refresh variance: the Poisson variance of the future jump total
    // plus a 50% relative estimation error on the total itself (the
    // total is estimated from a handful of past jumps).
    const sigmaRefresh =
      u *
      Math.sqrt(
        lambda * hEffDays * pool.jumpMeanSq + Math.pow(0.5 * jumpExp, 2),
      );
    const sigmaCount = COUNT_C / Math.sqrt(eHat + 1);
    const sigmaLag = s * lagSdDays;
    const sigmaGamma = jumpExp * gammaSd;
    const sigmaRaw = Math.sqrt(
      sigmaTrend * sigmaTrend +
        sigmaRefresh * sigmaRefresh +
        sigmaCount * sigmaCount +
        sigmaLag * sigmaLag +
        sigmaGamma * sigmaGamma,
    );
    rows.push({
      ratePct: Math.min(
        RATE_CEIL_PCT,
        Math.max(RATE_FLOOR_PCT, rHat * 100),
      ),
      eHat,
      saturated: false,
      nearSaturated: false,
      speed: s,
      sigmaRaw,
    });
  }

  return {
    rows,
    fit: {
      gamma,
      gammaSd,
      lambdaPerDay: lambda,
      lagMedianHours,
      lagSdDays,
      jumpExp,
      ceilings: ceilRecord,
      speeds,
      pHat,
    },
  };
}
