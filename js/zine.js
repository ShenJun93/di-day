// One A4 sheet, 8 panels: print it, fold it, cut the middle slit, and the walk becomes a pocket zine.
// Standard one-sheet layout: the top row is printed upside down.
//   top    (rotated 180°):  p5 | p4 | p3   | p2
//   bottom:                 p6 | p7 | back | front

import { drawWave } from "./audio.js";

const W = 3508, H = 2480;            // A4 landscape at 300 dpi
const PW = W / 4, PH = H / 2;        // one panel
const M = 70;                        // panel margin
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, Menlo, Consolas, monospace';
const INK = "#161513", PAPER = "#f3efe6", ACCENT = "#d1462f";

function wrap(g, text, x, y, maxW, lineH, maxLines = 99) {
  const words = String(text || "").split(/\s+/);
  let line = "", n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y + n * lineH);
      line = w;
      if (++n >= maxLines) return y + n * lineH;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n++ * lineH);
  return y + n * lineH;
}

// Draws the GPS trace as a single line, scaled into the box. No map tiles, no network.
export function drawRoute(g, track, stops, x, y, w, h, { color = INK, dot = ACCENT, width = 6 } = {}) {
  if (!track || track.length < 2) {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash([18, 18]);
    g.beginPath(); g.moveTo(x, y + h / 2); g.bezierCurveTo(x + w / 3, y, x + (2 * w) / 3, y + h, x + w, y + h / 2); g.stroke();
    g.setLineDash([]);
    return;
  }
  const lat = track.map((p) => p[0]), lon = track.map((p) => p[1]);
  const [a0, a1, o0, o1] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const k = Math.cos(((a0 + a1) / 2) * (Math.PI / 180));
  const s = Math.min(w / Math.max((o1 - o0) * k, 1e-6), h / Math.max(a1 - a0, 1e-6));
  const px = (p) => [x + (w - (o1 - o0) * k * s) / 2 + (p[1] - o0) * k * s, y + (h - (a1 - a0) * s) / 2 + (a1 - p[0]) * s];
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath();
  track.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
  g.stroke();
  g.fillStyle = dot; g.font = `bold 34px ${MONO}`;
  (stops || []).forEach((st, i) => {
    if (!st.pos) return;
    const [sx, sy] = px(st.pos);
    g.beginPath(); g.arc(sx, sy, 16, 0, Math.PI * 2); g.fill();
    g.fillText(String(i + 1), sx + 22, sy - 18);
  });
}

// Two-tone print look: grayscale mapped between ink and paper.
async function duotone(blob, w, h) {
  const img = await createImageBitmap(blob);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d");
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  const d = g.getImageData(0, 0, w, h);
  const a = [0x16, 0x15, 0x13], b = [0xf3, 0xef, 0xe6];
  for (let i = 0; i < d.data.length; i += 4) {
    const l = Math.min(1, Math.max(0, ((0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255 - 0.08) * 1.15));
    for (let ch = 0; ch < 3; ch++) d.data[i + ch] = a[ch] + (b[ch] - a[ch]) * l;
  }
  g.putImageData(d, 0, 0);
  return c;
}

const PANELS = { p5: [0, 0], p4: [1, 0], p3: [2, 0], p2: [3, 0], p6: [0, 1], p7: [1, 1], back: [2, 1], front: [3, 1] };

function panel(g, name, draw) {
  const [cx, cy] = PANELS[name];
  g.save();
  if (cy === 0) { g.translate((cx + 1) * PW, PH); g.rotate(Math.PI); }
  else g.translate(cx * PW, PH);
  g.beginPath(); g.rect(0, 0, PW, PH); g.clip();
  draw();
  g.restore();
}

export async function renderZine(walk, readings, poem, qrCanvas = null) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.textBaseline = "top";
  const date = new Date(walk.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const stops = walk.stops;
  const withPhoto = stops.map((s, i) => ({ s, r: readings[i] || {}, n: i + 1 })).filter((x) => x.s.photo || x.s.audio).slice(0, 4);

  panel(g, "front", () => {
    g.fillStyle = INK; g.font = `150px ${SERIF}`; g.fillText("Lạc", M, M);
    g.fillStyle = ACCENT; g.fillText(".", M + g.measureText("Lạc").width, M);
    g.fillStyle = INK; g.font = `italic 64px ${SERIF}`;
    const y = wrap(g, walk.score.title, M, M + 200, PW - 2 * M, 76, 3);
    g.font = `34px ${MONO}`; g.fillStyle = "#6b665c"; g.fillText(date, M, y + 20);
    drawRoute(g, walk.track, stops, M, 520, PW - 2 * M, PH - 520 - 170);
    g.font = `30px ${MONO}`; g.fillText(`${stops.length} stops · ${Math.round(((walk.endedAt || walk.startedAt) - walk.startedAt) / 60000)} min`, M, PH - 120);
  });

  panel(g, "p2", () => {
    g.fillStyle = ACCENT; g.font = `32px ${MONO}`; g.fillText("THE SCORE", M, M);
    g.fillStyle = INK; g.font = `36px ${SERIF}`;
    let y = M + 80;
    walk.cards.forEach((card, i) => {
      if (y > PH - 120) return;
      y = wrap(g, `${i + 1}. ${card.text}`, M, y, PW - 2 * M, 44, 3) + 16;
    });
  });

  const stopPanels = ["p3", "p4", "p5", "p6"];
  for (let k = 0; k < stopPanels.length; k++) {
    const item = withPhoto[k];
    const photo = item?.s.photo ? await duotone(item.s.photo, PW - 2 * M, 560) : null;
    let wave = null;
    if (item?.s.audio) {
      const { wavToSamples } = await import("./audio.js");
      wave = document.createElement("canvas"); wave.width = PW - 2 * M; wave.height = 90;
      drawWave(wave, await wavToSamples(item.s.audio), INK);
    }
    panel(g, stopPanels[k], () => {
      if (!item) {
        g.fillStyle = INK; g.font = `italic 54px ${SERIF}`;
        wrap(g, (poem || "").split("\n")[k] || "", M, PH / 2 - 60, PW - 2 * M, 66, 4);
        return;
      }
      g.fillStyle = ACCENT; g.font = `32px ${MONO}`; g.fillText(`STOP ${item.n}`, M, M);
      g.fillStyle = INK; g.font = `italic 34px ${SERIF}`;
      let y = wrap(g, `“${item.s.card.text}”`, M, M + 60, PW - 2 * M, 42, 3) + 20;
      if (photo) { g.drawImage(photo, M, y); y += 580; }
      if (wave) { g.drawImage(wave, M, y); y += 110; }
      g.font = `30px ${SERIF}`;
      if (item.r.saw) y = wrap(g, `seen: ${item.r.saw}`, M, y, PW - 2 * M, 38, 3) + 8;
      if (item.r.heard) y = wrap(g, `heard: ${item.r.heard}`, M, y, PW - 2 * M, 38, 4) + 18;
      g.font = `italic 44px ${SERIF}`;
      wrap(g, item.r.line, M, y, PW - 2 * M, 54, 3);
    });
  }

  panel(g, "p7", () => {
    g.fillStyle = ACCENT; g.font = `32px ${MONO}`; g.fillText("AFTER", M, M);
    g.fillStyle = INK; g.font = `italic 50px ${SERIF}`;
    let y = M + 90;
    for (const line of (poem || "").split("\n").filter(Boolean)) y = wrap(g, line, M, y, PW - 2 * M, 64, 3) + 10;
    drawRoute(g, walk.track, stops, M, Math.max(y + 60, PH / 2), PW - 2 * M, PH / 2 - 160, { width: 4 });
  });

  panel(g, "back", () => {
    g.fillStyle = INK; g.font = `30px ${SERIF}`;
    let y = wrap(g, "Made without a cloud. The rules, the reading of each photo and the listening to each sound " +
      "were done by Gemma 4 E4B, an open-weight model, running with llama.cpp on the walker's own computer. " +
      "Nothing left the house.", M, M, PW - 2 * M, 40);
    if (qrCanvas) {
      g.font = `28px ${MONO}`; g.fillText("Walk this score yourself:", M, y + 50);
      g.drawImage(qrCanvas, M, y + 100, 420, 420);
    }
    g.font = `26px ${MONO}`; g.fillStyle = "#6b665c"; g.fillText("lạc · get lost on purpose", M, PH - 100);
  });

  // fold guides
  g.strokeStyle = "#d9d2c3"; g.lineWidth = 2; g.setLineDash([12, 12]);
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * PW, 0); g.lineTo(i * PW, H); g.stroke(); }
  g.beginPath(); g.moveTo(0, PH); g.lineTo(W, PH); g.stroke();
  g.setLineDash([]); g.strokeStyle = ACCENT; g.lineWidth = 4;
  g.beginPath(); g.moveTo(PW, PH); g.lineTo(3 * PW, PH); g.stroke();   // the cut
  return c;
}
