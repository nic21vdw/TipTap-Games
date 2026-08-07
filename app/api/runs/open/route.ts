import { NextResponse } from "next/server";
import { currentUserId, serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Opens a single-use ticket for a run about to be played. The ticket records
 * the server's own start time, which is what /api/runs/submit measures the
 * eventual score against — a client that lies about how long it played gets
 * nowhere.
 */
export async function POST(request: Request) {
  const playerId = await currentUserId(request);
  if (!playerId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  let slug: unknown;
  try {
    ({ slug } = await request.json());
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "bad_slug" }, { status: 400 });
  }

  // Player-generated games aren't in the catalog and have no shared board.
  const { data: game } = await supabase
    .from("games")
    .select("slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ error: "unknown_game" }, { status: 404 });
  }

  const nonce = crypto.randomUUID();
  const { data, error } = await supabase
    .from("runs")
    .insert({ player_id: playerId, game_slug: slug, nonce })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ runId: data.id, nonce });
}
