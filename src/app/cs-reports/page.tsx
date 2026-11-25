"use client"
// Customer Service → Reports. Built from the CS log (Refunds + Store Credit pages).
// A "case" is one logged refund or store credit. "Kept the sale" = the customer took
// store credit or a partial refund instead of a full refund (the funnel worked).
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { PillSelect } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { SHOPIFY_STORES } from "@/lib/constants"
import { fetchEurRates, toEur, type Currency, type EurRates } from "@/lib/currency"
import { reasonLabel, money, type CsRefund, type CsStoreCredit } from "@/lib/cs-log"

type Case = {
  kind: "full" | "partial" | "credit"
  date: string
  store: string
  reason: string
  eur: number
  by: string
  products: string[]
}

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—")
const asCur = (c: string): Currency => (c === "USD" || c === "GBP" ? c : "EUR")
// "Women's Lace Bodice Midi Dress – …" → "dress"
const productType = (title: string) => {
  const head = title.split(/\s[–—|-]\s/)[0].toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/)
  const w = head[head.length - 1] || "other"
  return w.endsWith("es") && w.length > 5 ? w.slice(0, -2) : w.endsWith("s") && w.length > 4 && !w.endsWith("ss") ? w.slice(0, -1) : w
}

type Row = { key: string; cases: number; full: number; partial: number; credit: number; eur: number }
function group(cases: Case[], keyOf: (c: Case) => string[]): Row[] {
  const m = new Map<string, Row>()
  for (const c of cases) {
    for (const key of keyOf(c)) {
      const r = m.get(key) || { key, cases: 0, full: 0, partial: 0, credit: 0, eur: 0 }
      r.cases += 1
      r[c.kind] += 1
      r.eur += c.eur
      m.set(key, r)
    }
  }
  return Array.from(m.values()).sort((a, b) => b.cases - a.cases)
}

function Breakdown({ title, sub, rows, label }: { title: string; sub?: string; rows: Row[]; label: (k: string) => string }) {
  return (
    <Panel title={title} sub={sub} pad={false}>
      {rows.length === 0 ? (
        <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>Nothing logged in this period.</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--text-dim)" }}>
              <th className={`${TH} text-left`}></th>
              <th className={`${TH} text-right`}>Cases</th>
              <th className={`${TH} text-right`}>Full</th>
              <th className={`${TH} text-right`}>Partial</th>
              <th className={`${TH} text-right`}>Credit</th>
              <th className={`${TH} text-right`}>Kept sale</th>
              <th className={`${TH} text-right`}>Value (EUR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const kept = r.cases > 0 ? (r.partial + r.credit) / r.cases : 0
              return (
                <tr key={r.key} style={ROW_BORDER}>
                  <td className={`${TD} max-w-[200px] truncate`} style={{ color: "var(--text)" }}>{label(r.key)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{r.cases}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.full}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.partial}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.credit}</td>
                  <td className={`${TD} text-right`}><Badge tone={kept >= 0.5 ? "green" : kept > 0 ? "amber" : "red"}>{pct(r.partial + r.credit, r.cases)}</Badge></td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{money(r.eur, "EUR")}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

export default function CSReportsPage() {
  const [days, setDays] = useState("30")
  const [stores, setStores] = useState<FilterValue>(EMPTY_FILTER)
  const [refunds, setRefunds] = useState<CsRefund[]>([])
  const [credits, setCredits] = useState<CsStoreCredit[]>([])
  const [rates, setRates] = useState<EurRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/cs-log?kind=refund").then((r) => r.json()),
      fetch("/api/cs-log?kind=credit").then((r) => r.json()),
      fetchEurRates(day(120), day(0)),
    ])
      .then(([a, b, x]) => {
        if (a.error || b.error) setError(a.error || b.error)
        setRefunds(a.rows || [])
        setCredits(b.rows || [])
        setRates(x)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const from = day(Number(days) - 1)
  const cases: Case[] = useMemo(() => {
    const eur = (n: number, c: string, d: string) => (rates ? toEur(n, asCur(c), d, rates) : n)
    const list: Case[] = [
      ...refunds.map((r) => ({
        kind: r.refund_type as "full" | "partial",
        date: r.refund_date,
        store: r.store,
        reason: r.reason,
        eur: eur(Number(r.amount) || 0, r.currency, r.refund_date),
        by: r.logged_by || "(no name)",
        products: r.items.map((i) => i.title),
      })),
      ...credits.map((c) => ({
        kind: "credit" as const,
        date: c.issue_date,
        store: c.store,
        reason: c.reason,
        eur: eur(Number(c.amount) || 0, c.currency, c.issue_date),
        by: c.logged_by || "(no name)",
        products: [],
      })),
    ]
    return list.filter((c) => c.date >= from && passes(stores, c.store))
  }, [refunds, credits, rates, from, stores])

  const kept = cases.filter((c) => c.kind !== "full").length
  const byReason = group(cases, (c) => [c.reason])
  const byStore = group(cases, (c) => [c.store])
  const byType = group(cases.filter((c) => c.products.length), (c) => Array.from(new Set(c.products.map(productType))))
  const byPerson = group(cases, (c) => [c.by])
  const creditsInPeriod = credits.filter((c) => c.issue_date >= from && passes(stores, c.store))
  const used = creditsInPeriod.filter((c) => c.status === "used").length

  // Cases per week (oldest → newest), for a quick trend.
  const weeks = useMemo(() => {
    const n = Math.ceil(Number(days) / 7)
    return Array.from({ length: n }, (_, i) => {
      const end = day(i * 7)
      const start = day(i * 7 + 6)
      const inWeek = cases.filter((c) => c.date >= start && c.date <= end)
      return { label: new Date(start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), n: inWeek.length, kept: inWeek.filter((c) => c.kind !== "full").length }
    }).reverse()
  }, [cases, days])
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n))

  return (
    <PageShell
      title="Reports"
      breadcrumb="Customer Service → Reports"
      description="What CS handled: cases per reason, store, product type and team member, and how often the funnel kept the sale (store credit or partial refund instead of a full refund)."
      stats={[
        { label: `Cases (${days}d)`, value: loading ? "—" : String(cases.length), sub: "refunds + store credits logged" },
        { label: "Kept the sale", value: loading ? "—" : pct(kept, cases.length), sub: `${kept} credit or partial`, color: cases.length ? (kept / cases.length >= 0.5 ? "var(--green)" : "var(--orange)") : undefined },
        { label: "Top reason", value: loading ? "—" : byReason[0] ? reasonLabel(byReason[0].key) : "—", sub: byReason[0] ? `${byReason[0].cases} cases` : undefined },
        { label: "Store credit used", value: loading ? "—" : creditsInPeriod.length ? `${used} / ${creditsInPeriod.length}` : "—", sub: "credits given in this period" },
      ]}
      actions={
        <>
          <FilterSelect label="Store" options={Object.keys(SHOPIFY_STORES)} value={stores} onChange={setStores} />
          <PillSelect label="Period" value={days} onChange={setDays} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} align="right" />
        </>
      }
    >
      {error && <Notice tone="error">Couldn&apos;t load the CS log: {error}</Notice>}
      {loading ? (
        <Loading>Loading CS cases…</Loading>
      ) : cases.length === 0 ? (
        <EmptyState title="No cases logged in this period">
          The report fills as CS logs refunds on <Link href="/refunds" className="underline">Refunds</Link> and credits on{" "}
          <Link href="/store-credit" className="underline">Store Credit</Link>. Refund rate against revenue is on the{" "}
          <Link href="/refund-report" className="underline">Refund Report</Link>.
        </EmptyState>
      ) : (
        <>
          <Panel title="Cases per week" sub="Bar = cases logged, green part = sale kept (credit or partial)." className="mb-4">
            <div className="flex items-end gap-2 h-[110px]">
              {weeks.map((w) => (
                <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>{w.n || ""}</span>
                  <div className="w-full rounded-t flex flex-col justify-end overflow-hidden" style={{ height: `${(w.n / maxWeek) * 70}px`, background: "rgba(239,68,68,0.35)" }}>
                    <div style={{ height: `${w.n ? (w.kept / w.n) * 100 : 0}%`, background: "rgba(74,222,128,0.6)" }} />
                  </div>
                  <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{w.label}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Breakdown title="By reason" rows={byReason} label={reasonLabel} />
            <Breakdown title="By store" sub="Refund rate against revenue: see the Refund Report." rows={byStore} label={(k) => k} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="By product type" sub="From the products ticked on each refund." rows={byType} label={(k) => k.charAt(0).toUpperCase() + k.slice(1)} />
            <Breakdown title="By team member" sub="From “Logged by” on each case." rows={byPerson} label={(k) => k} />
          </div>
        </>
      )}
    </PageShell>
  )
}
