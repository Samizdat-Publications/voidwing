# Milestone 5 (polish and perf), critic round 5

Screenshots: 27 frames (win run 01 to 20 with the asteroid split from the standalone showcase
run and a new frame of the carrier warping in, lose run 21 to 24, pause menu, how to fly and
settings 25 to 27).

## Critic findings (summary of the verbatim report)

"Nothing I saw gets in the way of understanding or playing the game, so none of these is major."
Every pitch feature appeared in at least one frame (the lock tone cannot show in stills).

1. Minor: the Leviathan looks like a blockout: a flat grey slab with strip lights from attack
   range, plain untextured boxes and lattice masts in the break-up shots.
2. Minor: the promised big explosion is underwhelming: three whole slabs, a couple of flares and a
   thin ring, no fireball or debris cloud; hull pieces pass through asteroids.
3. Minor: HUD elements still draw on top of each other in places (an arrow on the target panel,
   the MISSILE label across the player's wing, FLAK tags under radio boxes, the lead dot over the
   range tag, four orange cues for one missile).
4. Minor: the Maul does not look heavy: no bigger than a Razor at the same range, and small in
   the target view.
5. Cosmetic: the guide promises a SHIELD IN THE WAY tag, but the frames show a differently
   worded top warning and radio lines instead.

WORST: minor - the Leviathan, the game's climax, looks like a blockout next to the polished
fighters, HUD and nebula.

## Builder response (fixes for round 6)

1. The hull's one 2048 px bake spans 940 m, so its panel seams vanished: the carrier shader now
   adds procedural panel seams on two scales and a per-panel tint in object space.
2. Found a real bug: the finale fireball and many carrier explosions were centred inside the
   hull, and point sprites draw flat at their centre depth, so the hull hid them. Carrier blasts,
   burns and the finale fireball are now nudged toward the camera; the fireball is bigger and
   lasts longer, a dark smoke pall follows, and the blast clears rocks further out.
3. Panel rects refresh the moment a HUD panel appears or the radio changes, each missile gets one
   cue (a triangle on screen, a chevron off screen) and the chevron's label keeps off your ship,
   and the target's tag keeps clear of its own lead dot.
4. The Maul is drawn at 2.2x (hit radius and gun mounts to match), with a larger engine flare and
   trail, and the target view frames bombers tighter.
5. The tag, the warning and the guide all say SHIELD IN THE WAY.
