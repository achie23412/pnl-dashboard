"use client"
import type { KPIData } from "@/lib/types"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function KPICard({
  title,
  value,
  sub,
  color,
}: {
  title: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
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

export function KPICards({ data }: { data: KPIData }) {
  const profitColor = data.profit >= 0 ? "var(--green)" : "var(--red)"
  const estLabel =
    data.estCogs > 0
      ? ` · <span style="color:var(--orange)">~$${fmt(data.estCogs)} est.</span>`
      : ""

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Revenue"
        value={`€${fmt(data.revenue)}`}
        sub={`${fmt(data.orders)} orders · €${fmt(data.orders > 0 ? data.revenue / data.orders : 0)}/order`}
        color="#4E6AA7"
      />
      <KPICard
        title="Ad Spend"
        value={`€${fmt(data.spend)}`}
        sub={`ROAS ${data.roas.toFixed(2)}x`}
        color="#E8456B"
      />
      <KPICard
        title="COGS (USD)"
        value={`$${fmt(data.cogs + data.estCogs)}`}
        sub={`$${fmt(data.orders > 0 ? (data.cogs + data.estCogs) / data.orders : 0, 2)}/order${estLabel}`}
        color="var(--orange)"
      />
      <KPICard
        title="Net Profit"
        value={`€${fmt(data.profit)}`}
        sub={`${data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : "0"}% margin`}
        color={profitColor}
      />
    </div>
  )
}
