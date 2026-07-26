import { NextResponse } from "next/server";
import { currentUserId, serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Nobody plays one game for more than an hour in a single best. */
const MAX_PLAUSIBLE_SECONDS = 3600;

/**
 * The one-time guest merge. A player who earned bests before signing in gets
 * them carried onto the account, recorded as unverified: they count towards
 * that player's own personal best on every device, but public_bests — and
 * therefore every leaderboard — ignores them. Runs the server watched are the
 * only runs that rank.
 *
 * Guarded by profiles.guest_imported_at, so it can only ever happen once.
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

  let bests: unknown;
  try {
    ({ bests } = await request.json());
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (!bests || typeof bests !== "object" || Array.isArray(bests)) {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("guest_imported_at")
    .eq("id", playerId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "no_profile" }, { status: 404 });
  }
  if (profile.guest_imported_at) {
    return NextResponse.json({ ok: true, imported: 0, already: true });
  }

  const { data: games } = await supabase
    .from("games")
    .select("slug, max_score_per_second");
  const ceilings = new Map(
    (games ?? []).map((g) => [
      g.slug as string,
      Math.ceil(g.max_score_per_second * MAX_PLAUSIBLE_SECONDS),
    ])
  );

  const rows = Object.entries(bests as Record<string, unknown>)
    .filter(
      ([slug, score]) =>
        ceilings.has(slug) && typeof score === "number" && Number.isFinite(score) && score > 0
    )
    .map(([slug, score]) => ({
      player_id: playerId,
      game_slug: slug,
      score: Math.min(Math.round(score as number), ceilings.get(slug)!),
      duration_ms: 0,
      verified: false,
    }));

  if (rows.length) {
    const { error } = await supabase.from("scores").insert(rows);
    if (error) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
  }

  await supabase
    .from("profiles")
    .update({ guest_imported_at: new Date().toISOString() })
    .eq("id", playerId);

  return NextResponse.json({ ok: true, imported: rows.length });
}
