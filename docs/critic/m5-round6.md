# Milestone 5 (polish and perf), critic round 6

Screenshots: 27 frames (win run 01 to 20 with the asteroid split from the standalone showcase
run, lose run 21 to 24, pause menu, how to fly and settings 25 to 27). First round with the
visible finale fireball, the hull panelling and the larger Maul.

## Critic findings (summary of the verbatim report)

"The HUD, menus, fighters and nebula look like a finished game, and I found no major blocker."

1. Minor: the Leviathan still looks like a placeholder: a flat slab of deck lights, generators
   on black lattice masts that read as oil derricks, thin straight yellow tether lines that read
   as debug lines, plain navy and maroon boxes in the break-up close-up.
2. Minor: "GET CLEAR" is an order the player cannot follow (the finale is an autopilot cutscene
   with the HUD hidden).
3. Minor: the missile warning did not always show where the missile was (a missile still on its
   launcher's bracket got no cue at all).
4. Minor: in sunlight Razors washed out to pale peach, near the wingmen's white; brackets and
   tracers pile onto your own ship in close fights; a Razor near a panel lost its marker.
5. Minor: the fights drift out of the asteroid belt into open nebula; rock looks vary.

Smaller: labels vanish when crowded, the bomber radio line repeats in wave 3, HULL CRITICAL and
the boost bar share an orange, the failure screen offers two buttons that both mean wave 1, the
settings panel nearly touches the screen edges at 720p, no frame shows the carrier arriving.

WORST: minor - the Leviathan still looks like placeholder geometry.

## Builder response (fixes for round 7)

1. The generators now stand on solid tapered emitter pylons (stepped, with collars and swept
   fins) and ribbed booms, with glowing power conduits built into the model; the thin beams are
   gone. The hull shader adds inset plates and stronger seams.
2. The finale reads "Leviathan breaking up / Autopilot burning clear", and the briefing's last
   step no longer asks you to get clear.
3. Every missile tracking you gets one cue: its triangle when visible, otherwise a chevron.
4. Enemy paint is a deeper red; your ship fades less when a marker sits behind it; markers near
   HUD panels are clipped at the panel edge instead of disappearing.
5. The belt is denser (about 35 % more rocks). To pay for it, each asteroid variant ships a
   360-face LOD for far rocks, and peak triangles fell from about 1.4M to 240k.

Also: the bomber warning plays once per mission, a violet boost bar, the failure screen names the
checkpoint ("Retry wave 2", "Retry the carrier") and hides "Restart mission" at wave 1, compact
settings rows, and the carrier warp-in is captured earlier.
