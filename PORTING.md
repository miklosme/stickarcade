# Original behavior and browser adaptations

The source of truth is `vendor/StickArcade.gmz`. `bun run import:original` extracts
its GMX/XML and GML files into `.cache/gamemaker/` for inspection. No GameMaker
editor or compiled runner is needed to build or run this port.

## Coordinate contracts

All gameplay runs in original GameMaker units: positive X right, positive Y down.
The renderer uses an orthographic camera. CSS sizing, device pixel ratio, and
canvas resolution do not enter the simulation. The fixed simulation rate is
30 steps per second; rendering may run at any refresh rate.

| Contract                 | Original value                                                                        | Source inside GMZ                                                     |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Room                     | 2000 × 480, 30 Hz                                                                     | `rooms/room_game.room.gmx`                                            |
| Ground                   | Y = 380                                                                               | `StickArcade.project.gmx`                                             |
| Player spawn             | (1000, 380)                                                                           | `objects/OP.object.gmx`                                               |
| Player mask              | X 90..110, Y 31..199, origin (100, 200)                                               | `sprites/s_stickman_stand.sprite.gmx`                                 |
| Player motion            | Acceleration/friction 1.5, maximum speed 15 per step                                  | `objects/o_player.object.gmx`, `objects/__player_controll.object.gmx` |
| Player limits            | X = 100..1900                                                                         | `objects/o_player.object.gmx`                                         |
| Camera follow            | Rounded distance / 6, clamped to room                                                 | `objects/CAM.object.gmx`                                              |
| Punch hit                | (X + facing × 60, Y − 140), frame 6, animation speed 0.5                              | `objects/o_player.object.gmx`                                         |
| Kick hit                 | (X + facing × 42, Y − 35), frame 4, animation speed 0.6                               | `objects/o_player.object.gmx`                                         |
| Hit mask                 | 72 × 32, origin (36, 16), inclusive bounds 0..71 / 0..31                              | `sprites/m_hit.sprite.gmx`                                            |
| Side spawns              | View right + 150 or view left − 150; first enemies from right                         | `scripts/spawn.gml`                                                   |
| Octopus spawn            | View left + floor(random(view width)), Y = 380                                        | `scripts/spawn.gml`                                                   |
| Bean                     | Speed 6 + random(3), range 50, hit frame 6                                            | `objects/o_bean.object.gmx`                                           |
| Sheep                    | Integer speed 7..10, jump range 190, damage range 40, jump velocity −10, gravity +0.6 | `objects/o_sheep.object.gmx`                                          |
| Octopus                  | Speed 5 + random(2), range 95..105, hit frame 13, mask switch at frame 47             | `objects/o_oct.object.gmx`                                            |
| Warrior                  | Speed 5 + round(random(4)), range 75..85, hit frame 6, immune to kicks                | `objects/o_warrior.object.gmx`                                        |
| Crates                   | Y = 0, initial vertical speed 10, gravity +1, margin 300                              | `scripts/drop_box.gml`, `objects/o_box.object.gmx`                    |
| Projectiles              | Horizontal speed 30 when kicked; sheep ricochet −15 / −15                             | `objects/o_wheel.object.gmx`, `objects/o_sheepball.object.gmx`        |
| Lives                    | 10 initially, +3 health only at 7 or fewer                                            | `objects/OP.object.gmx`, `objects/o_powerup_hp.object.gmx`            |
| Combo                    | 100 × multiplier (200 during bonus), max multiplier 5, 20-step expiry                 | `objects/__enemy.object.gmx`                                          |
| Power-ups                | 300 steps per shield/bonus, draw from a bag of four                                   | `scripts/next_powerup.gml`, `objects/o_powerup_*.object.gmx`          |
| Touch movement threshold | 8 original screen units                                                               | `objects/__player_controll.object.gmx`                                |

The complete wave string is imported directly, including `A` group markers and
the `B` loop back to index 317. Sprites retain all 488 frames, their origins, and
their stored bounding boxes; actor masks remain independent of visible animations.
Crate placement uses the original diagonal collision-line probe. Hit instances
are placed during Step and resolved after motion, matching the documented
[GameMaker event order](https://manual.gamemaker.io/lts/en/The_Asset_Editors/Object_Properties/Event_Order.htm).

The renderer uses original parallax rates (0.9, 0.8, 0.7, 0.6, 0.5, 0.3), original
layer offsets, and original depth values. It adapts the active water reflection
and grayscale shaders to Three.js render targets. The noise/blur shaders present
in the archive are not active in the original gameplay path. Bitmap font glyphs
come from the original font sheets; score digits preserve proportional spacing.

## Deliberate browser adaptations

- Vite and React Three Fiber are used as requested; Bun handles dependencies,
  scripts, extraction, and tests.
- The original touch source records a joystick coordinate but does not wire it
  to motion or instantiate its P/K control objects. This port connects that
  unfinished path to the original movement/attack events. It uses the original
  P/K artwork at the tutorial tap anchors `(SCREEN_WIDTH - 200, 245/345)`, scaled
  to 0.7 for two distinct hit targets. No new visible controls are introduced.
- Every screen fits the same 853 × 480 logical playfield, retaining the existing
  portrait layout and the original `floor(480 × 16 / 9)` baseline. The archived
  runner derived its width from the display ratio; this browser port fixes that
  ratio so screen size cannot change camera coverage or viewport-relative
  spawns. One uniform scale fits the whole playfield, centered with black space
  on either side on wide screens or above and below on tall screens. Rotating
  or resizing changes only presentation, never the camera or gameplay geometry.
- The original INI scoreboard becomes `localStorage`. Saving immediately at
  death prevents losing the run if the page closes during the original delayed
  name prompt. Empty names keep the generated player name. Names too long for
  their original scoreboard column are clipped to preserve the score column.
- Original name and leave-game dialogs use modal HTML equivalents with the same
  prompts and OK/Cancel choices, including support for embedded browsers.
  Original social buttons open the original sharing destinations, without
  sending anything automatically. Native ad/rating/analytics APIs are omitted.
- Touch, tab hiding, and focus loss clear held inputs. Background tabs stop
  simulation, and a long rendering stall never advances more than 0.25 seconds
  in one render callback. Foreground play still uses exact 1/30-second steps.
- Keyboard-accessible transparent HTML hit targets overlay the original WebGL
  buttons; the visible controls are exclusively the game's own sprites.

## Verification scope

`bun test` checks original numerical fixtures: movement and reversal,
viewport-independent world limits, masks and mirroring, frame-specific combat,
enemy stats and spawn positions, the octopus mask transition, sheep trajectory,
combos, crates, health/shield behavior, tutorial thresholds, pause, and persistent
score ordering. `bun run build` runs TypeScript checking and a Vite production
build.

The completed verification run passed 31 tests and the production build. Browser
checks covered keyboard movement and a scored kill, swipe movement and the K
button at 844 × 390, portrait layout and scoreboard at 390 × 844, pause/resume,
the leave-game dialog, death, naming, and scores surviving reload. The production
preview rendered at 1280 × 720 without console errors. Phone checks used browser
touch emulation; physical iOS/Android devices were not available. All 488 sprite
frames were also compared pixel-for-pixel against the extracted PNGs.

Sheep-body regression tests additionally cover walking out of view on either
side and returning to kick the same body, plus narrowing the viewport. The
original `o_sheepball` cleanup is an Outside Room event; camera movement does
not remove a resting body that is still inside the level.

This is a source-based port. No original compiled runner or gameplay recording
was supplied for side-by-side visual/timing comparison. The numerical contracts
above are verified against the archive; exact old-runner behavior in ambiguous
event ordering and random number sequences is not claimed. Random outcomes keep
the original ranges/distributions but use the browser's random generator.
