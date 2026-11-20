// Shared data shapes for the v2 forecaster. Plain shapes only; no
// behaviour lives here. Times are hours since 2026-11-19T00:00:00Z
// (launch midnight), rates are percents, counts are integers.

export interface TrophyInfo {
  id: number;
  name: string;
  description: string;
  tier: string;
  points: number;
  secret: boolean;
}

export interface HistoryRead {
  slot: string;
  at: string;
  players_tracked: number;
  trophies_earned: number;
  rates: Array<number | null>;
}

export interface CaseInput {
  id: string;
  at: string;
  horizon_minutes: number;
  target: string;
  levels: number[];
  trophies: TrophyInfo[];
  history: HistoryRead[];
}

// One epoch: a maximal run of consecutive reads whose payload (players
// plus every rate) is identical. Reads inside an epoch are duplicates —
// Exophase only changes its counts when it refreshes — so the epoch is
// represented by its LAST read. With the kit practice data the whole
// history collapses to a single epoch and the model must still run.
export interface Epoch {
  // Hours since launch, from the epoch's last read slot.
  tHours: number;
  // Wall-clock read window of the epoch (first / last read slots).
  // The state time (tHours) is the refresh midpoint, but the refresh
  // RATE is measured over the read window: how many refreshes the
  // house observed between the first and the last read.
  readStartHours: number;
  readEndHours: number;
  players: number;
  total: number;
  rates: Array<number | null>;
  // Integer earners per trophy, filled in by the inversion step.
  earners: number[];
  // True when the inverted earners do not reconcile with `total`.
  inversionFlagged: boolean;
}

// One refresh: the jump between two consecutive epochs.
export interface Refresh {
  // Index of the epoch the jump lands in (k >= 1).
  epochIndex: number;
  // Log size of the jump, after removing organic pool growth.
  jumpLog: number;
  // Hours between the two epoch times.
  dtHours: number;
}

export interface ForecastRow {
  id: number;
  q: number[];
}
