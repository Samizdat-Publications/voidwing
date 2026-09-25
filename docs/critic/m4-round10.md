# Milestone 4 (UI), critic round 10

Screenshots: 25 frames (win run 01 to 18, lose run 19 to 22, pause menu, how to fly and settings
23 to 25).

Also changed before this round: enemy shield bubbles shimmer lightly instead of flashing solid
(under sustained fire the flash hid the ship), impact flashes are smaller, and engine flares fade
when a ship flies at the camera (its engines face away).

## Critic findings (summary of the verbatim report)

1. Major: at 290 to 640 m a Razor is a bright smear under the lead dot, the cross and the
   brackets, so you cannot read its heading.
2. Major: with two Mauls close together, the lock frame and the LOCK tag can read as belonging to
   different ships.
3. Major: the Leviathan finale looks like placeholder art; its blast uses the same white flash as
   a fighter's.
4. Minor: the asteroid split does not read.
5. Minor: wave 1 kills a hesitant newcomer (who neither shoots nor dodges) in 33 s, and the death
   camera shows neither the wreck nor the killer.

The critic confirmed everything else in the pitch is visible and that one font and palette run
across the title, pause, failure and victory screens.

WORST: major - at combat range enemy fighters are bright specks under the lead dot, cross and
brackets, so dogfights chase a HUD box instead of a readable ship.

## Builder response (fixes for round 11)

1. A targeting computer view (as in the classic space sims): a zoomed camera renders the current
   target into a framed box under the target panel, so its shape and heading read at any range.
   It looks from just ahead of the player (never through its own hull), keeps the main camera's
   roll, and speed dust sits on a separate layer so it is never magnified.
2. The LOCK tag sits centred above the locked frame, so it cannot hang onto a neighbour.
3. Carrier model and finale detail: first M5 item.
5. The death camera frames the wreck and the ship that killed you.
