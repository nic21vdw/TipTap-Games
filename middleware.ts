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
/**
 * The iOS bundle is served from inside the app, so every call it makes to
 * /api/runs/* is cross-origin. These are the only origins a Capacitor webview
 * ever presents; anything else is a website and gets no CORS headers at all.
 * Credentials are deliberately absent — the native app authenticates with a
 * bearer token, so no cookie ever needs to cross this boundary.
 */
const NATIVE_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
]);

function corsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin || !NATIVE_ORIGINS.has(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export async function middleware(request: NextRequest) {
  const cors = request.nextUrl.pathname.startsWith("/api/")
    ? corsHeaders(request.headers.get("origin"))
    : null;

  if (cors && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  if (cors) {
    const passthrough = NextResponse.next({ request });
    for (const [name, value] of Object.entries(cors))
      passthrough.headers.set(name, value);
    // A bearer-authenticated call carries no cookie to refresh.
    return passthrough;
  }

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
