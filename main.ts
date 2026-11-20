// gta6-trophy-rarity-forecast-01 entry (v2): logistic adoption,
// refresh-aware, dilution-aware forecaster.
//
// Reads every <id>.in in the input directory (name order) and writes
// one <id>.out per case: {"trophies":[{"id":n,"q":[q05,q25,q50,q75,
// q95]}, ...]}. All modelling lives in src/forecast.ts and its
// modules; this file is I/O only.
//
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is offline, standard library only, and deterministic:
// no randomness, no clock, no unordered iteration anywhere in the
// forecast path.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { forecastCase } from "./src/forecast.ts";
import type { CaseInput } from "./src/types.ts";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const inputFiles = readdirSync(INPUT_DIR)
  .filter((f) => f.endsWith(".in"))
  .sort();
mkdirSync(OUTPUT_DIR, { recursive: true });
for (const file of inputFiles) {
  const id = file.slice(0, -".in".length);
  const parsed = JSON.parse(
    readFileSync(join(INPUT_DIR, file), "utf8"),
  ) as CaseInput;
  const rows = forecastCase(parsed, file);
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ trophies: rows })}\n`,
  );
}
