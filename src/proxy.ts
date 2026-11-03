import { NextRequest, NextResponse } from "next/server";

// Cheap cookie-presence gate. Real validation happens server-side in verifySession().
const PUBLIC_PREFIXES = ["/login", "/setup", "/api/setup", "/api/auth", "/api/health"];
const SESSION_COOKIE = "ombor_session";

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

// /api/publish is excluded so large uploads stream straight to the route handler
// (the proxy would otherwise buffer the body); that handler verifies the session itself.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/publish|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
