# A board run of the diagnostics

A short checklist for running the diagnostics on a TEC-1G with MON3 in the
ROM socket. The result is a serial log to paste back.
[diagnostics.md](diagnostics.md) says what each check does.

## What you need

- The TEC-1G with MON3, the GPIO board and its microSD module, and the card
  to test: a TEC-OS card, such as the starter card. Back up the card first.
  SD8 writes only blocks the card does not use and puts each one back, but a
  power cut during it would leave one of them changed.
- The USB-C FTDI adapter on the TEC-1G's FTDI header, and a terminal program
  on the computer that can send a text file and log to a file.
- `build/diag/DIAG.HEX`, from `npm run diag`, or from whoever sent it.
  Note the image ID that `npm run diag` prints.

## Load it over the FTDI adapter

1. Set the terminal to 4800 baud, 8 data bits, no parity, 2 stop bits, no
   flow control.
2. Power the TEC-1G. In MON3's main menu choose **Intel HEX Load**.
3. Send `DIAG.HEX` from the terminal as a plain text file (no protocol such
   as XMODEM).
4. The digits show `PASS` when the load is good. Press a key.
5. If they show `FAIL`, or nothing happens, set the terminal to wait a few
   milliseconds after each character, or after each line, and repeat from
   step 2. MON3 receives bit by bit and can drop characters sent back to back.

**Fallback, from a FAT32 card.** Copy `DIAG.HEX` to the root of a FAT32
microSD card. Fit it, then in MON3 choose **Drive Access**, **Catalog**
(or `Fn-F` in data entry mode), select `DIAG.HEX` and press `GO`. The program
asks for the card to test before it touches SD, so the FAT32 card can be
swapped then.

## Run it

1. Start logging the terminal to a file.
2. In MON3's data entry mode set the address to `4000h` (`AD`, `4000`, `AD`)
   and press `GO`. The LCD's last row reads `Log on? GO=send`.
3. Press `GO`. The header and a note of MON3's latch state appear on the
   terminal.
4. Fit the card to test if it is not in, and press `GO` (`AD` leaves).
5. Watch the DISC ACTIVITY LED: it should flash during SD1–SD9.
6. **SD8** asks before it writes: press `GO` to run the write test, `AD` to
   skip it.
7. **SD9** asks you to pull the card out: do so, then press `GO`. When asked,
   put it back and press `GO`. `AD` at the first question skips it.
8. Keep off the keypad during the SHAD check (the LCD's second row reads
   `Latch bit 0`).
9. **KEYS**: press a few keypad keys, and a few matrix keys if a keyboard is
   fitted. Each prints a `# KEY` line. Press `AD` to end.
10. At `SUMMARY`, press `GO` to return to MON3, and stop the log.

The whole run takes about two minutes, most of it SD8 and the reads.

## Send back

- The whole log, from the `TEC1G-DIAG` line to the `SUMMARY` line.
- The image ID `npm run diag` printed, if it differs from the log's.
- The card: make, size as marked and any markings (for example "4 GB HC
  UHS-I U1 V10 A1").
- Anything the LCD or the board did that the log does not show: the DISC
  ACTIVITY LED not flashing, a digit or LCD row wrong, or a step where the
  program stopped.
- The DIP switch settings (PROTECT, EXPAND, MATRIX).
