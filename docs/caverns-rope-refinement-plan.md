# Rope descent refinement — agreed during author review

This is an approved design for the later gameplay batch. Current BASIC still
uses USE ROPE to descend immediately; checkpoint 5 records that current rule.
No rail, tying state or revised command behavior has been implemented yet.

## Discoverable, deliberate sequence

1. The balcony description identifies a sturdy stone rail and the temple floor
   far below. The rail is fixed scenery, not another carried object.
2. TIE ROPE TO RAIL secures the carried rope, confirms the action and leaves the
   player on the balcony. Filler words such as TO need not be significant.
3. Explain that the rope ends short of the floor, so descent requires a final
   drop and will not permit climbing back. Give this warning before descent.
4. DOWN commits to the one-way descent, leaving the rope anchored above.
5. USE ROPE explains the tie-then-DOWN sequence rather than moving the player.

An incomplete tying request should ask what is missing, without charging a
turn or changing the world. DOWN without the secured rope should explain the
requirement and leave the player safe. Once the warning is clear, the explicit
DOWN command need not trigger an additional yes/no confirmation.

Implement explicit anchored-rope state. Define how taking/untieing the rope
clears that state so an ordinary pickup cannot leave an invisible attachment.
Preserve that state in the scenario format and future checkpoints; revise the
format/version and loader identity when implementing, rather than inferring a
new state from old-format saves. The existing one-way transition and key gate
remain part of the intended game progression.

## Caverns80 comparison

Its balcony description also has no rail. Its CMDDOWN requires DOWN with the
rope noun, possession of the rope and balcony room 28, then moves to temple 35
and leaves the rope behind. There is no tying step. Thus the rail/attachment
sequence is an author-approved improvement beyond both current versions.

Caverns80 also resets sword fatigue during this descent. Record that as a
separate combat-balance difference, not a necessary consequence of changing
rope syntax. The current BASIC and checkpoint 5 retain cumulative fatigue.

Caverns80's added east exit from temple 35 is likewise a separate exception:
it permits leaving via the wizard cavern without the key/gate/crypt sequence.
Keep that puzzle-bypass decision separate from ordinary return-path repairs.

## Acceptance

- Rail, floor height and available actions are described before they matter.
- Tying confirms attachment without moving the player.
- USE ROPE and incomplete commands explain the sequence safely.
- DOWN requires attachment and performs the existing one-way transition.
- Inventory/rope location and attachment state agree before and after descent.
- New checkpoint records can restore both a tied balcony and the temple floor.
- Preserve key/gate progression, measure the compiled image and refresh the
  qualified COM, scenario loader and scenarios after the eventual source edit.
