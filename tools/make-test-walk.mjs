// Builds a small synthetic walk (two stops) from public sample media, to test the base without going outside.
// Usage: node tools/make-test-walk.mjs > test.lac
const base = "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/";
const dataURL = async (name, type) => {
  const buf = Buffer.from(await (await fetch(base + name)).arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
};
const t = Date.UTC(2026, 9, 6, 9, 0);
const cards = [
  { kind: "move", text: "Leave by the door you use least." },
  { kind: "stop", text: "Stand still. Photograph something older than you. Record ten seconds of what you hear." },
  { kind: "stop", text: "Find a doorway. Photograph what it frames. Record the street behind you." },
  { kind: "home", text: "Go home by a different street than the one you came." },
];
const track = Array.from({ length: 30 }, (_, i) => [21.0285 + Math.sin(i / 4) * 0.0012 + i * 0.00005, 105.8542 + i * 0.00008, t + i * 60000]);
const walk = {
  v: 1, id: "walk-test", score: { title: "Test drift", lang: "en" }, cards, minutes: 40,
  startedAt: t, endedAt: t + 30 * 60000, i: 3, track,
  stops: [
    { cardIndex: 1, card: cards[1], t: t + 8 * 60000, pos: track[8], photo: await dataURL("city-streets.jpg", "image/jpeg"), audio: await dataURL("jfk.wav", "audio/wav") },
    { cardIndex: 2, card: cards[2], t: t + 20 * 60000, pos: track[20], photo: await dataURL("corgi.jpg", "image/jpeg"), audio: null },
  ],
};
process.stdout.write(JSON.stringify(walk));
