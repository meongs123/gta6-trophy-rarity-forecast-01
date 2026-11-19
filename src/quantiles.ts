// Quantiles on the logit scale (build-spec Langkah 5-6, v1).
//
//   median_i = 100 * E-hat_i / P-hat, clamped to [0.01, 99.99]
//   q_tau    = inv_logit(logit(median_i) + z_tau * sigma_total_i)
//
// v1 spread is symmetric and has two components:
//   sigma_trend = 0.5 * sqrt(H)   (random-walk extrapolation, H in days)
//   sigma_count = 1 / sqrt(E-hat + 1)   (small-count uncertainty; a trophy
//     with 4 earners carries ~0.45 logit of count noise, as it should)
// A future-refresh component (sigma_refresh) and any fan asymmetry belong
// to v2; v1 records the lag sensitivity instead of modelling it.
// Saturated trophies get a tight fan around logit(99.99) with sigma 0.1:
// the 100% trophy must not be allowed to spend the pay line on its own.
// Guardrails: cummax enforces non-decreasing quantiles, every value is
// clamped to [0, 100] and rounded to 4 decimals.

import type { EarnerForecast } from "./earners.ts";

export const Z_SCORES = [-1.645, -0.674, 0, 0.674, 1.645];
export const TREND_SIGMA = 0.5;
export const COUNT_SIGMA = 1.0;
export const SATURATED_SIGMA = 0.08;

export function clampRate(pct: number): number {
  return Math.min(99.99, Math.max(0.01, pct));
}

export function logitOf(pct: number): number {
  const c = clampRate(pct);
  return Math.log(c / (100 - c));
}

export function invLogit(l: number): number {
  return 100 / (1 + Math.exp(-l));
}

export function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

export function quantilesFor(
  eHat: number,
  pHat: number,
  horizonDays: number,
  forecast: EarnerForecast,
): number[] {
  let median: number;
  let sigma: number;
  if (forecast.saturated) {
    median = 99.99;
    sigma = SATURATED_SIGMA;
  } else {
    median = clampRate((100 * eHat) / pHat);
    const sigmaTrend = TREND_SIGMA * Math.sqrt(horizonDays);
    const sigmaCount = COUNT_SIGMA / Math.sqrt(eHat + 1);
    sigma = Math.sqrt(sigmaTrend * sigmaTrend + sigmaCount * sigmaCount);
  }
  const centre = logitOf(median);
  const raw = Z_SCORES.map((z) => invLogit(centre + z * sigma));
  // Guardrails: non-decreasing, inside [0, 100], 4 decimals.
  const out: number[] = [];
  let running = -Infinity;
  for (const v of raw) {
    const clamped = Math.min(100, Math.max(0, v));
    const rounded = round4(clamped);
    running = Math.max(running, rounded);
    out.push(running);
  }
  return out;
}
