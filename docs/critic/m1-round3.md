# Milestone 1 (greybox), critic round 3

Screenshots: 18 frames (test-output/critic-m1r3).

Process note: the critic reported that Claude Code auto-loaded this repo's CLAUDE.md into its
context because it ran in the repo directory (this was true for rounds 1 to 3). It said it ignored
it and judged only the screenshots against the pitch. From round 4 on the critic runs from a
scratchpad directory outside the repo with copied screenshots, so nothing but the images and the
pitch reach it.

## Critic findings (summary of the verbatim report)

What passes: every HUD element the pitch asks for, friend (cyan ring + call sign) vs foe (red
brackets) are easy to tell apart, off-screen arrows, radar, lock / reload states, clean end screens.

1. Major: both explosions are flat cardboard shapes; the finale shows no chain reaction; the carrier
   is a dark slab.
2. Major: once locked, about ten elements stack at screen centre; labels get cut off; the lead
   indicator cannot be picked out; the enemy is hidden under the lock diamond.
3. Major: no nebula, no engine trails, no laser glow, no shield shimmer.
4. Major: a huge flat yellow band slices across the view (a bolt passing close to the camera).
5. Major: asteroids never visibly split (no burst, the fragments are far apart).

WORST: major - Both explosions captured, the finale included, are flat unlit shapes with no bloom,
debris or visible chain reaction.

## Builder response (round 4 changes)

- Reticle: the on-screen "LOCKED" text is gone (the lock box turns solid, the weapons panel says
  LOCKED); the lock ring is drawn outside the target bracket; the lead indicator is now a yellow pip
  with a ring, unlike anything else on screen; the target label sits clear of the crosshair ticks;
  warnings moved to the top centre.
- Bolts within 12 m of the camera are hidden and thinned out to 60 m (fixes the yellow band).
- Asteroid break-ups: dust burst plus slower-drifting fragments.
- Deferred by the milestone plan (cosmetic for the greybox): explosion particles and the finale
  (M3), carrier model (M2), nebula (M2), trails / bloom / shimmer (M3).
