# Milestone 4 (UI), critic round 1

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26). The pitch given to the critic now also names the UI requirement (designed title,
HUD, pause, game over and victory screens with a consistent look).

Built for this round: Chakra Petch bundled from npm as the only font; one palette (cyan friends,
red enemies only, amber objectives, orange warnings, yellow lead) and spacing scale; chamfered
panels; a designed title screen with a briefing card; How to fly; a persisted settings screen
(sensitivity, invert Y, auto-level, difficulty, three volumes); restyled pause, failure (with
cause) and victory (with rank) screens; the reticle redesign (lock state on the target's own
brackets, no lock ring, a yellow diamond lead), off-screen arrows at the true screen edge that
slide off the HUD panels, labels kept out of the banner band, brackets for every enemy inside
1.6 km, and de-duplicated banner, objective and radio text.

## Critic findings (summary of the verbatim report)

The critic said the title, pause, victory and failure screens share one clean look, the HUD has
every required readout, and winning, losing, retrying and the menus all work.

1. Major: the lead diamond sits on the target at every range (contradicting How to fly), and the
   cross, bracket, lock text, range label and an unexplained orange arc crowd the target; the rest
   of wave 1 is a row of overlapping brackets.
2. Major: the ship looks stuck on a boulder for the whole first wave (the bot held its aim on
   targets behind a big rock and ground along it).
3. Major: the cyan steering dot the game teaches is never visible (it hid when on course and was
   tiny otherwise).
4. Minor: markers pile up at the carrier (generator diamonds over labels and through the banner,
   a wingman label inside enemy brackets).
5. Minor: destruction lacks weight: the asteroid split frame shows no split; the finale ring reads
   as a solid hoop; the player's own death is a small puff with the objective still up.

WORST: major - the lead diamond sits on the target at every range and the aim point is a knot of
HUD symbols around enemies that are only specks.

## Builder response (fixes for round 2)

1. The lead diamond now only appears when it actually leads (a crossing target, more than 12 px
   off the target); otherwise the brackets are the aim point. How to fly now says exactly that.
   Far contacts (over 600 m) get smaller brackets so formations overlap less.
2. Collision assist: the ship's turn (not the aim) bends around rocks and the carrier shield right
   ahead, using the same avoidance the AI ships use, so holding the aim on a target behind a rock
   slides past it instead of grinding along the surface.
3. The steering cue is a cyan ring with a dot that is always drawn (inside the gun sight when on
   course), with a dark outline; the tutorial and controls text call it the cyan ring.
4. Every bracket reserves its screen rect so labels dodge markers, and markers under the banner
   band fade to 35 % so the banner reads.
5. The asteroid split gets a bright crack flash and is captured at its peak; the final ring is
   thinner and more fiery; the player's own death is a bigger blast; the objective panel fades on
   the death camera.
