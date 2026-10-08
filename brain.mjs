// Gemma 4 E4B on this computer, through llama.cpp's llama-server (OpenAI-style API).
// Two jobs: read a listing's fine print while I'm out, and check that I really went out.

import { focus } from "./sources/index.mjs";

export const BASE = process.env.BRAIN || "http://127.0.0.1:8090";

// Who the listings are being read for. Edit to taste.
export const PROFILE = process.env.PROFILE ||
  "an adult solo developer living in Vietnam, not a student, not employed by any sponsor. " +
  "Works online only: cannot travel, avoids live interviews and video calls, will not add a payment card to qualify.";

async function chat(content, { json = false, maxTokens = 300, temperature = 0.3 } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }], max_tokens: maxTokens, temperature,
      chat_template_kwargs: { enable_thinking: false },
      // Plain JSON mode: a full JSON schema made this model pad replies with whitespace.
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`brain ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: (data.choices?.[0]?.message?.content || "").trim(), secs: (Date.now() - t0) / 1000 };
}

const parseJSON = (t) => JSON.parse((t.match(/\{[\s\S]*\}/) || ["{}"])[0]);

export async function online() {
  try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; }
}

// --- reading a listing ---------------------------------------------------------------------------
// The answer sets match the Bounty Triage benchmark (kaggle.com/benchmarks/shenjun93/bounty-triage).
// Converting time zones is left to code: that benchmark showed small models get it wrong.
export async function triage(listing) {
  const { text, secs } = await chat([{
    type: "text",
    text:
      `You help ${PROFILE}\nDecide if this listing is worth their time. Read the fine print, not the headline.\n\n` +
      `LISTING (${listing.source}): ${listing.title}\nPrize: ${listing.prize || "not stated"}\n` +
      (listing.deadlineText ? `Dates shown: ${listing.deadlineText}\n` : "") +
      (listing.deadlineUtc ? `Submission deadline: ${deadlineInVietnam(listing)} (already converted to Vietnam time)\n` : "") +
      (listing.submissions != null ? `Submissions or registrations so far: ${listing.submissions}\n` : "") +
      `---\n${focus(listing.text)}\n---\n\n` +
      `Definitions (from the Bounty Triage benchmark):\n` +
      `- gate is ONE extra requirement besides submitting the work. live_interview = a LIVE call, interview or live demo ` +
      `with people; a pre-recorded demo video is NOT a gate. in_person = being physically somewhere. card_required = adding ` +
      `a payment card. hired_first = being hired or contracted before being paid. own_cloud_account = running the work on a ` +
      `specific cloud provider. kyc = identity verification before payout. Following or reposting on social media is not a gate.\n` +
      `- eligible_vietnam is "no" if the listing limits entry to a region or country list that excludes Vietnam ` +
      `(for example "Region: Spain" or "India only"); "unclear" if it contradicts itself.\n` +
      `Reply with JSON only:\n` +
      `{"worth": "yes" | "maybe" | "no",\n` +
      ` "gate": "none" | "live_interview" | "in_person" | "card_required" | "hired_first" | "own_cloud_account" | "kyc" | "other",\n` +
      ` "gate_quote": "the exact words that create the gate, or empty",\n` +
      ` "eligible_vietnam": "yes" | "no" | "unclear",\n` +
      ` "deadline_as_written": "the submission deadline exactly as written, or empty",\n` +
      ` "deadline_timezone": "the time zone written next to it (e.g. PDT, UTC, IST, AoE), or empty",\n` +
      ` "effort": "hours" | "days" | "weeks",\n` +
      ` "why": "one plain sentence a busy person can act on"}`,
  }], { json: true, maxTokens: 260 });
  return { ...checkGate(parseJSON(text)), secs };
}

// A catch only counts if the words Gemma quotes actually say it. On the first real trip it still called
// "Record a pitch video and a demo video" a live interview, and guessed a payment card from a quote that
// never mentions one. Each gate needs one of its words in the quote, or it is dropped and the drop is shown.
const GATE_WORDS = {
  live_interview: /\blive\b|interview|\bcalls?\b|zoom|google meet|in real time|q ?& ?a|on stage/i,
  in_person: /on-?site|in[- ]person|venue|attend|physical|travel|located in/i,
  card_required: /\bcard\b|credit|debit|payment method|billing/i,
  kyc: /\bkyc\b|identity|verif|passport|government id/i,
  hired_first: /\bhire|contract|employ/i,
  own_cloud_account: /cloud|aws|azure|gcp|account/i,
};

export function checkGate(t) {
  const words = GATE_WORDS[t.gate];
  if (!words || words.test(t.gate_quote || "")) return t;
  const out = { ...t, gate: "none", gate_dropped: t.gate };
  // If the dropped catch was the only thing against it, it is back in play.
  if (t.worth === "no" && t.eligible_vietnam !== "no") out.worth = "maybe";
  return out;
}

// --- time zones, done in code ------------------------------------------------------------------
const OFFSETS = { UTC: 0, GMT: 0, Z: 0, PT: -7, PDT: -7, PST: -8, ET: -4, EDT: -4, EST: -5, CT: -5, CDT: -5, CST: -6,
  IST: 5.5, SGT: 8, WIB: 7, ICT: 7, CET: 1, CEST: 2, BST: 1, JST: 9, KST: 9, AOE: -12 };

export function deadlineInVietnam(listing, t = {}) {
  let ms = listing.deadlineUtc ? Date.parse(listing.deadlineUtc) : NaN;
  if (Number.isNaN(ms) && t.deadline_as_written) {
    const tz = String(t.deadline_timezone || "").toUpperCase().replace(/[^A-Z]/g, "");
    const off = OFFSETS[tz];
    const base = Date.parse(String(t.deadline_as_written).replace(/\b(at|by)\b/gi, " ").replace(/\(.*?\)/g, "").replace(/\b[A-Z]{2,4}\b\s*$/, "").trim() + " UTC");
    if (!Number.isNaN(base) && off !== undefined) ms = base - off * 3600e3;
  }
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false }) + " (VN)";
}

// --- did I actually go outside? --------------------------------------------------------------------
// Listen first, with no photo in the prompt: when image and audio came together, the model described
// sounds that matched the photo instead of the recording. Speech is described, never transcribed.
export async function checkOutside({ audioB64, photoB64 }) {
  let heard = { outdoors: null, heard: "" }, saw = { outdoors: null, saw: "" }, secs = 0;
  if (audioB64) {
    const r = await chat([
      { type: "text", text:
        "Listen to this short recording. Reply with JSON only: " +
        '{"outdoors": true | false, "heard": "one sentence naming each distinct sound you can actually hear"}. ' +
        "outdoors is true if it sounds like a street, market, road, park or anywhere outside a home. " +
        "If people talk, describe the voices but never write down what they say." },
      { type: "input_audio", input_audio: { data: audioB64, format: "wav" } },
    ], { json: true, maxTokens: 120 });
    heard = parseJSON(r.text); secs += r.secs;
  }
  if (photoB64) {
    const r = await chat([
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoB64}` } },
      { type: "text", text: 'Reply with JSON only: {"outdoors": true | false, "saw": "one plain sentence about what is in the photo"}. ' +
        "outdoors is true if the photo was taken outside (sky, street, trees, shopfronts)." },
    ], { json: true, maxTokens: 100 });
    saw = parseJSON(r.text); secs += r.secs;
  }
  return { outdoors: heard.outdoors === true || saw.outdoors === true, heard: heard.heard || "", saw: saw.saw || "", secs };
}
