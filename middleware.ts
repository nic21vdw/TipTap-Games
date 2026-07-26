import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  cloudConfigured,
} from "@/lib/supabase/config";

/**
 * Keeps the auth cookie fresh. Without this the session lives only in the
 * browser and an expired token would reach /api/runs/* as "signed out" —
 * scores would quietly stop reaching the board mid-session.
 *
 * A build with no Supabase project passes straight through.
 */
export async function middleware(request: NextRequest) {
  if (!cloudConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list)
          response.cookies.set(name, value, options);
      },
    },
  });

  // Reading the user is what triggers the refresh-and-reset-cookie path.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // everything except static assets and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
