# Caverns: restoring the original prose

Qualified in emulation and the browser. The owner requested restoration of atmosphere rather
than terse route summaries. All 54 room descriptions have been reconciled
with the preserved protected MicroWorld BASIC listing. The original sentences,
Norse setting, humour, statue of Loki, bat colony, glacial river and castle
have been restored where applicable. Modern map bearings and puzzle changes
take precedence over obsolete instructions. There is no new gameplay rule.

[Room-by-room comparison](evidence/caverns-prose-restoration/rooms.json)
records original, abbreviated and restored wording. The protected original is
unchanged in the archival repository. Formatting spaces from its fixed-width
listing are replaced by word wrapping for an 80-column display. Long paragraphs
are stored as counted lines and printed without truncation. Forty-column prose
layout is not the current target.

The displayed copyright is 1982-83; the GNU Public License notice retains 2019.
The public source is CAVERNS.BAS and BAZA writes CAVERNS.COM. The assembly build
is preserved as CAVASM.COM, outside the starter card, to avoid a name collision.
The card still supplies only source and instructions, not the compiled game.

The final native build is 37,248 bytes (37,177 logical), below the 40,000-byte
ceiling. Both independent full strict Tecos runs pass all 1,433 checks, with
no failures or skips. The Viewer passes all 202 checks with unchanged timing
and copy limits. A fresh Chromium context compiles the byte-identical game,
plays the opening and restores an exported checkpoint in independent storage.
The native quest earns 126 points, visits all 54 rooms, checks their actual
prose and returns home. The 480-command/36-scenario comparison preserves all
persisted state/RNG and exact non-prose responses. Descriptions, paragraph
wrapping and the copyright are the only permitted output differences.

The door's static description is deliberately neutral: the existing dynamic
message reports whether it is barred or blasted open. The bridge retains its
creaking, swaying atmosphere without falsely claiming it will collapse. The
temple's statue, balcony lore, crypt's decay, bat colony and castle's humour
return without restoring obsolete gates, bearings or riddles. All 216 exits,
objects, values and command vocabulary remain unchanged.

[Qualification and retained logs](evidence/caverns-prose-restoration/qualification.json)
separate earlier failed/stopped attempts from the two complete passing runs.
The host-copy timing failure under concurrent CPU load is retained by the
Viewer; CPU isolation passed the same limits, with no gate weakened. Physical
TEC-1G and the author's final read-through remain human-stage checks.

The qualified work is on main in Tecos and the Viewer. The exact main-built,
fresh-browser-tested standalone is pushed to the hosting branch with matching
build details. The executor's CONNECT proxy refuses the public URL, so uploaded
bytes are verified via Git and the live HTTP response is not claimed as seen.
Download any existing Viewer card before choosing New starter card; a reload
preserves old files rather than substituting the renamed, restored source.
