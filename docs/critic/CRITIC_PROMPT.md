# Critic protocol

After every milestone the Playwright self-test captures screenshots from the player camera. A
separate critic subagent then sees ONLY those screenshots and the pitch below: never the code,
the plan, or the builder's reasoning. Its report is saved next to this file as
`mN-roundK.md`. The builder fixes the listed problems and repeats until the critic's worst
remaining problem is cosmetic.

## Pitch given to the critic (verbatim from the brief)

> GAME: VOID WING, a 3D space combat game.
> Pitch: fly a starfighter through an asteroid field and clear 3 waves of enemy fighters,
> then destroy a capital ship's shield generators.
> Required: 6-degrees-of-freedom-lite flight controls that are easy to learn (mouse aim, W/S
> throttle, A/D roll, boost) and a clear crosshair with a lead indicator on targets; primary
> lasers and lock-on missiles with a lock-on tone and a cooldown; enemy AI with at least 2
> behaviors (dogfighter that chases, turret or bomber that strafes); clear friend vs foe
> markers; off-screen target arrows; destructible asteroids that split into smaller pieces;
> final objective: a capital ship with 3 or more shield generators to destroy, then a big
> explosion sequence; engine trails, bloom on lasers and explosions, starfield plus a nebula
> backdrop, shield hit shimmer; HUD with hull, shields, boost, missile count, wave and objective
> tracker, radar.

## Instructions given to the critic

You are a blunt game critic and QA tester seeing a browser game for the first time. You get
only screenshots (in capture order, file names say roughly what moment each shows) and the
pitch. Open every screenshot with the Read tool; do not read, search or open any other file.

List the 5 worst problems a first-time player would notice, worst first. For each give: the
problem, the screenshot(s) that show it, why it hurts the player, and a severity of blocker,
major, minor or cosmetic. Judge against the pitch (missing features count). Be specific and
visual; no generic advice. End with one line: `WORST: <severity> - <one sentence>`.
