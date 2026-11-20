// Forecast orchestration (v2).
//
// One case in, one list of quantile rows out. The steps, in order:
//   0. validate levels, segment the history into epochs;
//   1. invert integer earners per epoch (aggregate-constrained);
//   2. fit the two-regime pool and the refresh process (rate, sizes);
//   3. fit the adoption model: ceilings + speeds + gamma, jointly,
//      from the epoch intervals; forecast each rate as a logistic
//      adoption curve evaluated at (target - median lag) and diluted
//      by the expected future jumps;
//   4. saturated trophies forecast earners identical to the pool;
//   5. median = forecast rate, quantiles asymmetric on the logit
//      scale with a five-component spread.
// No randomness, no clock reads, no network: the same input bytes
// always produce the same output bytes.

import type { CaseInput, ForecastRow } from "./types.ts";
import { checkLevels, segmentEpochs, LAUNCH_MS } from "./parse.ts";
import { invertEpochs } from "./invert.ts";
import { fitPool, forecastPool } from "./pool.ts";
import { fitAdoption } from "./adoption.ts";
import { quantilesFor } from "./spread.ts";

export function forecastCase(c: CaseInput, fileLabel: string): ForecastRow[] {
  checkLevels(c.levels, fileLabel);
  const epochs = segmentEpochs(c);
  invertEpochs(epochs, c.trophies.length);

  const pool = fitPool(epochs);
  const tTargetHours =
    (Date.parse(c.target) - LAUNCH_MS) / 3_600_000;
  const pHat = forecastPool(pool, tTargetHours);

  const { rows } = fitAdoption(
    c.trophies,
    epochs,
    pool,
    pHat,
    tTargetHours,
  );

  const out: ForecastRow[] = [];
  for (let i = 0; i < c.trophies.length; i++) {
    out.push({ id: c.trophies[i].id, q: quantilesFor(rows[i]) });
  }
  return out;
}
