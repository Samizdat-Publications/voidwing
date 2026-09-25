# Milestone 4 (UI), critic round 11 (final for M4)

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26). First round with the targeting computer view.

## Critic findings (summary of the verbatim report)

The critic said almost every pitch item is on screen and that the title, HUD, pause, how to fly,
settings, failure and victory screens all share one look. It used the TARGET VIEW inset to read
enemy ships ("the only place a Razor looks like a ship").

1. Major: in the main view enemy fighters stay small (about 30 px at 215 m, smaller head-on), so
   dogfights are flown on brackets and the inset.
2. Major: the asteroid split frame in this run shows no split.
3. Major: the carrier finale is flown by HUD diamonds; the target view shows little for a
   generator; at 49 m the generator core swallows the cross; flak markers are small.
4. Minor: markers still stack during the bomber waves (a second bomber's bracket, the MISSILE
   arrow, the lock tag).
5. Minor: the "big explosion" is a flash and two rings on a hull that barely separates.

WORST: major - enemy fighters never get bigger than about 30 px even at 215 m, so dogfights are
spent keeping the cross on red boxes and watching the target view.

## M4 exit

Milestone 4 is the UI milestone: title, HUD, pause, game over and victory screens with a designed,
consistent look. Across eleven rounds the critic moved from functional placeholder screens to
repeated confirmation that every screen shares one font, palette and panel style, and that every
HUD element the pitch asks for is present and readable on its own. Reticle crowding, the lock
state, colour language, arrows, banners, labels on the player's ship, the steering cue, damage and
shield feedback and the controls documentation were all addressed along the way.

The remaining top items are about the 3D world rather than the interface: how large a fighter
looks at combat range (already mitigated by distance scaling, rim light and the target view),
the carrier model and its break-up, and the asteroid split's visibility. By the same scope rule
used to close M1 to M3, these are carried into M5 (polish), which runs its own critic loop:

- carrier model rework (silhouette, structured detail, larger scale) and a more visible break-up;
- a wider target view framing for generators, and taming the generator core at point-blank range;
- a more legible asteroid split and a reliable capture of it;
- enemy readability at range as part of the polish pass.
