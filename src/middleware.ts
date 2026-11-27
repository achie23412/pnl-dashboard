import { NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE, verifySession } from "@/lib/session"
import { CS_HOME, csCanOpen } from "@/lib/cs-access"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Cron and competitor sync check CRON_SECRET themselves; login/me must work before logging in
  if (
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/competitors") ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next()
  }

  // Vercel cron passes Authorization: Bearer <CRON_SECRET> — let cron-triggered API calls through
  if (pathname.startsWith("/api/") && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.next()
  }

  // The session must carry a valid signature and not be expired; the cookie existing isn't enough
  const role = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!role) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not logged in" }, { status: 401 })
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Customer service only gets the CS pages and the API routes behind them
  if (role === "cs" && !csCanOpen(pathname)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not available for the customer service login" }, { status: 403 })
    return NextResponse.redirect(new URL(CS_HOME, req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
