import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

// Evidence files (photos, PDFs) for a logged refund, in the private "cs-evidence" bucket.
// POST multipart { refund_id, file, by } → adds to cs_refunds.attachments
// GET ?path=… → redirect to a 10-minute signed link
// DELETE ?refund_id=…&path=… → removes the file
const BUCKET = "cs-evidence"
const MAX = 4 * 1024 * 1024 // Vercel request limit is 4.5 MB
const OK = /^(image\/(jpeg|png|webp|gif|heic)|application\/pdf)$/

type Attachment = { path: string; name: string; type: string; size: number; uploaded_at: string; by: string | null }

export async function POST(req: Request) {
  const form = await req.formData()
  const id = Number(form.get("refund_id"))
  const file = form.get("file")
  const by = String(form.get("by") || "") || null
  if (!id || !(file instanceof File)) return NextResponse.json({ error: "Pick a file." }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: "File is over 4 MB. Make it smaller (e.g. a screenshot) and try again." }, { status: 400 })
  if (!OK.test(file.type)) return NextResponse.json({ error: "Only photos (JPG, PNG, WEBP, HEIC) or PDF." }, { status: 400 })
  const db = getServiceClient()
  const path = `refunds/${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`
  const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (up.error) return NextResponse.json({ error: `${up.error.message}. Run supabase/refund-control.sql once (it creates the evidence bucket).` }, { status: 500 })
  const cur = await db.from("cs_refunds").select("attachments").eq("id", id).single()
  const list = ((cur.data?.attachments || []) as Attachment[]).concat({ path, name: file.name, type: file.type, size: file.size, uploaded_at: new Date().toISOString(), by })
  const res = await db.from("cs_refunds").update({ attachments: list }).eq("id", id).select("*").single()
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  await db.from("cs_refund_history").insert({ refund_id: id, changed_by: by, action: "evidence_added", changes: { file: file.name } })
  return NextResponse.json({ row: res.data })
}

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") || ""
  if (!path.startsWith("refunds/")) return NextResponse.json({ error: "Bad path" }, { status: 400 })
  const { data, error } = await getServiceClient().storage.from(BUCKET).createSignedUrl(path, 600)
  if (error || !data) return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get("refund_id"))
  const path = sp.get("path") || ""
  const by = sp.get("by") || null
  if (!id || !path.startsWith(`refunds/${id}/`)) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const db = getServiceClient()
  await db.storage.from(BUCKET).remove([path])
  const cur = await db.from("cs_refunds").select("attachments").eq("id", id).single()
  const list = ((cur.data?.attachments || []) as Attachment[]).filter((a) => a.path !== path)
  const res = await db.from("cs_refunds").update({ attachments: list }).eq("id", id).select("*").single()
  await db.from("cs_refund_history").insert({ refund_id: id, changed_by: by, action: "evidence_removed", changes: { file: path.split("/").pop() } })
  return NextResponse.json({ row: res.data })
}
