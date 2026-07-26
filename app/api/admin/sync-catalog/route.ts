import { NextResponse } from "next/server";
import { CATALOG } from "@/games/registry";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Pushes games/registry.ts into the `games` table. The registry stays the one
 * definition of a game; this keeps Postgres' copy — which /api/runs/submit
 * reads its anti-cheat ceilings from — in step with it after a deploy.
 *
 *   curl -X POST https://<host>/api/admin/sync-catalog \
 *        -H "x-admin-secret: $ADMIN_SYNC_SECRET"
 */
export async function POST(request: Request) {
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const rows = CATALOG.map((m) => ({
    slug: m.slug,
    title: m.title,
    rule_text: m.rule,
    tags: m.tags,
    intensity: m.intensity,
    luck: m.luck,
    nostalgia: m.nostalgia,
    session_length: m.sessionLength,
    score_unit: m.scoreUnit,
    max_score_per_second: m.maxScorePerSecond,
    is_active: true,
  }));

  const { error } = await supabase
    .from("games")
    .upsert(rows, { onConflict: "slug" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: rows.length });
}
