// Where the listings come from. Each source returns plain objects:
// { id, source, title, url, prize, deadlineUtc (ISO string or null), deadlineText, text }
// `text` is the listing's own words (rules, description), trimmed, for the model to read.

const UA = { "user-agent": "di-day/0.1 (personal bounty triage; contact via github.com/ShenJun93)" };

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Devpost hides an "unsupported browser, upgrade to Internet Explorer 10" banner in a comment; Gemma read it as a rule.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function getJSON(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return htmlToText(await res.text());
}

// Superteam Earn: bounties and hackathons, mostly Solana. Deadlines are exact UTC timestamps.
export async function superteam(limit = 12) {
  const list = await getJSON(`https://superteam.fun/api/listings?take=${limit}`);
  const open = list.filter((l) => l.status === "OPEN" && (!l.deadline || new Date(l.deadline) > new Date()));
  const out = [];
  for (const l of open) {
    let text = "";
    try {
      const d = await getJSON(`https://superteam.fun/api/listings/details/${l.slug}`);
      text = [d.description && htmlToText(d.description), d.region && `Region: ${d.region}`,
        d.eligibility && `Eligibility questions: ${JSON.stringify(d.eligibility)}`].filter(Boolean).join("\n");
    } catch {}
    out.push({
      id: `superteam:${l.id}`, source: "Superteam Earn", title: l.title,
      url: `https://superteam.fun/earn/listing/${l.slug}`,
      prize: l.rewardAmount ? `${l.rewardAmount} ${l.token || ""}`.trim() : "",
      deadlineUtc: l.deadline || null, deadlineText: "",
      submissions: l._count?.Submission ?? null,
      text: text.slice(0, 6000),
    });
  }
  return out;
}

// Devpost: open online hackathons. The list gives a date range; the rules page has the exact deadline.
export async function devpost(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const d = await getJSON(`https://devpost.com/api/hackathons?status[]=open&page=${p}`);
    for (const h of d.hackathons) {
      let text = "";
      try { text = await getText(new URL("rules", h.url).href); } catch {}
      out.push({
        id: `devpost:${h.id}`, source: "Devpost", title: h.title, url: h.url,
        prize: htmlToText(h.prize_amount || ""), deadlineUtc: null, deadlineText: h.submission_period_dates || "",
        submissions: h.registrations_count ?? null,
        text: [`Location: ${h.displayed_location?.location || ""}`, text].join("\n").slice(0, 6000),
      });
    }
  }
  return out;
}

// DEV challenges: writing and build challenges with cash prizes.
export async function devChallenges() {
  const res = await fetch("https://dev.to/challenges", { headers: UA });
  const html = await res.text();
  const slugs = [...new Set([...html.matchAll(/href="\/challenges\/([a-z0-9-]+-20\d\d-\d\d-\d\d)"/g)].map((m) => m[1]))];
  const out = [];
  for (const slug of slugs.slice(0, 8)) {
    const url = `https://dev.to/challenges/${slug}`;
    let text = "";
    try { text = await getText(url); } catch { continue; }
    if (!/Challenge Status:\s*Live/i.test(text)) continue;
    const title = (text.match(/^(.*Challenge[^\n]*)/m) || [])[1] || slug;
    out.push({
      id: `dev:${slug}`, source: "DEV", title: title.trim().slice(0, 120), url, prize: "",
      deadlineUtc: null, deadlineText: "", submissions: null, text: text.slice(0, 6000),
    });
  }
  return out;
}

// DEV's challenge list is rendered by JavaScript, so devChallenges() finds nothing in the raw HTML yet.
export const SOURCES = { superteam, devpost };

// Keeps the lines that usually hide the catch (eligibility, deadlines, interviews, payment), so a small
// model reads 3,500 characters of fine print instead of 6,000 characters of marketing.
const KEY = /(eligib|resident|countr|region|deadline|submission period|ends|closes|\b(PT|PDT|PST|ET|EDT|EST|UTC|GMT|IST|AoE)\b|interview|video call|live demo|in[- ]person|attend|venue|finalist|judg|card|payment|paid|payout|kyc|age|student|winner|claim|assign)/i;
export function focus(text, max = 3500) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const keep = new Set();
  lines.forEach((l, i) => { if (KEY.test(l)) [i - 1, i, i + 1].forEach((j) => j >= 0 && j < lines.length && keep.add(j)); });
  const head = lines.slice(0, 6).join('\n');
  const body = [...keep].sort((a, b) => a - b).map((i) => lines[i]).join('\n');
  return (head + '\n...\n' + body).slice(0, max);
}
