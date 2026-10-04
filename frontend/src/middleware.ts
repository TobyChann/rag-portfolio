// Forwards /api/* to the FastAPI backend, so the browser only ever talks to
// this site: the admin session cookie stays first-party (a cookie set by a
// different domain would be a third-party cookie, which browsers block) and
// there's no CORS.
//
// Forwarded requests reach the backend from Vercel's servers, so the visitor's
// IP travels in X-Client-IP, vouched for by a shared secret (PROXY_SECRET, also
// set on the backend). Without it every visitor would share one rate limit.
//
// Locally BACKEND_URL is unset: the browser calls the backend directly via
// NEXT_PUBLIC_API_URL and this middleware does nothing.
import { NextResponse, type NextRequest } from "next/server";

export const config = { matcher: "/api/:path*" };

export function middleware(req: NextRequest) {
  const backend = process.env.BACKEND_URL;
  if (!backend) return NextResponse.next();

  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, backend);
  const headers = new Headers(req.headers);
  const ip = req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  headers.set("x-client-ip", ip);
  headers.set("x-proxy-secret", process.env.PROXY_SECRET ?? "");
  return NextResponse.rewrite(target, { request: { headers } });
}
