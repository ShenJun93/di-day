// The base page: compose a score (shown as a QR code) and read a walk that came home.

import * as brain from "./brain.js";
import { encodeScore } from "./score.js";
import { importWalk } from "./store.js";
import { drawWave, montage, wavBlob, wavToSamples } from "./audio.js";
import { renderZine } from "./zine.js";

const $ = (id) => document.getElementById(id);
// Where the phone app lives. The QR code points there with the score in the URL fragment,
// which browsers never send to the server.
const POCKET_URL = localStorage.getItem("lac.pocket") || "https://shenjun93.github.io/lac/";

let seedPhoto = null;
let lastScore = null;

(async () => {
  const id = await brain.status();
  $("brain").textContent = id ? `brain online · ${id} · ${brain.BASE}` : `brain offline at ${brain.BASE}. Start llama-server (see README).`;
})();

$("seedIn").onchange = (e) => { seedPhoto = e.target.files[0] || null; $("seedName").textContent = seedPhoto?.name || ""; };

function qrCanvas(text, size = 520) {
  const qr = qrcode(0, "L");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), cell = Math.floor(size / (n + 8));
  const c = document.createElement("canvas");
  c.width = c.height = cell * (n + 8);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect((col + 4) * cell, (r + 4) * cell, cell, cell);
  return c;
}

async function scoreQR(score) {
  return qrCanvas(`${POCKET_URL}#s=${await encodeScore(score)}`);
}

$("compose").onclick = async () => {
  $("compose").disabled = true;
  $("composeState").textContent = "Gemma is writing the rules…";
  try {
    const { score, secs } = await brain.composeScore({
      lang: $("lang").value, minutes: Number($("minutes").value), about: $("about").value.trim(), seedPhoto,
    });
    lastScore = score;
    $("composeState").textContent = `done in ${secs.toFixed(0)} s`;
    $("scoreTitle").textContent = score.title;
    $("cards").replaceChildren(...score.cards.map((c) => {
      const li = document.createElement("li");
      const k = document.createElement("span"); k.className = "kind"; k.textContent = c.kind;
      li.append(k, c.text);
      return li;
    }));
    $("qr").replaceChildren(await scoreQR(score));
    $("qrUrl").textContent = POCKET_URL;
    $("scoreOut").classList.remove("hidden");
  } catch (e) {
    $("composeState").textContent = "failed: " + e.message;
  }
  $("compose").disabled = false;
};

$("walkIn").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const walk = await importWalk(file);
  const lang = walk.score.lang || "en";
  $("walkOut").classList.remove("hidden");
  $("walkTitle").textContent = `${walk.score.title} · ${new Date(walk.startedAt).toLocaleString()}`;
  $("stops").replaceChildren();
  const readings = [];
  const clips = [];
  for (const [i, stop] of walk.stops.entries()) {
    $("readState").textContent = `looking and listening: stop ${i + 1} of ${walk.stops.length}…`;
    const row = document.createElement("div"); row.className = "stop";
    const left = document.createElement("div");
    if (stop.photo) { const img = document.createElement("img"); img.src = URL.createObjectURL(stop.photo); left.append(img); }
    const right = document.createElement("div");
    const rule = document.createElement("p"); rule.className = "kind"; rule.textContent = `stop ${i + 1} · ${stop.card.text}`;
    right.append(rule);
    if (stop.audio) {
      const samples = await wavToSamples(stop.audio);
      clips.push(samples);
      const cv = document.createElement("canvas"); cv.width = 600; cv.height = 40; drawWave(cv, samples, getComputedStyle(document.body).color);
      const au = document.createElement("audio"); au.controls = true; au.src = URL.createObjectURL(stop.audio);
      right.append(cv, au);
    }
    const out = document.createElement("p"); out.textContent = "…"; right.append(out);
    row.append(left, right);
    $("stops").append(row);
    let r;
    try { r = await brain.readStop(stop, lang); } catch (err) { r = { saw: "", heard: "", line: "", error: err.message }; }
    readings.push(r);
    out.replaceChildren();
    for (const [label, val] of [["saw", r.saw], ["heard", r.heard]]) {
      const p = document.createElement("p"); p.className = "small"; p.textContent = `${label}: ${val || "—"}`; out.append(p);
    }
    const line = document.createElement("p"); line.style.fontStyle = "italic"; line.style.fontSize = "1.2rem"; line.textContent = r.line || r.error || "";
    out.append(line);
  }
  $("readState").textContent = "writing the last page…";
  const poem = await brain.closeWalk(readings, lang).catch(() => "");
  $("poem").textContent = poem;

  const mix = wavBlob(montage(clips));
  $("sound").src = $("soundDl").href = URL.createObjectURL(mix);

  const qr = qrCanvas(`${POCKET_URL}#s=${await encodeScore({ v: 1, title: walk.score.title, lang, minutes: walk.minutes, cards: walk.cards })}`);
  const zine = await renderZine(walk, readings, poem, qr);
  $("zinePreview").getContext("2d").drawImage(zine, 0, 0, 1754, 1240);
  zine.toBlob((b) => ($("zineDl").href = URL.createObjectURL(b)), "image/png");
  $("readState").textContent = `done · ${readings.reduce((n, r) => n + (r.secs || 0), 0).toFixed(0)} s of thinking`;
  window.__lac = { walk, readings, poem };
};
