// The web page on a phone (KE-125): tapping the PICO9918 screen must bring up
// the phone's keyboard, and what that keyboard sends must reach TEC-OS. A
// phone keyboard sends no keydown with a usable key; it edits a text field and
// fires beforeinput and input. So the page is built, opened in Chromium at a
// touch-enabled phone size, the screen is tapped, and `dir` and Enter are
// typed as such edits to whatever the tap focused, never as keydown on the
// canvas. The directory must then be on the PICO9918 screen. Needs npm run
// build and npm run media first, as web/build.mjs does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { ROOT } from "./lib/fixtures.mjs";

const require = createRequire(import.meta.url);
const DIST = resolve(ROOT, "web/dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function serve() {
  const server = createServer(async (req, res) => {
    const path = resolve(DIST, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
    const file = path === DIST || path.endsWith(sep) ? resolve(path, "index.html") : path;
    try {
      if (!file.startsWith(DIST + sep)) throw new Error("outside");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** In the page: edit the focused field as a phone keyboard does, one
 *  character at a time: beforeinput, then, unless that was cancelled, the
 *  change to the value and input. "\n" is the keyboard's Enter. */
function phoneType(text) {
  const el = document.activeElement;
  for (const ch of text) {
    const inputType = ch === "\n" ? "insertLineBreak" : "insertText";
    const data = ch === "\n" ? null : ch;
    const before = new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true });
    if (!el.dispatchEvent(before)) continue;
    const at = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, el.selectionStart ?? at) + ch + el.value.slice(at);
    el.selectionStart = el.selectionEnd = at + 1;
    el.dispatchEvent(new InputEvent("input", { inputType, data, bubbles: true }));
  }
}

test("on a phone, tapping the screen and typing dir on the phone's keyboard lists the directory", async (t) => {
  execFileSync(process.execPath, [resolve(ROOT, "web/build.mjs")], { stdio: "pipe" });
  const { chromium } = require("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.getElementById("serial").textContent.includes("[power on]"), null, { timeout: 30_000 });

  await page.tap("#tms");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, id: el?.id, autocorrect: el?.getAttribute("autocorrect"), autocapitalize: el?.getAttribute("autocapitalize"), spellcheck: el?.spellcheck };
  });
  assert.ok(
    focused.tag === "TEXTAREA" || focused.tag === "INPUT",
    `tapping the screen focused ${focused.tag}#${focused.id}, not a text field, so no phone keyboard comes up`,
  );
  assert.deepEqual([focused.autocorrect, focused.autocapitalize, focused.spellcheck], ["off", "off", false], "autocorrect, autocapitalise and spellcheck are off");
  assert.ok(await page.isVisible("#touchkeys"), "the row of keys a phone keyboard lacks is shown");

  // The screen is read from the machine the page runs, through its test hook.
  const screen = () => page.evaluate(() => globalThis.tecos.screen());
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>$/.test(l)), null, { timeout: 60_000 });

  await page.evaluate(phoneType, "dir\n");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^\d+ files, \d+K free$/.test(l)), null, { timeout: 60_000 }).catch(() => {});
  const lines = await screen();
  const at = lines.indexOf("A>dir");
  assert.ok(at >= 0, `the typed command is on the screen:\n${lines.join("\n")}`);
  assert.match(lines[at + 1] ?? "", /^MOUNT\.COM +GLCD\.SVC/, `the directory follows it:\n${lines.join("\n")}`);
  assert.ok(lines.slice(at).some((l) => /^\d+ files, \d+K free$/.test(l)), `the directory's count follows it:\n${lines.join("\n")}`);
  assert.deepEqual(errors, []);
});
