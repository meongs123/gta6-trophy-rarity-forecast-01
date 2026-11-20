// v2 hyperparameters for the gta6-trophy-rarity-forecast-01 forecaster.
//
// Shipped values are the sweep choice documented in concept-v2.md §5:
// one-knob sweeps over the 23-scenario Schema C, combinations re-tested
// on both suites (89 scenarios), final pick by minimax (worst case
// across all 89), not best central cell. Final config ("comboI"):
// CEIL_LIFT 6, S_TREND 0.3, ASYM_A 0; everything else at its prior.
// GAMMA_FORCE stays null (gamma is estimated, not forced: forcing
// gamma=1 won the 23-suite mean but blew up the 66-suite worst to 3.69).
//
// Groups: bronze-story, bronze-grind, bronze-other, silver, gold,
// platinum. A "group" is a tier x semantic class (description-driven).

// --- shrinkage / fitting ---
export const KAPPA = 3; // shrinkage weight: w = n / (n + KAPPA)
export const CEILING_GRID = true; // data-driven ceiling search (on) vs prior only (off)
export const CEILING_PENALTY = 20; // SSE units charged per (log ceiling move)^2
export const CEIL_LIFT = 6; // ceiling floor: at least CEIL_LIFT x highest observed rate
// Sweep: 2.5 -> 0.677 mean / 2.544 worst (23-suite); 4 -> 0.617 / 2.307;
// 6 -> 0.561 / 2.120; 8 -> worse mean, better worst; 10 -> mean 0.436
// but worst only 1.503 on the 23-suite while the 66-suite worst rose.
// 6 is the minimax compromise: the observed rate already rules out the
// low ceiling priors (a trophy at 6% cannot have a 4.7% ceiling), and
// the lift is data-driven, so it adapts per group instead of a fixed
// prior raise (story prior 0.25/0.35 scored worse than lift 6).
export const CEILING_RANGE_LO = 1 / 3; // grid stays within prior x [LO, HI]
export const CEILING_RANGE_HI = 3.5;
export const GAMMA_PER_TIER = false; // estimate gamma per group (false = one global gamma)
export const POOL_TWO_REGIME = true; // two-regime pool (false = one log-time slope)
export const AGGREGATE_CONSTRAINT = true; // interval-aware inversion (false = v1-style greedy)

// --- ceilings: prior share of the pool a group tends toward ---
// Minimax middle of the plausible week-one range. Early story trophies
// are the only ones that can plausibly reach double digits in a week;
// grind / platinum stay rare. The data-driven grid (when on) moves a
// ceiling only when the epoch trajectory shows real curvature.
export const CEILING_PRIOR: Record<string, number> = {
  "bronze-story": 0.15,
  "bronze-grind": 0.05,
  "bronze-other": 0.1,
  silver: 0.03,
  gold: 0.015,
  platinum: 0.005,
};

// --- adoption speed priors: logit growth per day ---
// A story trophy goes from ~0.7% to the low teens in 4-5 days if players
// keep arriving and playing: logit growth near 1/day. Grind trophies
// need repeated effort, so they climb at roughly half that; platinum
// needs the whole game, so it barely moves in week one.
export const SPEED_PRIOR: Record<string, number> = {
  "bronze-story": 0.9,
  "bronze-grind": 0.45,
  "bronze-other": 0.65,
  silver: 0.45,
  gold: 0.3,
  platinum: 0.2,
};
export const SPEED_MAX = 2.5; // fitted speeds are clamped to [0, SPEED_MAX]

// Ceiling grid searched per group (values are pool shares). The grid must
// span the plausible range with room on both sides; values below the
// group's largest observed rate are dropped at runtime.
export const CEILING_GRID_VALUES = [
  0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.35, 0.5, 0.7, 0.9,
];

// --- pool ---
export const JUMP_LOG = 0.2; // log-player jump that marks a refresh
export const POOL_SPLIT_HOURS = 48; // launch spike ends 21 Nov 00:00Z
export const POOL_SLOPE_PRIOR = 0.7; // log-time slope when unidentified
export const POOL_SLOPE_MAX = 1.5;
export const POOL_CAP = 20; // P-hat never exceeds POOL_CAP x last pool

// --- refresh process (Poisson prior) ---
export const GAMMA_PRIOR = 0.5; // earners follow this share of a pool jump
export const GAMMA_PRIOR_SD = 0.3; // std of gamma when no refresh observed
export const GAMMA_FORCE: number | null = null; // sensitivity knob: force gamma (null = estimate)
export const FIT_COLLINEAR_RATIO = 0.05; // Gram eigenvalue ratio below which (s, gamma) are unidentified
export const J_PRIOR_TOTAL = 1.2; // prior expected future jump total (log) over the horizon
export const J_PRIOR_WEIGHT = 2; // pseudo-refresh count weighting that prior
export const LAMBDA_PRIOR_PER_DAY = 1.0; // refreshes/day before seeing data
export const JUMP_SIZE_PRIOR = 1.0; // log size of a refresh when none seen
export const LAG_CAP_HOURS = 48; // median-lag evaluation shift is capped here
export const LAG_SD_MIN_DAYS = 0.25; // lag std floor, in days
export const LAG_SD_MAX_DAYS = 2.0; // lag std cap, in days

// --- spread (logit) ---
export const S_TREND = 0.3; // sigma_trend = S_TREND * sqrt(horizon days)
// Sweep: 0.3 -> 0.652 mean (23-suite) vs 0.5 -> 0.677 vs 0.8 -> 0.740.
// The trend component was double-counting variance already carried by
// sigma_refresh / sigma_lag / sigma_gamma, so a smaller value calibrates
// the total fan without touching the medians.
export const COUNT_C = 1.0; // sigma_count = COUNT_C / sqrt(E-hat + 1)
export const SAT_SIGMA = 0.08; // fan width for the saturated trophy
export const NEAR_SAT_SIGMA = 0.15; // fan width for near-saturated trophies
export const ASYM_A = 0; // lower fan widened by (1+A), upper by (1-A)
// Sweep: 0 -> 0.651 mean / 2.443 worst; 0.15 -> 0.677 / 2.544;
// 0.3 -> 0.714 / 2.684. The asymmetry HURT: the median already carries
// the dilution shift, so the extra skew mis-shapes the fan. Symmetric.
export const CAL_M = 1.0; // global multiplier on sigma_total (calibrated)

// --- guards ---
export const NEAR_SATURATED = 0.99; // E/P at last epoch that means "tracks pool"
export const RATE_FLOOR_PCT = 0.01; // scorer clamp, low end
export const RATE_CEIL_PCT = 99.99; // scorer clamp, high end
