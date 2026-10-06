// Đi đây ("I'm off"): press a button when you get up to buy lunch. While you are out, Gemma reads new
// bounty and hackathon listings on this computer. The results stay locked until you come back with
// a photo and ten seconds of sound from outside.
//
//   node server.mjs            then open http://localhost:8787 on this computer
//
// The dashboard and its API answer only to this computer. The phone page answers on the local network,
// and only at a random URL shown as a QR code when you leave.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { SOURCES } from "./sources/index.mjs";
import * as brain from "./brain.mjs";

const PORT = Number(process.env.PORT || 8787);
const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const DATA = path.join(DIR, "data");
const MAX_PER_TRIP = Number(process.env.MAX_PER_TRIP || 20);
const qrcode = createRequire(import.meta.url)("./vendor/qrcode.js");
fs.mkdirSync(DATA, { recursive: true });

const load = (name, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8")); } catch { return fallback; } };
const save = (name, value) => fs.writeFileSync(path.join(DATA, name), JSON.stringify(value, null, 1));

let state = load("state.json", { phase: "idle" });
const seen = new Set(load("seen.json", []));
const log = load("log.json", []);
let working = false;

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) return a.address;
  }
  return "localhost";
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
}

// --- the work done while I'm out -------------------------------------------------------------------

async function collect() {
  const all = [];
  for (const [name, fetchSource] of Object.entries(SOURCES)) {
    try { all.push(...(await fetchSource())); } catch (e) { console.warn(`source ${name} failed: ${e.message}`); }
  }
  const fresh = all.filter((l) => !seen.has(l.id));
  // Soonest deadlines first, so a short trip still covers what is urgent.
  fresh.sort((a, b) => (Date.parse(a.deadlineUtc) || 9e15) - (Date.parse(b.deadlineUtc) || 9e15));
  return fresh.slice(0, MAX_PER_TRIP);
}

async function work() {
  if (working) return;
  working = true;
  try {
    if (!state.queue) {
      state.status = "collecting listings";
      state.queue = await collect();
      state.results = [];
      save("state.json", state);
    }
    while (state.queue.length) {
      const listing = state.queue[0];
      state.status = `reading ${state.results.length + 1} of ${state.results.length + state.queue.length}`;
      let t;
      try { t = await brain.triage(listing); } catch (e) { t = { worth: "unknown", why: `could not read: ${e.message}` }; }
      const { text, ...meta } = listing;
      state.results.push({ ...meta, ...t, deadlineVn: brain.deadlineInVietnam(listing, t) });
      state.queue.shift();
      seen.add(listing.id);
      save("seen.json", [...seen]);
      save("state.json", state);
    }
    state.status = "done";
    state.finishedAt = Date.now();
    save("state.json", state);
  } finally {
    working = false;
  }
}

// --- http ------------------------------------------------------------------------------------------

const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req, limit = 25e6) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
});
const file = (res, name, type) => send(res, 200, fs.readFileSync(path.join(DIR, "public", name), "utf8"), type);

function publicState() {
  const { queue, results, token, proof, ...rest } = state;
  const unlocked = state.phase === "back" && state.unlocked;
  const sorted = (results || []).slice().sort((a, b) => ({ yes: 0, maybe: 1, no: 2 }[a.worth] ?? 3) - ({ yes: 0, maybe: 1, no: 2 }[b.worth] ?? 3));
  return {
    ...rest,
    read: results?.length || 0,
    total: (results?.length || 0) + (queue?.length || 0),
    results: unlocked ? sorted : null,
    proof: unlocked ? proof : proof ? { outdoors: proof.outdoors } : null,
    phoneUrl: state.phase === "out" ? `http://${lanAddress()}:${PORT}/out/${token}` : null,
    qr: state.phase === "out" ? qrSvg(`http://${lanAddress()}:${PORT}/out/${token}`) : null,
    log: log.slice(-14),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // phone side: only the random trip URL is reachable from the network
    const out = url.pathname.match(/^\/out\/([a-f0-9]{24})$/);
    if (out) return out[1] === state.token ? file(res, "out.html", "text/html; charset=utf-8") : send(res, 404, "not found", "text/plain");
    const back = url.pathname.match(/^\/api\/back\/([a-f0-9]{24})$/);
    if (back && req.method === "POST") {
      if (back[1] !== state.token || state.phase !== "out") return send(res, 409, { error: "no trip in progress" });
      const { audioB64, photoB64 } = JSON.parse(await readBody(req));
      const check = await brain.checkOutside({ audioB64, photoB64 });
      fs.mkdirSync(path.join(DATA, "trips"), { recursive: true });
      if (photoB64) fs.writeFileSync(path.join(DATA, "trips", `${state.outAt}.jpg`), Buffer.from(photoB64, "base64"));
      if (audioB64) fs.writeFileSync(path.join(DATA, "trips", `${state.outAt}.wav`), Buffer.from(audioB64, "base64"));
      if (!check.outdoors) return send(res, 200, { unlocked: false, ...check });
      Object.assign(state, { phase: "back", backAt: Date.now(), unlocked: true, proof: check });
      log.push({ outAt: state.outAt, backAt: state.backAt, minutes: Math.round((state.backAt - state.outAt) / 60000),
        readWhileOut: state.results.length, heard: check.heard, saw: check.saw });
      save("log.json", log); save("state.json", state);
      return send(res, 200, { unlocked: true, ...check });
    }
    // An earlier version of this project installed a service worker on this address. Replace it with one
    // that removes itself, so browsers that visited before see the current pages.
    if (url.pathname === "/sw.js") {
      return send(res, 200, "self.addEventListener('install',()=>self.skipWaiting());" +
        "self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(c=>caches.delete(c))))" +
        ".then(()=>self.registration.unregister()).then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate(c.url)))));",
      "text/javascript");
    }
    if (url.pathname === "/static/audio.js") return file(res, "audio.js", "text/javascript");
    if (url.pathname === "/static/app.css") return file(res, "app.css", "text/css");

    if (!isLocal(req)) return send(res, 403, "This page only opens on the computer that runs it.", "text/plain");

    if (url.pathname === "/") return file(res, "index.html", "text/html; charset=utf-8");
    if (url.pathname === "/api/state") return send(res, 200, { ...publicState(), brainOnline: await brain.online() });
    if (url.pathname === "/api/go" && req.method === "POST") {
      if (state.phase === "out") return send(res, 409, { error: "already out" });
      state = { phase: "out", outAt: Date.now(), token: crypto.randomBytes(12).toString("hex"), unlocked: false, status: "starting" };
      save("state.json", state);
      work().catch((e) => { state.status = `error: ${e.message}`; save("state.json", state); });
      return send(res, 200, publicState());
    }
    // The honest way out: open the results without proof, and the log says so.
    if (url.pathname === "/api/unlock" && req.method === "POST" && state.phase === "out") {
      Object.assign(state, { phase: "back", backAt: Date.now(), unlocked: true, proof: { outdoors: false, skipped: true } });
      log.push({ outAt: state.outAt, backAt: state.backAt, minutes: Math.round((state.backAt - state.outAt) / 60000),
        readWhileOut: state.results?.length || 0, skipped: true });
      save("log.json", log); save("state.json", state);
      return send(res, 200, publicState());
    }
    if (url.pathname === "/api/reset" && req.method === "POST") {
      state = { phase: "idle" }; save("state.json", state);
      return send(res, 200, publicState());
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Đi đây on http://localhost:${PORT}  (phone pages on http://${lanAddress()}:${PORT})`);
  if (state.phase === "out" && state.queue?.length) work();
});
