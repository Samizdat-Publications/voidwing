# Milestone 1 (greybox), critic round 1

Screenshots: 14 frames from `npm run playtest -- --scenario win --god` and `--scenario lose`
(test-output/critic-m1r1). Critic saw only the screenshots and the pitch.

## Critic report (verbatim)

No blockers. Both the win screen (11) and the loss screen (14) are reached, but all 5 problems below are major.

**1. You never see an enemy ship. Every fight is against red HUD icons.** Severity: major. Shots: 03, 04, 05, 06, 12, 13.
Enemies only exist as red diamonds and brackets with a name and a range: Razor 696 m (03), Razor 1212 m (04), Razor 1523 m (05), Maul 732 m (06). Even at 180 m (12) you can't make out a ship inside the lock diamond. In 13 the targeted Razor is 84 m away and still isn't in frame. The "wave 2 bombers" shot (05) has no bomber in it. Your wingmen are easy to see as grey ships with cyan engines (03, 04), so the problem is only the enemies. Why it hurts: dogfighting is the core of the game; you can't tell a Razor from a Maul.

**2. The aim point is a cluttered pile of markers, sitting right on top of your oversized ship.** Severity: major. Shots: 03, 04, 06, 12.
Within about 120 px of screen centre: crosshair ring and steering ring, a lead pip, the red lock diamond, dashed red boxes, name and range text, "LOCKED - FIRE [RMB]", a thin dark-maroon arc with no explanation. Two near-identical white circles about 30 px apart; nothing says which one is the lead. The boxy player ship is about 320 px wide, a quarter of the screen; the LOCKED prompt prints across the fuselage. The missile readout shows no cooldown, which the pitch requires.

**3. Explosions, including the finale, are flat, unlit polygons.** Severity: major. Shots: 09, 10, 13 (also 05, 08).
The chain reaction is one dull lump on an intact hull; the big explosion is a flat pale-cyan polygon with no glow, fire, debris, hull break-up or shockwave. The pitch promises a big explosion sequence and bloom.

**4. The carrier climax gives contradictory orders, and its shield is invisible.** Severity: major. Shots: 07, 08, 09.
"DESTROY THE 4 SHIELD GENERATORS" with a red "RETURN TO COMBAT AREA" plate directly under it while heading straight at Generator B. The radio says the carrier is shielded but there is no bubble, tint or shimmer. The carrier reads small next to your own fighter.

**5. Pitched visual effects are missing: nebula, engine trails, laser bloom and shield shimmer.** Severity: major. Every frame.

Also noticed: "HOLD POSITION" objective while the banner says "WEAPONS FREE"; the "GENERATOR DESTROYED" banner caught mid-fade; missile lock goes solid at 1.1 to 1.2 km on targets you can't see; a grey sliver of the ship shows through the title panel. What works: friend (cyan ring), foe (red) and objective (amber) markers are easy to tell apart; every required HUD readout is present plus radar; off-screen arrows exist.

WORST: major - You never actually see an enemy ship in any combat frame, so every dogfight is aiming at red HUD icons 700 to 1500 m away and the two enemy types can't be told apart.

## Builder response

- In scope for M1 and fixed in round 2: 1 (enemy visibility), 2 (HUD clutter, ship size, missile
  cooldown readout), 4 (visible shield bubble, generator power beams, boundary warning at the
  objective), plus the intro objective text and a shorter lock range (1300 m).
- Deferred by the milestone plan, treated as cosmetic for the greybox: 3 (explosion VFX, M3) and
  5 (nebula backdrop M2, trails / bloom / shimmer M3). Logged in CLAUDE.md DECISIONS.
- Note: the missile count "reset" between 03 and 04 was a file-ordering mistake in the critic set
  (lock shot was taken before the combat shot), not a game bug.
