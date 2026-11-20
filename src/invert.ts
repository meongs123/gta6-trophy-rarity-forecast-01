// Integer-earner inversion (v2).
//
// A printed rate r (2 decimals) and a player count P pin the earner
// count e down to the integers whose printed value rounds back to r:
//   round(e / P * 100, 2) == r
// i.e. e / P * 100 lies in [r - 0.005, r + 0.005). The candidate set is
// that interval intersected with the integers; its midpoint is the
// estimate. Two extra facts discipline the inversion:
//   - r = 100 forces e = P exactly (saturated trophy);
//   - the sum of all inverted earners must equal the page's
//     trophies_earned.
//
// Aggregate constraint (v2 A/B): with AGGREGATE_CONSTRAINT on, the sum
// is enforced as a CONSTRAINT on the assignment, not as a post-hoc
// patch. Starting from the midpoints, unit moves are applied in order
// of increasing cost — the increase in |e/P*100 - r| — and only moves
// that stay inside the trophy's candidate interval are considered
// first; moves outside an interval are the fallback when no in-interval
// move exists. With the flag off, the v1-style greedy is used instead
// (moves ordered by how far the inverted rate sits from the printed
// rate, intervals ignored). A large mismatch (> 1% of the total) flags
// the epoch instead of being silently patched, in both variants.
//
// A null rate means that read lacked the trophy. Null in every epoch
// means the trophy never appeared (e = 0); null in only some epochs is
// filled from the nearest epoch that has it, scaled by the pool ratio.

import type { Epoch } from "./types.ts";
import { AGGREGATE_CONSTRAINT } from "./params.ts";

interface Interval {
  lo: number;
  hi: number;
}

function candidateInterval(rate: number, players: number): Interval {
  return {
    lo: ((rate - 0.005) / 100) * players,
    hi: ((rate + 0.005) / 100) * players,
  };
}

function candidateIntegers(rate: number, players: number): Interval {
  if (rate >= 100) return { lo: players, hi: players };
  if (rate <= 0) return { lo: 0, hi: 0 };
  const { lo, hi } = candidateInterval(rate, players);
  return {
    lo: Math.max(0, Math.ceil(lo)),
    hi: Math.min(players, Math.ceil(hi) - 1),
  };
}

function midpointEarners(rate: number, players: number): number {
  if (rate >= 100) return players;
  if (rate <= 0) return 0;
  const { lo, hi } = candidateIntegers(rate, players);
  if (hi < lo) return Math.round((rate / 100) * players);
  return Math.round((lo + hi) / 2);
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

// Cost of moving trophy i by one earner in direction `dir` (+1 / -1):
// how much worse its printed-rate error gets. Used to order the
// constraint moves cheapest first.
function moveCost(epoch: Epoch, i: number, dir: number): number {
  const p = epoch.players;
  const r = epoch.rates[i] ?? 0;
  const before = Math.abs((epoch.earners[i] / p) * 100 - r);
  const after = Math.abs(((epoch.earners[i] + dir) / p) * 100 - r);
  return after - before;
}

function reconcileConstrained(epoch: Epoch): void {
  const n = epoch.earners.length;
  let sum = 0;
  for (const e of epoch.earners) sum += e;
  let diff = epoch.total - sum;
  if (diff === 0) return;
  if (Math.abs(diff) > 0.01 * Math.max(1, epoch.total)) {
    epoch.inversionFlagged = true;
    return;
  }
  const intervals: Interval[] = [];
  for (let i = 0; i < n; i++) {
    const rate = epoch.rates[i];
    intervals.push(
      rate === null
        ? { lo: epoch.earners[i], hi: epoch.earners[i] }
        : candidateIntegers(rate, epoch.players),
    );
  }
  // Guard against an unbounded loop: at most two passes over all
  // trophies in each direction.
  let guard = 0;
  while (diff !== 0 && guard < n * 2 + 2) {
    guard++;
    const dir = diff > 0 ? 1 : -1;
    let best = -1;
    let bestCost = Infinity;
    let bestInside = false;
    for (let i = 0; i < n; i++) {
      const next = epoch.earners[i] + dir;
      if (next < 0 || next > epoch.players) continue;
      const inside =
        next >= intervals[i].lo && next <= intervals[i].hi;
      // In-interval moves always beat out-of-interval moves.
      if (best >= 0 && bestInside && !inside) continue;
      const cost = moveCost(epoch, i, dir);
      if (inside && !bestInside) {
        best = i;
        bestCost = cost;
        bestInside = true;
      } else if (inside === bestInside && cost < bestCost - 1e-12) {
        best = i;
        bestCost = cost;
        bestInside = inside;
      }
    }
    if (best < 0) {
      epoch.inversionFlagged = true;
      return;
    }
    epoch.earners[best] += dir;
    diff -= dir;
  }
  if (diff !== 0) epoch.inversionFlagged = true;
}

function reconcileGreedy(epoch: Epoch): void {
  const n = epoch.earners.length;
  let sum = 0;
  for (const e of epoch.earners) sum += e;
  const diff0 = epoch.total - sum;
  if (diff0 === 0) return;
  if (Math.abs(diff0) > 0.01 * Math.max(1, epoch.total)) {
    epoch.inversionFlagged = true;
    return;
  }
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => {
    const ra =
      (epoch.earners[a] / epoch.players) * 100 - (epoch.rates[a] ?? 0);
    const rb =
      (epoch.earners[b] / epoch.players) * 100 - (epoch.rates[b] ?? 0);
    return diff0 > 0 ? ra - rb : rb - ra;
  });
  let remaining = diff0;
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
  for (const epoch of epochs) {
    if (AGGREGATE_CONSTRAINT) reconcileConstrained(epoch);
    else reconcileGreedy(epoch);
  }
}
