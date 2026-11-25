"use client"
// Finance → Refund Report. Amounts come from Shopify (the daily `refunds` sync),
// the WHY (reason, products, type) from the CS refund log (Customer Service → Refunds).
// Refund rate = refunded value ÷ revenue, per store in its own currency, overall in EUR.
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@supabase/supabase-js"
import { PageShell } from "@/components/PageShell"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORE_CURRENCY, fetchEurRates, toEur, type Currency, type EurRates } from "@/lib/currency"
import { reasonLabel, money, type CsRefund } from "@/lib/cs-log"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const TARGET = 5 // % of revenue
const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
const pct = (n: number | null) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(1)}%`)
const cur = (s: string): Currency => STORE_CURRENCY[s] || "EUR"
const digits = (id: string | null | undefined) => (id ? (String(id).match(/(\d+)\D*$/)?.[1] ?? "") : "")

type Rev = { date: string; store: string; revenue: number; orders: number }
type Ref = { date: string; store: string; amount: number; order_id: string | null; source: string | null }

export default function RefundReportPage() {
  const [days, setDays] = useState("30")
  const [rev, setRev] = useState<Rev[]>([])
  const [refunds, setRefunds] = useState<Ref[]>([])
  const [log, setLog] = useState<CsRefund[]>([])
  const [rates, setRates] = useState<EurRates | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  const from = day(Number(days) - 1)
  const to = day(0)

  useEffect(() => {
    setLoading(true)
    const errs: string[] = []
    Promise.all([
      supabase.from("daily_revenue").select("date,store,revenue,orders").gte("date", from).limit(5000),
      supabase.from("refunds").select("date,store,amount,order_id,source").gte("date", from).limit(5000),
      fetch("/api/cs-log?kind=refund").then((r) => r.json()),
      fetchEurRates(from, to),
    ])
      .then(([r, f, l, x]) => {
        if (r.error) errs.push(`revenue: ${r.error.message}`)
        if (f.error) errs.push(`Shopify refunds: ${f.error.message}`)
        if (l.error) errs.push(`CS refund log: ${l.error}`)
        setRev((r.data || []) as Rev[])
        setRefunds((f.data || []) as Ref[])
        setLog(((l.rows || []) as CsRefund[]).filter((y) => y.refund_date >= from))
        setRates(x)
      })
      .catch((e: unknown) => errs.push(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setErrors(errs)
        setLoading(false)
      })
  }, [from, to])

  const eur = (amount: number, store: string, date: string) => (rates ? toEur(amount, cur(store), date, rates) : amount)

  const byStore = useMemo(() => {
    const m = new Map<string, { store: string; revenue: number; orders: number; refunded: number; refundsN: number; logged: number }>()
    const row = (s: string) => {
      if (!m.has(s)) m.set(s, { store: s, revenue: 0, orders: 0, refunded: 0, refundsN: 0, logged: 0 })
      return m.get(s)!
    }
    for (const r of rev) {
      row(r.store).revenue += Number(r.revenue) || 0
      row(r.store).orders += Number(r.orders) || 0
    }
    for (const r of refunds) {
      row(r.store).refunded += Number(r.amount) || 0
      row(r.store).refundsN += 1
    }
    for (const r of log) row(r.store).logged += 1
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue)
  }, [rev, refunds, log])

  const totals = useMemo(() => {
    const revenue = rev.reduce((a, r) => a + eur(Number(r.revenue) || 0, r.store, r.date), 0)
    const refunded = refunds.reduce((a, r) => a + eur(Number(r.amount) || 0, r.store, r.date), 0)
    return { revenue, refunded, rate: revenue > 0 ? (refunded / revenue) * 100 : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, refunds, rates])

  const byReason = useMemo(() => {
    const m = new Map<string, { n: number; eur: number; full: number }>()
    for (const r of log) {
      const x = m.get(r.reason) || { n: 0, eur: 0, full: 0 }
      x.n += 1
      x.eur += eur(Number(r.amount) || 0, r.store, r.refund_date)
      if (r.refund_type === "full") x.full += 1
      m.set(r.reason, x)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, rates])

  const byProduct = useMemo(() => {
    const m = new Map<string, { title: string; store: string; refunds: number; qty: number; reasons: Record<string, number> }>()
    for (const r of log) {
      const list = r.items.length ? r.items : [{ title: "(no product logged)", qty: 0, price: 0, variant: null, product_id: null }]
      for (const i of list) {
        const k = `${r.store}::${i.title}`
        const x = m.get(k) || { title: i.title, store: r.store, refunds: 0, qty: 0, reasons: {} }
        x.refunds += 1
        x.qty += i.qty
        x.reasons[r.reason] = (x.reasons[r.reason] || 0) + 1
        m.set(k, x)
      }
    }
    return Array.from(m.values()).sort((a, b) => b.refunds - a.refunds).slice(0, 15)
  }, [log])

  // Shopify refunds that CS hasn't logged yet (matched on the Shopify order id).
  const shopifyRefunds = refunds.filter((r) => r.source === "shopify")
  const unlogged = useMemo(() => {
    const logged = new Set(log.map((r) => digits(r.shopify_order_id)).filter(Boolean))
    return shopifyRefunds.filter((r) => digits(r.order_id) && !logged.has(digits(r.order_id))).sort((a, b) => b.date.localeCompare(a.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refunds, log])

  const loggedTotal = log.length
  const rateTone = totals.rate == null ? undefined : totals.rate > TARGET ? "var(--red)" : "var(--green)"

  return (
    <PageShell
      title="Refund Report"
      breadcrumb="Finance → Refund Report"
      description="Refund rate per store against the 5% target, why customers get refunded (from the CS refund log) and which products cause it."
      stats={[
        { label: `Refund rate (${days}d)`, value: loading ? "—" : pct(totals.rate), color: rateTone, sub: `target below ${TARGET}% of revenue` },
        { label: `Refunded (${days}d)`, value: loading ? "—" : `€${Math.round(totals.refunded).toLocaleString("en-IE")}`, sub: `${refunds.length} refunds in Shopify` },
        { label: "Logged by CS", value: loading ? "—" : `${loggedTotal} / ${shopifyRefunds.length}`, sub: "refunds with a reason" },
        { label: "Top reason", value: loading ? "—" : byReason[0] ? reasonLabel(byReason[0][0]) : "—", sub: byReason[0] ? `${byReason[0][1].n} of ${loggedTotal} logged` : undefined },
      ]}
      actions={<PillSelect label="Period" value={days} onChange={setDays} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} align="right" />}
    >
      {errors.length > 0 && <Notice tone="error">Couldn&apos;t load everything: {errors.join(" · ")}</Notice>}
      {loading && rev.length === 0 ? (
        <Loading>Loading refunds…</Loading>
      ) : (
        <>
          <Panel title="Refund rate per store" sub="Refunded value ÷ revenue, in each store's own currency. Refund amounts come from Shopify (daily sync)." pad={false} className="mb-4">
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Store</th>
                  <th className={`${TH} text-right`}>Revenue</th>
                  <th className={`${TH} text-right`}>Orders</th>
                  <th className={`${TH} text-right`}>Refunded</th>
                  <th className={`${TH} text-right`}>Refunds</th>
                  <th className={`${TH} text-right`}>Refund rate</th>
                  <th className={`${TH} text-right`}>Logged by CS</th>
                </tr>
              </thead>
              <tbody>
                {byStore.map((s) => {
                  const rate = s.revenue > 0 ? (s.refunded / s.revenue) * 100 : null
                  return (
                    <tr key={s.store} style={ROW_BORDER}>
                      <td className={TD} style={{ color: "var(--text)" }}>{s.store}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{money(s.revenue, cur(s.store))}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{s.orders}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{money(s.refunded, cur(s.store))}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{s.refundsN}</td>
                      <td className={`${TD} text-right`}>
                        {rate == null ? <span style={{ color: "var(--text-dim)" }}>—</span> : <Badge tone={rate > TARGET ? "red" : "green"}>{pct(rate)}</Badge>}
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: s.logged < s.refundsN ? "var(--orange)" : "var(--text-muted)" }}>{s.logged} / {s.refundsN}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Panel title="Why customers get refunded" sub="From the CS refund log." pad={false}>
              {byReason.length === 0 ? (
                <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No refunds logged in this period yet. CS logs them under Customer Service → Refunds.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Reason</th>
                      <th className={`${TH} text-right`}>Refunds</th>
                      <th className={`${TH} text-right`}>Share</th>
                      <th className={`${TH} text-right`}>Full</th>
                      <th className={`${TH} text-right`}>Value (EUR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byReason.map(([k, v]) => (
                      <tr key={k} style={ROW_BORDER}>
                        <td className={TD} style={{ color: "var(--text)" }}>{reasonLabel(k)}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{v.n}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{pct((v.n / loggedTotal) * 100)}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{v.full}</td>
                        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{money(v.eur, "EUR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Most refunded products" sub="From the CS refund log. Check quality or the listing for products at the top." pad={false}>
              {byProduct.length === 0 ? (
                <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No products logged in this period yet.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Product</th>
                      <th className={`${TH} text-right`}>Refunds</th>
                      <th className={`${TH} text-right`}>Units</th>
                      <th className={`${TH} text-left`}>Main reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProduct.map((p) => {
                      const main = Object.entries(p.reasons).sort((a, b) => b[1] - a[1])[0]
                      return (
                        <tr key={`${p.store}${p.title}`} style={ROW_BORDER}>
                          <td className={`${TD} max-w-[220px]`}>
                            <div className="truncate" style={{ color: "var(--text)" }}>{p.title}</div>
                            <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store}</div>
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{p.refunds}</td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{p.qty}</td>
                          <td className={TD} style={{ color: "var(--text-muted)" }}>{main ? reasonLabel(main[0]) : "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <FilterBar>
            <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Refunds in Shopify without a reason</span>
            <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Log these so the report knows why.</span>
          </FilterBar>
          {unlogged.length === 0 ? (
            <EmptyState title="Every Shopify refund in this period is logged">Nothing to catch up on.</EmptyState>
          ) : (
            <Panel pad={false}>
              <table className="w-full">
                <thead>
                  <tr style={{ color: "var(--text-dim)" }}>
                    <th className={`${TH} text-left`}>Date</th>
                    <th className={`${TH} text-left`}>Store</th>
                    <th className={`${TH} text-left`}>Shopify order id</th>
                    <th className={`${TH} text-right`}>Amount</th>
                    <th className={`${TH} text-right`}></th>
                  </tr>
                </thead>
                <tbody>
                  {unlogged.slice(0, 50).map((r, i) => (
                    <tr key={i} style={ROW_BORDER}>
                      <td className={TD} style={{ color: "var(--text)" }}>{fmtDay(r.date)}</td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.store}</td>
                      <td className={`${TD} text-[10px] tabular-nums`} style={{ color: "var(--text-muted)" }}>{digits(r.order_id)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{money(Number(r.amount), cur(r.store))}</td>
                      <td className={`${TD} text-right`}>
                        <Link href={`/refunds?store=${encodeURIComponent(r.store)}&order_id=${digits(r.order_id)}`} className="text-[10px] underline" style={{ color: "var(--accent)" }}>Log it</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}
