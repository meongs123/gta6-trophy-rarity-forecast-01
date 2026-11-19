// Parse a case file into epochs (build-spec Langkah 0-1).
//
// An epoch is a maximal run of consecutive reads with an identical payload:
// same players_tracked and same rate for every trophy. Exophase only changes
// its counts when it refreshes, so reads inside one epoch are duplicates and
// only changes between epochs carry information. The epoch is represented by
// its LAST read. With the kit practice data every read shares one payload, so
// the whole history collapses to K = 1 epoch and the model must still run.

import type { CaseInput, Epoch, HistoryRead } from "./types.ts";

export const LAUNCH_MS = Date.parse("2026-11-19T00:00:00Z");

const EXPECTED_LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

function hoursSinceLaunch(iso: string): number {
  return (Date.parse(iso) - LAUNCH_MS) / 3_600_000;
}

function samePayload(a: HistoryRead, b: HistoryRead): boolean {
  if (a.players_tracked !== b.players_tracked) return false;
  if (a.rates.length !== b.rates.length) return false;
  for (let i = 0; i < a.rates.length; i++) {
    if (a.rates[i] !== b.rates[i]) return false;
  }
  return true;
}

export function checkLevels(levels: number[], fileLabel: string): void {
  if (
    levels.length !== EXPECTED_LEVELS.length ||
    levels.some((level, j) => level !== EXPECTED_LEVELS[j])
  ) {
    throw new Error(
      `${fileLabel} asks for levels ${JSON.stringify(levels)}, ` +
        `not ${JSON.stringify(EXPECTED_LEVELS)}`,
    );
  }
}

export function segmentEpochs(c: CaseInput): Epoch[] {
  if (c.history.length === 0) {
    throw new Error(`case ${c.id} has no history`);
  }
  const ordered = [...c.history].sort((a, b) =>
    a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0,
  );
  const epochs: Epoch[] = [];
  let runStart = 0;
  for (let i = 1; i <= ordered.length; i++) {
    const boundary =
      i === ordered.length || !samePayload(ordered[runStart], ordered[i]);
    if (!boundary) continue;
    const last = ordered[i - 1];
    epochs.push({
      tHours: hoursSinceLaunch(last.slot),
      players: last.players_tracked,
      total: last.trophies_earned,
      rates: [...last.rates],
      earners: [],
      inversionFlagged: false,
    });
    runStart = i;
  }
  return epochs;
}
