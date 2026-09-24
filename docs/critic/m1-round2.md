# Milestone 1 (greybox), critic round 2

Screenshots: 16 frames (test-output/critic-m1r2) after the round 1 fixes.

## Critic findings (summary of the verbatim report)

1. Major: enemy fighters are specks or invisible at every combat range; wave 2 and 3 shots show
   brackets but no ships; off-screen arrows are small and sink into rocks; "MISSILE INCOMING" gives
   no direction.
2. Major: missiles feel like a trap. "LOCKED - FIRE MISSILE" shows at 982 m on targets you cannot
   see, missiles are spent in wave 1 with nothing dying, and the launcher reads EMPTY for most of
   the mission.
3. Major: everything piles up on the aim point (crosshair, lead, lock diamond, brackets, labels);
   labels overlap friend and foe markers.
4. Major: finale looks like a placeholder (box carrier, flat polygon explosion).
5. Minor: no nebula, no bloom, and the damage indicator reads like thick maroon "trails".

Also: auto-target stayed on a generator behind the shield while another was close; asteroids show
black seams between facets; "GENERATOR DESTROYED" banner low contrast; no shot of an asteroid
splitting or of boost.

WORST: major - Enemy fighters are unreadable specks at every combat range.

## Builder response (round 3 changes)

- Enemies drawn about 1.8x larger; off-screen arrows larger, outlined and kept off the panels;
  radar missile blips bigger and blinking.
- Missiles: lock range 900 m, tighter turn (4.6 rad/s), proximity fuse +12 m, steer around rocks;
  full refill at wave breaks and +1 every 20 s in combat.
- HUD: distant enemies collapse to pips beyond 950 m; target label beside the bracket; friend labels
  only within 400 m; damage indicator became a soft edge glow.
- Auto-target penalises generators the shield blocks. Asteroid seams fixed (merged vertices).
- Playtest now captures a boost shot and an asteroid split.
