"use client"
import type { KPIData } from "@/lib/types"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function CompareArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return null
  const up = pct > 0
  const color = up ? "var(--green)" : "var(--red)"
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color }}>
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  )
}

function CompareArrowInverse({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return null
  const up = pct > 0
  const color = up ? "var(--red)" : "var(--green)"
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color }}>
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  )
}

function KPICard({
  title,
  value,
  sub,
  color,
  compare,
}: {
  title: string
  value: string
  sub?: string
  color: string
  compare?: React.ReactNode
}) {
  return (
    <div className="glass rounded-xl p-5 transition-colors hover:bg-[rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {title}
        </div>
        {compare}
      </div>
      <div className="text-2xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px] mt-1.5"
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
    ? ` · Fees -€${fmt(data.txnFees)}`
    : ""

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        title="Revenue"
        value={`€${fmt(data.revenue)}`}
        sub={`${fmt(data.orders)} orders · €${fmt(data.orders > 0 ? data.revenue / data.orders : 0)}/order`}
        color="var(--text)"
        compare={<CompareArrow current={data.revenue} previous={prevData?.revenue ?? null} />}
      />
      <KPICard
        title="Ad Spend"
        value={`€${fmt(data.spend)}`}
        sub={`ROAS ${data.roas.toFixed(2)}x`}
        color="var(--text)"
        compare={<CompareArrowInverse current={data.spend} previous={prevData?.spend ?? null} />}
      />
      <KPICard
        title="ROAS"
        value={`${data.roas.toFixed(2)}x`}
        sub={data.roas >= 2.5 ? "Healthy" : data.roas >= 1 ? "Break-even zone" : "Below break-even"}
        color={roasColor}
        compare={<CompareArrow current={data.roas} previous={prevData?.roas ?? null} />}
      />
      <KPICard
        title="Refund Rate"
        value={`${data.refundRate.toFixed(1)}%`}
        sub={`€${fmt(data.refundAmount)} refunded · Target <5%`}
        color={refundColor}
        compare={<CompareArrowInverse current={data.refundRate} previous={prevData?.refundRate ?? null} />}
      />
      <KPICard
        title="COGS"
        value={`€${fmt(data.cogs + data.estCogs)}`}
        sub={`${data.cogsPercent.toFixed(1)}% of rev${estLabel}`}
        color="var(--orange)"
      />
      <KPICard
        title="Net Profit"
        value={`€${fmt(data.profit)}`}
        sub={`${data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : "0"}% margin${txnLabel}`}
        color={profitColor}
        compare={<CompareArrow current={data.profit} previous={prevData?.profit ?? null} />}
      />
    </div>
  )
}
