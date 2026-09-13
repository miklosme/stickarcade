# StickArcade

I made this game in highschool (2009).

Ported to web using `GPT-6 Astra`.

Play it at <https://stickarcade.miklos.dev>

---

A browser port of the GameMaker project in `vendor/StickArcade.gmz`, built with
Vite, React, and React Three Fiber. All artwork, animation frames, sound effects,
bitmap fonts, menus, and HUD graphics come from the original archive.

## Run

```sh
bun install
bun run dev
```

Open the local URL printed by Vite. To play on a phone on the same Wi-Fi, open
the Network URL printed by Vite. The server listens on all interfaces for this.

```sh
bun test
bun run build
bun run preview
```

`dist/` is the static production build. There is no server-side game state.

## Controls

- **Left/right arrows:** move.
- **S:** punch; **D:** kick.
- **Escape:** pause/resume. The original pause/continue/back buttons also work.
- **Touch:** drag/swipe the left half to move; lift to stop. Tap the right
  playfield above the ground line to punch or below it to kick (the split is
  `GROUND_LEVEL - 70`). Movement and attacks support simultaneous touches.

The original tutorial automatically plays when the best score is below 3,000.
Move more than 400 world units in both directions to complete the movement
lesson. The original tutorial artwork says “swipe”; keyboard players use the
arrow keys. The separate tutorial button always starts the tutorial.

The ten-entry scoreboard is saved to `localStorage` at death, before the death
animation finishes. The original name prompt then updates that entry. Reloading
keeps the scoreboard and last player name. Keys: `stickarcade.highscores.v1` and
`stickarcade.player-name`. Scores are local to this browser and origin. If storage
is unavailable, the current session remains playable with an in-memory board.

## Fidelity and source mapping

See [PORTING.md](PORTING.md) for numerical contracts, original source paths,
browser adaptations, and limits on comparing against the old runner.

The archived source is extracted to ignored `.cache/gamemaker/` by:

```sh
bun run import:original
```

This requires libarchive `tar` (included on macOS), which reads the 7-Zip GMZ
without GameMaker. It regenerates the lossless texture atlases in `public/assets/`
and the sprite/font metadata in `src/game/original.json`. These generated assets
are included, so ordinary install/build/play does not require extraction.

The simulation is separate from the renderer in `src/game/engine.ts`. Vite dev
builds expose a read-only `window.stickarcadeSnapshot()` for coordinate inspection;
the production build omits it.
