# Milestone 3 (feel), critic round 5

Screenshots: 23 frames (win run 01 to 19, lose run 20 to 23).

The critic confirmed nearly every pitch item is visible and said the remaining problems are about
fairness, readability and finish. The dogfight readability complaint of rounds 2 to 4 (enemies as
specks under stacked reticles) is no longer in the top five.

## Critic findings (summary of the verbatim report)

1. Major: the capital-ship fight hits hard with fire you never see: shields and hull drop fast
   during the first generator while the radar shows no red dots and nothing is marked; the hit arc
   points at a wingman.
2. Minor: the finale centre is a pile-up: the GENERATOR DESTROYED banner prints over generator
   markers and wingman labels, the crosshair is lost in a generator's glow, and a grey subtitle is
   hard to read on bright nebula.
3. Minor: the mission is over in about two and a half minutes (a god-mode bot run).
4. Cosmetic: the Leviathan looks like placeholder boxes; its shield reads as a hoop.
5. Cosmetic: the asteroid split is a brown smudge that hangs over the crosshair.

WORST: major - the finale takes you from full shields to 25 hull during the first generator, with
fire that is never marked or visible.

## Builder response (fixes for round 6)

1. Carrier turrets that are tracking the player get small red square markers, and the nearest is
   labelled FLAK. Hit events now carry their source, so the red hit arc points at the turret or
   fighter that fired, not at the flak burst. Turret balance: 1.1 km reach (from 1.5), three-round
   bursts (from four), 2.4 s between bursts (from 1.7), 3 damage per round (from 5), wider spread,
   and a bigger muzzle flash so you can see which gun is firing.
2. Deferred to M4 (UI): banner placement against world markers, subtitle contrast.
3. Not changed: mission length is judged from a bot that flies straight at every target in god
   mode; a first-time player takes several times longer.
4. Carrier art quality is an M5 polish candidate.
5. Asteroid split: shorter-lived haze, faster and larger rock chunks.
