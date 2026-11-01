TEC-OS starter disk

COPY SOURCE DEST   copy a file (built in), for example COPY TERM.COM B:TERM.COM
TERM               draw on the video console; TERM S also scrolls
PROBE              exercise the BDOS file functions
DEMO               the LCD, digits, 8x8 LEDs and PICO9918; any key stops
EDIT NAME.TXT      full-screen editor, if present: ^S save, ^Q quit
VOLS               list the card's volumes
MOUNT B: NAME      put a volume on a drive; MOUNT B: takes it off

B: is an empty work disk, written behind: its changes reach the card when a
file is closed, at ^C and at MOUNT. Press ^C at A> before reset or power off.
