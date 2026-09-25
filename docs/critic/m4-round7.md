# Milestone 4 (UI), critic round 7

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26).

Also changed before this round: enemy AI now leads its shots with the real bolt speed (bolts
inherit the ship's forward speed; the AI was aiming too far ahead of crossing targets). A
diagnostic run confirmed Razors hit a straight-flying passive pilot about 19 % of the time. The
lose scenario's bot now holds its course (it had been dodging by chasing targets).

## Critic findings (summary of the verbatim report)

The reticle crowding of rounds 1 to 6 is no longer the worst item.

1. Major: wave 1 is tuned to kill a new player: five dogfighters with no warm-up killed an idle
   pilot in 24 s; even the winning run lost 39 shield before its first kill; Cadet is buried in
   settings and only applies to the next mission.
2. Major: you cannot tell which ship the missile is locked on: with bomber pairs the LOCK frame
   sits on one ship while the BOMBER range label sits by the other.
3. Minor: the three aim markers (cross, ring, dot) drift apart and need a glossary.
4. Minor: the finale target looks unfinished (flat oval on approach, boxy hull, soft blast).
5. Cosmetic: HUD pieces collide at times (a banner over a generator marker, an arrow against the
   weapons panel, a faint banner mid-fade).

WORST: major - wave 1 sends five dogfighters at a player still figuring out three aim markers.

## Builder response (fixes for round 8)

1. Wave 1 is a warm-up: two Razors, then two more after 14 s. Razor bolts are back to 3.4 damage
   (the lead fix made them accurate) with slightly wider aim, and the player's shield recovers at
   16/s after 3 s again. Difficulty can be picked on the title screen and changes apply at once,
   including to enemies already in the fight.
2. Every target gets one tag pinned to its bracket's top-right corner that carries the lock state,
   the type and the range together ("LOCK  BOMBER  182 m"); locked, the tag is filled red and the
   bracket gets a solid frame. A tag can no longer read as belonging to a neighbouring ship.
3. Kept: the three markers are the mouse-aim model's cross (guns), ring (steering) and dot (lead);
   the title card and How to fly explain them.
4. Scheduled for M5: carrier model detail.
5. Cosmetic items noted.
