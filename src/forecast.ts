// Forecast orchestration (build-spec Langkah 0-7).
//
// One case in, one list of quantile rows out. The steps, in order:
//   0. validate levels, segment the history into epochs;
//   1. invert integer earners per epoch, reconciled against trophies_earned;
//   2. fit the pool (log-time + refresh level-shifts) and estimate gamma;
//   3. forecast earners per trophy with tier x semantic shrinkage;
//   4. saturated trophies forecast earners identical to the pool;
//   5. median = 100 * E-hat / P-hat, quantiles symmetric on the logit scale.
// No randomness, no clock reads, no network: the same input bytes always
// produce the same output bytes.

import type { CaseInput, ForecastRow } from "./types.ts";
import { checkLevels, segmentEpochs, LAUNCH_MS } from "./parse.ts";
import { invertEpochs } from "./invert.ts";
import { fitPool, forecastPool } from "./pool.ts";
import { forecastEarners } from "./earners.ts";
import { quantilesFor } from "./quantiles.ts";

export function forecastCase(c: CaseInput, fileLabel: string): ForecastRow[] {
  checkLevels(c.levels, fileLabel);
  const epochs = segmentEpochs(c);
  invertEpochs(epochs, c.trophies.length);

  const pool = fitPool(epochs);
  const tTargetHours =
    (Date.parse(c.target) - LAUNCH_MS) / 3_600_000;
  const pHat = forecastPool(pool, tTargetHours);
  const horizonDays = c.horizon_minutes / 1440;

  const earners = forecastEarners(
    c.trophies,
    epochs,
    pool,
    pHat,
    tTargetHours,
  );

  const rows: ForecastRow[] = [];
  for (let i = 0; i < c.trophies.length; i++) {
    rows.push({
      id: c.trophies[i].id,
      q: quantilesFor(earners[i].eHat, pHat, horizonDays, earners[i]),
    });
  }
  return rows;
}
