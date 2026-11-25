"use client"
import type { RevenueRow, SpendRow, SessionsRow } from "@/lib/types"

const GOOGLE_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]

type Props = {
  store: string
  revenue: RevenueRow[] // this store, EUR, whole window
  spend: SpendRow[]
  sessions: SessionsRow[]
  baselineFrom: string
  recentFrom: string
  todayStr: string
  recentDays: number
  baselineDays: number
  breakevenRoas: number
}

type Period = {
  revenue: number
  spend: number
  orders: number
  sessions: number
  sessionOrders: number
}

const eur = (n: number) => `€${n.toLocaleString("en-IE", { maximumFractionDigits: n < 100 ? 2 : 0 })}`
const pct = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : b > 0 ? Infinity : 0)
const fmtPct = (p: number) => (!Number.isFinite(p) ? "new" : `${p > 0 ? "+" : ""}${p.toFixed(0)}%`)

export function analyseRoasDrop(p: Props) {
  const inRecent = (d: string) => d >= p.recentFrom && d < p.todayStr
  const inBaseline = (d: string) => d >= p.baselineFrom && d < p.recentFrom

  const period = (inP: (d: string) => boolean): Period => {
    const rev = p.revenue.filter((r) => inP(r.date))
    const ses = p.sessions.filter((r) => inP(r.date) && r.sessions > 0)
    const sesDays = new Set(ses.map((r) => r.date))
    return {
      revenue: rev.reduce((a, r) => a + r.revenue, 0),
      orders: rev.reduce((a, r) => a + r.orders, 0),
      spend: p.spend.filter((r) => inP(r.date)).reduce((a, r) => a + r.spend, 0),
      sessions: ses.reduce((a, r) => a + r.sessions, 0),
      sessionOrders: rev.filter((r) => sesDays.has(r.date)).reduce((a, r) => a + r.orders, 0),
    }
  }
  const b = period(inBaseline)
  const r = period(inRecent)

  const perDay = (x: Period, days: number) => ({
    revenue: x.revenue / days,
    spend: x.spend / days,
    orders: x.orders / days,
    aov: x.orders > 0 ? x.revenue / x.orders : 0,
    cpa: x.orders > 0 ? x.spend / x.orders : Infinity,
    roas: x.spend > 0 ? x.revenue / x.spend : 0,
    cvr: x.sessions > 0 ? (x.sessionOrders / x.sessions) * 100 : null,
  })
  const B = perDay(b, p.baselineDays)
  const R = perDay(r, p.recentDays)

  // Spend per ad account (per day) — where did the money go?
  const accounts = new Map<string, { label: string; before: number; recent: number }>()
  for (const s of p.spend) {
    const key = `${s.channel}|${s.account}`
    const a = accounts.get(key) || { label: `${s.channel} · ${s.account}`, before: 0, recent: 0 }
    if (inBaseline(s.date)) a.before += s.spend / p.baselineDays
    if (inRecent(s.date)) a.recent += s.spend / p.recentDays
    accounts.set(key, a)
  }
  const accountRows = Array.from(accounts.values())
    .filter((a) => a.before > 0.5 || a.recent > 0.5)
    .sort((x, y) => Math.abs(y.recent - y.before) - Math.abs(x.recent - x.before))

  // Day by day
  const dates: string[] = []
  for (let d = new Date(p.baselineFrom + "T00:00:00Z"); d.toISOString().slice(0, 10) < p.todayStr; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  const days = dates.map((date) => {
    const rev = p.revenue.filter((x) => x.date === date)
    const revenue = rev.reduce((a, x) => a + x.revenue, 0)
    const orders = rev.reduce((a, x) => a + x.orders, 0)
    const spendRows = p.spend.filter((x) => x.date === date)
    const spend = spendRows.reduce((a, x) => a + x.spend, 0)
    const noData = rev.length === 0 && spendRows.length === 0
    return { date, revenue, orders, spend, noData, roas: spend > 0 ? revenue / spend : null, recent: inRecent(date) }
  })
  const missingRecent = days.filter((d) => d.recent && d.noData).map((d) => d.date.slice(5))

  // ── Why: ROAS = AOV ÷ cost per order. Which side moved more?
  const why: string[] = []
  const cpaChange = Number.isFinite(B.cpa) && Number.isFinite(R.cpa) ? R.cpa / B.cpa : null
  const aovChange = B.aov > 0 && R.aov > 0 ? R.aov / B.aov : null

  if (r.orders === 0) {
    why.push(`No orders at all in the last ${p.recentDays} days while ${eur(r.spend)} was spent. That alone explains the drop.`)
  } else if (cpaChange && aovChange) {
    const cpaWeight = Math.abs(Math.log(cpaChange))
    const aovWeight = Math.abs(Math.log(aovChange))
    if (cpaWeight >= aovWeight && cpaChange > 1) {
      why.push(
        `Main cause: each order got more expensive. Cost per order went from ${eur(B.cpa)} to ${eur(R.cpa)} (${fmtPct((cpaChange - 1) * 100)}).` +
          (aovWeight > 0.05 ? ` Average order value also moved ${fmtPct((aovChange - 1) * 100)} (${eur(B.aov)} → ${eur(R.aov)}).` : ""),
      )
    } else if (aovChange < 1) {
      why.push(
        `Main cause: orders got smaller. Average order value fell from ${eur(B.aov)} to ${eur(R.aov)} (${fmtPct((aovChange - 1) * 100)}), while cost per order went ${eur(B.cpa)} → ${eur(R.cpa)}.`,
      )
    } else {
      why.push(`Cost per order went ${eur(B.cpa)} → ${eur(R.cpa)} and average order value ${eur(B.aov)} → ${eur(R.aov)}.`)
    }
    // ROAS = order value ÷ cost per order, so the ROAS change = (order value change) × (1 ÷ cost per order change).
    const fromCpa = (1 / cpaChange - 1) * 100
    const fromAov = (aovChange - 1) * 100
    const net = ((aovChange / cpaChange) - 1) * 100
    const part = (v: number, what: string) =>
      `${what} ${v < 0 ? "pulled ROAS down" : "pushed ROAS up"} ${Math.abs(v).toFixed(0)}%`
    why.push(
      `The maths (ROAS = order value ÷ cost per order): ${part(fromCpa, "cost per order")}, ${part(fromAov, "order value")}, net ${fmtPct(net)}.`,
    )
  }

  const spendCh = pct(B.spend, R.spend)
  const ordersCh = pct(B.orders, R.orders)
  const spendLine = `Spend per day ${eur(B.spend)} → ${eur(R.spend)} (${fmtPct(spendCh)}), orders per day ${B.orders.toFixed(1)} → ${R.orders.toFixed(1)} (${fmtPct(ordersCh)}).`
  if (spendCh >= 15 && ordersCh < spendCh - 10) {
    why.push(`How: budget went up but sales didn't keep pace. ${spendLine} The extra spend bought fewer sales per euro.`)
  } else if (Math.abs(spendCh) < 15 && ordersCh <= -15) {
    why.push(`How: same budget, fewer sales. ${spendLine}`)
  } else if (spendCh <= -15 && ordersCh < spendCh) {
    why.push(`How: spend was cut, but orders fell even faster. ${spendLine}`)
  } else {
    why.push(spendLine)
  }

  const top = accountRows[0]
  if (top && Math.abs(top.recent - top.before) >= 5) {
    why.push(
      `Biggest spend change: ${top.label}, ${eur(top.before)} → ${eur(top.recent)} per day (${fmtPct(pct(top.before, top.recent))}).`,
    )
  }

  if (B.cvr !== null && R.cvr !== null) {
    why.push(`Conversion rate (human sessions) ${B.cvr.toFixed(2)}% → ${R.cvr.toFixed(2)}%.`)
  }

  const recentDays = days.filter((d) => d.recent && d.spend > 0)
  const worst = recentDays.slice().sort((x, y) => (x.roas ?? 0) - (y.roas ?? 0))[0]
  if (worst && recentDays.length > 1) {
    why.push(
      `Worst day: ${worst.date.slice(5)} at ${(worst.roas ?? 0).toFixed(2)}x (${eur(worst.spend)} spent, ${worst.orders} order${worst.orders === 1 ? "" : "s"}).`,
    )
  }

  if (missingRecent.length > 0) {
    why.push(
      `No revenue or spend rows at all for ${missingRecent.join(", ")}: either ads were off with no sales, or that day hasn't synced yet. Those days still count in the per-day averages.`,
    )
  }

  if (r.orders > 0 && r.orders < 6) {
    why.push(`Careful: only ${r.orders} order${r.orders === 1 ? "" : "s"} in the last ${p.recentDays} days. With so few orders, one sale more or less moves ROAS a lot.`)
  }

  // ── Status vs break-even and what the playbook says
  const be = p.breakevenRoas
  const status = !Number.isFinite(be)
    ? "Break-even ROAS unknown (no COGS data)."
    : R.roas < be
      ? `At ${R.roas.toFixed(2)}x the store is below its break-even of ${be.toFixed(2)}x, so ads are losing money right now.`
      : `At ${R.roas.toFixed(2)}x the store is still above its break-even of ${be.toFixed(2)}x (${((R.roas / be - 1) * 100).toFixed(0)}% headroom), so it's still profitable.`

  const isGoogle = GOOGLE_STORES.includes(p.store)
  const drop = B.roas > 0 ? (1 - R.roas / B.roas) * 100 : 0
  const rule = isGoogle
    ? drop >= 50
      ? "Google Ads SOP (OAK × Ascend): a 50%+ dip means scaling the budget back 15%, and checking product exclusions ($25 spent + ROAS < 1.8)."
      : "Google Ads SOP (OAK × Ascend): don't raise the budget until there are 2–3 days in a row on target ROAS (2.5), and check product exclusions ($25 spent + ROAS < 1.8)."
    : "Simo's scaling rule: only double the budget when spend is over $60 and total, today and yesterday net profit are all over 20%. Below that, don't scale. Use the per-product kill rules for tests."

  return { B, R, accountRows, days, why, status, rule }
}

export function RoasAlertDetail(props: Props & { color: string }) {
  const { B, R, accountRows, days, why, status, rule } = analyseRoasDrop(props)
  const be = props.breakevenRoas

  const metric = (label: string, before: string, recent: string, change: number | null, good: "up" | "down" | "neutral") => {
    const moved = change !== null && Number.isFinite(change) && good !== "neutral"
    const isBad = moved && (good === "up" ? change! < -5 : change! > 5)
    const isGood = moved && (good === "up" ? change! > 5 : change! < -5)
    return (
      <tr key={label} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <td className="py-1.5 pr-3" style={{ color: "var(--text-dim)" }}>{label}</td>
        <td className="py-1.5 px-3 text-right tabular-nums">{before}</td>
        <td className="py-1.5 px-3 text-right tabular-nums">{recent}</td>
        <td
          className="py-1.5 pl-3 text-right tabular-nums font-medium"
          style={{ color: isBad ? "var(--red)" : isGood ? "var(--green)" : "var(--text-dim)" }}
        >
          {change === null ? "—" : fmtPct(change)}
        </td>
      </tr>
    )
  }

  return (
    <div className="px-4 pb-4 pt-1 text-[11px]" style={{ color: "var(--text)" }}>
      <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: props.color }}>Why it happened</div>
        <ul className="space-y-1 list-disc pl-4">
          {why.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
        <div className="mt-2.5 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div>{status}</div>
          <div className="mt-1" style={{ color: "var(--text-dim)" }}>{rule}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            Per day: {props.baselineDays} days before vs last {props.recentDays} days
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className="text-left font-medium pb-1"></th>
                <th className="text-right font-medium pb-1 px-3">Before</th>
                <th className="text-right font-medium pb-1 px-3">Last {props.recentDays}d</th>
                <th className="text-right font-medium pb-1 pl-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {metric("ROAS", `${B.roas.toFixed(2)}x`, `${R.roas.toFixed(2)}x`, pct(B.roas, R.roas), "up")}
              {metric("Spend / day", eur(B.spend), eur(R.spend), pct(B.spend, R.spend), "neutral")}
              {metric("Revenue / day", eur(B.revenue), eur(R.revenue), pct(B.revenue, R.revenue), "up")}
              {metric("Orders / day", B.orders.toFixed(1), R.orders.toFixed(1), pct(B.orders, R.orders), "up")}
              {metric("Avg order value", B.aov ? eur(B.aov) : "—", R.aov ? eur(R.aov) : "—", B.aov && R.aov ? pct(B.aov, R.aov) : null, "up")}
              {metric(
                "Cost per order",
                Number.isFinite(B.cpa) ? eur(B.cpa) : "no orders",
                Number.isFinite(R.cpa) ? eur(R.cpa) : "no orders",
                Number.isFinite(B.cpa) && Number.isFinite(R.cpa) ? pct(B.cpa, R.cpa) : null,
                "down",
              )}
              {B.cvr !== null && R.cvr !== null &&
                metric("Conversion rate", `${B.cvr.toFixed(2)}%`, `${R.cvr.toFixed(2)}%`, pct(B.cvr, R.cvr), "up")}
            </tbody>
          </table>

          {accountRows.length > 0 && (
            <>
              <div className="text-[9px] font-semibold uppercase tracking-wider mt-3 mb-1.5" style={{ color: "var(--text-dim)" }}>
                Spend per day by ad account
              </div>
              <table className="w-full">
                <tbody>
                  {accountRows.map((a) =>
                    metric(a.label, eur(a.before), eur(a.recent), pct(a.before, a.recent), "neutral"),
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            Day by day {Number.isFinite(be) ? `(break-even ${be.toFixed(2)}x)` : ""}
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className="text-left font-medium pb-1">Date</th>
                <th className="text-right font-medium pb-1 px-2">Spend</th>
                <th className="text-right font-medium pb-1 px-2">Revenue</th>
                <th className="text-right font-medium pb-1 px-2">Orders</th>
                <th className="text-right font-medium pb-1 pl-2">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr
                  key={d.date}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: d.recent ? "rgba(255,255,255,0.03)" : undefined,
                  }}
                >
                  <td className="py-1 pr-2" style={{ color: d.recent ? "var(--text)" : "var(--text-dim)" }}>
                    {d.date.slice(5)}{d.recent ? " •" : ""}{d.noData ? " (no data)" : ""}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{eur(d.spend)}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{eur(d.revenue)}</td>
                  <td className="py-1 px-2 text-right tabular-nums">{d.orders}</td>
                  <td
                    className="py-1 pl-2 text-right tabular-nums font-medium"
                    style={{
                      color: d.roas === null ? "var(--text-dim)" : Number.isFinite(be) && d.roas < be ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {d.roas === null ? "—" : `${d.roas.toFixed(2)}x`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
            • = last {props.recentDays} days. Today is left out because it isn&apos;t over yet. ROAS here is blended: all Shopify
            revenue ÷ all ad spend for this store, not per campaign.
          </div>
        </div>
      </div>
    </div>
  )
}
