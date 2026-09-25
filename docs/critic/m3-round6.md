# Milestone 3 (feel), critic round 6 (final for M3)

Screenshots: 23 frames (win run 01 to 19, lose run 20 to 23).

The critic confirmed almost everything in the pitch is visibly present (flight and throttle, lock
states with a reload cooldown, Razor dogfighters, Maul bombers, flak turrets, friend and foe
markers, off-screen arrows, four generators, the explosion sequence, trails, nebula, shimmer,
radar) and said the problems are about what the player can read, not missing features.

## Critic findings (summary of the verbatim report)

1. Major: the centre of the screen is a pile of rings (crosshair, aim dot, lock ring, lead ring,
   range text, damage arc) on top of the target; the lead ring sits near the target centre and
   reads as "target is here"; the damage arc shares the lock ring's red.
2. Major: at the last generator the generator core, the sun and the nebula bloom into one white
   blowout; the sun is a huge white disc elsewhere.
3. Minor: an escort fighter on screen without a bracket in the carrier fight; red is used for
   every warning as well as for enemies.
4. Minor: off-screen arrows pile up under the player's ship after a retry and float inside the
   play area.
5. Minor: the LEVIATHAN intro banner is covered by the generator markers; instructions are
   repeated in three places; a faint grey subtitle.

Just missed: gem-like debris around a split rock, no rocks in view during wave 2, a 2:22 bot run,
3D ships showing through the see-through menu panels.

WORST: major - the pile of rings in the middle of the screen sits on top of the target and the
player's own ship.

## Builder response and M3 exit

- Fixed now (effects, in M3 scope): the generator core's emission is clamped (it was 6, it
  bloomed the view white at close range) and the sun's core and halo are toned down in the
  nebula shader. The hit-direction arc is orange and sits well outside the reticle; the steering
  dot hides when it overlaps the crosshair.
- The worst remaining problem (item 1) and items 3 to 5 are HUD layout and reticle design, which is
  the job of Milestone 4 (UI: HUD restyle, screens). By the same scope rule used to close M1 and M2,
  they are treated as out of scope for the feel milestone and carried into M4 as its first items:
  a reticle redesign (one clear aim mark, a lead indicator that cannot be mistaken for the target),
  a colour language that keeps red for enemies, off-screen arrows at the true screen edge that
  dodge the HUD panels, banners that do not overlap world markers, markers for every enemy on
  screen, and de-duplicated instructions.
- Rounds 1 to 6 fixed: the white-out finale, soap-bubble shells, asteroid bake blotches, the
  death camera, damage feedback (vignette, hit arcs, missile threat chevrons, hull fires, death
  cause), own-ship glare, lasers that were invisible, far enemies read as lit silhouettes, the
  carrier break-up and burning wrecks, invisible turret fire (FLAK markers and a fairer balance),
  and the capture harness (asteroid split, bomber close-up, shield hit).
