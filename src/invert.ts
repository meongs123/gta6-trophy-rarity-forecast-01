// Integer-earner inversion (build-spec Langkah 2).
//
// A printed rate r (2 decimals) and a player count P pin the earner count e
// down to the integers whose printed value rounds back to r:
//   round(e / P * 100, 2) == r
// i.e. e / P * 100 lies in [r - 0.005, r + 0.005). The candidate set is that
// interval intersected with the integers; its midpoint is the estimate.
// Two extra facts discipline the inversion:
//   - r = 100 forces e = P exactly (saturated trophy);
//   - the sum of all inverted earners must equal the page's trophies_earned.
//     A small mismatch (rounding residue) is repaired by moving the trophies
//     whose inverted rate is furthest from the printed rate, one earner each.
//     A large mismatch (> 1% of the total) flags the epoch instead of being
//     silently patched.
// A null rate means that read lacked the trophy. Null in every epoch means
// the trophy never appeared (e = 0); null in only some epochs is filled from
// the nearest epoch that has it, scaled by the pool ratio.

import type { Epoch } from "./types.ts";

function candidateInterval(
  rate: number,
  players: number,
): { lo: number; hi: number } {
  return {
    lo: ((rate - 0.005) / 100) * players,
    hi: ((rate + 0.005) / 100) * players,
  };
}

function midpointEarners(rate: number, players: number): number {
  if (rate >= 100) return players;
  if (rate <= 0) return 0;
  const { lo, hi } = candidateInterval(rate, players);
  const first = Math.max(0, Math.ceil(lo));
  const last = Math.min(players, Math.ceil(hi) - 1);
  if (last < first) return Math.round((rate / 100) * players);
  return Math.round((first + last) / 2);
}

function fillNulls(epochs: Epoch[], trophyIndex: number): void {
  const known: number[] = [];
  for (let k = 0; k < epochs.length; k++) {
    if (epochs[k].rates[trophyIndex] !== null) known.push(k);
  }
  if (known.length === 0) {
    for (const epoch of epochs) epoch.earners[trophyIndex] = 0;
    return;
  }
  for (let k = 0; k < epochs.length; k++) {
    if (epochs[k].rates[trophyIndex] !== null) continue;
    let best = known[0];
    for (const j of known) {
      if (Math.abs(j - k) < Math.abs(best - k)) best = j;
    }
    const scaled = Math.round(
      (epochs[best].earners[trophyIndex] * epochs[k].players) /
        epochs[best].players,
    );
    epochs[k].earners[trophyIndex] = Math.min(
      epochs[k].players,
      Math.max(0, scaled),
    );
  }
}

function reconcileTotal(epoch: Epoch): void {
  const n = epoch.earners.length;
  let sum = 0;
  for (const e of epoch.earners) sum += e;
  const diff = epoch.total - sum;
  if (diff === 0) return;
  if (Math.abs(diff) > 0.01 * Math.max(1, epoch.total)) {
    epoch.inversionFlagged = true;
    return;
  }
  // Rounding residue: move the trophies whose inverted rate sits furthest
  // on the side the correction needs, one earner at a time.
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => {
    const ra =
      (epoch.earners[a] / epoch.players) * 100 - (epoch.rates[a] ?? 0);
    const rb =
      (epoch.earners[b] / epoch.players) * 100 - (epoch.rates[b] ?? 0);
    return diff > 0 ? ra - rb : rb - ra;
  });
  let remaining = diff;
  let cursor = 0;
  while (remaining !== 0 && cursor < order.length * 2) {
    const i = order[cursor % order.length];
    cursor++;
    if (remaining > 0) {
      if (epoch.earners[i] >= epoch.players) continue;
      epoch.earners[i] += 1;
      remaining -= 1;
    } else {
      if (epoch.earners[i] <= 0) continue;
      epoch.earners[i] -= 1;
      remaining += 1;
    }
  }
  if (remaining !== 0) epoch.inversionFlagged = true;
}

export function invertEpochs(epochs: Epoch[], trophyCount: number): void {
  for (const epoch of epochs) {
    epoch.earners = new Array<number>(trophyCount).fill(0);
    for (let i = 0; i < trophyCount; i++) {
      const rate = epoch.rates[i];
      if (rate === null) continue;
      epoch.earners[i] = midpointEarners(rate, epoch.players);
    }
  }
  for (let i = 0; i < trophyCount; i++) fillNulls(epochs, i);
  for (const epoch of epochs) reconcileTotal(epoch);
}
