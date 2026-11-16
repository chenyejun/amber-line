# Amber Line

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/chenyejun/amber-line/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/chenyejun/amber-line/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser, built on three.js. Dusk over the old
freight yard: you hold the line with two Amber teammates against five Rust raiders.
First to five rounds takes the yard — and the raiders carry a charge, so every round
is a race to stop the plant or cut the wire.

## Run it

```sh
node serve.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=kr2w23qf&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

---

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network: the
game is static files under `game/`, with three.js 0.187.0 vendored in
`game/vendor/three/`.

- **W A S D** move, **mouse** look, **click** fire, **R** reload, **Space** jump,
  **Ctrl** crouch, **G** throw a grenade, **E** plant / defuse, **B** buy menu,
  **1–4** switch weapon.
- **Rounds:** buy phase, then a 100-second round. Wipe the other team, run the
  clock out, or defuse the charge. First to 5 rounds wins the match.
- **Money:** kills pay $300, a round win $3250. Spend it between rounds on the
  Jackal SMG ($1500), the Longshot rifle ($2700), the Harpoon marksman rifle
  ($4200) or frag grenades ($300). The P9 sidearm is free.
- **Bots:** two Amber defenders hold the sites with you; five Rust raiders push the
  lanes, investigate gunfire, strafe and burst-fire when they see you, and their
  carrier plants the charge when a site is clear.
- **Gunplay:** hitscan with headshot multipliers, recoil and spread that punish
  firing on the move, acceleration and crouching, and collision with the whole
  yard. Stopping to aim pays.

## The yard

Freight Yard 9 is an original three-lane map: a crate alley west, a container
lane east, and a raised loading platform in the middle with steps on both sides.
Two bomb sites sit at the north end — Site A under the amber lamp, Site B under
the red one. Everything is plain three.js geometry, lit by a low amber sun; every
sound is synthesised with WebAudio, so the game ships no audio files at all.

## Screenshots

The captures in `screenshots/` are deterministic renders of the game's own code:
`?shot=start`, `?shot=play`, `?shot=buy` and `?shot=end` (with `&seed=1`) stage
the opening, a mid-round firefight, the buy menu and a round card.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library. It refuses an entry over the
competition's caps instead of handing it in broken.

## License

MIT — see [LICENSE](LICENSE).
