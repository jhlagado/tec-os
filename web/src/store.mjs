// The card image, kept in IndexedDB so it survives reloads. A load finds no
// card (null), and the page makes one, or fails and throws, and the page saves
// nothing over the record it couldn't read (KE-164). A save that fails throws,
// so the page keeps the card marked unsaved and says so (KE-153).

const DB = "tecos";
const STORE = "cards";
const KEY = "current";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let warned = false;
function warn(e) {
  if (!warned) console.warn("card storage unavailable:", e);
  warned = true;
}

export async function loadCard() {
  let db;
  try {
    db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ? new Uint8Array(request.result) : null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    warn(e);
    throw e;
  } finally {
    db?.close();
  }
}

export async function saveCard(image) {
  let db;
  try {
    db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(image.slice().buffer, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("the save was aborted"));
    });
  } catch (e) {
    warn(e);
    throw e;
  } finally {
    db?.close(); // each save its own connection, closed after it (D2)
  }
}
