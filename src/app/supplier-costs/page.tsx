"use client"
import { PageShell } from "@/components/PageShell"

export default function SupplierCostsPage() {
  return (
    <PageShell
      title="Supplier Costs"
      breadcrumb="Finance → Supplier Costs"
      description="Track and compare supplier pricing across products. See cost trends and identify savings opportunities."
      stats={[
        { label: "Active suppliers", value: "4" },
        { label: "Avg COGS/unit", value: "$8.50" },
        { label: "Cost change (30d)", value: "-2.1%", color: "var(--green)" },
        { label: "Products tracked", value: "48" },
      ]}
    >
      <div className="glass rounded-xl p-6">
        <div className="text-center py-12">
          <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Supplier cost data from ShipGoods</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Connect ShipGoods API to see per-supplier cost breakdowns.</div>
        </div>
      </div>
    </PageShell>
  )
}
