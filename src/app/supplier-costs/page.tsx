"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function SupplierCostsPage() {
  return (
    <PageShell
      title="Supplier Costs"
      breadcrumb="Back End → Finance → Supplier Costs"
      description="Total spent per supplier over time. See which suppliers cost the most, track price changes, and spot when a supplier raises prices without notice."
      filters
      stats={[
        { label: "Total Suppliers", value: "0" },
        { label: "Total Spent (30d)", value: "$0.00" },
        { label: "Avg Cost/Unit", value: "$0.00" },
        { label: "Price Increases", value: "0", color: "var(--orange)" },
      ]}
    >
      <GlassTable
        headers={["Supplier", "Products", "Units (30d)", "Total Cost (30d)", "Avg Unit Cost", "Previous Avg", "Change", "Last Invoice"]}
        emptyMessage="No supplier cost data yet."
      />
    </PageShell>
  )
}
