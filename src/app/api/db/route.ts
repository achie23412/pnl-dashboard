// Database access for pages, through the logged-in server instead of the public Supabase key.
// Only the tables and actions below are allowed; middleware already requires a valid session.
import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

type Op = "select" | "insert" | "update" | "delete"
const ALLOWED: Record<string, Op[]> = {
  daily_revenue: ["select"],
  daily_spend: ["select"],
  daily_cogs: ["select"],
  daily_sessions: ["select"],
  store_settings: ["select"],
  refunds: ["select"],
  refresh_log: ["select"],
  research: ["select", "insert"],
  competitors: ["select", "insert", "update", "delete"],
  product_tests: ["select", "insert", "update", "delete"],
}
const FILTERS = ["eq", "gte", "lte", "in"] as const
type Filter = [(typeof FILTERS)[number], string, unknown]
const COLUMN = /^[a-z_][a-z0-9_]*$/

type Body = {
  table: string
  op: Op
  columns?: string
  filters?: Filter[]
  order?: { column: string; ascending?: boolean; nullsFirst?: boolean }[]
  limit?: number
  values?: Record<string, unknown> | Record<string, unknown>[]
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Body | null
  if (!b || !ALLOWED[b.table]?.includes(b.op)) return NextResponse.json({ data: null, error: { message: "Not allowed" } }, { status: 403 })
  const filters = b.filters || []
  if (!filters.every((f) => Array.isArray(f) && FILTERS.includes(f[0]) && COLUMN.test(String(f[1])))) {
    return NextResponse.json({ data: null, error: { message: "Bad filter" } }, { status: 400 })
  }
  // Never change or delete a whole table by accident
  if ((b.op === "update" || b.op === "delete") && !filters.some((f) => f[0] === "eq")) {
    return NextResponse.json({ data: null, error: { message: "update/delete needs an eq filter" } }, { status: 400 })
  }

  const table = getServiceClient().from(b.table)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any =
    b.op === "select" ? table.select(typeof b.columns === "string" && b.columns ? b.columns : "*")
    : b.op === "insert" ? table.insert(b.values ?? {})
    : b.op === "update" ? table.update(b.values ?? {})
    : table.delete()
  for (const [op, col, val] of filters) q = op === "in" ? q.in(col, Array.isArray(val) ? val : [val]) : q[op](col, val)
  if (b.op === "select") {
    for (const o of b.order || []) if (COLUMN.test(o.column)) q = q.order(o.column, { ascending: o.ascending ?? true, nullsFirst: o.nullsFirst })
    if (b.limit) q = q.limit(Math.min(Number(b.limit) || 1000, 20000))
  }
  const { data, error } = await q
  return NextResponse.json({ data: data ?? null, error: error ? { message: error.message, code: error.code } : null }, { status: error ? 500 : 200 })
}
