# Reusable rope connection — agreed during author review

This is the latest approved design for the later gameplay batch. It supersedes
both the original one-way drop and the subsequent proposal to require the key
before descent. Current BASIC still uses USE ROPE for its one-way descent;
checkpoint 5 records that current rule. No tying/ascent change is implemented.

## Discoverable, deliberate sequence

1. The balcony description identifies a sturdy stone rail and the temple floor
   below. The rail is fixed scenery, not another carried object.
2. TIE ROPE TO RAIL secures the carried rope, confirms the action and leaves the
   player on the balcony. Filler words such as TO need not be significant.
3. Describe the rope reaching the floor. Remove the ten-foot-short/final-jump
   detail; it contradicts the approved ability to climb back.
4. DOWN descends to the temple floor, leaving the rope secured above.
5. UP from the temple climbs the secured rope back to the balcony.
6. USE ROPE explains the appropriate tying/climbing action rather than
   immediately moving the player without a clear direction.

No key check before descent is needed. A player missing the key or candle can
climb back and recover naturally. The upward route works even when the temple
is dark, provided the rope is still secured. This preserves the temple's
locked gate and crypt puzzle without trapping an unprepared player.

An incomplete tying request should ask what is missing, without charging a
turn or changing the world. DOWN without the secured rope explains the
requirement and leaves the player safe. Once the action is clear, an explicit
UP or DOWN need not trigger an additional yes/no confirmation.

Implement explicit anchored-rope state and visible descriptions at both ends.
Define how taking/untying the rope clears attachment so an ordinary pickup
cannot leave an invisible climbing connection. Preserve that state in the
scenario format and future checkpoints; update format/version and loader
identity when implementing, rather than inventing new state from old saves.

## Caverns80 comparison

Its balcony description also has no rail. CMDDOWN requires DOWN with a rope
noun, possession and balcony room 28, then moves to temple 35 and leaves the
rope behind. It has no tying step or reciprocal ascent. The reusable secured
rope is an explicit author-approved improvement beyond both current versions.

Caverns80 also resets sword fatigue during descent. That is a separate combat
balance difference; the current BASIC and checkpoint 5 retain cumulative
fatigue. Do not import the reset merely to implement climbing.

Caverns80's added east exit from temple 35 is a separate rejected bypass of the
key/gate/crypt sequence. UP restores access to the upper caves; it does not
provide an alternative way into the lower temple/castle region.

## Magic-word role

The author explicitly approved this consequence: a reusable UP route makes
GALAR optional for escape. Keep the spell as a valuable fast-travel reward,
not a mandatory workaround for a one-way trap. Do not add another arbitrary
closure or equipment loss to force its use. Verify a complete walking return
from castle via drawbridge/ledge/wizard cavern/temple/rope/upper caves, while
retaining the gate and crypt puzzles for first access to the lower region.

## Acceptance

- Rail, floor-reaching rope and available actions are described consistently.
- Tying confirms attachment without moving the player.
- USE ROPE and incomplete commands explain the sequence safely.
- DOWN and UP work while the rope is secured, including recovery without a
  key or candle; neither item is an artificial condition of descent/ascent.
- Rope inventory/location and attachment state agree before and after climbing.
- Removing the rope disables the climbing connection.
- New checkpoints can restore a tied balcony and the temple floor correctly.
- Preserve key/gate progression, measure the compiled image and refresh the
  qualified COM, scenario loader and scenarios after the eventual source edit.
