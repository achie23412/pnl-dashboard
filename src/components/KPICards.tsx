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
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium ml-1" style={{ color }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
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
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium ml-1" style={{ color }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
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
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      <div className="flex items-baseline gap-1">
        <div className="text-2xl font-bold" style={{ color }}>
          {value}
        </div>
        {compare}
      </div>
      {sub && (
        <div
          className="text-xs mt-1"
          style={{ color: "var(--text-muted)" }}
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
  const refundColor = data.refundRate <= 3 ? "var(--green)" : data.refundRate <= 5 ? "var(--orange)" : "var(--red)"
  const estLabel =
    data.estCogs > 0
      ? ` · <span style="color:var(--orange)">~€${fmt(data.estCogs)} est.</span>`
      : ""
  const txnLabel = includeTxnFees && data.txnFees > 0
    ? ` · Fees -€${fmt(data.txnFees)}`
    : ""

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        title="Revenue"
        value={`€${fmt(data.revenue)}`}
        sub={`${fmt(data.orders)} orders · €${fmt(data.orders > 0 ? data.revenue / data.orders : 0)}/order`}
        color="#4E6AA7"
        compare={<CompareArrow current={data.revenue} previous={prevData?.revenue ?? null} />}
      />
      <KPICard
        title="Ad Spend"
        value={`€${fmt(data.spend)}`}
        sub={`ROAS ${data.roas.toFixed(2)}x`}
        color="#E8456B"
        compare={<CompareArrowInverse current={data.spend} previous={prevData?.spend ?? null} />}
      />
      <KPICard
        title="ROAS"
        value={`${data.roas.toFixed(2)}x`}
        sub={data.roas >= 2.5 ? "Healthy" : data.roas >= 1 ? "Break-even zone" : "Below break-even"}
        color={data.roas >= 2.5 ? "var(--green)" : data.roas >= 1 ? "var(--orange)" : "var(--red)"}
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
