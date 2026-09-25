# Milestone 3 (feel), critic round 3

Screenshots: 22 frames (win run 01 to 18, lose run 19 to 22).

The critic opened by confirming that every pitch feature now appears in the captures: lead pip,
lock and reload states, both enemy types, friend and foe markers, off-screen arrows, splitting
asteroids, four generators, the chain explosion, shield shimmer and the full HUD with radar.

## Critic findings (summary of the verbatim report)

1. Major: you still cannot see what you are shooting at. At lock range the enemy is a speck under
   the crosshair, lock ring, lead pip, bracket and range text; range labels are overprinted; a
   150 px lock ring around a close Maul; the lead pip disappears when it overlaps the target;
   bombers look like fighters except in the target panel.
2. Major: the player's own ship (about 190 px, 100 px under the crosshair) and its white-hot
   engines hide the fight below the nose.
3. Major: no threat: hull reads 100 in every frame of the winning run and the mission ends in
   2:45; the losing run never fires. (Both are test-harness artifacts: the winning bot flies in god
   mode, and the losing bot is deliberately passive.)
4. Minor: the Leviathan looks flat until the cutscene; generator kills are small puffs.
5. Minor: the asteroid split barely registers; the rock debris chunks look like smooth stand-ins.

Smaller: wave tracker counts wingman kills but the failure screen shows only the player's; labels
collide with the comms and objective panels; faint grey subtitles; no countdown between waves; a
weak death shot.

WORST: major - at combat range the target is a speck buried under stacked reticles, covered
labels and the player's own glowing ship.

## Builder response (fixes for round 4)

1. Reticle: the lock ring is capped at 46 px; the lead pip is always drawn (the tie line only when
   it is off the target); the range sits under the ring; Mauls get an orange bracket with top and
   bottom bars and a BOMBER tag, so the two enemy types read differently at a glance.
2. Own ship: chase camera at 38 m (from 33); the player's nozzles and flares are kept under the
   bloom threshold so they glow without flaring into white discs.
3. God mode now lets the hull take damage down to a 25 % floor (test runs show real hull and
   shield numbers without the bot dying).
4. Generator kills: a bigger blast (size 6.5), a 150 m shock shell, and the pylon top burns for
   seven seconds.
5. Rock debris is faceted and darker so chunks read as rock.

Also: a "Next wave in N s" countdown during breaks, and the failure screen says "Your kills".
Deferred to M4 (UI): HUD labels dodging the DOM panels, subtitle contrast, layout of arrows near
the radar.
