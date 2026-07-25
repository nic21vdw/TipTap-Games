import { NextResponse } from "next/server";
import { currentUserId, serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A run left open this long was abandoned, not played. */
const MAX_RUN_AGE_MS = 2 * 60 * 60 * 1000;
/** Slack for the round trip, so a legitimate fast run is never rejected. */
const GRACE_SECONDS = 2;

/**
 * Redeems a ticket from /api/runs/open and records the score.
 *
 * Three things have to hold: the ticket belongs to the caller, it has never
 * been redeemed, and the score is reachable inside the elapsed time the
 * server itself measured. Consuming the ticket is a conditional update, so
 * two racing submits can only ever produce one score.
 */
export async function POST(request: Request) {
  const playerId = await currentUserId();
  if (!playerId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  let body: { runId?: unknown; nonce?: unknown; score?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const { runId, nonce, score } = body;
  if (
    typeof runId !== "string" ||
    typeof nonce !== "string" ||
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0
  ) {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const { data: run } = await supabase
    .from("runs")
    .select("id, player_id, game_slug, nonce, started_at, consumed_at")
    .eq("id", runId)
    .maybeSingle();

  if (
    !run ||
    run.player_id !== playerId ||
    run.nonce !== nonce ||
    run.consumed_at !== null
  ) {
    return NextResponse.json({ error: "invalid_run" }, { status: 403 });
  }

  const startedAt = new Date(run.started_at).getTime();
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 0 || elapsedMs > MAX_RUN_AGE_MS) {
    return NextResponse.json({ error: "expired_run" }, { status: 403 });
  }

  const { data: game } = await supabase
    .from("games")
    .select("max_score_per_second")
    .eq("slug", run.game_slug)
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ error: "unknown_game" }, { status: 404 });
  }

  const ceiling = Math.ceil(
    game.max_score_per_second * (elapsedMs / 1000 + GRACE_SECONDS)
  );
  if (score > ceiling) {
    // Burn the ticket either way — a rejected attempt doesn't get a retry.
    await supabase
      .from("runs")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", runId);
    return NextResponse.json(
      { error: "implausible_score", ceiling },
      { status: 422 }
    );
  }

  const { data: consumed } = await supabase
    .from("runs")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", runId)
    .is("consumed_at", null)
    .select("id");

  if (!consumed?.length) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  const { error } = await supabase.from("scores").insert({
    player_id: playerId,
    game_slug: run.game_slug,
    score: Math.round(score),
    duration_ms: Math.round(elapsedMs),
    verified: true,
  });

  if (error) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
