import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { canAccessPath, landingFor } from "@/lib/auth/permissions";

/**
 * The real access-control boundary.
 *
 * Runs before any page renders, on the server, using only the signed cookie.
 * The client cannot influence the outcome: React state, devtools and a forged
 * localStorage value are all irrelevant here. The in-app guards
 * (`<ProtectedRoute>`, `<Can>`) exist to keep the UI coherent — this is what
 * actually stops the request.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  /* ------------------------------------------------------- Unauthenticated */

  if (!session) {
    if (pathname === "/login") return NextResponse.next();

    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    // Preserve the intended destination so we can bounce back after sign-in.
    // Only a same-site path is stored — never a full URL, which would make
    // this an open redirect.
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);

    const response = NextResponse.redirect(login);
    // Clear any stale/expired cookie so the browser stops resending it.
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  /* --------------------------------------------------------- Authenticated */

  // A signed-in user has no business on the login screen.
  if (pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = landingFor(session.role);
    home.search = "";
    return NextResponse.redirect(home);
  }

  if (!canAccessPath(session.role, pathname)) {
    const denied = request.nextUrl.clone();
    denied.pathname = "/denied";
    denied.search = `?from=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(denied);
  }

  // Hand identity to Server Components without re-verifying downstream.
  const headers = new Headers(request.headers);
  headers.set("x-sbs-user", session.sub);
  headers.set("x-sbs-role", session.role);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  /**
   * Everything except Next internals, static assets and the auth endpoints.
   * `/api/auth/*` must stay open or login itself would be unreachable; those
   * handlers do their own validation.
   *
   * `/api/health/*` is excluded for the inverse reason: it reports why the
   * database is unreachable, and bouncing it to /login made it useless in
   * exactly the situation it exists for. It guards itself with a key and
   * returns an ordinary 404 without one.
   */
  matcher: [
    "/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|favicon.svg|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
