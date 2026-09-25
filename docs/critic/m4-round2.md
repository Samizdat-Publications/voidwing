# Milestone 4 (UI), critic round 2

Screenshots: 26 frames (win run 01 to 19, lose run 20 to 23, pause menu, how to fly and settings
24 to 26).

Also fixed before this round (from the builder's own review of the captures): comms moved to the
bottom left above the status panel (they collided with the centred banner), a duplicate carrier
radio line reworded, the playtest bot throttles up at launch like a player would, and the
player's collision assist looks 1.3 s ahead with a tight margin.

## Critic findings (summary of the verbatim report)

The critic confirmed every pitch feature appears and that the title, HUD, pause, victory and
failure screens share one font, palette and panel style.

1. Major: fights become a pile of HUD markers where you aim: enemies approach in a tight pack, so
   brackets, tags, both reticles and the lead diamond merge; a tag touches the cross; a wingman
   ring sits on an enemy bracket.
2. Major: the lead indicator is almost never visible (it only showed for crossing targets), and
   the gun cross and the cyan steering ring read as two reticles.
3. Major: the carrier's rule (its shield eats shots unless you attack a generator from outside the
   bubble) is only explained after you fail, and the shield-blocked warning stacks on top of the
   GENERATOR DESTROYED banner.
4. Minor: the Leviathan looks like placeholder art; the ending is small.
5. Minor: orange and gold mean too many things (bombers, missile marker, damage arc, hull warning;
   generator diamonds look like the lead diamond).

WORST: major - enemies fly in tight packs straight ahead, so brackets, tags, both reticles, the
lead diamond and the damage arc merge where you aim.

## Builder response (fixes for round 3)

1. Dogfighters swing in from their own flank angle while far out (the offset fades inside 260 m),
   so a wave spreads instead of queueing; non-target brackets are thinner and at 70 % so the target
   stands out; the lock and range tags sit beside the bracket's right edge, clear of the gun
   cross's vertical axis.
2. The lead mark is always drawn, now as a yellow dot (no other marker is a filled yellow dot),
   with a tie line when it sits ahead of the target; How to fly explains that it sits on top of an
   enemy flying straight at you. The steering ring only shows while the ship is turning.
3. The shield rule is stated up front: on the title briefing ("hit its 4 generator pylons from
   outside the bubble") and in the radio call when the carrier arrives; the shield-blocked warning
   waits until banners clear; the shield bubble reads a little stronger.
4. Deferred to M5: carrier model detail and scale.
5. Bombers are red like every enemy (told apart by the heavy bracket and the BOMBER tag); orange is
   now only for danger to you (incoming missile, damage direction, hull warnings).
