// Parse a case file and split its history into epochs (v2).
//
// An epoch is a maximal run of consecutive reads with an identical
// payload: same players_tracked and the same rate for every trophy.
// Exophase only changes its counts when it refreshes, so reads inside
// one epoch carry no new information and only changes between epochs
// do. The epoch is represented by its LAST read; `slot`/`at` differences
// inside a run are ignored because the payload is what matters.

import type { CaseInput, Epoch, HistoryRead } from "./types.ts";

export const LAUNCH_MS = Date.parse("2026-11-19T00:00:00Z");

const EXPECTED_LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

export function hoursSinceLaunch(iso: string): number {
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
    const first = ordered[runStart];
    // TIME ATTRIBUTION: the payload of an epoch is the state at the
    // refresh that created it, not the state at the epoch's last read.
    // The refresh falls between the previous epoch's last read and
    // this epoch's first read, so the epoch's time is the midpoint of
    // those two slots (error at most half a read interval). The first
    // epoch has no predecessor: its time is its first read's slot.
    // Representing an epoch by its LAST read instead would mis-date
    // the state by up to the whole epoch length (a day or more when
    // refreshes are sparse) and systematically flatten every fitted
    // growth rate. The payload values themselves are identical across
    // the epoch, so they still come from the last read.
    let tHours: number;
    if (epochs.length === 0) {
      tHours = hoursSinceLaunch(first.slot);
    } else {
      const prevLast = ordered[runStart - 1];
      tHours =
        (hoursSinceLaunch(prevLast.slot) + hoursSinceLaunch(first.slot)) /
        2;
    }
    epochs.push({
      tHours,
      readStartHours: hoursSinceLaunch(first.slot),
      readEndHours: hoursSinceLaunch(last.slot),
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
