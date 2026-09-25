# Milestone 5 (polish and perf), critic round 4

Screenshots: 26 frames (win run 01 to 19 with the asteroid split from the standalone showcase
run, lose run 20 to 23, pause menu, how to fly and settings 24 to 26).

## Critic findings (summary of the verbatim report)

The critic called the title, briefing, flight guide, pause, settings and end screens clean and
consistent, and found every pitch feature in at least one frame.

1. Major: near the carrier the player's ship vanished: the test pilot pinned it against
   Generator D (speed 8 m/s with the throttle up), the glowing orb covered the ship and the
   target view showed a flat beige panel (its camera sat inside the orb).
2. Minor: markers and arrows drawn over HUD panels (a generator diamond on the SHIELD row, an
   arrow squeezed between the target panel and the target view, an arrow into the objective
   panel); the radar's thin backing let asteroids and carrier lights compete with its dots.
3. Minor: Razors and Mauls wore identical red brackets at about the same size, so bombers could
   not be picked out at a glance.
4. Minor: the Leviathan read as a frigate (about nine fighter lengths) and its finale as glowing
   balls and a ring around intact box halves.
5. Minor: the yellow lead dot, the most important aiming aid, was a 5 to 6 px dot lost on red
   hulls and inside amber generator diamonds.

Cosmetic notes: smooth orange asteroid fragments, unlabelled target bars, mixed button wording
(FLY AGAIN / TITLE SCREEN / RESTART WAVE), amber arrows not explained in the guide. The carrier
arriving and a generator exploding were not captured.

WORST: major - flying close to a shield generator lets the fighter clip into it, hiding the ship
and blanking the target view.

## Builder response (fixes for round 5)

1. The ship was not inside the pylon but pinned at its collision sphere, and the see-through fade
   (for markers behind your ship) faded it to 30 % because the orb filled the view. Now: the
   collision assist steers around generator pylons, a scrape bounces you off hard with damage,
   shake and a hull sound, your ship only fades for small markers, and the target view hides when
   the target is right in front of you.
2. Markers whose bracket crosses a HUD panel are hidden, arrows keep a wider berth, the target
   panel and its view form one block for arrow placement, and the radar has a solid backing.
3. Bombers keep a 45 % larger on-screen size floor and carry a raised double bar over their
   brackets.
4. The carrier is 35 % larger (scaled into the Blender export, about 940 m long); its sections
   separate faster.
5. The lead dot is larger with a heavier outline, on and off the target.

Also: fragments keep their rock colour with hot edges, the target bars are labelled SHIELD and
HULL, the end screens use "Retry from checkpoint", "Restart mission" and "Quit to title"
consistently, the guide explains amber arrows, and the capture now includes the carrier's
warp-in and a generator 0.25 s after it blows.
