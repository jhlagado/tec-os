# LCD revision 2 byte pricing

Source pin: `20a9a2d8fa5e407d0713f20da9662c18831fbae1`.
Measurement: 17 November 2026, 15:28:55 to 15:28:57 UTC.

The normal build fails at the root source's end. The pinned assembler then
successfully prices a private copy with both workspace and ROM moved 2000h
lower. It measures 16,728 ROM bytes. The implied normal-origin end is
10158h, 344 bytes beyond the 16 KiB image. The candidate needs 472 bytes of
net savings to retain the required 128-byte reserve.

The four stdout/stderr logs are exact copies. `measurement.json` records
component pins, input and log hashes, the diagnostic census and resource
monitoring. It normalises the Node executable's host path. The original
provenance and full guard log remain in the local build evidence, identified
by their hashes. `SHA256SUMS` covers these portable records.

The relocated image was discarded and never executed or published. This is
byte pricing, not normal-origin placement or runtime qualification. No new
firmware artifact has been qualified.
