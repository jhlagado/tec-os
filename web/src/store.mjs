// The card image, kept in IndexedDB so it survives reloads. Failures are
// reported once and the page carries on with the card in memory.

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
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ? new Uint8Array(request.result) : null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    warn(e);
    return null;
  }
}

export async function saveCard(image) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(image.slice().buffer, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    warn(e);
  }
}
