# VOID WING - project guide

Part of the "5 game test" series (one-shot builds from a single meta-prompt). This folder is its own
git repo. Writing rule for every file here: no em dashes (use commas, colons or a spaced hyphen).

## Pitch

VOID WING is a 3D space combat game in the browser. You fly a KV-9 Kestrel starfighter, call sign
Void One, through the Tarsus asteroid belt with two AI wingmen. Clear three waves of Hegemony fighters
(Razor dogfighters and Maul bombers), then the Hegemony carrier Leviathan jumps in behind an energy
shield. Knock out its four shield generators to trigger a chain reaction that tears the carrier apart.
Die and it is mission failed; retry from the current wave.

## Run

- `npm install`, then `npm run dev` (Vite dev server on http://127.0.0.1:5173).
- `npm run build` type-checks and builds to `dist/`; `npm run preview` serves the build.
- `npm run playtest -- --scenario win|lose|ui|showcase|smoke` runs the headless Playwright
  self-test (screenshots, console log and report.json in `test-output/`). Add `--god` for the win
  run and `--preview` to test the production build (`--nobuild` reuses dist/ for parallel runs).
- `npm run assets` rebuilds every GLB from `blender_scripts/` with Blender in background mode
  (set `BLENDER_PATH` if Blender is not at the default install path).

URL flags for testing: `?test` exposes `window.__VW` hooks, `?god` makes the player invulnerable,
`?phase=N` jumps to a mission phase, `?seed=N` fixes the asteroid layout, `?nosound`.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Aim. The ship turns toward the white steering ring; click the game to capture the mouse |
| Left mouse | Lasers (hold) |
| Right mouse or F | Fire a missile once the lock-on tone goes solid |
| W / S | Throttle up / down |
| A / D | Roll left / right |
| Shift or Space | Boost (drains the boost meter) |
| Tab | Cycle target |
| Esc or P | Pause |

## Stack and layout

Vite + TypeScript + Three.js (WebGL2). No runtime downloads: every model is a GLB made by the
scripts in `blender_scripts/`, textures are Blender-baked or shader-generated, all audio is Web Audio
synthesis, fonts are open fonts bundled through npm (@fontsource).

```
src/core      renderer, input, math, pools
src/game      entities (ships, AI, weapons, asteroids, capital ship), mission director, world
src/render    assets loader, camera rig, sky, particles, trails, shield shader
src/audio     synth SFX and the music sequencer
src/ui        HUD (DOM + canvas overlay), menus and screens, styles
src/debug     test hooks for Playwright
blender_scripts/  one Python script per asset family (+ vw_common.py helpers)
public/assets/    exported .glb files
scripts/          playtest.mjs (Playwright self-test), build-assets.mjs
docs/critic/      critic subagent reports per milestone
screenshots/      final player-view screenshots
```

Conventions: ship local frame is -Z forward, +Y up, +X right (same as a Three.js camera).
In Blender, ships are modelled nose toward +Y, up +Z, so the glTF export lands nose at -Z.
1 unit = 1 metre.

## Milestone plan

Do them in order. After each milestone run the self-test loop below.

1. [x] Greybox: core loop playable with primitive shapes, win and lose states work.
   (4 critic rounds, reports in docs/critic/m1-round*.md; progress shots in docs/progress/m1-greybox)
2. [x] Assets: model everything in Blender via the MCP, export GLB, swap into the game.
   (2 critic rounds, docs/critic/m2-round*.md; shots in docs/progress/m2-assets)
3. [x] Feel: animation, camera, particles, screen shake, hit feedback, sound, music.
   (6 critic rounds, docs/critic/m3-round*.md; shots in docs/progress/m3-feel. Reticle and HUD
   layout issues carried into M4.)
4. [x] UI: title, HUD, pause, game over and victory screens with a consistent designed look.
   (11 critic rounds, docs/critic/m4-round*.md; shots in docs/progress/m4-ui. World readability,
   carrier art and the asteroid split carried into M5.)
5. [ ] Polish and perf: steady 60 fps on a mid-range laptop, no console errors.

Done means: a first-time player can start, understand the controls, play, and reach both win and
lose screens with no bugs; README.md with controls and how to run; `screenshots/` with 6 final
player-view shots.

### Self-test loop (after every milestone)

1. `npm run playtest -- --scenario win` and `--scenario lose`: headless Chromium plays through
   scripted input, captures screenshots from the player camera, records console output.
2. Spawn a critic subagent that sees ONLY the screenshots and the pitch (not code, not reasoning).
   It lists the 5 worst problems a player would notice. Save the report to `docs/critic/`.
3. Fix them. Repeat until the critic's worst remaining issue is cosmetic.

## Asset list

| Asset | Script | Output |
| --- | --- | --- |
| KV-9 Kestrel player ship (panels, cockpit, nozzles, emissive trim) | `player_ship.py` | `kestrel.glb` |
| Razor dogfighter | `enemy_ships.py` | `razor.glb` |
| Maul bomber | `enemy_ships.py` | `maul.glb` |
| Leviathan carrier (3 breakable hull sections, hardpoint empties) | `capital_ship.py` | `leviathan.glb` |
| Shield generator | `capital_ship.py` | `generator.glb` |
| Carrier turret | `capital_ship.py` | `turret.glb` |
| Asteroids, 4 variants with baked procedural rock texture | `asteroids.py` | `asteroid_a..d.glb` |
| Missile | `ordnance.py` | `missile.glb` |
| Debris chunks (rock and hull fragments for explosions) | `ordnance.py` | `debris.glb` |

## DECISIONS log

Newest last. Each entry: date, decision, reason.

- 2026-09-24: Repo lives at `5 game test/VoidWing` with its own git history and a private GitHub
  repo; the parent folder's repo excludes `5 game test/` locally. Reason: separate project.
- 2026-09-24: Blender work runs through the Blender MCP against the Blender 5.1 GUI (the MCP's
  background tool has no BLENDER_PATH). Scripts are still standalone so `npm run assets` can
  regenerate everything headless.
- 2026-09-24: Flight model is "mouse aim": the mouse moves an aim direction (unbounded with pointer
  lock), the ship turns toward it at a capped rate, the camera follows the ship. The crosshair shows
  where the guns point; a small ring shows where you are steering. Reason: this is the scheme
  first-time PC players pick up fastest (point where you want to go), and it avoids the overshoot of
  a virtual-joystick scheme.
- 2026-09-24: Laser bolts fly exactly along the gun line (they only inherit the ship's forward speed),
  so the crosshair never lies; the lead indicator solves the intercept against target velocity.
  Mild aim assist bends bolts onto the lead point inside a 2.5 degree cone.
- 2026-09-24: Missile lock builds automatically while the current target stays inside the lock ring;
  RMB or F fires once locked. One button, no hold-and-release.
- 2026-09-24: Added two AI wingmen (Void Two, Void Three) so friend vs foe markers mean something.
  They deal reduced damage so the player gets most kills.
- 2026-09-24: The carrier hull is invulnerable behind its shield; only the four generators on pylons
  outside the shield can be damaged. Destroying all four triggers the finale.
- 2026-09-24: Gentle auto-level (rolls toward the belt plane when you are not rolling) is on by
  default and can be switched off in settings. Reason: first-time players lose orientation in 6DOF.
- 2026-09-24: Asset scripts run in a headless Blender process that the MCP-connected Blender spawns
  (`blender_scripts/vw_launch.py`). Reason: the first in-session bake test crashed the shared GUI
  Blender (depsgraph access violation during export from the add-on's timer), and that instance is
  shared with other sessions. Isolation also removes MCP timeouts on long bakes. Logs go to
  `test-output/blender-logs/`.
- 2026-09-24: Playwright self-test uses chrome-headless-shell with `--use-angle=d3d11 --enable-gpu`
  (real GPU). Pointer lock and movementX work headless, so the bot flies with real mouse events.
- 2026-09-24: The carrier warps in about 1.3 km ahead of the player (leaning toward the belt centre),
  broadside on, and vaporises rocks inside its shield. Reason: a fixed spawn could be 3 km away.
- 2026-09-24: Every ship material gets a team-tinted Fresnel rim (cyan friend, red foe) via
  `onBeforeCompile`. Reason: critic round 1 could not see enemy ships against black space.
- 2026-09-24: Greybox critic scope: missing VFX (explosion particles, nebula, trails, bloom, shield
  shimmer) are scheduled for M2/M3 and treated as cosmetic when judging the greybox loop.
- 2026-09-24: The critic subagent runs from a scratchpad folder outside the repo with copied
  screenshots. Reason: when it ran inside the repo, Claude Code auto-loaded this CLAUDE.md into it
  (rounds 1 to 3), which breaks the "screenshots and pitch only" rule.
- 2026-09-24: Missiles: 900 m lock range, steer around rocks, full refill at wave breaks plus one
  missile every 20 s in combat. Reason: critic round 2 found the launcher empty most of the mission.
- 2026-09-24: The carrier shield is a tight ellipsoid (100 x 82 x 372 m) and the generators sit on
  tall pylons outside it, so any approach from a generator's side has a clear shot; a HUD warning
  says when shots are being blocked. Auto-targeting skips generators the shield hides.
- 2026-09-24: Bolts within 12 m of the camera are hidden and thinned out to 60 m (a flak bolt
  skimming the camera filled the screen as a flat band).
- 2026-09-24: Hull textures are baked per asset from one shared procedural panel material
  (`vw_common.panel_material`: normal-weighted 3D grid seams on two scales, per-panel tint, grime,
  pointiness edge wear, stripe bands) into base colour x AO + tangent normal maps. The carrier bakes
  one 2048 px atlas and is then split into bow / mid / stern meshes that share it.
- 2026-09-24: The nebula is a procedural GLSL shader rendered once at start-up into a 768 px HDR
  cubemap (scene background at 0.62 intensity) and PMREM-filtered into the scene environment, so
  hulls pick up its colours. Stars stay as sized, twinkling points for crispness.
- 2026-09-24: Blender emission strengths are clamped in the loader (engine glows to 3.2) because
  Cycles-tuned values blow out to white under ACES tone mapping.
- 2026-09-24: Three's shader diagnostics are off unless `?debug` (ANGLE's D3D compiler prints
  harmless constant-folding notes for built-in chunks that three logs as warnings).
- 2026-09-24: Enemy models are drawn larger than modelled (Razor 1.35x, Maul 1.2x, `ENEMY_SCALE`),
  with radii and gun mounts matched in config. The current target's rim pulses brighter. Reason:
  readability at dogfight range beats strict scale.
- 2026-09-24: The crosshair is a hollow sight (ticks and a faint ring) so the target shows through.
- 2026-09-24: M3 effects are CPU-simulated pools drawn in a handful of calls: additive and smoke
  point sprites, spark streaks, instanced debris from `debris.glb`, pooled shock shells and rings,
  two pooled point lights, and all engine trails batched into one ribbon buffer that fades near
  the camera. Post: HDR (half float, MSAA 4) -> UnrealBloom (threshold 1.6) -> ACES output.
- 2026-09-24: The carrier's final blast is its own recipe (`Particles.nova`): white core, fire
  cloud, two flat shock rings in the deck plane tipped toward the camera, streaks and hull debris,
  in slow motion. The screen flash is capped at 1.7x exposure for about 0.6 s. Chain explosions
  skip shock shells. Reason: round 1 of the M3 test captured a fully white frame and soap-bubble
  shells around the carrier.
- 2026-09-24: Audio is all Web Audio synthesis: an SFX engine (voice limiting, generated reverb
  impulse, noise and FM voices) and a lookahead step sequencer for music (128 BPM, A minor;
  title, combat, boss beds plus victory and defeat stingers).
- 2026-09-24: Asteroid variants are built at the origin in one Blender session, so each finished
  rock is hidden from rays (`hide_render`) before the next one bakes. Reason: overlapping rocks
  were occluding each other's AO bake and baked in as black blotches.
- 2026-09-24: Milestone playtests run against the production build (`--preview`), built once and
  shared with `--nobuild` when scenarios run in parallel. Reason: editing source during dev-server
  runs triggered HMR reloads that broke the bot.
- 2026-09-25: Other ships are drawn up to 2.8x larger with distance and their team rim glows
  brighter with range (visual only; hit spheres keep their real size). Reason: at 450 to 800 m
  fighters were 5 to 15 px specks; critic rounds 2 to 4.
- 2026-09-25: Chase camera at 38 m behind, 10 m up; the player's trim, nozzles and flares stay
  under the bloom threshold. Reason: the player's own ship hid and out-glowed its targets.
- 2026-09-25: Test god mode lets shields drop and the hull fall to a 25 % floor (`hullFloor`)
  instead of zeroing damage. Reason: god-mode runs showed shield shimmer with a full HUD, which
  read as broken feedback.
- 2026-09-25: Hit events carry their source; the hit-direction arc points at the shooter. Carrier
  turrets tracking the player are marked (FLAK) and were rebalanced (1.1 km reach, 3-round bursts,
  2.4 s apart, 3 damage). Reason: critic round 5 found carrier fire invisible and unfair.
- 2026-09-25: The failure screen names what killed the player; damaged ships burn from a hull
  wound; the HUD fades out for the finale camera and the death camera.
- 2026-09-25: M3 closed after 6 critic rounds with a HUD-layout issue as the worst remaining
  problem (reticle stacking, arrow and banner placement). Same scope rule as M1 and M2: it belongs
  to the UI milestone, which starts with it.
- 2026-09-25: UI font is Chakra Petch (OFL-1.1) bundled from npm (`@fontsource/chakra-petch`),
  latin subsets only. It is the only font.
- 2026-09-25: UI colour language: cyan = you and wingmen, red = enemies only, amber = objectives,
  orange = danger to you (warnings, damage, missiles), yellow = the lead dot, white = the gun
  cross and the steering ring. Wingmen are cyan carets, never circles.
- 2026-09-25: Mouse-aim camera (as in War Thunder's mouse aim): the chase camera looks along the
  aim direction, not the ship's nose, so what you steer at stays centred above your ship while the
  gun cross swings onto it. Reason: with a nose-following camera, targets you were turning toward
  landed on your own ship (M4 critic rounds 3 and 4).
- 2026-09-25: The reticle carries one tag per target (lock state, type, range) pinned to its
  bracket; locked targets get a solid frame and a filled red LOCK tag; the steering ring hides on
  the lead dot; the player's ship fades to 30 % when a marker is behind it; labels dodge markers,
  the banner and the ship.
- 2026-09-25: Targeting computer view: a zoomed camera renders the current target into a framed
  box under the target panel (speed dust sits on layer 1 so it is never magnified). Reason: a
  fighter flying at you at 300 to 600 m is a few pixels in any chase view.
- 2026-09-25: Collision assist: the player's turn (not the aim) bends around rocks about 1.3 s
  ahead, reusing the AI avoidance with a tight margin.
- 2026-09-25: Enemy AI leads with the real bolt speed (bolts inherit the ship's forward speed),
  which made them accurate; Razor and Maul damage were retuned for it and wave 1 became a warm-up
  (two Razors, then two more). Difficulty is on the title screen and applies at once.
- 2026-09-25: Playtest bots: the win bot throttles up and flies in god mode with a hull floor; the
  lose bot neither shoots nor dodges (it holds its course).
- 2026-09-25: M4 closed after 11 critic rounds; the worst remaining items were world readability
  at range, the carrier art and the asteroid split, carried into M5 (polish) and its own loop.
