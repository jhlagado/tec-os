# TEC Compact exact export

The selected design at Origo `dd42012c`, exported as 96 slots from 20h through 7Fh, eight bytes per slot, top row first. Every row uses only bits 7–3. No clipping or rescaling occurs. `tec-compact.txt` uses the existing five-column source format. `tec-compact.bin` contains the same 768 bytes.

Run `python3 export.py` from any directory to reproduce the export using the retained BDF files alongside this folder and `original-font5x7.txt`. `manifest.json` records hashes and ordering. `NOTICES.txt` retains the Spleen licence, X11 notice and the limit of known original-font attribution.

The 95 printable slots match the selected 40/80 TED preview bytes exactly, checked against `ted_trial.py`. Slot 7F is the original eight-row five-pixel solid block, unchanged. It was not replaced in the preview. The original source and exact 768-byte original are retained here, including DEL. The original bytes match the qualified baseline font hash.

These are normal glyph patterns. Reverse generation remains a consumer responsibility; the research preview complements the full byte with XOR FF. PICO and GLCD qualification must establish their own complete resulting patterns. No product source, default or pin changes in this export.
