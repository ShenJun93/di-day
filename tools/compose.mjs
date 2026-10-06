// Compose a score from the command line and write its QR code as SVG.
// Usage: node tools/compose.mjs vi "about the neighbourhood" > score.svg
import { createRequire } from "node:module";
import * as brain from "../js/brain.js";
import { encodeScore } from "../js/score.js";

const require = createRequire(import.meta.url);
const qrcode = require("../vendor/qrcode.js");
const [lang = "en", about = ""] = process.argv.slice(2);
const { score, secs } = await brain.composeScore({ lang, about, minutes: 40 });
console.error(`(${secs.toFixed(0)} s) ${score.title}`);
score.cards.forEach((c, i) => console.error(`${String(i + 1).padStart(2)}. [${c.kind}] ${c.text}`));
const url = `https://shenjun93.github.io/lac/#s=${await encodeScore(score)}`;
console.error(url.length, "chars");
const qr = qrcode(0, "L");
qr.addData(url);
qr.make();
process.stdout.write(qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true }));
