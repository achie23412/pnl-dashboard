"use client"
// Profit & Loss in the exact model of the Ascend "Profit Sheet" (Setup / month tabs / Year Overview):
// PROFIT = Gross Revenue − Refunds − Cost of Goods − Ad Spend − Media Buyer Fee − Transaction Fee
// Filled from the dashboard's own data instead of typing it in by hand.
import { useEffect, useMemo, useState } from "react"
import { db } from "@/lib/db-client"
import { PageShell } from "@/components/PageShell"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Notice, Loading, SectionLabel, TH, TD, ROW_BORDER } from "@/components/ui"
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE } from "@/lib/constants"
import { mediaBuyerRate } from "@/lib/fee-settings"
import { useFeeSettings } from "@/lib/use-fee-settings"
import { STORE_CURRENCY, COGS_CURRENCY, AD_SPEND_CURRENCY, FALLBACK_RATES, fetchEurRates, toEur, type EurRates } from "@/lib/currency"

// Database reads go through our logged-in server (/api/db), not the public Supabase key
const supabase = db

// Transaction fee as the sheet's Setup tab. The media buyer fee comes from Store Settings (from its start date).
const SHEET_STORES = ["Susan & Allen", "Carter & Collins", "Walsh & Farley"]
const ALL_STORES = [...SHEET_STORES, "LUMEGLASSES", "Blinky"]
const FEES: Record<string, { mediaBuyer: number; txn: number }> = {
  "Susan & Allen": { mediaBuyer: 0.1, txn: 0.06 },
  "Carter & Collins": { mediaBuyer: 0.1, txn: 0.06 },
  "Walsh & Farley": { mediaBuyer: 0.1, txn: 0.06 },
  LUMEGLASSES: { mediaBuyer: 0, txn: TRANSACTION_FEE_RATE.LUMEGLASSES ?? 0.029 },
  Blinky: { mediaBuyer: 0, txn: TRANSACTION_FEE_RATE.Blinky ?? 0.029 },
}
// The sheet's year runs Sep 2026 – Aug 2027
const YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 8 + i, 1)).toISOString().slice(0, 7))

type Row = { gross: number; refunds: number; cogs: number; cogsEst: number; ad: number; orders: number }
type Line = Row & { net: number; mb: number; txn: number; profitBefore: number; profit: number; roas: number | null; grossRoas: number | null; profitPct: number | null; cogPct: number | null }
type Raw = {
  rev: { date: string; store: string; revenue: number; orders: number }[]
  sp: { date: string; store: string; spend: number }[]
  cg: { date: string; store: string; cogs: number }[]
  ref: { date: string; store: string; amount: number }[]
}

const empty = (): Row => ({ gross: 0, refunds: 0, cogs: 0, cogsEst: 0, ad: 0, orders: 0 })
const add = (a: Row, b: Row): Row => ({ gross: a.gross + b.gross, refunds: a.refunds + b.refunds, cogs: a.cogs + b.cogs, cogsEst: a.cogsEst + b.cogsEst, ad: a.ad + b.ad, orders: a.orders + b.orders })

function finish(r: Row, fees: { mb: number; txn: number }): Line {
  const net = r.gross - r.refunds
  const profitBefore = r.gross - r.cogs - r.ad - fees.mb - fees.txn
  const profit = profitBefore - r.refunds
  return {
    ...r, net, mb: fees.mb, txn: fees.txn, profitBefore, profit,
    roas: r.ad > 0 ? net / r.ad : null,
    grossRoas: r.ad > 0 ? r.gross / r.ad : null,
    profitPct: r.gross > 0 ? (profit / r.gross) * 100 : null,
    cogPct: r.gross > 0 ? (r.cogs / r.gross) * 100 : null,
  }
}

const monthLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
const eur = (n: number) => (Math.abs(n) < 0.005 ? "–" : `${n < 0 ? "−" : ""}€${Math.abs(n).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const eur0 = (n: number) => `${n < 0 ? "−" : ""}€${Math.abs(Math.round(n)).toLocaleString("en-IE")}`
const pct = (n: number | null) => (n === null ? "" : `${n.toFixed(1)}%`)
const xr = (n: number | null) => (n === null ? "" : `${n.toFixed(2)}x`)

export default function ProfitLossPage() {
  const feeSettings = useFeeSettings()
  const thisMonth = new Date().toISOString().slice(0, 7)
  // Default = the 3 Google stores (the profit sheet). "all" = every store with data.
  const [storeF, setStoreF] = useState<FilterValue>({ mode: "include", values: SHEET_STORES })
  const [month, setMonth] = useState(thisMonth)
  const [raw, setRaw] = useState<Raw | null>(null)
  const [rates, setRates] = useState<EurRates>(FALLBACK_RATES)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [rev, sp, cg, ref] = await Promise.all([
          supabase.from("daily_revenue").select("date,store,revenue,orders").gte("date", "2026-09-01").order("date").limit(10000),
          supabase.from("daily_spend").select("date,store,spend").gte("date", "2026-09-01").order("date").limit(10000),
          supabase.from("daily_cogs").select("date,store,cogs").gte("date", "2026-09-01").order("date").limit(10000),
          supabase.from("refunds").select("date,store,amount").gte("date", "2026-09-01").order("date").limit(10000),
        ])
        const err = rev.error || sp.error || cg.error || ref.error
        if (err) throw new Error(err.message)
        setRaw({ rev: (rev.data || []) as Raw["rev"], sp: (sp.data || []) as Raw["sp"], cg: (cg.data || []) as Raw["cg"], ref: (ref.data || []) as Raw["ref"] })
        setRates(await fetchEurRates("2026-09-01", new Date().toISOString().slice(0, 10)))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  // Per store per day, in EUR
  const byStoreDay = useMemo(() => {
    const m = new Map<string, Row>()
    if (!raw) return m
    const get = (s: string, d: string) => {
      const k = `${s}|${d}`
      if (!m.has(k)) m.set(k, empty())
      return m.get(k)!
    }
    for (const r of raw.rev) {
      const row = get(r.store, r.date)
      row.gross += toEur(Number(r.revenue) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates)
      row.orders += Number(r.orders) || 0
    }
    for (const r of raw.sp) get(r.store, r.date).ad += toEur(Number(r.spend) || 0, AD_SPEND_CURRENCY, r.date, rates)
    for (const r of raw.ref) get(r.store, r.date).refunds += toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates)
    const cogsDays = new Set<string>()
    for (const r of raw.cg) {
      get(r.store, r.date).cogs += toEur(Number(r.cogs) || 0, COGS_CURRENCY, r.date, rates)
      cogsDays.add(`${r.store}|${r.date}`)
    }
    // No COGS row for a day with orders → estimate from the average COGS per order
    m.forEach((row, k) => {
      if (!cogsDays.has(k) && row.orders > 0) {
        const [s, d] = k.split("|")
        const est = row.orders * toEur(AVG_COGS_PER_ORDER[s] || 0, COGS_CURRENCY, d, rates)
        row.cogs += est
        row.cogsEst += est
      }
    })
    return m
  }, [raw, rates])

  // Store list comes from the data, so a new store shows up here without a code change
  const dataStores = useMemo(() => {
    const seen = new Set<string>()
    byStoreDay.forEach((_, k) => seen.add(k.split("|")[0]))
    const known = ALL_STORES.filter((s) => seen.has(s))
    return [...known, ...Array.from(seen).filter((s) => !ALL_STORES.includes(s)).sort()]
  }, [byStoreDay])
  const storesInScope = (dataStores.length ? dataStores : ALL_STORES).filter((s) => passes(storeF, s))

  const lineFor = (stores: string[], inDate: (d: string) => boolean): Line => {
    let total = empty()
    let mb = 0
    let txn = 0
    byStoreDay.forEach((row, k) => {
      const [s, d] = k.split("|")
      if (!stores.includes(s) || !inDate(d)) return
      total = add(total, row)
      mb += row.ad * mediaBuyerRate(feeSettings, s, d)
      txn += row.gross * (FEES[s]?.txn ?? 0)
    })
    return finish(total, { mb, txn })
  }

  const inMonth = (m: string) => (d: string) => d.startsWith(m)
  const storeLines = storesInScope.map((s) => ({ store: s, line: lineFor([s], inMonth(month)) }))
  const monthTotal = lineFor(storesInScope, inMonth(month))
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const today = new Date().toISOString().slice(0, 10)
  const dayLines = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)
    .filter((d) => d <= today)
    .map((d) => ({ date: d, line: lineFor(storesInScope, (v) => v === d) }))
  const yearLines = YEAR_MONTHS.filter((m) => m <= thisMonth).map((m) => ({
    month: m,
    line: lineFor(storesInScope, inMonth(m)),
    byStore: storesInScope.map((s) => lineFor([s], inMonth(m)).profit),
  }))
  const yearTotal = lineFor(storesInScope, (d) => d >= "2026-09-01" && d < "2027-09-01")
  const firstData = raw?.rev[0]?.date
  const monthsWithData = YEAR_MONTHS.filter((m) => m <= thisMonth)

  const cols: { key: string; label: string; fmt: (l: Line) => string; color?: (l: Line) => string | undefined }[] = [
    { key: "gross", label: "Gross revenue", fmt: (l) => eur(l.gross) },
    { key: "refunds", label: "Refunds", fmt: (l) => eur(l.refunds), color: (l) => (l.refunds > 0 ? "var(--red)" : undefined) },
    { key: "net", label: "Net revenue", fmt: (l) => eur(l.net) },
    { key: "cogs", label: "Cost of goods", fmt: (l) => eur(l.cogs) + (l.cogsEst > 0.005 ? "*" : "") },
    { key: "ad", label: "Ad spend", fmt: (l) => eur(l.ad) },
    { key: "mb", label: "Media buyer fee", fmt: (l) => eur(l.mb) },
    { key: "txn", label: "Transaction fee", fmt: (l) => eur(l.txn) },
    { key: "pb", label: "Profit before refunds", fmt: (l) => eur(l.profitBefore) },
    { key: "profit", label: "Profit", fmt: (l) => eur(l.profit), color: (l) => (l.profit > 0.005 ? "var(--green)" : l.profit < -0.005 ? "var(--red)" : undefined) },
    { key: "roas", label: "ROAS", fmt: (l) => xr(l.roas) },
    { key: "groas", label: "Gross ROAS", fmt: (l) => xr(l.grossRoas) },
    { key: "ppct", label: "Profit %", fmt: (l) => pct(l.profitPct), color: (l) => (l.profitPct === null ? undefined : l.profitPct >= 0 ? "var(--green)" : "var(--red)") },
    { key: "cpct", label: "COG %", fmt: (l) => pct(l.cogPct) },
  ]

  const table = (head: string, rows: { label: string; line: Line; dim?: boolean }[], total?: { label: string; line: Line }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] whitespace-nowrap">
        <thead>
          <tr style={{ color: "var(--text-dim)" }}>
            <th className={`${TH} text-left`}>{head}</th>
            {cols.map((c) => <th key={c.key} className={`${TH} text-right`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ ...ROW_BORDER, opacity: r.dim ? 0.45 : 1 }}>
              <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{r.label}</td>
              {cols.map((c) => <td key={c.key} className={`${TD} text-right tabular-nums`} style={{ color: c.color?.(r.line) || "var(--text-muted)" }}>{c.fmt(r.line)}</td>)}
            </tr>
          ))}
          {total && (
            <tr style={{ borderTop: "2px solid rgba(255,255,255,0.12)" }}>
              <td className={`${TD} font-bold`} style={{ color: "var(--text)" }}>{total.label}</td>
              {cols.map((c) => <td key={c.key} className={`${TD} text-right font-bold tabular-nums`} style={{ color: c.color?.(total.line) || "var(--text)" }}>{c.fmt(total.line)}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  const t = monthTotal
  const isGoogle = storeF.mode === "include" && storeF.values.length === SHEET_STORES.length && SHEET_STORES.every((s) => storeF.values.includes(s))
  const scopeLabel = !storeF.values.length ? "all stores" : isGoogle ? "Google stores" : storesInScope.length <= 2 ? storesInScope.join(" + ") : `${storesInScope.length} stores`

  return (
    <PageShell
      title="Profit & Loss"
      breadcrumb="Finance → Profit & Loss"
      description="Built on the Ascend profit sheet: same columns, same fees (Google stores: transaction fee 6% of gross revenue; media buyer fee from its start date in Store Settings). Filled automatically from Shopify revenue, Windsor ad spend, refunds and COGS. All amounts in EUR."
      stats={raw ? [
        { label: `Gross revenue · ${monthLabel(month)}`, value: eur0(t.gross), sub: `${t.orders} orders · ${scopeLabel}` },
        { label: "Ad spend", value: eur0(t.ad), sub: `+ ${eur0(t.mb)} media buyer fee` },
        { label: "Cost of goods", value: eur0(t.cogs), sub: t.cogPct !== null ? `${t.cogPct.toFixed(1)}% of revenue` : "" },
        { label: "Profit", value: eur0(t.profit), sub: t.profitPct !== null ? `${t.profitPct.toFixed(1)}% of revenue` : "", color: t.profit >= 0 ? "var(--green)" : "var(--red)" },
        { label: "ROAS", value: t.roas !== null ? `${t.roas.toFixed(2)}x` : "—", sub: t.grossRoas !== null ? `gross ${t.grossRoas.toFixed(2)}x` : "" },
      ] : [
        { label: "Gross revenue", value: "—" }, { label: "Ad spend", value: "—" }, { label: "Cost of goods", value: "—" }, { label: "Profit", value: "—" }, { label: "ROAS", value: "—" },
      ]}
    >
      <FilterBar>
        <FilterSelect
          label="Stores"
          options={(dataStores.length ? dataStores : ALL_STORES).map((st) => ({ value: st, label: SHEET_STORES.includes(st) ? `${st} (Google)` : st }))}
          value={storeF}
          onChange={setStoreF}
        />
        <PillSelect
          label="Month"
          value={month}
          onChange={setMonth}
          options={monthsWithData.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load profit data: {error}.</Notice>}
      {!raw && !error && <Loading>Loading revenue, ad spend, refunds and COGS…</Loading>}

      {raw && (
        <>
          <Panel title={`${monthLabel(month)} by store`} sub="In EUR" className="mb-4">
            {table("Store", storeLines.map((s) => ({ label: s.store, line: s.line, dim: s.line.gross === 0 && s.line.ad === 0 })), { label: "Month total", line: monthTotal })}
          </Panel>

          <Panel title={`Day by day: ${scopeLabel}`} className="mb-4">
            {table("Date", dayLines.slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
              label: new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
              line: d.line,
              dim: d.line.gross === 0 && d.line.ad === 0,
            })))}
          </Panel>

          <Panel title="Year overview (Sep 2026 – Aug 2027)" className="mb-4">
            {table("Month", yearLines.map((y) => ({ label: monthLabel(y.month), line: y.line, dim: y.line.gross === 0 && y.line.ad === 0 })), { label: "Full year", line: yearTotal })}
            {storesInScope.length > 1 && (
              <div className="overflow-x-auto mt-4">
                <SectionLabel>Profit by store</SectionLabel>
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr style={{ color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Month</th>
                      {storesInScope.map((s) => <th key={s} className={`${TH} text-right`}>{s}</th>)}
                      <th className={`${TH} text-right`}>Combined</th>
                      <th className={`${TH} text-right`}>Best store</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearLines.map((y) => {
                      const hasAny = y.byStore.some((v) => Math.abs(v) > 0.005)
                      const best = hasAny ? storesInScope[y.byStore.indexOf(Math.max(...y.byStore))] : "–"
                      return (
                        <tr key={y.month} style={ROW_BORDER}>
                          <td className={TD} style={{ color: "var(--text)" }}>{monthLabel(y.month)}</td>
                          {y.byStore.map((v, i) => <td key={i} className={`${TD} text-right tabular-nums`} style={{ color: v > 0.005 ? "var(--green)" : v < -0.005 ? "var(--red)" : "var(--text-dim)" }}>{eur(v)}</td>)}
                          <td className={`${TD} text-right font-semibold tabular-nums`} style={{ color: y.line.profit >= 0 ? "var(--green)" : "var(--red)" }}>{eur(y.line.profit)}</td>
                          <td className={`${TD} text-right`} style={{ color: "var(--text-muted)" }}>{best}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="text-[10px] space-y-1" style={{ color: "var(--text-dim)" }}>
            <div>Same formulas as the Ascend profit sheet: net revenue = gross − refunds · profit before refunds = gross − cost of goods − ad spend − media buyer fee − transaction fee · profit = profit before refunds − refunds · ROAS = net ÷ ad spend · gross ROAS = gross ÷ ad spend.</div>
            <div>Fees: transaction 6% of gross revenue on the Google stores (Setup tab); media buyer fee (% of ad spend) only from the start date set in Store Settings. LUMEGLASSES and Blinky: transaction fee {(FEES.LUMEGLASSES.txn * 100).toFixed(1)}%.</div>
            <div>* Cost of goods with a star includes an estimate (average COGS per order) for days without ShipGoods COGS. The sheet currently types a flat 30%.</div>
            <div>Differences vs the sheet: amounts use the daily ECB rate (the sheet one rate per month); ad spend is the full Google Ads day from Windsor (the sheet&apos;s daily split is typed by hand). Dashboard data starts {firstData ? new Date(firstData + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "late Oct 2026"}, so September only exists in the sheet.</div>
          </div>
        </>
      )}
    </PageShell>
  )
}
