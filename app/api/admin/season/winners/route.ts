import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The giveaway draw. Two ways to pick, both from the same season board:
 *
 *   ?season=2026-09                 the standings, top down, with emails
 *   ?season=2026-09&draw=3&seed=x   three names drawn at random, weighted by
 *                                   points, from a published seed
 *
 * The seeded draw is the point of this route: the seed and the standings are
 * both public before the draw runs, so anyone can replay it and get the same
 * three names. Nothing here is reachable without ADMIN_SYNC_SECRET, and it is
 * the only place a player's email is ever joined to their handle.
 *
 *   curl "https://<host>/api/admin/season/winners?season=2026-09&draw=1&seed=live" \
 *        -H "x-admin-secret: $ADMIN_SYNC_SECRET"
 */

interface BoardRow {
  player_id: string;
  handle: string;
  points: number;
  games_played: number;
  best_rank: number;
  rank: number;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted sampling without replacement: a point is a ticket in the hat. */
function draw(rows: BoardRow[], count: number, seed: string): BoardRow[] {
  const random = seededRandom(seed);
  const pool = [...rows];
  const picked: BoardRow[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, r) => sum + Math.max(1, r.points), 0);
    let ticket = random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= Math.max(1, pool[i].points);
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

export async function GET(request: Request) {
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const drawCount = Number(url.searchParams.get("draw") ?? 0);
  const seed = url.searchParams.get("seed") ?? season ?? "draw";

  const { data: seasonRows, error: seasonError } = await supabase.rpc(
    "current_season",
    { p_season: season }
  );
  if (seasonError) {
    return NextResponse.json({ error: seasonError.message }, { status: 500 });
  }
  const meta = (seasonRows as Array<Record<string, unknown>> | null)?.[0] ?? null;
  if (!meta) {
    return NextResponse.json({ error: "no_season" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("season_overall", {
    p_season: season,
    p_limit: limit,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const board = (data ?? []) as BoardRow[];
  const chosen =
    drawCount > 0 ? draw(board, Math.min(drawCount, board.length), seed) : board;

  const withEmail = await Promise.all(
    chosen.map(async (row) => {
      const { data: user } = await supabase.auth.admin.getUserById(row.player_id);
      return {
        rank: row.rank,
        handle: row.handle,
        points: row.points,
        gamesPlayed: row.games_played,
        bestRank: row.best_rank,
        email: user?.user?.email ?? null,
      };
    })
  );

  if (url.searchParams.get("format") === "csv") {
    const header = "rank,handle,points,games_played,best_rank,email";
    const body = withEmail
      .map((r) =>
        [r.rank, r.handle, r.points, r.gamesPlayed, r.bestRank, r.email ?? ""]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    return new NextResponse(`${header}\n${body}\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${meta.slug}-winners.csv"`,
      },
    });
  }

  return NextResponse.json({
    season: meta,
    drawn: drawCount > 0,
    seed: drawCount > 0 ? seed : null,
    entrants: board.length,
    players: withEmail,
  });
}
