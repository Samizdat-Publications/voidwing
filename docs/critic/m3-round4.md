# Milestone 3 (feel), critic round 4

Screenshots: 23 frames (win run 01 to 19, lose run 20 to 23).

## Critic findings (summary of the verbatim report)

1. Major: at 444 to 779 m enemies are a few pixels under the lock ring, lead ring, crosshair and
   bracket; Razor and Maul look the same apart from the BOMBER tag; the lock ring stays red while
   missiles reload; the title's aiming hint says "the ring" without saying which.
2. Major: the carrier finale: a flat pancake with a banner stamped over it and labels running
   through the subtitle; boxy hull in the cutscene; in the blast frame the camera is jammed
   against a huge flat dark polygon (a big asteroid on the escape path).
3. Minor: off-screen arrows sit well inside the screen, land under the player's ship and on the
   radar, and all look alike.
4. Minor: being hit blows out the aim point with a white burst; the late fights drain you fast.
5. Minor: waves 2 and 3 happen in open nebula; the split is a tan haze; faceted debris chunks look
   like placeholders.

Lesser: a small, dull death puff; a giant flat orange beam near the camera (a Maul heavy bolt
passing close); the sun behind the objective box at the start.

WORST: major - in every dogfight the enemy is a few pixels buried under lock, lead, crosshair and
bracket markers.

## Builder response (fixes for round 5)

1. Far ships: drawn up to 2.8x larger with distance, and their team rim glows brighter with range
   (up to +1.8), so a fighter at 500 to 800 m reads as a red-lit silhouette that blooms; the
   current target still pulses on top. The lock ring turns grey and dashed while missiles reload or
   are empty. The lead pip drops its centre dot when it sits on the target, so the ship shows
   through. The title hint now names the cyan steering dot.
2. Finale: the escape route is cleared of rocks when the finale starts, the camera is pushed out of
   any rock in every mode, and the carrier sections fly out along the keel or upward, never toward
   the player.
3. Bolts other than the player's own are hidden within 16 m of the camera and thinned out to 50 m
   (the flat orange beam).
4. Hits on the player's own ship use a smaller, dimmer flash and hull glow.
5. Rock debris keeps smooth shading (darker).

The capture triggers for the combat shots now fire at typical human fighting range (target under
350 m, lock under 650 m) instead of the bot's long-range openings.

Deferred to M4 (UI): off-screen arrow placement against the HUD panels, banner and label layout on
the arrival card.
