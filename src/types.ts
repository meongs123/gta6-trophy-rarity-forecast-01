// Shared shapes for the gta6-trophy-rarity-forecast-01 forecaster (v1).
// Everything here is a plain data shape; no behaviour lives in this file.

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

// One epoch: a maximal run of consecutive reads whose payload (players +
// every rate) is identical. Only the last read of the run is kept, because
// reads inside an epoch carry no new information.
export interface Epoch {
  // Hours since 2026-11-19T00:00:00Z, taken from the epoch's last read slot.
  tHours: number;
  players: number;
  total: number;
  rates: Array<number | null>;
  // Integer earners per trophy, filled in by the inversion step.
  earners: number[];
  // True when the inverted earners do not reconcile with `total`.
  inversionFlagged: boolean;
}

export interface ForecastRow {
  id: number;
  q: number[];
}
