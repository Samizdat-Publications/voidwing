# Milestone 4 (UI), critic round 4

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26).

## Critic findings (summary of the verbatim report)

The critic said the build covers almost every pitch item and the title, HUD, pause, failure and
victory screens share one clean look.

1. Major: in close dogfights the target lands between the gun cross and the ship's nose, so its
   bracket, tags, the aim ring and the lead dot pile up on the nose; FLAK boxes sit on the
   fuselage.
2. Major: three alarms stack at once (missile, hull, return to combat area) and the boundary order
   has no direction.
3. Minor: no readable shield-hit shimmer on the player (the full bubble flash had been removed to
   keep the sight clear); the orange hit arcs float in empty sky.
4. Minor: the asteroid split is practically invisible; the fragments look like any other rock.
5. Minor: enemies read as red specks without trails; the heavy bomber does not look heavy.

Just missed: the Leviathan's art; an old radio line lingering; arrows against the target panel;
the banner showing through the pause panel; a label clipped at the screen edge; a 2:53 bot run.

WORST: major - in close dogfights the player's own fighter sits where the target lands, so the
enemy, its bracket and the yellow dot pile up on the ship's nose.

## Builder response (fixes for round 5)

1. Mouse-aim camera (as in War Thunder's mouse aim): the chase camera now looks along the aim
   direction instead of the ship's nose, keeping the ship's roll. Whatever you steer at stays at
   the centre of the screen above your ship, and the white gun cross swings onto it as the ship
   turns. The target no longer lands on the nose during a turn.
2. At most two warnings show, most urgent first; out of bounds, an amber COMBAT AREA marker or
   edge arrow points the way back.
3. The player's shield flashes its rim briefly on a hit (not the whole bubble); damage direction is
   two orange chevrons on a ring around your own ship, pointing at the attacker.
4. Split fragments start hot (an orange-white tint that cools over about a second).
5. Enemy engine trails are brighter and wider; the Maul is drawn 1.75x with its radius and guns
   matched, so it reads as heavier than a Razor.

Also: banners and warnings are hidden while a menu is open, and HUD labels are clamped on screen.
