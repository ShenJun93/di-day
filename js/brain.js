// The base: Gemma 4 E4B on the walker's own computer, served by llama.cpp (llama-server).
// The phone never talks to it directly; walks travel as files. Nothing goes to a cloud API.
// llama-server speaks the OpenAI chat format, takes images as data URLs and audio as base64 WAV,
// and can constrain the reply to a JSON schema, which keeps a small model's output parseable.

import { SAFETY_NOTE, sanitizeScore } from "./score.js";

export const BASE = localStorage.getItem("lac.base") || location.origin;

const blobToBase64 = (blob) =>
  new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });

export async function status() {
  const res = await fetch(`${BASE}/v1/models`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.id || "model";
}

async function chat(content, { schema = null, maxTokens = 400, temperature = 0.9 } = {}) {
  const body = {
    messages: [{ role: "user", content }],
    max_tokens: maxTokens,
    temperature,
    top_p: 0.95,
    top_k: 64,
    chat_template_kwargs: { enable_thinking: false },
  };
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "reply", schema } };
  const t0 = performance.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`base replied ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return { text, secs: (performance.now() - t0) / 1000, usage: data.usage };
}

const LANG = { en: "English", vi: "Vietnamese" };

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    cards: {
      type: "array", minItems: 10, maxItems: 13,
      items: {
        type: "object",
        properties: { kind: { enum: ["move", "see", "hear", "stop", "home"] }, text: { type: "string" } },
        required: ["kind", "text"],
      },
    },
  },
  required: ["title", "cards"],
};

// Before the walk: a deck of rules, optionally tuned by a photo of the view from home.
export async function composeScore({ lang = "en", minutes = 40, about = "", seedPhoto = null } = {}) {
  const content = [];
  if (seedPhoto) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${await blobToBase64(seedPhoto)}` } });
  content.push({
    type: "text",
    text:
      `You write event scores for a dérive: a playful, aimless walk through a city.\n` +
      (seedPhoto ? "The photo shows the view from the walker's home. Let a few rules grow out of what is in it.\n" : "") +
      (about ? `About the neighbourhood: ${about}\n` : "") +
      `Write 12 short rules in ${LANG[lang]}, each under 22 words, mixing these kinds:\n` +
      `- "move": where or how to walk next\n- "see": follow or look for something visible\n` +
      `- "hear": navigate by sound\n` +
      `- "stop": stand still, take one photo of something specific and record ten seconds of sound\n` +
      `Use exactly 4 "stop" rules spread through the walk. The last rule has kind "home" and sends the walker home by a new route.\n` +
      `Rules should make people notice small, ordinary things. ${SAFETY_NOTE}\n` +
      `Give the walk a poetic title of 2 to 5 words.`,
  });
  const { text, secs } = await chat(content, { schema: SCORE_SCHEMA, maxTokens: 900 });
  return { score: sanitizeScore({ ...JSON.parse(text), lang, minutes }), secs };
}

const STOP_SCHEMA = {
  type: "object",
  properties: { saw: { type: "string" }, heard: { type: "string" }, line: { type: "string" } },
  required: ["saw", "heard", "line"],
};

// After the walk: look at each stop's photo and listen to its recording.
export async function readStop(stop, lang = "en") {
  const content = [];
  if (stop.photo) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${await blobToBase64(stop.photo)}` } });
  content.push({
    type: "text",
    text:
      `A walker followed this rule: "${stop.card.text}".\n` +
      (stop.photo ? "The image is what they saw when they stopped.\n" : "There is no photo for this stop.\n") +
      (stop.audio ? "The audio is ten seconds of what they heard there.\n" : "There is no recording for this stop.\n") +
      `Reply in ${LANG[lang]}:\n` +
      `- saw: what is in the photo, one plain sentence\n` +
      `- heard: the soundscape, naming each distinct sound you can actually hear (not a transcript of speech), one sentence\n` +
      `- line: one short, concrete line of poetry about this stop, under 14 words\n` +
      `Only describe what is really in the image and the audio. If something is unclear, say so plainly.`,
  });
  if (stop.audio) content.push({ type: "input_audio", input_audio: { data: await blobToBase64(stop.audio), format: "wav" } });
  const { text, secs } = await chat(content, { schema: STOP_SCHEMA, maxTokens: 300, temperature: 0.7 });
  return { ...JSON.parse(text), secs };
}

// Closing page of the zine.
export async function closeWalk(readings, lang = "en") {
  const lines = readings.map((r, i) => `${i + 1}. saw: ${r.saw} / heard: ${r.heard}`).join("\n");
  const { text } = await chat([{
    type: "text",
    text: `These are the stops of one aimless walk:\n${lines}\n` +
      `Write a four-line poem in ${LANG[lang]} about the whole walk, using concrete details from the stops. ` +
      `Output only the four lines.`,
  }], { maxTokens: 140 });
  return text.replace(/^```.*$/gm, "").trim().split("\n").filter(Boolean).slice(0, 4).join("\n");
}
