# Milestone 5 (polish and perf), critic round 7

Screenshots: 27 frames (win run 01 to 20 with the asteroid split from the standalone showcase
run, lose run 21 to 24, pause menu, how to fly and settings 25 to 27). First round with the
emitter pylons, the asteroid LODs and the denser belt.

## Critic findings (summary of the verbatim report)

Every pitch feature appeared in at least one frame (the split frame of this run showed the
rock as one piece, and the lock tone is audio).

1. Minor: HUD layers sat on top of live markers: the radio box covered the Generator D diamond,
   and off-screen arrows were drawn inside the target card and the target view.
2. Minor: without its shield the Leviathan still reads as flat navy and maroon boxes, and the big
   explosion is mostly one bloom sphere with a thin ring.
3. Minor: a generator's target card showed an empty SHIELD bar (reads "unshielded"), while the
   carrier's bubble blocks shots.
4. Cosmetic: the player's death shows a soft orange smudge and flat cream polygons.
5. Cosmetic: labels in the scene are small and inconsistent (FLAK tags, target card captions,
   wingman names that come and go).

WORST: minor - the radio box and the target panel sit on top of live markers and bury the
off-screen arrows in the busiest fights.

## Builder response (fixes for round 8)

1. Two real bugs: the arrow placement ping-ponged between the target card and the target view
   below it and could end inside one, and the marker clip (even-odd rule) broke where the merged
   target block overlapped the individual panel rects. Arrows now take the nearest clear spot
   along the edge, the panel rects never overlap, and the radio box turns see-through while the
   target or an objective sits behind it.
2. The finale core burns orange instead of blooming white.
3. A generator's card shows BUBBLE: the carrier shield's strength (live generators), in orange.
4. Wreckage is charred metal that glows orange while hot instead of flat cream plates.
5. Target card captions and FLAK tags are a size larger.
