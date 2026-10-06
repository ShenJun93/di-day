// A "score" is a deck of walking rules, in the spirit of Fluxus event scores.
// It is plain JSON so it can travel in a QR code, be printed, or be edited by hand.

export const CARD_KINDS = ["move", "see", "hear", "stop", "home"];

// Used when no model is available (phone alone, first run, or the base is off).
export const DEFAULT_SCORE = {
  v: 1,
  title: "A first drift",
  lang: "en",
  minutes: 40,
  cards: [
    { kind: "move", text: "Leave by the door you use least. Turn the way the wind is blowing." },
    { kind: "see", text: "Follow the first yellow thing you see until it ends." },
    { kind: "stop", text: "Stand still. Photograph something older than you. Record ten seconds of what you hear." },
    { kind: "hear", text: "Walk toward the only sound that is not a machine." },
    { kind: "see", text: "Take the next turn that has a plant in it." },
    { kind: "stop", text: "Find a doorway. Photograph what it frames. Record the street behind you." },
    { kind: "hear", text: "Find a place quieter than this one. Count your steps to get there." },
    { kind: "move", text: "Follow someone carrying food, at a polite distance, until they turn." },
    { kind: "stop", text: "Photograph the ground. Record ten seconds with your eyes closed." },
    { kind: "see", text: "Walk until you find writing you cannot read." },
    { kind: "stop", text: "Photograph the sky through something. Record the loudest corner you can find." },
    { kind: "home", text: "Go home by a different street than the one you came." },
  ],
};

// Rules every generated card must respect. Shown to the model and checked again here.
export const SAFETY_NOTE =
  "Never ask the walker to cross against traffic, enter private property, follow anyone closely, " +
  "touch strangers, climb, or go near water edges or rail tracks. Never ask for photos of faces, house numbers or " +
  "licence plates, and never ask to record a particular person. Daylight walking only.";

const BANNED = /(cross (the road|against)|private|trespass|climb|rail(way)? track|jump|touch (a |the )?stranger|swim|house number|licen[cs]e plate|\bfaces?\b|số nhà|biển số|khuôn mặt)/i;

export function sanitizeScore(raw) {
  const cards = (raw?.cards || [])
    .filter((c) => c && typeof c.text === "string" && c.text.trim().length > 3 && !BANNED.test(c.text))
    .map((c) => ({ kind: CARD_KINDS.includes(c.kind) ? c.kind : "move", text: c.text.trim().slice(0, 160) }))
    .slice(0, 14);
  if (cards.length < 6) return { ...DEFAULT_SCORE };
  if (cards[cards.length - 1].kind !== "home") cards.push(DEFAULT_SCORE.cards.at(-1));
  // A walk needs stops to become a zine. Small models sometimes write fewer than asked: top up from the default deck.
  const spare = DEFAULT_SCORE.cards.filter((c) => c.kind === "stop");
  for (let pos = 3; cards.filter((c) => c.kind === "stop").length < 3 && spare.length; pos += 3) {
    cards.splice(Math.min(pos, cards.length - 1), 0, spare.shift());
  }
  return {
    v: 1,
    title: String(raw.title || "Untitled drift").slice(0, 60),
    lang: raw.lang === "vi" ? "vi" : "en",
    minutes: Math.min(Math.max(Number(raw.minutes) || 40, 15), 45),
    cards,
  };
}

// --- compact transport: JSON -> deflate -> base64url, so a score fits in a QR code URL ---

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toB64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

export async function encodeScore(score) {
  const bytes = new TextEncoder().encode(JSON.stringify(score));
  return toB64url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

export async function decodeScore(text) {
  const bytes = await pipe(fromB64url(text), new DecompressionStream("deflate-raw"));
  return sanitizeScore(JSON.parse(new TextDecoder().decode(bytes)));
}
