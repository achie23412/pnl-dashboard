"use client"
import type { KPIData } from "@/lib/types"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function Delta({ current, previous, invert }: { current: number; previous: number | null; invert?: boolean }) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return null
  const up = pct > 0
  const good = invert ? !up : up
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
      style={{
        color: good ? "var(--green)" : "var(--red)",
        background: good ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
      }}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {up ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  revenue: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  spend: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  roas: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  refund: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
  cogs: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  profit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
}

function KPICard({
  title,
  icon,
  value,
  sub,
  valueColor,
  accentColor,
  delta,
}: {
  title: string
  icon: React.ReactNode
  value: string
  sub?: string
  valueColor: string
  accentColor: string
  delta?: React.ReactNode
}) {
  return (
    <div
      className="glass rounded-xl p-3.5 transition-colors hover:bg-[rgba(255,255,255,0.06)] relative overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div style={{ color: accentColor, opacity: 0.7 }}>{icon}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {title}
          </div>
        </div>
        {delta}
      </div>

      <div className="text-[20px] font-bold tracking-tight leading-none" style={{ color: valueColor }}>
        {value}
      </div>

      {sub && (
        <div
          className="text-[10px] mt-1.5"
          style={{ color: "var(--text-dim)" }}
          dangerouslySetInnerHTML={{ __html: sub }}
        />
      )}
    </div>
  )
}

export function KPICards({
  data,
  prevData,
  includeTxnFees,
}: {
  data: KPIData
  prevData?: KPIData | null
  includeTxnFees?: boolean
}) {
  const profitColor = data.profit >= 0 ? "var(--green)" : "var(--red)"
  const roasColor = data.roas >= 2.5 ? "var(--green)" : data.roas >= 1 ? "var(--orange)" : "var(--red)"
  const refundColor = data.refundRate <= 3 ? "var(--green)" : data.refundRate <= 5 ? "var(--orange)" : "var(--red)"
  const estLabel =
    data.estCogs > 0
      ? ` · <span style="color:var(--orange)">~€${fmt(data.estCogs)} est.</span>`
      : ""
  const txnLabel = includeTxnFees && data.txnFees > 0
    ? ` · Fees −€${fmt(data.txnFees)}`
    : ""

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        title="Revenue"
        icon={ICONS.revenue}
        value={`€${fmt(data.revenue)}`}
        sub={`${fmt(data.orders)} orders · €${fmt(data.orders > 0 ? data.revenue / data.orders : 0)}/order`}
        valueColor="var(--text)"
        accentColor="#4E6AA7"
        delta={<Delta current={data.revenue} previous={prevData?.revenue ?? null} />}
      />
      <KPICard
        title="Ad Spend"
        icon={ICONS.spend}
        value={`€${fmt(data.spend)}`}
        sub={`ROAS ${data.roas.toFixed(2)}x`}
        valueColor="var(--text)"
        accentColor="#E8456B"
        delta={<Delta current={data.spend} previous={prevData?.spend ?? null} invert />}
      />
      <KPICard
        title="ROAS"
        icon={ICONS.roas}
        value={`${data.roas.toFixed(2)}x`}
        sub={data.roas >= 2.5 ? "Healthy" : data.roas >= 1 ? "Break-even zone" : "Below break-even"}
        valueColor={roasColor}
        accentColor={roasColor === "var(--green)" ? "#34d399" : roasColor === "var(--orange)" ? "#D4903A" : "#f87171"}
        delta={<Delta current={data.roas} previous={prevData?.roas ?? null} />}
      />
      <KPICard
        title="Refund Rate"
        icon={ICONS.refund}
        value={`${data.refundRate.toFixed(1)}%`}
        sub={`€${fmt(data.refundAmount)} refunded · Target <5%`}
        valueColor={refundColor}
        accentColor={refundColor === "var(--green)" ? "#34d399" : "#f87171"}
        delta={<Delta current={data.refundRate} previous={prevData?.refundRate ?? null} invert />}
      />
      <KPICard
        title="COGS"
        icon={ICONS.cogs}
        value={`€${fmt(data.cogs + data.estCogs)}`}
        sub={`${data.cogsPercent.toFixed(1)}% of rev${estLabel}`}
        valueColor="var(--orange)"
        accentColor="#D4903A"
      />
      <KPICard
        title="Net Profit"
        icon={ICONS.profit}
        value={`€${fmt(data.profit)}`}
        sub={`${data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : "0"}% margin${txnLabel}`}
        valueColor={profitColor}
        accentColor={data.profit >= 0 ? "#34d399" : "#f87171"}
        delta={<Delta current={data.profit} previous={prevData?.profit ?? null} />}
      />
    </div>
  )
}
