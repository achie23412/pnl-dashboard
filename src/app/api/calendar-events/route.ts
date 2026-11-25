import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export async function GET() {
  const db = getServiceClient()
  const { data, error } = await db
    .from("calendar_events")
    .select("*")
    .order("date", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, label, type, store, note } = body

  if (!date || !label || !type) {
    return NextResponse.json({ error: "date, label, type required" }, { status: 400 })
  }

  const db = getServiceClient()
  const { data, error } = await db
    .from("calendar_events")
    .insert({ date, label, type, store: store || null, note: note || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const db = getServiceClient()
  const { error } = await db.from("calendar_events").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
