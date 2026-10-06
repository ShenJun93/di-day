// Tiny IndexedDB key-value store. Walks live only on the device that recorded them.

const DB = "lac";
const STORE = "kv";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const get = (key) => tx("readonly", (s) => s.get(key));
export const set = (key, value) => tx("readwrite", (s) => s.put(value, key));
export const del = (key) => tx("readwrite", (s) => s.delete(key));

// --- a walk travels between phone and laptop as one .lac file (JSON with inline media) ---

const blobToDataURL = (blob) =>
  new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });

export async function exportWalk(walk) {
  const stops = await Promise.all(walk.stops.map(async (s) => ({
    ...s,
    photo: s.photo instanceof Blob ? await blobToDataURL(s.photo) : s.photo,
    audio: s.audio instanceof Blob ? await blobToDataURL(s.audio) : s.audio,
  })));
  return new File([JSON.stringify({ ...walk, stops })], `walk-${walk.startedAt}.lac`, { type: "application/json" });
}

export async function importWalk(file) {
  const walk = JSON.parse(await file.text());
  if (walk.v !== 1 || !Array.isArray(walk.stops)) throw new Error("Not a Lac walk file");
  const stops = await Promise.all(walk.stops.map(async (s) => ({
    ...s,
    photo: s.photo ? await (await fetch(s.photo)).blob() : null,
    audio: s.audio ? await (await fetch(s.audio)).blob() : null,
  })));
  return { ...walk, stops };
}
