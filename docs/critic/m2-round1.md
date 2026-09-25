# Milestone 2 (assets), critic round 1

Screenshots: 20 frames with the Blender GLB assets and the baked nebula (critic ran from a scratchpad
folder outside the repo).

## Critic findings (summary of the verbatim report)

1. Major: every explosion is a flat hard-edged polygon with no bloom (finale, asteroid break, death);
   lasers have no glow.
2. Major: enemies are specks under a pile of markers; the Maul is never visible, even in the
   close-range capture (hidden behind the crosshair, lock ring and labels).
3. Minor: wingmen and their rings sit on top of the radar and status panels; friend markers merge
   with the lock box at the crosshair; the missile warning arrow label overlaps the warning banner;
   "NO MISSILE LOCK" looks like the real missile warning.
4. Minor: no engine trails, boost barely registers.
5. Minor: the Leviathan reads as a grey plank with flagpoles; generators are small; the generator
   kill has little payoff.

Also: arrows for enemies behind you sit under your own ship; the HUD still says LOCKED after death;
asteroid shadow sides render black; no shield-hit shimmer on the player.

WORST: major - explosions are flat pale polygons with no bloom, fire or debris.

## Builder response (round 2 changes)

- Crosshair redrawn as a hollow sight (four ticks and a faint ring) so the target shows through.
- Enemy models drawn larger (Razor 1.35x, Maul 1.2x), stronger red rim, and the current target's rim
  pulses brighter (rim colour became a live uniform: one shader program for all ships).
- Wingman formation slots moved up and ahead so they never sit on the HUD panels.
- "NO LOCK" now flashes in the weapons panel instead of the red warning banner; the lock readout
  shows OFFLINE and the target panel hides once the player is dead.
- Off-screen arrows for targets behind the camera go to the side edges.
- Leviathan rebuilt with a taller hull, a bigger command tower with a sensor dish, flank sponsons, a
  dorsal spine, a larger engine block and bigger generator orbs (hit radius 20 m).
- Fill light raised (hemisphere 0.75, environment 1.15) so rock shadow sides are not pure black.
- Deferred to M3 by the plan: explosions, bloom, trails, shimmer.
