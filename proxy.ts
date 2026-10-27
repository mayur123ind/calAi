import { NextResponse, type NextRequest } from "next/server";

// First line of defence only: real session checks happen in every route handler.
const SESSION_COOKIE = "calai_session";
const PUBLIC_PAGES = ["/login", "/signup"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Refuse cross-site writes (CSRF): browsers always send Origin on these.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  if (PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (isApi) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|manifest.webmanifest).*)"],
};
