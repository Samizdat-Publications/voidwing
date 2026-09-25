# Milestone 4 (UI), critic round 9

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26).

## Critic findings (summary of the verbatim report)

The critic found nearly everything in the pitch on screen, with one clean look across title, HUD,
pause, failure and victory screens.

1. Major: on target, the enemy disappears: from 268 to 638 m the Razor is a glint the size of the
   lead dot under the cross, the dot and the lock box.
2. Major: the Leviathan finale looks like grey-box placeholder art (a plank on arrival, cubes up
   close, three grey blocks in the blast).
3. Major: three aim marks, and the cyan steering ring looks like the cyan friendly marker.
4. Minor: the player's ship hides the closest threats and their markers land on it.
5. Minor: the asteroid split does not read as a split.

WORST: major - when you are on target the enemy vanishes under the gun cross, lead dot and lock box.

## Builder response (fixes for round 10)

1. Far ships are drawn up to 3.6x larger (from 2.8x, starting at 200 m) and the current target's
   rim glows much brighter, so it stays a lit red shape; the lead dot turns into a hollow ring
   when it sits on the target, so the ship shows through.
2. The carrier model is asset work outside the UI milestone; it is the first M5 item (a new
   silhouette, structured detail instead of random cubes, engine block and bridge tower, larger
   scale).
3. The steering ring is white; cyan now only means friends, and wingmen are marked with a cyan
   caret over the ship instead of a circle. How to fly and the controls list say "white ring".
4. and 5. Noted (items already worked on in earlier rounds).
