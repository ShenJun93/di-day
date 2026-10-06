// Recording, resampling, waveform drawing and the end-of-walk "soundwalk" montage.
// Everything stays in the browser: clips are stored as 16 kHz mono WAV, which is what Gemma's
// audio encoder expects and what any player can open.

export const SAMPLE_RATE = 16000;

export async function recordClip(seconds = 10, onTick = () => {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();
  for (let s = seconds; s > 0; s--) {
    onTick(s);
    await new Promise((r) => setTimeout(r, 1000));
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return toMono16k(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer());
}

export async function toMono16k(arrayBuffer) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  ctx.close();
  const frames = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0);
}

export function wavBlob(samples, rate = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}

export async function wavToSamples(blob) {
  return toMono16k(await blob.arrayBuffer());
}

// Joins the stop recordings with short crossfades: the walk, heard in about a minute.
export function montage(clips, { keepSeconds = 7, fade = 0.8, rate = SAMPLE_RATE } = {}) {
  const keep = Math.round(keepSeconds * rate);
  const f = Math.round(fade * rate);
  const parts = clips.filter((c) => c?.length).map((c) => {
    const start = Math.max(0, Math.floor((c.length - keep) / 2));
    return c.subarray(start, start + keep);
  });
  if (!parts.length) return new Float32Array(0);
  const total = parts.reduce((n, p) => n + p.length, 0) - f * (parts.length - 1);
  const out = new Float32Array(total);
  let pos = 0;
  parts.forEach((p, i) => {
    for (let j = 0; j < p.length; j++) {
      let g = 1;
      if (i > 0 && j < f) g = j / f;
      if (i < parts.length - 1 && j >= p.length - f) g = (p.length - j) / f;
      out[pos + j] += p[j] * g;
    }
    pos += p.length - f;
  });
  return out;
}

export function drawWave(canvas, samples, color = "#111") {
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  const step = Math.max(1, Math.floor(samples.length / w));
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = x * step; i < (x + 1) * step && i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const bar = Math.max(1, peak * h * 0.95);
    g.fillRect(x, (h - bar) / 2, 1, bar);
  }
}
