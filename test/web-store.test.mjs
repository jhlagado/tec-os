// KE-153: the page's card store. A save that fails throws from the real
// web/src/store.mjs, and the page keeps the card unsaved, says so and saves
// again, until a save succeeds. IndexedDB's failure is injected: in Node by a
// stand-in for the module, in Chromium by a script that runs before the page.
// The page test needs npm run build and npm run media first, as
// web/build.mjs does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ROOT } from "./lib/fixtures.mjs";

const require = createRequire(import.meta.url);
const DIST = resolve(ROOT, "web/dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

let closes = 0;
/** An IndexedDB whose open fails, or whose put's transaction fails, as asked. */
function failing(where) {
  const later = (f) => setTimeout(f, 0);
  return {
    open() {
      const request = {};
      later(() => {
        if (where === "open") {
          request.error = new Error("open refused");
          request.onerror?.();
          return;
        }
        request.result = {
          close() {
            closes += 1;
          },
          transaction() {
            const tx = { error: null };
            tx.objectStore = () => ({ put: () => later(() => ((tx.error = new Error("quota exceeded")), tx.onerror?.())) });
            return tx;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test("the real store's saveCard throws when IndexedDB can't open, or a put fails (KE-153)", async () => {
  const { saveCard } = await import(pathToFileURL(resolve(ROOT, "web/src/store.mjs")).href);
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const where of ["open", "put"]) {
      globalThis.indexedDB = failing(where);
      closes = 0;
      await assert.rejects(saveCard(new Uint8Array(4)), /open refused|quota exceeded/, where);
      assert.equal(closes, where === "open" ? 0 : 1, `${where}: a connection opened is closed (D2)`);
    }
  } finally {
    console.warn = warn;
    delete globalThis.indexedDB;
  }
});

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

test("the page keeps a card it couldn't save unsaved, says so, and saves it once storage works (KE-153)", async (t) => {
  execFileSync(process.execPath, [resolve(ROOT, "web/build.mjs")], { stdio: "pipe" });
  const { chromium } = require("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Every put fails while window.failSaves is set; each attempt is counted.
  await page.addInitScript(() => {
    window.failSaves = true;
    window.saveTries = 0;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...a) => {
      const request = open(...a);
      request.addEventListener("success", () => {
        const db = request.result;
        const transaction = db.transaction.bind(db);
        db.transaction = (store, mode) => {
          const tx = transaction(store, mode);
          if (mode !== "readwrite") return tx;
          window.saveTries += 1;
          if (window.failSaves) setTimeout(() => tx.abort(), 0);
          return tx;
        };
      });
      return request;
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => /not saved/.test(document.getElementById("cardinfo").textContent), null, { timeout: 30_000 });
  await page.waitForFunction(() => window.saveTries >= 3, null, { timeout: 30_000 });
  await page.evaluate(() => (window.failSaves = false));
  await page.waitForFunction(() => !/not saved|keeps failing/.test(document.getElementById("cardinfo").textContent), null, { timeout: 30_000 });
  const stored = await page.evaluate(
    () =>
      new Promise((ok) => {
        const r = indexedDB.open("tecos", 1);
        r.onsuccess = () => {
          const get = r.result.transaction("cards").objectStore("cards").get("current");
          get.onsuccess = () => ok(get.result ? get.result.byteLength : 0);
        };
      }),
  );
  assert.ok(stored > 0, "the card saved once storage worked");
  assert.deepEqual(errors, []);
});

test("the page saves one card at a time, and after three failures says saving keeps failing (D2, D3)", async () => {
  const source = readFileSync(resolve(ROOT, "web/src/main.mjs"), "utf8");
  const start = source.indexOf("setInterval(async () =>");
  const end = source.indexOf("// ---- Run loop", start);
  const info = { textContent: "" };
  let release;
  let calls = 0;
  let fail = false;
  const context = {
    state: { card: new Uint8Array(4), cardDirty: true },
    $: () => info,
    refreshCard: () => {},
    setInterval: (fn) => (context.tick = fn),
    saveCard: async () => {
      calls += 1;
      if (fail) throw new Error("quota exceeded");
      await new Promise((ok) => (release = ok));
    },
  };
  runInNewContext(`${source.slice(start, end)}\nthis.save = save;`, context);
  const first = context.tick(); // a save under way
  await Promise.resolve();
  context.state.cardDirty = true;
  assert.equal(await context.save(), false, "a second save while one runs doesn't start");
  assert.equal(calls, 1, "one saveCard at a time (D3)");
  assert.equal(context.state.cardDirty, true, "and the card stays dirty for the next tick");
  release();
  await first;
  fail = true;
  for (let i = 1; i <= 3; i += 1) {
    await context.save();
    assert.match(info.textContent, i < 3 ? /saved again shortly/ : /keeps failing.*Download image/, `failure ${i}`);
  }
});
