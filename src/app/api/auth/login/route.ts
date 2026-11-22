import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = process.env.DASHBOARD_USER || "admin"
  const validPass = process.env.DASHBOARD_PASS || "admin"

  if (username !== validUser || password !== validPass) {
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

  return NextResponse.json({ ok: true })
}
