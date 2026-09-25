# Milestone 5 (polish and perf), critic round 3

Screenshots: 26 frames (win run 01 to 19 with the asteroid split taken from the standalone
showcase run, lose run 20 to 23, pause menu, how to fly and settings 24 to 26).

## Critic findings (summary of the verbatim report)

The critic found every pitch feature in at least one frame. It flagged "WAVE 1 / FIRST CONTACT"
after a cleared wave as a possible bug; that frame is the showcase run's split shot (captured at
wave 1 start) swapped into the set, not something a player can see.

1. Major: between 250 and 600 m enemies read as 10 to 30 px sparks, bleached white or pink by
   bloom against the bright nebula, with the player's own laser glow running up to the lock box;
   the ship's shape only reads at about 200 m or in the target view.
2. Minor: threat markers pile onto the aim point (an orange missile triangle on the locked
   bomber, a MISSILE label per missile) and point different ways (radar, edge arrows and damage
   chevrons disagreed for attackers behind); the flight guide never explains the triangle.
3. Minor: the Leviathan still underwhelms: a flat slab in a squashed disc whose guns show only as
   FLAK tags, with blocky towers when it breaks up.
4. Minor: centre banners and old radio lines cover the fight (GENERATOR DESTROYED across the
   carrier, a stale radio line stacked over a newer one).
5. Cosmetic: the death shot and the carrier blast look least finished (a soft white glow with
   orange confetti and no text; three white bloom balls and a flat ring).

WORST: major - at normal fighting ranges enemies are tiny bloom-bleached sparks against a bright
nebula.

## Builder response (fixes for round 4)

1. The sparks were bloom: enemy rims ran up to about ten times their base on targets and far
   ships, and enemy engine flares were large and bright in a tail chase. Enemy rims now stay just
   under the bloom threshold (a crisp red edge that pulses slightly on the target), enemy flares
   are smaller and dimmer, the player's laser glow heads fade out within 200 m of the camera, and
   the nebula backdrop is a little darker.
2. A missile sitting on a bracket (just launched) gets no triangle, only the nearest incoming
   missile is labelled, and threat chevrons, the damage cue and edge arrows share one direction
   convention. The flight guide explains the triangle.
3. The carrier's guns show: larger, brighter flak with a muzzle flash and a puff of gun smoke at
   each turret; its shield shows more lit cells.
4. No GENERATOR DESTROYED banner (the objective panel and radio already say it), smaller banners
   with shorter times, and at most two radio lines.
5. The death camera carries a VOID ONE DOWN caption with the cause; big blasts open on a fire
   coloured flash instead of white, and the carrier's section blasts are smaller.
