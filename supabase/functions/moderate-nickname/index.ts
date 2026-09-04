// Server-side nickname moderation.
//
// Called from the client before a nickname is saved/joined. It runs two checks:
//   1. A local obfuscation-aware blocklist (catches "tw*t", "f0ck", leetspeak,
//      and vowel-drops that a pure NLP service like Tisane does not flag).
//   2. Tisane Labs /parse for natural-language profanity, hate speech, and
//      other problematic content (catches "fuck", racial slurs, insults, …).
//
// The Tisane key is read from the environment and never shipped to the browser.
// Set it with:
//   supabase secrets set TISANE_API_KEY=<primary key>
//
// Note: BLOCKED_TERMS / LEET / matcher logic mirrors src/lib/nickname.ts.
// Keep the two lists in sync.

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
  "#": "h",
};

const BLOCKED_TERMS: string[] = [
  // Profanity
  "fuck",
  "fucked",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "shitty",
  "bullshit",
  "bitch",
  "bitching",
  "cunt",
  "cock",
  "dick",
  "pussy",
  "twat",
  "asshole",
  "arsehole",
  "bastard",
  "whore",
  "slut",
  "prick",
  "douche",
  "douchebag",
  "wanker",
  "bollocks",
  "damn",
  // Common letter-substitution / vowel-drop forms.
  "fock",
  "fvck",
  "fuk",
  "shyt",
  "bich",
  "dik",
  "cawk",
  // Hate speech (racial)
  "nigger",
  "nigga",
  "chink",
  "kike",
  "spic",
  "gook",
  "wetback",
  "coon",
  "beaner",
  // Hate speech (sexual orientation / gender)
  "faggot",
  "fag",
  "dyke",
  "homo",
  "tranny",
  "shemale",
  // Ableist slurs
  "retard",
  "retarded",
  "spastic",
  "spaz",
  // Sexual / predatory content
  "rape",
  "rapist",
  "pedo",
  "pedophile",
  "molest",
  "incest",
  // Extremist content
  "nazi",
  "hitler",
];

const VOWELS = "aeiou";

/** Terms where an optional vowel would reduce the word to something innocent. */
const STRICT_TERMS = new Set(["rape"]);

function normalize(value: string): string {
  const split = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  let out = "";
  for (const ch of split) out += LEET[ch] ?? ch;
  return out;
}

function squeeze(value: string): string {
  return value.replace(/([a-z])\1+/g, "$1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(term: string): RegExp {
  const SEP = "[^a-z]*";
  const strict = STRICT_TERMS.has(term);
  let src = "\\b";
  for (const ch of term) {
    const optional = !strict && VOWELS.includes(ch);
    src += optional
      ? `(?:${SEP}${escapeRegExp(ch)})?`
      : `${SEP}${escapeRegExp(ch)}`;
  }
  src += "\\b";
  return new RegExp(src);
}

const MATCHERS = BLOCKED_TERMS.map(buildMatcher);

function localFlagged(value: string): boolean {
  const normalized = normalize(value);
  const squeezed = squeeze(normalized);
  return MATCHERS.some((re) => re.test(normalized) || re.test(squeezed));
}

/** Abuse categories we treat as disqualifying for a nickname. */
const BLOCKED_ABUSE_TYPES = new Set([
  "profanity",
  "bigotry",
  "personal_attack",
  "sexual_advances",
  "sexual_harassment",
  "self_harm",
  "criminal_activity",
  "allegations",
  "weapons",
  "violence",
  "drug_activity",
  "harassment",
  "privacy_violation",
  "spam",
]);

async function tisaneFlagged(nickname: string): Promise<boolean> {
  const key = Deno.env.get("TISANE_API_KEY");
  if (!key) return false; // not configured → rely on local blocklist only

  try {
    const res = await fetch("https://api.tisane.ai/parse", {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: "en",
        content: nickname,
        settings: { abuse: true },
      }),
    });
    if (!res.ok) return false; // fail open on upstream errors

    const json = await res.json();
    const abuse: Array<{ type?: string }> = json?.abuse ?? [];
    return abuse.some((entry) => entry.type && BLOCKED_ABUSE_TYPES.has(entry.type));
  } catch {
    return false;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);
  }

  let nickname = "";
  try {
    const body = await req.json();
    nickname = String(body?.nickname ?? "").trim();
  } catch {
    return jsonResponse({ ok: false, reason: "bad_request" }, 400);
  }

  if (!nickname) {
    return jsonResponse({ ok: false, reason: "empty" }, 400);
  }

  const flagged = localFlagged(nickname) || (await tisaneFlagged(nickname));
  return jsonResponse({ ok: !flagged, reason: flagged ? "inappropriate" : null });
});
