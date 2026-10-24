// TMS9918 screen rendering from VRAM and registers: text mode (40 columns of
// 6-pixel cells) and Graphics I (32 columns), the modes the TEC-OS console
// uses. Other modes use the framebuffer the runtime renders itself.

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
    return true;
  }
  if (fallbackFramebuffer) {
    for (let i = 0; i < 256 * 192; i += 1) put(d, i & 255, i >> 8, fallbackFramebuffer[i] ?? 0);
    return true;
  }
  return false;
}
