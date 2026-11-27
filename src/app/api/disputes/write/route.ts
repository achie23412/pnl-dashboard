import { NextRequest, NextResponse } from "next/server"
import { writeResponse } from "@/lib/dispute-writer"
import { getRole } from "@/lib/auth-role"
import type { EvidencePack } from "@/lib/dispute-evidence"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST { pack } (Owner) → Claude writes the chargeback response from the evidence pack the page already
// built. Returns the text for the editor; nothing is saved or sent.
export async function POST(req: NextRequest) {
  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Only the Owner can do this." }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const pack = b.pack as EvidencePack | undefined
  if (!pack?.fields || !Array.isArray(pack.checks)) return NextResponse.json({ error: "pack required" }, { status: 400 })
  try {
    return NextResponse.json(await writeResponse(pack))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
