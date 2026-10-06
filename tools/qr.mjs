// Turns a score JSON file into the pocket URL and a QR code SVG.
// Usage: node tools/qr.mjs score.json > score.svg
import fs from "node:fs";
import { createRequire } from "node:module";
import { encodeScore, sanitizeScore } from "../js/score.js";

const qrcode = createRequire(import.meta.url)("../vendor/qrcode.js");
const score = sanitizeScore(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const url = `https://shenjun93.github.io/lac/#s=${await encodeScore(score)}`;
console.error(url);
const qr = qrcode(0, "L");
qr.addData(url);
qr.make();
process.stdout.write(qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true }));
