// Smoke test for the base, using the same code the page uses (js/brain.js).
// Usage: node tools/smoke-brain.mjs   (llama-server must be running, see README)
import * as brain from "../js/brain.js";

const media = "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/";
const blob = async (name, type) => new Blob([await (await fetch(media + name)).arrayBuffer()], { type });

console.log("brain:", await brain.status());
const { score, secs } = await brain.composeScore({ lang: "en", about: "narrow alleys, a wet market, motorbikes, a lake two streets away" });
console.log(`\nSCORE (${secs.toFixed(0)} s): ${score.title}`);
score.cards.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. [${c.kind}] ${c.text}`));

const stop = { card: score.cards.find((c) => c.kind === "stop"), photo: await blob("city-streets.jpg", "image/jpeg"), audio: await blob("jfk.wav", "audio/wav") };
const r = await brain.readStop(stop, "en");
console.log(`\nSTOP (${r.secs.toFixed(0)} s)\n heard: ${r.heard}\n saw:   ${r.saw}\n line:  ${r.line}`);
console.log("\nAFTER:\n" + await brain.closeWalk([r], "en"));
