# Milestone 4 (UI), critic round 6

Screenshots: 25 frames (win run 01 to 17, a standalone asteroid shot 18, lose run 19 to 22, pause
menu, how to fly and settings 23 to 25).

Also fixed before this round: the marker canvas had been raised above the HUD panels, which also
put it above the menus (the crosshair showed on top of How to fly); menus now stack above the HUD,
and How to fly got compact spacing so all eight tips and the full controls fit at 720p.

## Critic findings (summary of the verbatim report)

The critic found every pitch feature on screen and said the problems are readability and finish.

1. Major: the middle of the screen is crowded and the player's ship sits in it: a generator
   diamond and label drawn over the engines, a FLAK tag on the wing, a bomber tag between a
   wingman ring and its name, a close target's range tag pushed down beside the wingtip.
2. Minor: explosion debris looks like flat, unshaded peach cut-outs.
3. Minor: the carrier and the enemy ships look like placeholder blocks.
4. Minor: the missile lock barely shows where you look (same bracket, a tiny word changes).
5. Minor: the asteroid split barely shows (a puff and chips the size of the field's pebbles).

WORST: major - the player's ship sits under a pile of aiming marks, lock brackets and tiny labels,
so targets and objectives disappear behind it and friend and foe tags overlap.

## Builder response (fixes for round 7)

1. The chase camera sits further back and higher (42 m, 13 m up), so the ship is smaller and lower
   on screen; the ship fades whenever any marker (not only the target) is behind it; labels that
   cannot take their spot step up before they step down, so tags leave the ship's area upward.
2. Debris pieces are smaller and their hot glow is dimmer and cools faster.
3. Carrier detail is scheduled for M5.
4. A locked target gets a solid red frame and a filled red LOCK tag with white text.
5. Asteroids split into fewer, bigger fragments (2 or 3 at 45 to 60 % of the parent), so the
   break reads as big rock to smaller rocks.
