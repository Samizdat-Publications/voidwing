# Milestone 3 (feel), critic round 2

Screenshots: 22 frames from the production build (win run 01 to 17, lose run 18 to 22), including
new captures of an asteroid split, a close bomber, a player shield hit and the death camera after
the HUD fades.

## Critic findings (summary of the verbatim report)

1. Major: at the ranges where fights happen (450 to 900 m) enemies are 5 to 15 px specks under big
   red HUD circles; a Maul at 589 m looks no different from a Razor; the swarm wave looks empty.
2. Major: the player's lasers are nearly invisible (a cyan pinprick under the reticle), so there is
   no laser bloom and no way to walk shots onto a target.
3. Major: the reticle still crowds the target (crosshair ticks over the ship, lock circle, brackets,
   name, bars and lead ring within 100 px; a white incoming-missile ring looks like a second lead
   indicator).
4. Minor: in the winning run the shield shimmer and hit arcs show but SHIELD stays at 100 (the
   god-mode test run zeroed damage but still raised shield-hit events).
5. Minor: the carrier reads as a hex-grid lens hiding the hull; the blast frame is a clean
   see-through sphere and ring, with no fire, break-up or debris.

WORST: major - enemies are 5 to 15 px specks at combat range, so the dogfight plays as matching
icons instead of chasing ships.

Progress since round 1: the aim-point pile-up, damage feedback, death camera, own-ship glare,
asteroid split and bomber captures are no longer in the top five as separate items.

## Builder response (fixes for round 3)

1. Other ships are drawn up to 2.3x larger with distance (1x inside 260 m, visual only; hit spheres
   keep their real size), so a Razor at 750 m reads as a shape rather than a dot.
2. Bolts: the near-camera thinning only applies inside 28 m (it was eating the first 60 m of every
   player bolt), bolts keep a minimum on-screen width of about 2 px, and they are longer and
   brighter (player 24 m, intensity 6) so they read as glowing streaks from the chase camera.
3. Reticle: the target shows only its range beside the lock ring (name, class and bars stay in the
   target panel), the lock ring replaces the brackets while it is up, the crosshair ticks start at
   16 px leaving a clear window, and incoming missiles are red triangles.
4. God mode now drains shields normally and only protects the hull, so test runs show real shield
   numbers.
5. Carrier: the shield lattice on the faces is subtler so the hull shows through; the blast rings
   lie flatter; the three sections survive the blast as burning wrecks flung outward, with bigger
   hull debris; the blast capture is taken a moment later.
