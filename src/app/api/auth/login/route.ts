import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = process.env.DASHBOARD_USER || "admin"
  const validPass = process.env.DASHBOARD_PASS || "admin"
  const coachUser = process.env.COACH_USER || ""
  const coachPass = process.env.COACH_PASS || ""

  const isOwner = username === validUser && password === validPass
  const isCoach = coachUser && coachPass && username === coachUser && password === coachPass

  if (!isOwner && !isCoach) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const token = crypto.randomBytes(32).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set("pnl_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.json({ ok: true, role: isCoach ? "coach" : "owner" })
}
