import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GLOBAL_LEADERBOARD_ENABLED = false;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
} as const;

const SCORE_FORMULA = {
  reputation: 2,
  totalDiscoveries: 5,
  predictionAccuracy: 1.5,
} as const;

const PLAUSIBILITY_CAPS = {
  reputation: { min: 0, max: 100 },
  totalDiscoveries: { min: 0, max: 500 },
  predictionAccuracy: { min: 0, max: 100 },
  season: { min: 1, max: 50 },
} as const;

interface SubmitPayload {
  id: string;
  scoutName: string;
  score: number;
  season: number;
  reputation: number;
  totalDiscoveries: number;
  predictionAccuracy: number;
  submittedAt: number;
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!GLOBAL_LEADERBOARD_ENABLED) {
    return jsonResponse(
      { error: "Global leaderboard is disabled during beta while score verification is hardened." },
      403,
    );
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Authenticate the user via the JWT in the Authorization header.
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Use the anon key client with the user's JWT to verify identity.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse and validate the payload.
  let payload: SubmitPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { id, scoutName, score, season, reputation, totalDiscoveries, predictionAccuracy, submittedAt } = payload;

  if (!id || !scoutName || typeof score !== "number" || typeof submittedAt !== "number") {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  // Plausibility checks.
  if (!inRange(reputation, PLAUSIBILITY_CAPS.reputation.min, PLAUSIBILITY_CAPS.reputation.max)) {
    return jsonResponse({ error: "reputation out of range" }, 422);
  }
  if (!inRange(totalDiscoveries, PLAUSIBILITY_CAPS.totalDiscoveries.min, PLAUSIBILITY_CAPS.totalDiscoveries.max)) {
    return jsonResponse({ error: "totalDiscoveries out of range" }, 422);
  }
  if (!inRange(predictionAccuracy, PLAUSIBILITY_CAPS.predictionAccuracy.min, PLAUSIBILITY_CAPS.predictionAccuracy.max)) {
    return jsonResponse({ error: "predictionAccuracy out of range" }, 422);
  }
  if (!inRange(season, PLAUSIBILITY_CAPS.season.min, PLAUSIBILITY_CAPS.season.max)) {
    return jsonResponse({ error: "season out of range" }, 422);
  }

  // Recalculate score and verify it matches.
  const expected =
    reputation * SCORE_FORMULA.reputation +
    totalDiscoveries * SCORE_FORMULA.totalDiscoveries +
    predictionAccuracy * SCORE_FORMULA.predictionAccuracy;

  // Allow a tiny floating-point tolerance.
  if (Math.abs(score - expected) > 0.01) {
    return jsonResponse({ error: "Score mismatch", expected, received: score }, 422);
  }

  // Insert using the service role client (bypasses RLS).
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { error: insertError } = await adminClient.from("leaderboard_entries").insert({
    id,
    user_id: user.id,
    scout_name: scoutName,
    score,
    season,
    reputation,
    total_discoveries: totalDiscoveries,
    prediction_accuracy: predictionAccuracy,
    submitted_at: submittedAt,
  });

  if (insertError) {
    const status = insertError.code === "23505" ? 409 : 500; // duplicate PK = 409
    return jsonResponse({ error: insertError.message }, status);
  }

  return jsonResponse({ success: true }, 200);
});
