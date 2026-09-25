# Milestone 4 (UI), critic round 5

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26). First round with the mouse-aim camera.

## Critic findings (summary of the verbatim report)

The critic listed nearly every pitch feature as on screen, with matching title, pause, failure and
victory screens, and said the problems are about reading the screen.

1. Major: you fight HUD symbols, not ships: around a 207 m Razor sit the cyan ring, the lead dot,
   the bracket, a RELOAD tag, a range tag and two orange damage chevrons.
2. Major: the carrier attack is a tangle of markers over a flat plate; the FLAK tag is drawn on the
   player's own ship; nothing shows whether fire reaches the generator or hits the shield.
3. Minor: the orange damage chevrons are unlabelled and look like the MISSILE markers; How to fly
   does not explain them.
4. Minor: the controls are split across screens (the title list lacks the cross and dot; How to fly
   lacks throttle and roll).
5. Minor: solid corner panels hide enemies that pass behind them.

WORST: major - enemy fighters are 20 to 40 px shapes under a pile of aiming symbols, tags and
chevrons.

## Builder response (fixes for round 6)

1. The reticle only carries LOCKING or LOCK (reload and ammo stay in the weapons panel); the
   steering ring hides when it sits on the lead dot; damage chevrons only appear when whatever hit
   you is off screen.
2. The player's ship reserves its screen area, so no label or turret marker lands on it; a target
   generator whose line of fire crosses the shield says SHIELD IN THE WAY (in orange) instead of
   just its range.
3. How to fly now explains the orange chevrons, the MISSILE arrows and the SHIELD IN THE WAY tag;
   MISSILE labels are bigger.
4. How to fly carries the full controls table, and the title list names the white cross and the
   yellow dot.
5. HUD panels are lighter (58 % instead of 78 %) and the marker canvas sits above them, so a ship
   passing behind a panel keeps its bracket.
