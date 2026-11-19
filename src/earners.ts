// Earners model E_i(t) (build-spec Langkah 4 + Langkah 2b).
//
//   log(E_i(t) + 0.5) = alpha_i + beta_i * log(1 + t) + gamma * (refresh jumps)
//
// The +0.5 keeps trophies with zero earners in log space. Beta is fitted per
// trophy by least squares on the epoch points (when at least two epochs carry
// a positive count), then shrunk hierarchically toward its group mean:
//
//   beta_shrunk = w * beta_fit + (1 - w) * beta_group,  w = n / (n + kappa)
//
// with kappa = 3 and n the number of epochs where the trophy has earners.
// Groups are tier x semantic: the description decides whether a bronze is a
// story trophy ("Complete Chapter ...", "final mission") or a grind trophy
// ("Complete 250 Stunts", "Win 20 races", ...); other tiers group by tier.
// The 33 trophies with 1-5 earners are very likely one small early cohort,
// not 33 independent signals, so shrinkage toward the group is the point.
//
// WITH K = 1 (the whole kit practice history) there is no fitted slope at
// all: beta is 100% group prior and alpha is anchored on the single point.
// That is stated explicitly in the validation report, not hidden.
//
// Saturated trophies (Langkah 2b): a trophy with E == P in every observed
// epoch forecasts earners identical to the pool (E-hat == P-hat, median
// 99.99). A near-saturated trophy (E/P >= 0.99 at the last epoch) tracks the
// pool instead of its beta: its rate is held at its last rate, so its
// earners grow exactly with P-hat.

import type { Epoch, TrophyInfo } from "./types.ts";
import type { PoolFit } from "./pool.ts";

export const KAPPA = 3;
export const NEAR_SATURATED = 0.99;

export interface EarnerForecast {
  eHat: number;
  saturated: boolean;
  nearSaturated: boolean;
  beta: number;
}

function semanticGroup(t: TrophyInfo): string {
  const d = t.description;
  if (/chapter/i.test(d) || /final mission/i.test(d)) return "story";
  if (/\d/.test(d)) return "grind";
  return "other";
}

export function groupKey(t: TrophyInfo): string {
  if (t.tier === "bronze") return `bronze-${semanticGroup(t)}`;
  return t.tier;
}

function groupPrior(key: string): number {
  if (key === "bronze-story") return 1.0;
  if (key === "bronze-grind") return 0.5;
  if (key === "bronze-other") return 0.7;
  if (key === "silver") return 0.5;
  if (key === "gold") return 0.3;
  if (key === "platinum") return 0.3;
  return 0.5;
}

function fitSlope(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (let k = 0; k < xs.length; k++) {
    mx += xs[k];
    my += ys[k];
  }
  mx /= xs.length;
  my /= ys.length;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < xs.length; k++) {
    sxx += (xs[k] - mx) * (xs[k] - mx);
    sxy += (xs[k] - mx) * (ys[k] - my);
  }
  if (sxx <= 1e-12) return null;
  return sxy / sxx;
}

export function forecastEarners(
  trophies: TrophyInfo[],
  epochs: Epoch[],
  pool: PoolFit,
  pHat: number,
  tTargetHours: number,
): EarnerForecast[] {
  const nT = trophies.length;
  const last = epochs[epochs.length - 1];
  const xTarget = Math.log(1 + tTargetHours);
  const xLast = Math.log(1 + last.tHours);

  // First pass: fitted slopes and group means (only meaningful when K >= 3,
  // but the code path is identical for K = 1 and simply yields no fits).
  const fitted: Array<number | null> = new Array<number | null>(nT).fill(null);
  const positiveCounts: number[] = new Array<number>(nT).fill(0);
  const groupSums = new Map<string, { sum: number; count: number }>();
  for (let i = 0; i < nT; i++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < epochs.length; k++) {
      const e = epochs[k].earners[i];
      if (e > 0) {
        positiveCounts[i]++;
        xs.push(Math.log(1 + epochs[k].tHours));
        ys.push(Math.log(e + 0.5) - pool.gamma * pool.jumpsCumulative[k]);
      }
    }
    fitted[i] = fitSlope(xs, ys);
    if (fitted[i] !== null) {
      const key = groupKey(trophies[i]);
      const acc = groupSums.get(key) ?? { sum: 0, count: 0 };
      acc.sum += fitted[i] as number;
      acc.count += 1;
      groupSums.set(key, acc);
    }
  }

  const out: EarnerForecast[] = [];
  for (let i = 0; i < nT; i++) {
    const eLast = last.earners[i];
    const saturated = epochs.every((ep) => ep.earners[i] === ep.players);
    const nearSaturated =
      !saturated && eLast / last.players >= NEAR_SATURATED;

    if (saturated) {
      out.push({ eHat: pHat, saturated: true, nearSaturated: false, beta: pool.b });
      continue;
    }
    if (nearSaturated) {
      out.push({
        eHat: (eLast / last.players) * pHat,
        saturated: false,
        nearSaturated: true,
        beta: pool.b,
      });
      continue;
    }

    const key = groupKey(trophies[i]);
    const acc = groupSums.get(key);
    const betaGroup =
      acc !== undefined && acc.count > 0
        ? acc.sum / acc.count
        : groupPrior(key);
    // With K = 1 there is no fitted slope anywhere, so betaGroup falls back
    // to the prior and w = 0 below: beta is 100% prior by construction.
    const w = positiveCounts[i] / (positiveCounts[i] + KAPPA);
    const beta =
      fitted[i] !== null
        ? w * (fitted[i] as number) + (1 - w) * betaGroup
        : betaGroup;
    const alpha =
      Math.log(eLast + 0.5) -
      pool.gamma * pool.jumpsCumulative[epochs.length - 1] -
      beta * xLast;
    const raw =
      Math.exp(alpha + beta * xTarget + pool.gamma * pool.totalJump) - 0.5;
    const eHat = Math.min(pHat, Math.max(0, raw));
    out.push({ eHat, saturated: false, nearSaturated: false, beta });
  }
  return out;
}
