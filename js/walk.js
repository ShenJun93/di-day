// The pocket: deals rule cards, records one photo + ten seconds of sound per stop, keeps the GPS trace.
// Works with no network. State is saved after every step so a reload mid-walk loses nothing.

import { DEFAULT_SCORE, decodeScore } from "./score.js";
import { recordClip, wavBlob } from "./audio.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const show = (id) => ["home", "walk", "done"].forEach((s) => $(s).classList.toggle("hidden", s !== id));

let score = DEFAULT_SCORE;
let walk = null;
let watchId = null;

async function loadScore() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("s")) {
    try {
      score = await decodeScore(hash.get("s"));
      await store.set("score", score);
      history.replaceState(null, "", location.pathname);
    } catch (e) {
      alert("This QR code did not contain a valid score.");
    }
  } else {
    score = (await store.get("score")) || DEFAULT_SCORE;
  }
  $("scoreTitle").textContent = score.title;
  $("scoreInfo").textContent = `${score.cards.length} cards · about ${score.minutes} minutes · ${score.lang === "vi" ? "Tiếng Việt" : "English"}`;
}

async function renderWalks() {
  const list = (await store.get("walks")) || [];
  if (!list.length) return;
  $("walks").innerHTML = "";
  for (const id of list.slice().reverse()) {
    const w = await store.get(id);
    if (!w) continue;
    const b = document.createElement("button");
    b.textContent = `${new Date(w.startedAt).toLocaleString()} · ${w.stops.length} stops`;
    b.onclick = () => openDone(w);
    $("walks").append(b, document.createElement("br"));
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = score.lang === "vi" ? "vi-VN" : "en-US";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

const save = () => store.set(walk.id, walk);

function currentStop() {
  const card = walk.cards[walk.i];
  let stop = walk.stops.find((s) => s.cardIndex === walk.i);
  if (!stop) {
    stop = { cardIndex: walk.i, card, t: Date.now(), pos: walk.track.at(-1) || null, photo: null, audio: null };
    walk.stops.push(stop);
  }
  return stop;
}

function renderCard() {
  const card = walk.cards[walk.i];
  $("progress").textContent = `card ${walk.i + 1} / ${walk.cards.length}`;
  $("kind").textContent = card.kind;
  $("rule").textContent = card.text;
  const stop = walk.stops.find((s) => s.cardIndex === walk.i);
  $("stopState").textContent = stop
    ? `${stop.photo ? "photo ✓" : "no photo"} · ${stop.audio ? "sound ✓" : "no sound"}`
    : card.kind === "stop" ? "This is a stop: one photo, ten seconds of sound." : "";
  $("stopTools").classList.remove("hidden");
  $("next").textContent = walk.i === walk.cards.length - 1 ? "I'm home" : "Next card";
  speak(card.text);
}

function tickClock() {
  if (!walk) return;
  const left = Math.max(0, walk.minutes * 60000 - (Date.now() - walk.startedAt));
  $("clock").textContent = `${Math.floor(left / 60000)}′ left`;
  if (left === 0 && walk.i < walk.cards.length - 1) {
    walk.i = walk.cards.length - 1; // time is up: deal the "home" card
    save();
    renderCard();
  }
}

async function startWalk() {
  walk = {
    v: 1, id: `walk-${Date.now()}`, score: { title: score.title, lang: score.lang }, cards: score.cards,
    minutes: score.minutes, startedAt: Date.now(), endedAt: null, i: 0, track: [], stops: [],
  };
  await save();
  await store.set("current", walk.id);
  begin();
}

function begin() {
  show("walk");
  renderCard();
  setInterval(tickClock, 15000);
  tickClock();
  if ("geolocation" in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        const pt = [+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6), Date.now()];
        const last = walk.track.at(-1);
        if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.00005) { walk.track.push(pt); save(); }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
}

async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: "image/jpeg", quality: 0.82 });
}

$("photoIn").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentStop().photo = await shrinkPhoto(file);
  e.target.value = "";
  await save();
  renderCardState();
};

$("rec").onclick = async () => {
  $("rec").disabled = true;
  speechSynthesis?.cancel();
  try {
    const samples = await recordClip(10, (s) => ($("rec").textContent = `● ${s}`));
    currentStop().audio = wavBlob(samples);
    await save();
  } catch (e) {
    alert("Could not record: " + e.message);
  }
  $("rec").textContent = "🎙 Record 10 s";
  $("rec").disabled = false;
  renderCardState();
};

function renderCardState() {
  const stop = walk.stops.find((s) => s.cardIndex === walk.i);
  $("stopState").textContent = stop ? `${stop.photo ? "photo ✓" : "no photo"} · ${stop.audio ? "sound ✓" : "no sound"}` : "";
}

$("speak").onclick = () => speak(walk.cards[walk.i].text);
$("next").onclick = async () => {
  if (walk.i >= walk.cards.length - 1) return finish();
  walk.i++;
  await save();
  renderCard();
};
$("finish").onclick = () => confirm("End the walk here?") && finish();
$("start").onclick = startWalk;

async function finish() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  walk.endedAt = Date.now();
  walk.stops = walk.stops.filter((s) => s.photo || s.audio);
  await save();
  const list = (await store.get("walks")) || [];
  if (!list.includes(walk.id)) await store.set("walks", [...list, walk.id]);
  await store.del("current");
  speechSynthesis?.cancel();
  openDone(walk);
}

function openDone(w) {
  walk = w;
  show("done");
  $("doneTitle").textContent = w.score.title;
  const mins = Math.round(((w.endedAt || Date.now()) - w.startedAt) / 60000);
  $("doneInfo").textContent = `${mins} minutes · ${w.stops.length} stops · ${w.track.length} GPS points`;
  $("doneThumbs").innerHTML = "";
  for (const s of w.stops) {
    if (!s.photo) continue;
    const img = document.createElement("img");
    img.src = URL.createObjectURL(s.photo);
    $("doneThumbs").append(img);
  }
}

$("share").onclick = async () => {
  const file = await store.exportWalk(walk);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Lạc walk" }); return; } catch {}
  }
  download(file);
};
$("save").onclick = async () => download(await store.exportWalk(walk));
$("back").onclick = () => { show("home"); renderWalks(); };

function download(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

(async () => {
  await loadScore();
  await renderWalks();
  const current = await store.get("current");
  if (current && (walk = await store.get(current))) begin();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
