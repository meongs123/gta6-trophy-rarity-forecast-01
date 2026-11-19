# gta6-trophy-rarity-forecast-01

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/meongs123/gta6-trophy-rarity-forecast-01/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/meongs123/gta6-trophy-rarity-forecast-01/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Write a program that reads the earn rate of every Grand Theft Auto VI trophy on Exophase as the house recorded it up to 2026-11-21 11:30 UTC and forecasts each trophy's rate at 2026-11-26 00:00 UTC, the percent of players who will have earned it by then, as five quantiles a trophy, for the lowest pinball loss on the logit scale: places go by that loss, lowest first, so 1st place is the best forecast, and a forecast must also beat our house forecasts to take any place, so one that beats them but ranks below 20th wins nothing; the lowest loss wins $50, 2nd place $35, 3rd place $25, 4th to 10th place $10 each and 11th to 20th place $7 each.

The entry is a program, not a web app: `main.ts` (Node 22, standard library only) reads each case file at `/input` and writes one forecast file to `/output` — five quantiles (0.05, 0.25, 0.5, 0.75, 0.95) of every trophy's Exophase earn rate at the case's target. It runs offline, with no network. `vendor/house-baseline.ts` is the kit's starter kept byte-for-byte as a pristine reference; `main.ts` starts from the same house baseline (persistence) and is developed from there.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`input/` holds the case files from the competition kit (`input/*.in`); `out/` receives one `<id>.out` per case.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vh95w5pk&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
