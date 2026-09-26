# Milestone 5 (polish and perf), critic round 9 (final for M5)

Screenshots: 27 frames (win run 01 to 20 with the asteroid split from the standalone showcase
run, lose run 21 to 24, pause menu, how to fly and settings 25 to 27). First round with the
three-quarter carrier arrival from 1.3 km, the dimmer window strips and the red HULL CRITICAL.

## Critic findings (summary of the verbatim report)

"No problem blocks play, so the worst ones are rated minor." Every pitch item appeared in at
least one frame except a readable asteroid split in this set's showcase frame.

1. Minor: the Leviathan looks unfinished: a flat slab with rows of lights inside an orange egg,
   then plain flat-shaded boxes in the cutscene, bleached by the blast glow.
2. Minor: threat cues sit on or beside the player's own ship (the MISSILE chevron over the hull
   and shield bubble, small hit chevrons in a similar orange to the lead dot).
3. Minor: HUD panels cover action at the busiest moments.
4. Minor: this set's asteroid split frame reads as a hit flash.
5. Cosmetic: a rock right next to the camera shows as a flat peach shape.

WORST: minor - the Leviathan, the climax, is the least finished-looking asset.

## M5 exit

Milestone 5 ran nine critic rounds. Rounds 1 to 4 each had a major problem (bomber markers
colliding, the reticle hiding its target, bloom turning far enemies into sparks, the fighter
pinned inside a generator); all were fixed. Rounds 5 to 9 found nothing major: the critics
repeatedly called the HUD, menus, fighters and nebula finished, and the worst item in every one
of those rounds was the carrier's art direction, described differently each time (a barge, a
plank, oil derricks, smokestacks, an egg). Along the way the carrier was rebuilt, scaled up,
given procedural panelling, emitter pylons and conduits, a readable shield bubble, a visible
fireball (a real bug hid it inside the hull) and a three-quarter arrival.

The loop's target was a cosmetic worst issue; it ended at minor. The remaining item is the
look of one procedurally built model rather than a defect a player trips over, and further
rounds were changing its description rather than its rating, so the milestone closes here with
that noted in CLAUDE.md. Items 2 to 5 above are small follow-ups for any later pass.

Perf at exit: 60 fps average at 1280x720 and 1920x1080 in the headless self-test on this desktop
GPU, peak about 240k triangles and 130 draw calls, no shader compiles during play, 0 console
errors or warnings in every run. Occasional stalls seen in the self-test coincided with heavy
other load on the test machine (the game's own update and render stayed at 1 to 4 ms in them).
