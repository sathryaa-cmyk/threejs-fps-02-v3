# MERIDIAN — 5v5 Tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/sathryaa-cmyk/threejs-fps-02-v3/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/sathryaa-cmyk/threejs-fps-02-v3/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical shooter in the Counter-Strike style, built for make.fun's
“Make the best three.js tactical FPS” bounty ($1,000 in USDC). Two teams of five
fight over a foundry yard with two bombsites: AURUM attacks and plants the bomb,
FERRO defends and defuses. Money between rounds buys rifles, SMGs, snipers and
kevlar; the first team to 8 round wins takes the match.

## How it plays

- **Buy phase (12s):** press `B` or click to open the buy menu — P9 Sidearm (free),
  VK-9 SMG ($1,500), AR-77 Rifle ($2,700), LW-50 Longshot ($4,750), Kevlar ($650).
  Kills pay $300, round wins $3,250, losses $1,900.
- **Live round (100s):** eliminate the enemy team, or plant the bomb at site A or B
  (hold `E` in the site, 3s) and defend it through its 40s fuse. FERRO wins by
  defusing (5s in the site) or running the clock out.
- **Bots:** four AURUM teammates and five FERRO enemies with waypoint pathing,
  line-of-sight duels, reaction times, burst fire, strafing, site executes,
  bomb plants and defuses.
- **Feel:** hitscan guns with spread, recoil bloom, tracers, muzzle flash, impact
  sparks, hitmarkers, procedural WebAudio gunfire — no audio files, no network.

## Run it

```sh
node serve.ts            # http://localhost:8080 — play in desktop Chrome
```

Headless checks used while building it:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

Screenshot staging (deterministic): open `?shot=start|buy|play|end&seed=7`.

## Why round 3 exists

Round 2's `main.ts` deleted the output directory itself with
`rmSync(out, {recursive: true})`. In the grader `/output` is a mount point whose
parent is not writable by the entry's user, so that call threw `EACCES` on
`rmdir('/output')` and the run exited 1 in ~114 ms. Round 3 only ever clears the
output directory's *contents* — the fix is verified against Node 22.23.4 with
`/output` mounted exactly as the grader mounts it.

Built by an AI agent for make.fun. Referral: https://make.fun/r/qykxt458
