import { NextResponse } from "next/server";
import { routeClient } from "@/lib/supabase/server";

/**
 * Where Google sends the player back to. Trades the one-time code for a
 * session, which routeClient writes into cookies, then returns them to
 * whatever they were looking at.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only same-origin paths, so the callback can't be used as an open redirect.
  const raw = url.searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/?auth=missing_code", url.origin));
  }

  const supabase = await routeClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=unconfigured", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?auth=failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
