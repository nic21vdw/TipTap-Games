import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The contest calendar. A season is a window with a name and a prize; the
 * boards are derived from `scores` by time, so opening one is safe at any
 * point — including halfway through a month that has already been played.
 *
 * List every season:
 *   curl https://<host>/api/admin/season -H "x-admin-secret: $ADMIN_SYNC_SECRET"
 *
 * Open one (month defaults to the calendar month it starts in, UTC):
 *   curl -X POST https://<host>/api/admin/season \
 *        -H "x-admin-secret: $ADMIN_SYNC_SECRET" \
 *        -H "content-type: application/json" \
 *        -d '{"month":"2026-09","title":"September Doomscroll Cup","prize":"..."}'
 */

function authorised(request: Request): boolean {
  const secret = process.env.ADMIN_SYNC_SECRET;
  return Boolean(secret) && request.headers.get("x-admin-secret") === secret;
}

const MONTH = /^(\d{4})-(\d{2})$/;

function monthWindow(month: string): { starts: string; ends: string } | null {
  const m = MONTH.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  if (index < 0 || index > 11) return null;
  return {
    starts: new Date(Date.UTC(year, index, 1)).toISOString(),
    ends: new Date(Date.UTC(year, index + 1, 1)).toISOString(),
  };
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("seasons")
    .select("slug, title, prize, starts_at, ends_at")
    .order("starts_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ seasons: data ?? [] });
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  let body: {
    month?: unknown;
    slug?: unknown;
    title?: unknown;
    prize?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const month = typeof body.month === "string" ? body.month : null;
  const window = month ? monthWindow(month) : null;
  if (month && !window) {
    return NextResponse.json({ error: "bad_month" }, { status: 400 });
  }

  const startsAt =
    typeof body.startsAt === "string" ? body.startsAt : window?.starts;
  const endsAt = typeof body.endsAt === "string" ? body.endsAt : window?.ends;
  const slug = typeof body.slug === "string" ? body.slug : month;
  const title = typeof body.title === "string" ? body.title : null;

  if (!slug || !title || !startsAt || !endsAt) {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    return NextResponse.json({ error: "bad_window" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("seasons")
    .upsert(
      {
        slug,
        title,
        prize: typeof body.prize === "string" ? body.prize : null,
        starts_at: startsAt,
        ends_at: endsAt,
      },
      { onConflict: "slug" }
    )
    .select("slug, title, prize, starts_at, ends_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, season: data });
}
