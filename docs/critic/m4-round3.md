# Milestone 4 (UI), critic round 3

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26).

Also changed before this round: the dogfighters' flank offset fades out before firing range
(it had kept their guns off the player entirely), Razor fire is a little more dangerous (4.2 per
bolt, tighter aim, shorter pauses) and the player's shield recovers a little slower. Reason: after
the playtest bot started throttling up, a player who never fired could survive wave 1 forever.

## Critic findings (summary of the verbatim report)

The critic confirmed every pitch feature appears and that title, pause, how to fly, settings,
victory and failure screens share one font, palette and panel style; the problems are readability
and finish.

1. Major: during turns the target, its tags, the lead dot and the steering ring sit on the
   player's own ship, and the shield bubble covers them when hit; the ring and dot overlap; the
   player's own lasers barely bloom seen from behind.
2. Major: the Leviathan up close is flat boxes under random cubes; the finale blast is small; a big
   asteroid blocks a third of the blast frame.
3. Major: close generator runs wash out: the objective diamond grows to 225 px, the core blooms
   over the cross, and the tags drift far apart.
4. Minor: wide banners cover the upper middle during live combat.
5. Minor: bomber pairs tangle their brackets and lock tags.

Smaller: outline-only buttons show an open cut corner; the how-to icon for the cyan ring is a dot;
a soft death explosion; a passive run shows wingmen clearing wave 1.

WORST: major - in most dogfights the target bracket, lead dot, steering ring and tags sit on the
player's own ship and inside its shield bubble.

## Builder response (fixes for round 4)

1. The player's own ship fades to 30 % whenever the target or the lead dot sits behind it on
   screen; the player's shield shows only the impact ripple (no full bubble flash); the steering
   ring is bigger (9 px) and thinner so the lead dot sits inside it; the player's bolts carry a
   glowing head so their fire blooms from behind.
2. The finale clears a wider rock-free corridor (260 m, 1.4 km) and keeps the camera 45 m from any
   rock. Carrier model detail is scheduled for M5.
3. Generator markers are capped (46 px half-size) so they stay compact at point-blank range.
4. Banners are smaller (34 px title), on a lighter, narrower band, and shorter (2 to 2.4 s).
5. Bombers split up on their approach like the fighters do, and every bracket reserves its screen
   rect before any label is placed, so tags dodge neighbouring brackets.

Also: outline buttons drop the chamfer (no open corner) and the how-to icon is a ring.
