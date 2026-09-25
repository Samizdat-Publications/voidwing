# Milestone 2 (assets), critic round 2 (final for M2)

Screenshots: 20 frames after the round 1 fixes (critic ran outside the repo).

## Critic findings (summary of the verbatim report)

1. Major: every explosion, including the finale, is a hard-edged polygon blob with no bloom, fire or
   debris; lasers are flat rectangles.
2. Major: enemies are specks at 350 to 780 m; the Maul's shape is never readable; the swarm wave
   looks like empty space.
3. Minor: taking damage has almost no in-world feedback; no shield shimmer on any ship.
4. Minor: no engine trails, boost has no visual punch.
5. Minor: the aim point still stacks crosshair, lock diamond, brackets and the lead ring.

WORST: major - explosions and the finale are flat polygon blobs with no bloom or debris.

## Builder response and M2 exit

- The worst remaining problem (explosions, bloom) and items 3 and 4 are the M3 effects pass. Item 2
  (enemy readability at range) is also being solved in M3 with engine flares, trails and bloom:
  at 350 m a dark hull is only a few pixels, and bright engines are what makes fighters readable in
  the genre. Per the milestone plan these count as cosmetic for the asset milestone, so M2 exits.
- Carried into M3: particle explosions and the carrier break-up, bloom, engine trails and flares,
  boost feedback, ship shield shimmer and damage smoke, reticle stacking.
