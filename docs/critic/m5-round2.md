# Milestone 5 (polish and perf), critic round 2

Screenshots: 25 frames (win run 01 to 18, lose run 19 to 22, pause menu, how to fly and settings
23 to 25). The first attempt at this round stalled and was re-run with the same frames.

## Critic findings (summary of the verbatim report)

The critic found every pitch feature in at least one frame and called the menus clean.

1. Major: the steering ring, gun cross, lead dot, lock frame and range tag all sit on one spot, so
   at 240 to 700 m the ship you are shooting is hidden under the symbols; a cross tick even cut
   the range tag ("24| m"), and a locked bomber could not be seen while its unlocked partner was.
2. Minor: your own lasers and missiles read as short cyan dashes (seen end-on from the chase
   camera) while enemy fire shows as long red beams; you never see your missile fly.
3. Minor: the asteroid split looked like a glitch: a big rock turned flat, unlit beige (the laser
   hit flash was feeding the new hot-glow term) with two orange lumps in front of it.
4. Minor: the carrier reads as a flat plank in a thin orange disc from afar, and its death as an
   even ring around three clean box sections with no fire or debris field.
5. Cosmetic: HUD layers collide (the LEVIATHAN card over generator labels, off-screen arrows on
   top of each other, a flak marker over the radio text, a wingman flying through the camera).

Also noted: a Razor at 983 m drew as large as one at 209 m.

WORST: major - the reticle, lead dot, lock frame and range tag hide the enemy you are shooting.

## Builder response (fixes for round 3)

1. On target, the gun cross opens up so its ticks sit outside the target's frame, the steering
   ring and its dot step aside, and a lead point that falls on the ship shrinks to a small dot.
   The target's tag sits beside the vertical axis, so no tick can cut it.
2. Player bolts are longer and brighter (34 m), and missiles leave a ribbon trail (white for
   yours, orange for enemy missiles).
3. Only fresh fragments glow (the hit flash no longer feeds the glow), brightest toward their
   silhouette, with a milder orange tint.
4. The carrier's shield is taller (125 m instead of 85 m) with more lit cells, so it reads as a
   bubble; the blast rings have a ragged, patchy front; the blast adds burning streaks, fireballs
   strung through the cloud and nearly twice the hull debris.
5. Turret markers skip HUD panels, a second off-screen arrow on the same spot is dropped, and
   wingmen steer clear of the chase camera. Far-ship magnification eases off with range so a far
   fighter still looks farther than a near one.

Perf found along the way: a 280 to 410 ms stall in wave 2 was traced (with a new long-frame
diagnostic) to shader programs compiling on first use; the warm-up now compiles for both render
outputs, including the player's fade-ready hull, and runs behind the loading screen (about 0.7 to
1 s). No shader compiles during play in the self-test.
