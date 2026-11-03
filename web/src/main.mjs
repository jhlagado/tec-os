// TEC-OS in the browser: the Debug80 TEC-1G runtime driving a TMS9918
// screen, the front-panel displays, a serial terminal and an SD card kept in
// IndexedDB. The machine wrapper is the one the tests use.

import { Machine, symbolsFromD8 } from "../../host/machine.mjs";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { prepareCard, widthDrivers } from "../../host/card.mjs";
import { parseContainer, volumePayload } from "../../tools/lib/container.mjs";
import { CpmVolume } from "../../tools/lib/cpmfs.mjs";
import { buildRecipe } from "../../tools/lib/recipe.mjs";
import { loadCard, saveCard } from "./store.mjs";
import { isText80, renderText80, renderTms } from "./tms.mjs";

const CPU_HZ = 4_000_000;
const $ = (id) => document.getElementById(id);

const state = {
  width: localStorageGet("tecos.width") ?? "80",
  display: localStorageGet("tecos.display") ?? "tms",
  machine: null,
  card: null,
  cardDirty: false,
  unsaved: false, // the last save failed (KE-153)
  importBusy: false,
  running: true,
  serialSeen: 0,
  serialText: "",
  escape: 0,
};

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not available: the choice lasts for this page only.
  }
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-cache" }); // a rebuilt ROM or file is never served stale
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadRom() {
  const [rom, symbols] = await Promise.all([
    fetchBytes("roms/tecos.rom"),
    fetch("roms/tecos.symbols.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  return { rom, symbols: symbolsFromD8({ symbols }) };
}

async function starterCard() {
  const recipe = await fetch("starter.recipe.json", { cache: "no-cache" }).then((r) => r.json());
  return buildRecipe(recipe, fetchBytes);
}

// ---- Machine lifecycle ------------------------------------------------------

async function powerOn() {
  let fetched = {};
  if (state.display === "tms") {
    const recipe = await fetch("starter.recipe.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
    fetched = await widthDrivers(recipe, fetchBytes);
  }
  const { problem, note, changed } = prepareCard(state.card, state.display, state.width, fetched.drivers);
  if (changed) state.cardDirty = true;
  const { rom, symbols } = await loadRom();
  state.machine = new Machine({
    rom,
    symbols,
    sdImage: state.card,
    tms: state.display === "tms",
    matrix: true,
    onSdWrite: () => {
      state.cardDirty = true;
    },
  });
  state.serialSeen = 0;
  appendSerial("\n[power on]\n");
  for (const words of [fetched.problem, problem, note]) if (words) appendSerial(`[${words}]\n`);
}

function reset() {
  state.machine?.reset();
  appendSerial("\n[reset]\n");
}

/** Save the card; on failure it stays marked unsaved, the next tick tries again, and the page says so. */
async function save(image = state.card) {
  try {
    await saveCard(image);
    const was = state.unsaved;
    state.unsaved = false;
    if (was) refreshCard();
    return true;
  } catch (e) {
    state.cardDirty = true;
    state.unsaved = true;
    $("cardinfo").textContent = `Card not saved in this browser: ${e?.message ?? e}. It is kept in memory and saved again shortly.`;
    return false;
  }
}

setInterval(async () => {
  if (state.importBusy || !state.cardDirty || !state.card) return;
  state.cardDirty = false;
  await save();
}, 2000);

// ---- Run loop -----------------------------------------------------------------

let last = performance.now();
let cyclesWindow = 0;
let windowStart = last;

function frame(now) {
  const m = state.machine;
  const dt = Math.min(100, now - last);
  last = now;
  if (m && state.running && !state.importBusy) {
    const target = m.cycles + (dt * CPU_HZ) / 1000;
    const deadline = performance.now() + 30;
    const start = m.cycles;
    let n = 0;
    while (m.cycles < target) {
      m.step();
      if (m.pending?.length) m.pumpInput();
      if ((++n & 1023) === 0 && performance.now() > deadline) break;
    }
    cyclesWindow += m.cycles - start;
    render(m);
  }
  if (now - windowStart > 1000) {
    $("speed").textContent = state.running ? `${(cyclesWindow / ((now - windowStart) * 1000)).toFixed(2)} MHz` : "paused";
    cyclesWindow = 0;
    windowStart = now;
  }
  requestAnimationFrame(frame);
}

// ---- Rendering ------------------------------------------------------------------

const tmsCanvas = $("tms");
const tmsCtx = tmsCanvas.getContext("2d");
const tmsBitmap = document.createElement("canvas");
tmsBitmap.width = 256;
tmsBitmap.height = 192;
const tmsBitmapCtx = tmsBitmap.getContext("2d");
const tmsImage = tmsBitmapCtx.createImageData(256, 192);
const wideBitmap = document.createElement("canvas");
wideBitmap.width = 512;
wideBitmap.height = 192;
const wideBitmapCtx = wideBitmap.getContext("2d");
const wideImage = wideBitmapCtx.createImageData(512, 192);

const glcdCanvas = $("glcd");
const glcdCtx = glcdCanvas.getContext("2d");
const glcdBitmap = document.createElement("canvas");
glcdBitmap.width = 128;
glcdBitmap.height = 64;
const glcdBitmapCtx = glcdBitmap.getContext("2d");
const glcdImage = glcdBitmapCtx.createImageData(128, 64);

function render(m) {
  const p = serializeTec1gUpdateFromRuntimeState(m.tec1g.state);
  drawTms(p.tms9918, m.tec1g.state.display.tms9918);
  drawDigits(p.digits);
  drawLeds(p);
  drawLcd(p.lcd, p.lcdState);
  drawGlcd(p.glcd, p.glcdState);
  $("latch").textContent =
    `latch ${hex2(m.sysCtrl)}  window ${m.physicalBank < 0 ? "classic" : `bank ${m.physicalBank}`}` +
    `  caps ${p.capsLock ? "on" : "off"}`;
  pullSerial(m);
}

function hex2(v) {
  return v.toString(16).toUpperCase().padStart(2, "0") + "h";
}

function drawTms(tms, device) {
  if (!tms?.active) {
    tmsCtx.fillStyle = "#000";
    tmsCtx.fillRect(0, 0, tmsCanvas.width, tmsCanvas.height);
    return;
  }
  const snapshot = device.stateSnapshot();
  const r = snapshot.registers;
  tmsCtx.imageSmoothingEnabled = false;
  if (isText80(r)) {
    renderText80(wideImage, snapshot);
    wideBitmapCtx.putImageData(wideImage, 0, 0);
    tmsCtx.drawImage(wideBitmap, 0, 0, tmsCanvas.width, tmsCanvas.height);
    return;
  }
  const ownMode = (r[1] & 0x10) !== 0 || ((r[1] & 0x18) === 0 && (r[0] & 0x02) === 0);
  renderTms(tmsImage, snapshot, ownMode ? null : tms.framebuffer);
  tmsBitmapCtx.putImageData(tmsImage, 0, 0);
  tmsCtx.drawImage(tmsBitmap, 0, 0, tmsCanvas.width, tmsCanvas.height);
}

// Segment bits on port 02h: 0 a, 1 f, 2 g, 3 b, 4 dp, 5 c, 6 e, 7 d.
const SEGMENTS = [
  ["a", 0, "M8 4h20l-3 4H11z"],
  ["f", 1, "M6 6l4 4v14l-4 3z"],
  ["g", 2, "M9 28h18l2 2-2 2H9l-2-2z"],
  ["b", 3, "M30 6v21l-4-3V10z"],
  ["dp", 4, "M32 50a2.5 2.5 0 1 0 0.1 0z"],
  ["c", 5, "M30 33v21l-4-4V36z"],
  ["e", 6, "M6 33l4 3v14l-4 4z"],
  ["d", 7, "M11 52h14l3 4H8z"],
];
const digitEls = [];
for (let i = 0; i < 6; i += 1) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 36 60");
  for (const [, bit, d] of SEGMENTS) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "seg");
    path.dataset.bit = String(bit);
    svg.appendChild(path);
  }
  $("digits").appendChild(svg);
  digitEls.push([...svg.querySelectorAll("path")]);
}
function drawDigits(digits) {
  for (let i = 0; i < 6; i += 1) {
    const value = digits?.[5 - i] ?? 0; // index 5 is the leftmost digit
    for (const path of digitEls[i]) path.classList.toggle("on", (value & (1 << Number(path.dataset.bit))) !== 0);
  }
}

const ledEls = [];
for (let i = 0; i < 64; i += 1) {
  const dot = document.createElement("div");
  $("leds").appendChild(dot);
  ledEls.push(dot);
}
// The matrix is multiplexed: a program lights one row at a time. While it
// keeps scanning, show the last complete scan; when it stops, the row latched.
let ledScan = { id: -1, at: 0, rows: null };
function drawLeds(p) {
  const last = p.matrixScanCycles?.at(-1);
  if (last && last.id !== ledScan.id) ledScan = { id: last.id, at: performance.now(), rows: last.rows };
  const scanning = ledScan.rows && performance.now() - ledScan.at < 100;
  const plane = (name, row) => {
    if (!scanning) return p[name]?.[row] ?? 0;
    const image = ledScan.rows.find((r) => r.row === row);
    return image ? image[{ matrix: "red", matrixGreen: "green", matrixBlue: "blue" }[name]] : 0;
  };
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const bit = 1 << col;
      const r = plane("matrix", row) & bit ? 255 : 0;
      const g = plane("matrixGreen", row) & bit ? 220 : 0;
      const b = plane("matrixBlue", row) & bit ? 255 : 0;
      ledEls[row * 8 + col].style.background = r || g || b ? `rgb(${r},${g},${b})` : "";
    }
  }
}

function drawLcd(bytes, lcdState) {
  if (!bytes || lcdState?.displayOn === false) {
    $("lcd").textContent = "";
    return;
  }
  const rows = [];
  for (let r = 0; r < 4; r += 1) {
    let line = "";
    for (let c = 0; c < 20; c += 1) {
      const v = bytes[r * 20 + c] ?? 0x20;
      line += v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : " ";
    }
    rows.push(line);
  }
  const text = rows.join("\n");
  if ($("lcd").textContent !== text) $("lcd").textContent = text;
}

function drawGlcd(bytes, glcdState) {
  const d = glcdImage.data;
  const on = glcdState?.displayOn && glcdState?.graphicsOn && bytes;
  for (let row = 0, o = 0; row < 64; row += 1) {
    for (let col = 0; col < 128; col += 1, o += 4) {
      const lit = on && (bytes[row * 16 + (col >> 3)] & (0x80 >> (col & 7))) !== 0;
      d[o] = lit ? 32 : 200;
      d[o + 1] = lit ? 40 : 216;
      d[o + 2] = lit ? 90 : 240;
      d[o + 3] = 255;
    }
  }
  glcdBitmapCtx.putImageData(glcdImage, 0, 0);
  glcdCtx.imageSmoothingEnabled = false;
  glcdCtx.drawImage(glcdBitmap, 0, 0, glcdCanvas.width, glcdCanvas.height);
}

// ---- Serial terminal ---------------------------------------------------------------

function pullSerial(m) {
  if (m.serial.length === state.serialSeen) return;
  let text = "";
  for (let i = state.serialSeen; i < m.serial.length; i += 1) {
    const b = m.serial[i];
    if (state.escape) {
      // Skip ANSI sequences: ESC [ parameters final.
      if (state.escape === 1) state.escape = b === 0x5b ? 2 : 0;
      else if (b >= 0x40 && b <= 0x7e) state.escape = 0;
      continue;
    }
    if (b === 0x1b) state.escape = 1;
    else if (b === 0x0a) text += "\n";
    else if (b === 0x08) text += "\b";
    else if (b >= 0x20 && b < 0x7f) text += String.fromCharCode(b);
  }
  state.serialSeen = m.serial.length;
  appendSerial(text);
}

function appendSerial(text) {
  let s = state.serialText;
  for (const ch of text) s = ch === "\b" ? s.slice(0, -1) : s + ch;
  state.serialText = s.length > 40000 ? s.slice(-30000) : s;
  const pre = $("serial");
  const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = state.serialText;
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}

// ---- Keyboard ----------------------------------------------------------------------

const ARROWS = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D" };

function keyText(e) {
  if (e.metaKey || e.altKey) return null;
  if (e.key === "Enter") return "\r";
  if (e.key === "Backspace") return "\b";
  if (e.key === "Escape") return "\x1b";
  if (e.key === "Tab") return "\t";
  if (e.key === "Delete") return "\x7f";
  if (ARROWS[e.key]) return `\x1b[${ARROWS[e.key]}`;
  if (e.key.length !== 1) return null;
  if (e.ctrlKey) {
    const c = e.key.toUpperCase().charCodeAt(0);
    return c >= 0x40 && c <= 0x5f ? String.fromCharCode(c - 0x40) : null;
  }
  return e.key;
}

// The TEC-1G matrix keyboard's own arrow keys; TEC-OS turns them into ESC [ A-D.
const MATRIX_ARROWS = { ArrowUp: "\x03", ArrowDown: "\x04", ArrowLeft: "\x05", ArrowRight: "\x06" };

function onKey(route) {
  return (e) => {
    let text = keyText(e);
    if (text === null || !state.machine) return;
    e.preventDefault();
    const matrix = route() === "matrix";
    if (matrix && MATRIX_ARROWS[e.key]) text = MATRIX_ARROWS[e.key];
    const via = matrix && text.length === 1 ? "matrix" : "serial";
    state.machine.enqueueInput(text, via);
  };
}

$("tms").addEventListener("keydown", onKey(() => "matrix"));
$("serial").addEventListener("keydown", onKey(() => "serial"));
$("tms").addEventListener("click", () => $("tms").focus());
$("glcd").addEventListener("keydown", onKey(() => "matrix"));
$("glcd").addEventListener("click", () => $("glcd").focus());

// ---- Phones and tablets ------------------------------------------------------------
// A canvas or pre brings up no on-screen keyboard. A tap on the screen, the
// GLCD or the serial terminal focuses a hidden text field instead, and what
// the phone's keyboard does to that field is turned into the key events the
// tapped element would have had, for the same onKey. The field holds one
// space, so that Backspace always has something to delete; each edit is
// compared with what was there and the field is put back. A row of keys gives
// the ones a phone keyboard lacks; Ctrl latches for the next key.

const phone = { target: "matrix", pointer: "", ctrl: false };
const phoneInput = $("phonekeys");
const PHONE_REST = " ";
let phoneSent = PHONE_REST;

function phoneKey(key, ctrlHeld = false) {
  const ctrlKey = (ctrlHeld || phone.ctrl) && key.length === 1;
  if (phone.ctrl) setCtrl(false);
  onKey(() => phone.target)({ key, ctrlKey, metaKey: false, altKey: false, preventDefault() {} });
}

function setCtrl(on) {
  phone.ctrl = on;
  $("touchkeys").querySelector('[data-key="Control"]').setAttribute("aria-pressed", String(on));
}

function phoneRest() {
  phoneInput.value = PHONE_REST;
  phoneInput.selectionStart = phoneInput.selectionEnd = PHONE_REST.length;
  phoneSent = PHONE_REST;
}

// Send the difference between what the field held and what it holds now: a
// Backspace for each character taken off the end, then each one added. A
// keyboard composing a word changes it in place, so this follows it as it goes.
function phoneEdited() {
  const now = phoneInput.value;
  let same = 0;
  while (same < now.length && same < phoneSent.length && now[same] === phoneSent[same]) same += 1;
  for (let i = same; i < phoneSent.length; i += 1) phoneKey("Backspace");
  for (const ch of now.slice(same)) phoneKey(ch === "\n" || ch === "\r" ? "Enter" : ch);
  phoneSent = now;
}

function phoneFocus(el, target) {
  phone.target = target;
  const box = el.getBoundingClientRect();
  phoneInput.style.top = `${box.top + window.scrollY}px`;
  phoneInput.style.left = `${box.left + window.scrollX}px`;
  phoneRest();
  phoneInput.focus({ preventScroll: true });
  el.after($("touchkeys"));
}

for (const [id, target] of [["tms", "matrix"], ["glcd", "matrix"], ["serial", "serial"]]) {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => {
    phone.pointer = e.pointerType;
  });
  el.addEventListener("click", () => {
    if (phone.pointer === "touch") phoneFocus(el, target);
  });
}

phoneInput.addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229) return; // the keyboard is editing the field: see input
  // A key with a name, as from a tablet's own keyboard, goes as it would to the
  // tapped element; letters a phone keyboard sends this way go the same way.
  const ctrlKey = e.ctrlKey || (phone.ctrl && e.key.length === 1);
  if (keyText({ key: e.key, ctrlKey, metaKey: e.metaKey, altKey: e.altKey }) === null) return;
  e.preventDefault();
  phoneKey(e.key, e.ctrlKey);
});
phoneInput.addEventListener("beforeinput", (e) => {
  if (e.isComposing) return;
  if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
    e.preventDefault();
    phoneKey("Enter");
  }
});
phoneInput.addEventListener("input", (e) => {
  phoneEdited();
  if (!e.isComposing) phoneRest();
});
phoneInput.addEventListener("compositionend", () => {
  phoneEdited();
  phoneRest();
});

for (const button of $("touchkeys").querySelectorAll("button")) {
  button.addEventListener("mousedown", (e) => e.preventDefault()); // keep the field, and the keyboard
  button.addEventListener("click", () => {
    if (button.dataset.key === "Control") setCtrl(!phone.ctrl);
    else phoneKey(button.dataset.key);
    if (document.activeElement !== phoneInput && phone.pointer === "touch") phoneInput.focus({ preventScroll: true });
  });
}

// For tests: the PICO9918 screen as text rows.
globalThis.tecos = { screen: () => state.machine?.screen() ?? [] };

// ---- Card ---------------------------------------------------------------------------

function cardInfo() {
  try {
    return parseContainer(state.card);
  } catch (e) {
    $("cardinfo").textContent = `Card is not a valid container: ${e.message}`;
    return null;
  }
}

function refreshCard() {
  const info = cardInfo();
  if (!info) return;
  $("cardinfo").textContent =
    info.volumes.map((v) => `${v.drive ?? "-"}: ${v.label} (${v.g.name}${v.readOnly ? ", read-only" : ""})`).join("   ") +
    (state.unsaved ? "   Card not saved in this browser: it is kept in memory and saved again shortly." : "");
  const select = $("drive");
  const current = select.value;
  select.innerHTML = "";
  for (const v of info.volumes.filter((x) => x.drive)) {
    const opt = document.createElement("option");
    opt.value = v.drive;
    opt.textContent = `${v.drive}: ${v.label}`;
    select.appendChild(opt);
  }
  if (current) select.value = current;
  refreshFiles();
}

function currentVolume() {
  const info = cardInfo();
  const v = info?.volumes.find((x) => x.drive === $("drive").value);
  return v ? new CpmVolume(volumePayload(state.card, v), v.g, { readOnly: v.readOnly }) : null;
}

function refreshFiles() {
  const fs = currentVolume();
  const body = $("filelist").querySelector("tbody");
  body.innerHTML = "";
  if (!fs) return;
  for (const f of fs.list()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${f.user}</td><td>${f.name}</td><td>${f.bytes}</td><td><button>Download</button></td>`;
    tr.querySelector("button").addEventListener("click", () => {
      download(fs.read(f.name, { user: f.user, text: $("astext").checked }), f.name);
    });
    body.appendChild(tr);
  }
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function useCard(image) {
  if (state.importBusy) {
    $("cardinfo").textContent = "Not opened: file import in progress";
    return;
  }
  parseContainer(image);
  state.card = image;
  await save(image);
  await powerOn();
  refreshCard();
}

$("starter").addEventListener("click", async () => useCard(await starterCard()));
$("saveimg").addEventListener("click", () => state.card && download(state.card, "tecos-card.img"));
$("openimg").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await useCard(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    $("cardinfo").textContent = `Not opened: ${err.message}`;
  }
  e.target.value = "";
});
$("putfile").addEventListener("change", async (e) => {
  if (state.importBusy) {
    $("cardinfo").textContent = "Not copied: file import in progress";
    e.target.value = "";
    return;
  }
  if (!state.card) return;
  state.importBusy = true;
  const wasRunning = state.running;
  state.running = false;
  try {
    const staged = state.card.slice();
    const v = parseContainer(staged).volumes.find((x) => x.drive === $("drive").value);
    if (!v) return;
    const fs = new CpmVolume(volumePayload(staged, v), v.g, { readOnly: v.readOnly });
    for (const file of e.target.files) {
      const name = file.name.toUpperCase();
      fs.write(name, new Uint8Array(await file.arrayBuffer()), { text: $("astext").checked });
    }
    state.card.set(staged);
    await save();
    reset();
  } catch (err) {
    $("cardinfo").textContent = `Not copied: ${err.message}`;
  } finally {
    state.running = wasRunning;
    state.importBusy = false;
  }
  e.target.value = "";
  refreshFiles();
});
$("drive").addEventListener("change", refreshFiles);

// ---- Controls -------------------------------------------------------------------------

$("display").value = state.display;
$("display").addEventListener("change", async (e) => {
  state.display = e.target.value;
  localStorageSet("tecos.display", state.display);
  await powerOn();
  (state.display === "tms" ? $("tms") : $("glcd")).focus();
});
$("profile").value = state.width;
$("profile").addEventListener("change", async (e) => {
  state.width = e.target.value;
  localStorageSet("tecos.width", state.width);
  await powerOn();
});
$("reset").addEventListener("click", () => {
  reset();
  refreshFiles();
});
$("power").addEventListener("click", async () => {
  await powerOn();
  refreshFiles();
});
$("pause").addEventListener("click", () => {
  if (state.importBusy) return;
  state.running = !state.running;
  $("pause").textContent = state.running ? "Pause" : "Run";
});
setInterval(refreshFiles, 5000);

// ---- Start ---------------------------------------------------------------------------

(async () => {
  state.card = (await loadCard()) ?? (await starterCard());
  try {
    parseContainer(state.card);
  } catch {
    state.card = await starterCard();
  }
  await save();
  await powerOn();
  refreshCard();
  requestAnimationFrame(frame);
  $("tms").focus();
})();
