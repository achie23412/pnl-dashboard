import { NextResponse } from "next/server"
import { getRole } from "@/lib/auth-role"

export const dynamic = "force-dynamic"

// GET → { role: "owner" | "coach" | "cs" | null }. null = logged in before roles existed: log in again.
export async function GET() {
  return NextResponse.json({ role: await getRole() })
}
