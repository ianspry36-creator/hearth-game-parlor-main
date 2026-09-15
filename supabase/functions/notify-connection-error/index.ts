// Best-effort email notification for multiplayer connection failures.
//
// The client calls this (via supabase.functions.invoke) at the same time it
// writes to the `connection_errors` table. It forwards a short summary to the
// owner's inbox via Resend, so a broken invite/join can be noticed without
// polling the dashboard.
//
// One-time setup:
//   1. Create a free Resend account (https://resend.com) and copy an API key.
//   2. Add the secret:   supabase secrets set RESEND_API_KEY=<key>
//   3. Deploy:           supabase functions deploy notify-connection-error
//
// Until the key is set this function no-ops and returns ok:false, so the table
// log remains the source of truth either way.

const TO_EMAIL = "cardsandgamesuk01@gmail.com";
// Resend's shared test sender; swap for a sender on a domain you verify in
// Resend once you're happy with the flow.
const FROM_EMAIL = "Hearth Game Parlor <onboarding@resend.dev>";

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

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return jsonResponse({ ok: false, reason: "email_not_configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, reason: "bad_request" }, 400);
  }

  const errorType = String(body?.error_type ?? "unknown");
  const message = String(body?.message ?? "").slice(0, 4000);
  const game = body?.game ? String(body.game) : "n/a";
  const nickname = body?.nickname ? String(body.nickname) : "unknown";
  const origin = body?.origin ? String(body.origin) : "n/a";
  const when = new Date().toISOString();

  const text = [
    "A multiplayer connection error was reported in the Hearth Game Parlor.",
    "",
    `Type:     ${errorType}`,
    `Game:     ${game}`,
    `Nickname: ${nickname}`,
    `Origin:   ${origin}`,
    `When:     ${when}`,
    "",
    "Details:",
    message,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `[hearth-game-parlor] connection error: ${errorType}`,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return jsonResponse(
      { ok: false, reason: "resend_failed", detail: detail.slice(0, 500) },
      502,
    );
  }

  return jsonResponse({ ok: true });
});
