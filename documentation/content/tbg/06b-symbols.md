---
title: Name the code with symbols
parent: TBG
nav_order: 7
nav_group: Using TBG
---

# 7. Name the code with symbols

When TAS builds `STEP.COM` it also writes `STEP.TBG`, a small file of the
program's labels. TBG on its own shows only addresses. Load the symbols
extension, `TBGSYM.SVC`, and TBG names the code with your labels.

Load TBG first, then the extension, once per session:

```text
A>TBG.SVC
A>TBGSYM.SVC
A>TBG.SVC STEP
```

With an armed launch, enter `TBG.SVC ARM`, then `TBGSYM.SVC`, then `STEP`.
The extension needs five pages beyond TBG's own. Without TBG resident, CP/M
refuses to load it.

At each launch TBGSYM reads the `.TBG` file beside the COM and checks that
it describes the program in memory. When it does, Registers shows `SY` at
the end of its second row, and:

- **Code** shows a label on its own row above the instruction it names, such
  as `TAKE:`. The targets of jumps and calls, and addresses in brackets,
  show as names when a label has that value.
- **Symbols**, a fifth view after Memory, lists the labels in address order.
  **Up/Down** select one, **Enter** opens Code at it (**Esc** comes back), and
  **B** toggles a breakpoint there.

If the program has been rebuilt and the `.TBG` file no longer matches, or
there is none, TBG carries on without names and `SY` does not show. Rebuild
with TAS to write both files again.

`UNLOAD` at the CP/M prompt removes the most recently loaded service. With
TBGSYM loaded after TBG, it removes TBGSYM and leaves TBG as it was.
