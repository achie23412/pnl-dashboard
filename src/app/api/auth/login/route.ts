import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { SESSION_COOKIE, SESSION_DAYS, createSession } from "@/lib/session"
import { ROLE_COOKIE } from "@/lib/auth-role"

// Compare without leaking how many characters matched
function same(a: unknown, b: string | undefined): boolean {
  if (typeof a !== "string" || !b) return false
  const x = crypto.createHash("sha256").update(a).digest()
  const y = crypto.createHash("sha256").update(b).digest()
  return crypto.timingSafeEqual(x, y)
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({}))

  // No built-in fallback logins: without DASHBOARD_USER/DASHBOARD_PASS in Vercel nobody can log in
  const ownerUser = process.env.DASHBOARD_USER
  const ownerPass = process.env.DASHBOARD_PASS
  const coachUser = process.env.COACH_USER || (process.env.coach ? "coach" : undefined)
  const coachPass = process.env.COACH_PASS || process.env.coach || undefined

  const isOwner = same(username, ownerUser) && same(password, ownerPass)
  const isCoach = !isOwner && same(username, coachUser) && same(password, coachPass)

  if (!isOwner && !isCoach) {
    // Slow down password guessing
    await new Promise((r) => setTimeout(r, 1000))
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const role = isOwner ? "owner" : "coach"
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, await createSession(role), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  })
  // The role now lives in the signed session; remove the old separate role cookie
  cookieStore.delete(ROLE_COOKIE)

  return NextResponse.json({ ok: true, role })
}
