# Milestone 3 (feel), critic round 1

Screenshots: 20 frames from the production build (win run 01 to 16, lose run 17 to 20). The
critic ran from a scratchpad folder outside the repo and saw only the screenshots and the pitch.

Before this round the builder fixed, from its own review of the test captures:
- the final blast was a fully white frame (5x exposure flash); now a capped flash, a white core,
  a fire cloud and two flat shock rings;
- chain explosions around the carrier left soap-bubble shock shells;
- asteroid variants C and D had black blotches baked in (finished rocks at the origin occluded the
  next rock's AO bake);
- rocks were chalky once the blotches were gone (albedo lowered);
- the death camera sat inside the player's fireball.

## Critic findings (summary of the verbatim report)

1. Major: the aim point is a pile-up. Lock diamond, corner brackets, crosshair, lead ring and the
   name label all land in the same 150 px; the label is cut by the diamond's corner, friend and
   foe labels overprint ("OID TWOAZOR"), the lead ring is tiny and gets lost.
2. Major: taking damage barely registers. At hull 27 the only cue is a small "HULL CRITICAL" tag;
   "MISSILE INCOMING" has no direction; no shield shimmer is visible in any frame; the HUD stays
   up on the death camera; the failure screen never says what killed you.
3. Major: the player's own fighter (a fifth of the screen, just under the crosshair) blocks and
   out-glows targets and markers.
4. Major: no frame shows an asteroid splitting or a readable bomber; wave 2 says "Destroy enemy
   fighters" while sending Mauls; the Leviathan has no identifiable turret.
5. Minor: the capital climax is flat: carrier small on arrival, shield reads as a plate, combat HUD
   stays up in the finale, the blast ring looks like repeated puffs, no visible break-up.

Smaller: a wingman marker drawn over the target panel, small off-screen arrows that sit on the
radar, the same instruction shown three times, a banner captured mid-fade, a label clipped at the
top edge.

WORST: major - the aim point is buried under the lock diamond, an overprinted label, a tiny lead
ring, friendly markers and the player's own white-hot fighter.

## Builder response (fixes for round 2)

1. Reticle: the target label moved outside a new circular lock ring (four closing arcs, then a solid
   ring with ticks); labels reserve screen rects and slide past each other; the lead pip is bigger
   (10 px ring, dark outline, centre dot) and drawn last; labels are outlined and clamped on screen.
2. Damage: pulsing red vignette below 35 % hull, a red hit-direction arc around the sight plus the
   edge glow, missile threat chevrons around the sight that point at every tracking missile
   ("MISSILE BEHIND" when it is behind), bigger colour-coded warnings, damaged ships now burn from a
   hull wound (flames, smoke, sparks when critical), the HUD fades out on the death camera, and the
   failure screen names the killer ("Shot down by a Maul bomber", "Collided with an asteroid").
   The playtest now captures a player shield hit.
3. Own ship: chase camera pulled back (33 m, from 27 m); player trim emission at 45 %, rim at 0.3,
   smaller engine flares.
4. Features: the Maul is drawn 1.45x (heavier silhouette, radius and guns matched); the target panel
   shows a class line (DOGFIGHTER, HEAVY BOMBER, SHIELD GENERATOR); wave objectives say "fighters and
   bombers" when Mauls are in the wave; asteroid fragments separate at 9 to 20 m/s; the playtest's
   split showcase searches 900 m and waits for the fragments to separate; the bomber shot requires a
   live, mostly intact Maul.
5. Finale: the combat HUD hides for the finale camera; the sections drift apart twice as fast and
   spin more; their torn ends burn and smoke until the blast; the ring's edge is smoother; the
   carrier arrives about 1 km out instead of 1.3 km; the shield shows a faint hex lattice with a
   sweeping band so it reads as a bubble.

Deferred to M4 (UI): repeated instructions across objective, comms and banner; panel layering.
