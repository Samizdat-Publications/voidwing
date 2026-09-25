# Milestone 5 (polish and perf), critic round 1

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26). First round with the rebuilt carrier, the new asteroid split, per-distance
magnification from 90 m and the Graphics setting.

## Critic findings (summary of the verbatim report)

The critic found every pitch feature in at least one frame except the steering ring (item 2).

1. Major: when Maul bombers fly in stacked pairs, their brackets overlap by about 50 px and the
   LOCK tag, pinned above the locked frame, lands under the other bomber's hull (09 to 12). With
   the gun cross, lead dot and MISSILE arrow in the same spot the middle of the screen is a knot
   of red rectangles.
2. Minor: the "white ring" the controls describe never shows in flight (it hid whenever it sat
   inside the gun cross), so the first instruction points at nothing.
3. Minor: the LOCK readout reads "READY" in blue with no lock (sounds like a lock), shares one bar
   for reload and lock, and "LOCKED" uses the enemy red next to the red missile warning.
4. Minor: the Leviathan lacks scale: wingmen over its deck look a tenth of its length, the shield
   reads as a thin hoop, and the break-up shows plain box sections.
5. Minor: world markers ignore the HUD: a wingman tag drawn across the SHIELD/HULL panel, a Razor
   at the screen edge with no marker, a generator name 90 px from its diamond.

WORST: major - overlapping bomber brackets and a lock tag that lands on the wrong ship.

## Builder response (fixes for round 2)

1. Bomber pairs attack as a pincer (the second takes the side opposite the first and holds it to
   700 m), and ships keep a hull-size gap (Mauls about 70 m apart). Magnification now follows
   each ship's own size (a floor on screen size), so bombers are barely magnified and never swell
   into each other. Brackets fit the drawn ship. The target's tag sits flush against its frame on
   the first side (above, below, right, left) clear of other brackets, and a neighbour whose
   bracket crosses the target's frame is drawn faint.
2. The steering ring is always drawn (hidden only on the lead dot).
3. Lock readout: NO LOCK (muted) when ready without a lock, LOCKING (white), LOCKED (green, the
   player's positive colour, also used for the LOCK tag on the target), RELOAD (muted).
4. Wingmen are magnified at most 1.8x, and anything within 750 m of the carrier at most 1.25x
   (wingmen) or 2x (enemies), so the carrier keeps its scale; its shield shows more lit cells
   across the face.
5. World labels treat HUD panels as obstacles, a label with no room next to its marker is skipped
   instead of drawn far away, and markers of ships behind a panel are hidden with it.
