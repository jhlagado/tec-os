// TMS9918 screen rendering from VRAM and registers: text mode (40 columns of
// 6-pixel cells) and Graphics I (32 columns) with its sprites, the modes the
// TEC-OS console and its programs use. Other modes use the framebuffer the
// runtime renders itself.

const PALETTE = [
  0x000000, 0x000000, 0x21c842, 0x5edc78, 0x5455ed, 0x7d76fc, 0xd4524d, 0x42ebf5,
  0xfc5554, 0xff7978, 0xd4c154, 0xe6ce80, 0x21b03b, 0xc95bba, 0xcccccc, 0xffffff,
];

function put(d, x, y, rgb) {
  const o = (y * 256 + x) * 4;
  d[o] = (rgb >> 16) & 0xff;
  d[o + 1] = (rgb >> 8) & 0xff;
  d[o + 2] = rgb & 0xff;
  d[o + 3] = 255;
}

/**
 * Sprites over the background: up to 32 from the attribute table, ending at
 * a Y of D0h, 8 x 8 or 16 x 16 (register 1 bit 1), doubled with bit 0. Sprite
 * 0 is in front. The early clock bit moves a sprite 32 pixels left. The
 * four-per-line limit and collision flag are not modelled.
 */
function drawSprites(d, r, vram) {
  const attrs = (r[5] & 0x7f) * 0x80;
  const pats = (r[6] & 0x07) * 0x800;
  const size = r[1] & 0x02 ? 16 : 8;
  const mag = r[1] & 0x01 ? 2 : 1;
  let count = 0;
  while (count < 32 && vram[attrs + count * 4] !== 0xd0) count += 1;
  for (let i = count - 1; i >= 0; i -= 1) {
    const a = attrs + i * 4;
    let y = (vram[a] + 1) & 0xff;
    if (y > 0xe0) y -= 256;
    const colourByte = vram[a + 3];
    const x = vram[a + 1] - (colourByte & 0x80 ? 32 : 0);
    const colour = colourByte & 0x0f;
    if (colour === 0) continue;
    const name = size === 16 ? vram[a + 2] & 0xfc : vram[a + 2];
    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        const byte = vram[pats + name * 8 + (px >> 3) * 16 + py];
        if (!(byte & (0x80 >> (px & 7)))) continue;
        for (let my = 0; my < mag; my += 1) for (let mx = 0; mx < mag; mx += 1) {
          const sx = x + px * mag + mx, sy = y + py * mag + my;
          if (sx >= 0 && sx < 256 && sy >= 0 && sy < 192) put(d, sx, sy, PALETTE[colour]);
        }
      }
    }
  }
}

/** True when the registers select the PICO9918's 80-column text mode. */
export function isText80(registers) {
  return (registers[0] & 0x04) !== 0 && (registers[1] & 0x10) !== 0;
}

/**
 * Fill a 512 x 192 image for 80-column text: 80 cells of 6 pixels between
 * 16-pixel borders, names at a 4 KiB boundary, colours from register 7.
 */
export function renderText80(image, snapshot) {
  const d = image.data;
  const r = snapshot.registers;
  const vram = snapshot.vram;
  const backdrop = PALETTE[r[7] & 0x0f];
  const fg = PALETTE[r[7] >> 4];
  const names = (r[2] & 0x0c) << 10;
  const patterns = (r[4] & 0x07) * 0x800;
  const put80 = (x, y, rgb) => {
    const o = (y * 512 + x) * 4;
    d[o] = (rgb >> 16) & 0xff;
    d[o + 1] = (rgb >> 8) & 0xff;
    d[o + 2] = rgb & 0xff;
    d[o + 3] = 255;
  };
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      put80(x, y, backdrop);
      put80(496 + x, y, backdrop);
    }
  }
  const on = (r[1] & 0x40) !== 0;
  for (let row = 0; row < 24; row += 1) {
    for (let col = 0; col < 80; col += 1) {
      const code = vram[names + row * 80 + col];
      for (let line = 0; line < 8; line += 1) {
        const bits = on ? vram[patterns + code * 8 + line] : 0;
        for (let px = 0; px < 6; px += 1) put80(16 + col * 6 + px, row * 8 + line, bits & (0x80 >> px) ? fg : backdrop);
      }
    }
  }
}

/** Fill image data (256 x 192) for the current mode. Returns false if blank. */
export function renderTms(image, snapshot, fallbackFramebuffer) {
  const d = image.data;
  const r = snapshot.registers;
  const vram = snapshot.vram;
  const backdrop = PALETTE[r[7] & 0x0f];
  const enabled = (r[1] & 0x40) !== 0;
  const text = (r[1] & 0x10) !== 0;
  const graphics1 = (r[1] & 0x18) === 0 && (r[0] & 0x02) === 0;
  if (!enabled) {
    for (let y = 0; y < 192; y += 1) for (let x = 0; x < 256; x += 1) put(d, x, y, backdrop);
    return true;
  }
  if (text) {
    const names = (r[2] & 0x0f) * 0x400;
    const patterns = (r[4] & 0x07) * 0x800;
    const fg = PALETTE[r[7] >> 4];
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        put(d, x, y, backdrop);
        put(d, 248 + x, y, backdrop);
      }
    }
    for (let row = 0; row < 24; row += 1) {
      for (let col = 0; col < 40; col += 1) {
        const code = vram[names + row * 40 + col];
        for (let line = 0; line < 8; line += 1) {
          const bits = vram[patterns + code * 8 + line];
          for (let px = 0; px < 6; px += 1) put(d, 8 + col * 6 + px, row * 8 + line, bits & (0x80 >> px) ? fg : backdrop);
        }
      }
    }
    return true;
  }
  if (graphics1 && !fallbackFramebuffer) {
    const names = (r[2] & 0x0f) * 0x400;
    const patterns = (r[4] & 0x07) * 0x800;
    const colors = r[3] * 0x40;
    for (let row = 0; row < 24; row += 1) {
      for (let col = 0; col < 32; col += 1) {
        const code = vram[names + row * 32 + col];
        const c = vram[colors + (code >> 3)];
        const fg = (c >> 4) === 0 ? backdrop : PALETTE[c >> 4];
        const bg = (c & 0x0f) === 0 ? backdrop : PALETTE[c & 0x0f];
        for (let line = 0; line < 8; line += 1) {
          const bits = vram[patterns + code * 8 + line];
          for (let px = 0; px < 8; px += 1) put(d, col * 8 + px, row * 8 + line, bits & (0x80 >> px) ? fg : bg);
        }
      }
    }
    drawSprites(d, r, vram);
    return true;
  }
  if (fallbackFramebuffer) {
    for (let i = 0; i < 256 * 192; i += 1) put(d, i & 255, i >> 8, fallbackFramebuffer[i] ?? 0);
    return true;
  }
  return false;
}
