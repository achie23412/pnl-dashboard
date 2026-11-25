import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { categoryOf, timing, MONTHS, COUNTRY_STORES, indexTitles, coveredBy } from "@/lib/season-keywords"
import { liveTitles } from "@/lib/live-titles"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type DbKeyword = { country: string; keyword: string; category: string | null; months: number[]; avg_monthly: number; uploaded_at: string; source?: string | null }

async function allKeywords(country?: string): Promise<DbKeyword[]> {
  const db = getServiceClient()
  const out: DbKeyword[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from("season_keywords").select("country,keyword,category,months,avg_monthly,uploaded_at,source").range(from, from + 999)
    if (country) q = q.eq("country", country)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    out.push(...((data || []) as DbKeyword[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// GET ?country=US → keywords + suggestions
// GET ?view=calendar → "list by" events per country and month (for the Calendar and the to-do list)
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  try {
    if (p.get("view") === "calendar") {
      const kws = await allKeywords()
      const today = new Date()
      const events: { date: string; label: string; type: "prep" | "launch"; note: string; store?: string }[] = []
      for (const country of Object.keys(COUNTRY_STORES)) {
        const list = kws.filter((k) => k.country === country)
        if (!list.length) continue
        const titles = indexTitles((await liveTitles(COUNTRY_STORES[country])).map((t) => t.title))
        for (let i = 0; i < 12; i++) {
          const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))
          const m = d.getUTCMonth()
          const toList = list.filter((k) => { const t = timing(k.months); return !t.evergreen && t.listBy === m && coveredBy(k.keyword, titles) === 0 })
          const toPush = list.filter((k) => { const t = timing(k.months); return !t.evergreen && t.pushFrom === m })
          const date = d.toISOString().slice(0, 10)
          const top = (arr: DbKeyword[]) => arr.slice().sort((a, b) => b.avg_monthly - a.avg_monthly).slice(0, 6).map((k) => k.keyword).join(", ")
          if (toList.length) events.push({ date, type: "prep", label: `List ${toList.length} season keywords (${country})`, store: COUNTRY_STORES[country].join(", "), note: `Season Board: demand starts climbing in ${MONTHS[(m + 1) % 12]}; list now so the products get indexed. Missing in the store: ${top(toList)}${toList.length > 6 ? "…" : ""}.` })
          if (toPush.length) events.push({ date, type: "launch", label: `Push budget on ${toPush.length} season keywords (${country})`, store: COUNTRY_STORES[country].join(", "), note: `Season Board: the climb starts this month for ${top(toPush)}${toPush.length > 6 ? "…" : ""}.` })
        }
      }
      return NextResponse.json({ events })
    }

    const country = p.get("country") || "US"
    const db = getServiceClient()
    const [kws, sug, titles] = await Promise.all([
      allKeywords(country),
      db.from("season_keyword_suggestions").select("*").order("created_at", { ascending: false }).limit(200),
      liveTitles(COUNTRY_STORES[country] || []),
    ])
    if (sug.error) throw new Error(sug.error.message)
    return NextResponse.json({
      country,
      keywords: kws,
      updatedAt: kws.reduce((a, k) => (k.uploaded_at > a ? k.uploaded_at : a), ""),
      suggestions: sug.data || [],
      stores: COUNTRY_STORES[country] || [],
      titles, // live product titles per store, for coverage
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST {action:"upload", country, rows:[{keyword, months, avg}], replace?:boolean}
// POST {action:"suggest", keyword, country, category, why}
export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = getServiceClient()
  try {
    if (body.action === "upload") {
      const country = String(body.country || "")
      if (!COUNTRY_STORES[country]) throw new Error("Unknown country")
      const rows = (body.rows || []) as { keyword: string; months: number[]; avg: number }[]
      if (!rows.length) throw new Error("No keywords in the file")
      if (body.replace) await db.from("season_keywords").delete().eq("country", country)
      const now = new Date().toISOString()
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({
          country,
          keyword: String(r.keyword).slice(0, 200),
          category: categoryOf(r.keyword),
          months: (r.months || []).slice(0, 12).map((v) => Math.max(0, Math.round(Number(v) || 0))),
          avg_monthly: Math.round(Number(r.avg) || 0),
          // "keyword_planner+trends" = volumes from Keyword Planner, monthly pattern from Google Trends
          source: body.source === "keyword_planner+trends" ? "keyword_planner+trends" : "keyword_planner",
          uploaded_at: now,
        }))
        const { error } = await db.from("season_keywords").upsert(chunk, { onConflict: "country,keyword" })
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true, saved: rows.length })
    }
    if (body.action === "suggest") {
      if (!body.keyword || !body.country) throw new Error("keyword and country required")
      const { data, error } = await db.from("season_keyword_suggestions").insert({
        keyword: String(body.keyword).toLowerCase().slice(0, 200),
        country: String(body.country),
        category: body.category || categoryOf(String(body.keyword)),
        why: body.why ? String(body.why).slice(0, 500) : null,
      }).select().single()
      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

// PATCH {id, status: "approved"|"rejected", note}
export async function PATCH(req: NextRequest) {
  const { id, status, note } = await req.json()
  if (!id || !["approved", "rejected", "pending"].includes(status)) return NextResponse.json({ error: "id and status required" }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db.from("season_keyword_suggestions")
    .update({ status, note: note || null, decided_at: status === "pending" ? null : new Date().toISOString() })
    .eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

