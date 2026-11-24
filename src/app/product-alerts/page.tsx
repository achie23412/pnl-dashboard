"use client"
import { PageShell } from "@/components/PageShell"

export default function ProductAlertsPage() {
  return (
    <PageShell
      title="Product Alerts"
      breadcrumb="Front End → Product Alerts"
      description="Automated alerts when a product crosses a threshold: refund rate spike, stock warning, margin drop, or competitor price change."
      stats={[
        { label: "Active alerts", value: "—" },
        { label: "Resolved today", value: "—" },
        { label: "Critical", value: "—" },
        { label: "Products monitored", value: "—" },
      ]}
    >
      <div className="space-y-2">
        {[
          { level: "Critical", product: "Women's Wedding Guest Maxi Dress", msg: "Refund rate hit 10.5% — above 8% threshold", time: "2h ago", color: "var(--red)" },
          { level: "Warning", product: "Men's Faux Leather Blazer", msg: "Margin dropped below 30% after COGS increase", time: "5h ago", color: "var(--orange)" },
          { level: "Info", product: "Women's Cable Knit Cardigan", msg: "Competitor lowered price by 15%", time: "1d ago", color: "var(--blue)" },
        ].map((a, i) => (
          <div key={i} className="glass rounded-xl px-4 py-3 flex items-center gap-3" style={{ borderLeft: `3px solid ${a.color}` }}>
            <div className="flex-1">
              <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{a.product}</div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{a.msg}</div>
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>{a.time}</div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: `${a.color}20`, color: a.color }}>{a.level}</span>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
