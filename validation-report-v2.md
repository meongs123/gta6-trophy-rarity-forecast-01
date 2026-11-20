# validation-report-v2.md — gta6-trophy-rarity-forecast-01 v2

Final config ("comboI"): CEIL_LIFT 6, S_TREND 0.3, ASYM_A 0, all other
parameters at prior (see `src/params.ts`). Measured 2026-11-20 ~23:30 WIB
on the live working tree (uncommitted). Design and parameter evidence in
`concept-v2.md` (concept dir). v1's `validation-report.md` is untouched;
this file is the v2 record.

## 1. Headline numbers

| suite | v1 mean | v2 mean | v1 worst | v2 worst | v2 coverage 90% | v2 # < 0.05 |
|---|---|---|---|---|---|---|
| Schema C, 23 scenarios (v1 generator) | 0.686518 | **0.506624** | 2.893006 (satOff) | **2.061318 (satOff)** | 0.993 | 0 |
| Schema C v2, 66 scenarios (v2 generator) | 0.50914 | **0.500907** | 3.02841 (H γ0/capnone/rate5) | **2.983963 (same cell)** | 0.933 | 0 |
| Combined, 89 scenarios | 0.555 | **0.502** | 3.028 | **2.984** | — | 0 |
| Synthetic harness, 9 cases | mean ≈ 1.014 | **mean ≈ 0.515** | — | — | 0.98–1.00 | 9/9 GREEN |

Live pay line (20 Nov 21:33 WIB): rank 20 = 0.022, rank 1 = 0.000005,
rank 50 = 0.0413. v2's best mean (0.502) is 23x the pay line; its worst
(2.984) is 136x. **Verdict: NOT promotable** — see concept-v2.md §0/§7.
The practice cut is a 90-min horizon; the final is 4.6 days (72x
longer); the house bar is unknown; no local number guarantees a prize.

## 2. Synthetic harness — 9/9 GREEN

Runner: `node tools/harness.mjs` (live repo, final config).

| case | loss | cov90 | runtime | deterministic |
|---|---|---|---|---|
| H1 multi-epoch f00 (2 past refreshes, future pool ×6) | 0.410707 | 1.00 | 288/245 ms | true |
| H2 null trophies (one null in epoch 1, one null everywhere) | 0.450361 | 0.98 | 257/279 ms | true |
| H3 rate 0% (trophy 14 forced to zero earners) | 0.413324 | 1.00 | 233/239 ms | true |
| H4 large pool P0=100000 (inversion ambiguity) | 0.422294 | 1.00 | 215/207 ms | true |
| H5 one past refresh ×6 + future pool ×2 | 0.790245 | 1.00 | 187/196 ms | true |
| H6 no refresh at all (single epoch, 2 days) | 0.624314 | 1.00 | 286/306 ms | true |
| H7 only 10 trophies (no hardcoding of 55) | 0.591612 | 1.00 | 201/214 ms | true |
| H8 γ=0 world (earners ignore refreshes) | 0.648514 | 1.00 | 271/329 ms | true |
| H9 γ=1 world (earners follow pool fully) | 0.283794 | 1.00 | 247/228 ms | true |

Mean 0.515 vs v2-base 0.642 vs v1 1.014. Every case better than v1.
Coverage 0.98–1.00 everywhere = slight over-cover on the harness
(the Schema C coverage is the calibrated number: 0.993 / 0.933).

## 3. Schema C, 23 scenarios (v1 generator) — full table

Runner: `node tools/schema-c.mjs`. Mean 0.506624, worst 2.061318,
coverage 0.993, 0/23 < 0.05, K7 max rel diff 70.0%.

| scenario | loss | cov90 | worst trophy | pool × | sat #2 loss |
|---|---|---|---|---|---|
| pool~1.1/ref0/gamma0 | 1.166840 | 1 | 1.626 (id 3) | 1.11 | 0.008448 |
| pool~1.1/ref0/gamma0.5 | 0.442855 | 1 | 0.608 (id 26) | 1.10 | 0.008448 |
| pool~1.1/ref0/gamma1 | 0.349850 | 1 | 0.524 (id 26) | 1.11 | 0.008448 |
| poolx2/ref1/gamma0 | 0.893048 | 1 | 1.323 (id 3) | 2.01 | 0.008448 |
| poolx2/ref1/gamma0.5 | 0.403635 | 1 | 0.530 (id 26) | 2.01 | 0.008448 |
| poolx2/ref1/gamma1 | 0.289523 | 1 | 0.381 (id 20) | 2.02 | 0.008448 |
| poolx6/ref1/gamma0 | 0.669699 | 1 | 1.329 (id 3) | 6.05 | 0.008448 |
| poolx6/ref1/gamma0.5 | 0.398717 | 1 | 0.638 (id 3) | 6.08 | 0.008448 |
| poolx6/ref1/gamma1 | 0.367944 | 1 | 0.562 (id 22) | 6.08 | 0.008448 |
| poolx6/ref3/gamma0 | 0.419051 | 1 | 0.663 (id 3) | 6.10 | 0.008448 |
| poolx6/ref3/gamma0.5 (central) | 0.338371 | 1 | 0.514 (id 26) | 6.10 | 0.008448 |
| poolx6/ref3/gamma1 | 0.338520 | 1 | 0.477 (id 26) | 6.10 | 0.008448 |
| poolx20/ref1/gamma0 | 0.357000 | 1 | 0.541 (id 1) | 20.29 | 0.008448 |
| poolx20/ref1/gamma0.5 | 0.318165 | 1 | 0.522 (id 3) | 20.28 | 0.008448 |
| poolx20/ref1/gamma1 | 0.353007 | 1 | 0.533 (id 22) | 20.33 | 0.008448 |
| poolx20/ref3/gamma0 | 0.436142 | 1 | 0.651 (id 3) | 20.20 | 0.008448 |
| poolx20/ref3/gamma0.5 | 0.306001 | 1 | 0.432 (id 26) | 20.23 | 0.008448 |
| poolx20/ref3/gamma1 | 0.305170 | 1 | 0.434 (id 20) | 20.28 | 0.008448 |
| poolx6/ref3/gamma0.5/lag12h | 0.360154 | 1 | 0.595 (id 3) | 6.08 | 0.008448 |
| poolx6/ref3/gamma0.5/lag24h | 0.357720 | 1 | 0.527 (id 3) | 3.38 | 0.008448 |
| poolx6/ref3/gamma0.5/lag48h | 0.355330 | 1 | 0.632 (id 3) | 3.35 | 0.008448 |
| poolx6/ref3/gamma0.5/satOff | 2.061318 | 0.836 | 9.427 (id 26) | 6.09 | 0.008448 |
| refresh-akhir poolx6@-1h | 0.364299 | 1 | 0.396 (id 40) | 37.10 | 0.008448 |

Central-scenario group losses: platinum #1 0.261, saturated #2 0.008,
bronze-story 0.513, gold 0.272, bronze-other 0.332, silver 0.259,
bronze-grind 0.295. satOff group losses: bronze-story 9.397, everything
else ≤ 0.80 — the story ceiling is the entire satOff error.
γ=0 no-refresh group losses: story 1.623, other 1.165, platinum 1.19.

## 4. Schema C v2, 66 scenarios (second generator) — full table

Runner: `node tools/schema-c-v2.mjs`. Mean 0.500907, worst 2.983963,
coverage 0.933, 0/66 < 0.05, K7 max rel diff 88.5%, non-deterministic
runs 0. Per-family (mean/worst): A 1.019/1.398, B 0.398/0.500,
C 0.378/0.543, D 0.368/0.482, E 0.286/0.347, F 0.515/0.578,
G 0.272/0.275, H 0.537/2.984.

| scenario | loss | cov90 | worst trophy | pool × |
|---|---|---|---|---|
| A satStop48/ceilx1 | 0.873957 | 0.836 | 1.714 (id 26) | 6.09 |
| A satStop48/ceilx3 | 1.307048 | 0.273 | 1.815 (id 18) | 6.16 |
| A satStop48/ceilx10 | 1.397905 | 0.273 | 1.988 (id 18) | 6.16 |
| A satCeilx10/nofreeze | 0.495967 | 1 | 1.304 (id 3) | 6.15 |
| B refresh-end/x2@-1h | 0.323804 | 1 | 0.529 (id 4) | 12.38 |
| B refresh-end/x6@-1h | 0.371419 | 1 | 0.404 (id 20) | 36.95 |
| B refresh-end/x18@-1h | 0.500139 | 1 | 0.658 (id 40) | 111.81 |
| C lag0h/ref0 | 0.542818 | 1 | 0.851 (id 26) | 1.11 |
| C lag0h/ref1 | 0.376488 | 1 | 0.552 (id 26) | 6.04 |
| C lag0h/ref3 | 0.372386 | 1 | 0.547 (id 4) | 6.12 |
| C lag12h/ref0 | 0.431180 | 1 | 0.569 (id 26) | 1.09 |
| C lag12h/ref1 | 0.307844 | 1 | 0.457 (id 3) | 5.99 |
| C lag12h/ref3 | 0.413911 | 1 | 0.675 (id 3) | 3.43 |
| C lag24h/ref0 | 0.483828 | 1 | 0.833 (id 3) | 1.09 |
| C lag24h/ref1 | 0.292107 | 1 | 0.357 (id 3) | 5.92 |
| C lag24h/ref3 | 0.317534 | 1 | 0.477 (id 3) | 3.37 |
| C lag48h/ref0 | 0.358957 | 1 | 0.559 (id 1) | 1.06 |
| C lag48h/ref1 | 0.334853 | 1 | 0.560 (id 3) | 5.86 |
| C lag48h/ref3 | 0.306796 | 1 | 0.434 (id 3) | 3.31 |
| D regime/one/gamma0.5 | 0.266353 | 1 | 0.375 (id 26) | 6.11 |
| D regime/two/gamma0.5 | 0.395825 | 1 | 0.446 (id 20) | 6.10 |
| D regime/two/gamma0 | 0.482448 | 1 | 0.594 (id 8) | 6.09 |
| D regime/two/gamma1 | 0.327112 | 1 | 0.412 (id 26) | 6.09 |
| E lowcount-noise/central/seed201 | 0.274216 | 1 | 0.366 (id 26) | 6.12 |
| E lowcount-noise/central/seed202 | 0.237970 | 1 | 0.339 (id 26) | 6.12 |
| E lowcount-noise/norefresh/seed201 | 0.347221 | 1 | 0.521 (id 1) | 1.11 |
| F nearsat/central | 0.452484 | 1 | 1.844 (id 4) | 6.14 |
| F nearsat/norefresh | 0.577533 | 0.945 | 3.060 (id 3) | 1.11 |
| G platinum-E4-noise/seed301 | 0.275076 | 1 | 0.389 (id 26) | 6.12 |
| G platinum-E4-noise/seed302 | 0.268832 | 1 | 0.382 (id 26) | 6.11 |
| H gamma0/cap20/rate0.5 | 0.593591 | 1 | 0.720 (id 33) | 2.72 |
| H gamma0/cap20/rate1 | 0.279802 | 1 | 0.316 (id 15) | 6.67 |
| H gamma0/cap20/rate3 | 0.338413 | 1 | 0.614 (id 1) | 20.14 |
| H gamma0/cap20/rate5 | 0.351752 | 1 | 0.615 (id 1) | 20.11 |
| H gamma0/cap50/rate0.5 | 0.751448 | 1 | 0.986 (id 38) | 2.74 |
| H gamma0/cap50/rate1 | 0.464533 | 1 | 0.577 (id 20) | 6.73 |
| H gamma0/cap50/rate3 | 0.426961 | 1 | 1.084 (id 1) | 50.80 |
| H gamma0/cap50/rate5 | 0.457382 | 1 | 1.103 (id 1) | 50.74 |
| H gamma0/capnone/rate0.5 | 0.660672 | 1 | 0.803 (id 20) | 2.73 |
| H gamma0/capnone/rate1 | 0.378560 | 1 | 0.444 (id 40) | 6.70 |
| H gamma0/capnone/rate3 | 1.654149 | 0.018 | 2.090 (id 7) | 244.92 |
| H gamma0/capnone/rate5 | 2.983963 | 0.018 | 4.543 (id 22) | 8951.27 |
| H gamma0.5/cap20/rate0.5 | 0.301831 | 1 | 0.372 (id 1) | 2.71 |
| H gamma0.5/cap20/rate1 | 0.287093 | 1 | 0.423 (id 26) | 6.67 |
| H gamma0.5/cap20/rate3 | 0.304394 | 1 | 0.400 (id 26) | 20.11 |
| H gamma0.5/cap20/rate5 | 0.320351 | 1 | 0.434 (id 26) | 20.37 |
| H gamma0.5/cap50/rate0.5 | 0.325220 | 1 | 0.392 (id 20) | 2.74 |
| H gamma0.5/cap50/rate1 | 0.275905 | 1 | 0.394 (id 26) | 6.73 |
| H gamma0.5/cap50/rate3 | 0.378217 | 1 | 0.470 (id 26) | 50.74 |
| H gamma0.5/cap50/rate5 | 0.373358 | 1 | 0.459 (id 26) | 50.67 |
| H gamma0.5/capnone/rate0.5 | 0.299614 | 1 | 0.363 (id 1) | 2.72 |
| H gamma0.5/capnone/rate1 | 0.265918 | 1 | 0.359 (id 26) | 6.69 |
| H gamma0.5/capnone/rate3 | 0.620062 | 1 | 0.778 (id 32) | 244.58 |
| H gamma0.5/capnone/rate5 | 1.810517 | 0.182 | 2.293 (id 14) | 8939.09 |
| H gamma1/cap20/rate0.5 | 0.344416 | 1 | 0.479 (id 26) | 2.71 |
| H gamma1/cap20/rate1 | 0.335609 | 1 | 0.479 (id 26) | 6.66 |
| H gamma1/cap20/rate3 | 0.412668 | 1 | 0.512 (id 18) | 20.37 |
| H gamma1/cap20/rate5 | 0.401701 | 1 | 0.504 (id 26) | 20.34 |
| H gamma1/cap50/rate0.5 | 0.396876 | 1 | 0.503 (id 26) | 2.74 |
| H gamma1/cap50/rate1 | 0.388654 | 1 | 0.494 (id 26) | 6.72 |
| H gamma1/cap50/rate3 | 0.380616 | 1 | 0.369 (id 26) | 50.67 |
| H gamma1/cap50/rate5 | 0.370540 | 1 | 0.494 (id 26) | 50.60 |
| H gamma1/capnone/rate0.5 | 0.364501 | 1 | 0.494 (id 26) | 2.72 |
| H gamma1/capnone/rate1 | 0.353613 | 1 | 0.489 (id 26) | 6.68 |
| H gamma1/capnone/rate3 | 0.348529 | 1 | 0.485 (id 26) | 244.25 |
| H gamma1/capnone/rate5 | 0.344416 | 1 | 0.479 (id 26) | 8930.99 |

The H-family pattern is the cleanest diagnostic in the report: every
γ=1 cell scores 0.34–0.41 regardless of cap or rate (earners follow the
pool, so no dilution); every γ=0/cap≤50 cell scores 0.28–0.75; only
γ=0/capnone/rate3–5 blow up (1.65, 2.98, coverage 0.018) — five future
refreshes of 1.8 log each (pool ×8951) with earners not following, from
two past jumps of 0.6 log. No model can foresee a 9.0-log future jump
total from a 1.2-log past. The pool cap is not the binding constraint
(the model's expected jump total is ~1.76 log either way).

## 5. Parameter sweep summary

One-knob sweeps on the 23-suite (35 variants), combinations on both
suites (11 combos). Full numbers in concept-v2.md §5. What moved the
needle: CEIL_LIFT (2.5→6: mean 0.677→0.561), GAMMA_FORCE=1 (0.461 —
rejected: 66-worst 3.69), S_TREND 0.3 (0.652), ASYM_A 0 (0.651),
J_PRIOR_TOTAL 0.6 (0.621). What did nothing on Schema C: KAPPA (1/3/10),
CEILING_GRID on/off, CEILING_PENALTY (5/20/80), GAMMA_PER_TIER,
AGGREGATE_CONSTRAINT, POOL_TWO_REGIME, POOL_CAP (20/50/none), JUMP_LOG
(0.1/0.2/0.4), LAMBDA_PRIOR ≥ 0.65/day. What hurt: GAMMA_FORCE=0
(0.988), S_TREND 0.8 (0.740), CAL_M 1.3 (0.738), ASYM_A 0.3 (0.714),
J_PRIOR_TOTAL 2.0 (0.767), LAMBDA_PRIOR 0.109–0.217/day (0.708).

Combination results (89 scenarios, mean/worst): base 0.575/2.573,
comboA (γ=1, lift6, CAL_M 0.8, sTrend 0.3, asym0) 0.475/3.691,
comboB (lift8) 0.491/3.691, comboE (fitted γ, dilution shrunk)
0.492/3.501, comboH 0.474/3.451, comboI (shipped) 0.502/2.984,
comboJ 0.494/3.420, comboK 0.509/3.347, comboL 0.518/2.980.
Shipped config chosen by minimax over all 89; it is the only config
besides comboL that beats v1 on both combined mean and combined worst.

## 6. Determinism, runtime, format

- Two runs of `main.ts` on the kit inputs (p00, p01): byte-identical.
  sha256 p00 `720b69f054850a4b2fa69a6de3c084ce7c40af7a477f97309445853804e062ba`,
  p01 `c2994d69693aca91e1b93a14a35527f331d8da9ceaf9a8d8e86deeb40c7fe1e1`.
- Runtime ~186–195 ms per run (both cases, Node v24.22.1 on the VM;
  limit 8 s/case).
- Output 2,798 B per case (limit 65,536 B). 55 rows, quantiles
  non-decreasing, exactly 5 quantiles each.
- p00 medians: #1 platinum 0.3441%, #2 saturated 99.99%,
  #3 story 0.6882% (q05 0.0632, q95 7.0529). Median range 0.3441–99.99%.

## 7. Per-trophy diagnosis (final config)

- Saturated #2 "Just Like Paradise": loss 0.008448 in every scenario.
- Platinum #1 "Vice Got a Price!" (E=4): 0.261 central, 0.296 satOff,
  1.19 in γ=0 no-refresh, 1.369 in H capnone/rate5.
- 33 trophies with 1–5 earners (family E): mean 0.286, worst 0.347.
- Near-saturated (family F): mean 0.515; worst trophy #4
  "T**s Ass Drug Money" 1.844 central, #3 "Paradise Lost" 3.060
  norefresh.
- Worst trophies overall: #26 "Supply & Demand" (9.427 satOff, 0.514
  central), #22 "Road to Rehabilitation" (4.543 H γ0/capnone/rate5),
  #18 "Top Fun" (1.988 A satStop48/ceilx10), #3 "Paradise Lost"
  (1.626 γ=0 no-refresh), #40 "Maximum Withdrawal" (0.396
  refresh-end).
- Persistent weak group: bronze-story (central 0.513; satOff 9.397).
  The ceiling is the binding uncertainty in every suite.

## 8. K1–K7 checklist (build-spec §7)

- K1 format gate: PASS.
- K2 synthetic robustness: PASS (9/9, mean 0.515).
- K3 Schema C worst < 0.05 (refresh-end < 0.30): FAIL (worst 2.061,
  refresh-end 0.364 / 0.324–0.500 on the 66-suite).
- K4 coverage 0.90–0.98: PARTIAL (0.933 on 66 — pass; 0.993 on 23 —
  over-cover).
- K5 stress divergence ≤ 2× practice: NOT EVALUABLE (no server
  practice grade for v2).
- K6 practice loss rambu: NOT MEASURED (no server grade for v2).
- K7 γ sensitivity < 50%: FAIL (70.0% on 23, 88.5% on 66).

## 9. Reproduction

From the entry repo root (Node ≥ 22, stdlib only, offline):
- `node tools/harness.mjs` — 9/9.
- `node tools/schema-c.mjs` — 23 scenarios, stdout JSON.
- `node tools/schema-c-v2.mjs` — 66 scenarios; honors
  `SCHEMA_C_V2_ENTRY_ROOT` and `SCHEMA_C_V2_OUT_JSON`.
- `MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=<out> node main.ts`
  — p00/p01 outputs; run twice and compare sha256 for determinism.
Sweep drivers and frozen per-variant results live in /tmp/v2-work/
(sweep.mjs, sweep2.mjs, sweep3.mjs, sweep-results.json,
sweep2-results.json, sweep3-results.json) and /tmp/sweep*/ — scratch,
not part of the submission.
