# A board run of the diagnostics

A short checklist for running the diagnostics on a TEC-1G with MON3 in the
ROM socket. The result is a serial log to paste back.
[diagnostics.md](diagnostics.md) says what each check does.

## Before the run: the card

SD8 writes the card. It addresses only blocks the card does not use and puts
each one back, but a fake card can send a write elsewhere, and a fault or a
power cut can leave a block changed. So:

1. **Use a card you can lose, or image it first.** On the computer, save the
   whole card to a file: for example
   `sudo dd if=/dev/sdX of=card-backup.img bs=1M` on Linux or macOS (with the
   card's own device for `/dev/sdX`), or Read in Win32 Disk Imager on
   Windows.
2. **Write the TEC-OS starter image to it**, `dist/starter.img` from
   `npm run media`, with `tecvol install` or the same tools
   (`sudo dd if=dist/starter.img of=/dev/sdX bs=1M`, or Write in Win32 Disk
   Imager).
3. **After the run**, if the log shows `SD8 FAIL alias`, `SD8 FAIL
   restore-failed`, or the note `restore it from your backup`, re-image the
   card before using it: write `dist/starter.img`, or your backup, back to it.
   Do not run TEC-OS on the card first.

## What you need

- The TEC-1G with MON3, the GPIO board and its microSD module, and the card
  prepared as above.
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
5. **Keep off the keypad for a moment.** The latch check, SHAD, runs at once
   after that `GO`, while the LCD's second row reads `Latch bit 0`. It is done
   when the row changes to `SD1 MISO idle`, under a second later.
6. Watch the DISC ACTIVITY LED: it should flash during SD1–SD9.
7. **SD8** asks before it writes. To write, press `8`, then `GO`. Any other
   key skips it. While it runs, hold `AD` to stop it at the next block.
8. **SD9** asks you to pull the card out: do so, then press `GO`. When asked,
   put it back and press `GO`. `AD` at the first question skips it.
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
