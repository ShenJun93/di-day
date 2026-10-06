// The base: Gemma 4 E4B on the walker's own computer, served by llama.cpp (llama-server).
// The phone never talks to it directly; walks travel as files. Nothing goes to a cloud API.
// llama-server speaks the OpenAI chat format and takes images as data URLs and audio as base64 WAV.

import { DEFAULT_SCORE, SAFETY_NOTE, sanitizeScore } from "./score.js";

const saved = typeof localStorage !== "undefined" ? localStorage.getItem("lac.base") : null;
export const BASE = saved || globalThis.LAC_BASE || "http://127.0.0.1:8090";

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function status() {
  const res = await fetch(`${BASE}/v1/models`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.id || "model";
}

async function chat(content, { json = false, maxTokens = 400, temperature = 0.9 } = {}) {
  const body = {
    messages: [{ role: "user", content }],
    max_tokens: maxTokens,
    temperature,
    top_p: 0.95,
    top_k: 64,
    chat_template_kwargs: { enable_thinking: false },
  };
  // Plain JSON mode. A full JSON schema made this model pad its reply with whitespace until max_tokens.
  if (json) body.response_format = { type: "json_object" };
  const t0 = performance.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`base replied ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || "").trim();
  return { text, secs: (performance.now() - t0) / 1000 };
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in reply: " + text.slice(0, 120));
  return JSON.parse(m[0]);
}

const asText = (v) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim();

const LANG = { en: "English", vi: "Vietnamese" };

const EXAMPLES = DEFAULT_SCORE.cards.slice(1, 7).map((c) => `{"kind": "${c.kind}", "text": "${c.text}"}`).join("\n");

// Before the walk: a deck of rules, optionally tuned by a photo of the view from home.
export async function composeScore({ lang = "en", minutes = 40, about = "", seedPhoto = null } = {}) {
  const content = [];
  if (seedPhoto) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${await blobToBase64(seedPhoto)}` } });
  content.push({
    type: "text",
    text:
      `You write event scores for a dérive: a playful, aimless walk through a city, in the spirit of Fluxus instructions.\n` +
      (seedPhoto ? "The image shows the view from the walker's home. Let two or three rules grow out of specific things in it.\n" : "") +
      (about ? `About the neighbourhood: ${about}\n` : "") +
      `Write 12 rules in ${LANG[lang]}. Every rule must be a concrete instruction someone can follow right now on a street: ` +
      `name a colour, a sound, a number of steps, an object, a direction. Never write vague advice like "notice the details" or "be present".\n` +
      `Kinds: "move" (how to choose the next turn), "see" (follow or look for something visible), "hear" (navigate by sound), ` +
      `"stop" (stand still, photograph one specific thing, record ten seconds of sound). Use exactly 4 "stop" rules spread through the deck. ` +
      `The 12th rule has kind "home" and sends the walker home by a different street.\n` +
      `Each rule under 22 words. ${SAFETY_NOTE}\n` +
      `Examples of the right tone (do not copy them):\n${EXAMPLES}\n` +
      `Also give the walk a poetic title of 2 to 5 words.\n` +
      `Reply with JSON only: {"title": "...", "cards": [{"kind": "...", "text": "..."}]}`,
  });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text, secs } = await chat(content, { json: true, maxTokens: 900 });
      return { score: sanitizeScore({ ...parseJSON(text), lang, minutes }), secs };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// After the walk, step 1: listen with eyes closed. Audio only, so the photo cannot colour what is heard.
// Speech is described, never transcribed: the neighbours did not agree to be in a zine.
export async function listen(audioBlob, lang = "en") {
  const { text, secs } = await chat([
    {
      type: "text",
      text:
        `Listen to this ten-second street recording. In one sentence of ${LANG[lang]}, describe the soundscape: ` +
        `name each distinct sound you can actually hear and where it seems to be (near, far, passing). ` +
        `If people are talking, say so and describe the voices, but never write down what they say. ` +
        `If the recording is mostly silence or wind, say that.`,
    },
    { type: "input_audio", input_audio: { data: await blobToBase64(audioBlob), format: "wav" } },
  ], { maxTokens: 90, temperature: 0.4 });
  return { heard: text.replace(/^["“]|["”]$/g, ""), secs };
}

// Step 2: look at the photo, with what was heard, and write the stop's line.
export async function look(stop, heard, lang = "en") {
  const content = [];
  if (stop.photo) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${await blobToBase64(stop.photo)}` } });
  content.push({
    type: "text",
    text:
      `A walker followed this rule: "${stop.card.text}".\n` +
      (stop.photo ? "The image is what they photographed when they stopped.\n" : "There is no photo for this stop.\n") +
      (heard ? `At the same moment they heard: ${heard}\n` : "") +
      `Reply in ${LANG[lang]} with compact JSON: {"saw": "...", "line": "..."}\n` +
      `saw: what is in the image, one plain sentence (empty string if there is no image).\n` +
      `line: one short, concrete line of poetry about this stop, using one thing seen and one thing heard, under 14 words.`,
  });
  const { text, secs } = await chat(content, { json: true, maxTokens: 120, temperature: 0.8 });
  const out = parseJSON(text);
  return { saw: asText(out.saw), line: asText(out.line), secs };
}

export async function readStop(stop, lang = "en") {
  let heard = "", secs = 0;
  if (stop.audio) ({ heard, secs } = await listen(stop.audio, lang));
  const seen = await look(stop, heard, lang);
  return { heard, saw: seen.saw, line: seen.line, secs: secs + seen.secs };
}

// Closing page of the zine.
export async function closeWalk(readings, lang = "en") {
  readings = readings.filter((r) => r.saw || r.heard);
  if (!readings.length) return "";
  const lines = readings.map((r, i) => `${i + 1}. saw: ${r.saw} / heard: ${r.heard}`).join("\n");
  const { text } = await chat([{
    type: "text",
    text: `These are the stops of one aimless walk:\n${lines}\n` +
      `Write a four-line poem in ${LANG[lang]} about the whole walk, using concrete details from the stops. ` +
      `Output only the four lines, no title.`,
  }], { maxTokens: 140 });
  return text.replace(/^```.*$/gm, "").trim().split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4).join("\n");
}
