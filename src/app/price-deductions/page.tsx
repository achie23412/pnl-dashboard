"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function PriceDeductionsPage() {
  return (
    <PageShell
      title="Price Deductions"
      breadcrumb="Back End → Customer Service → Price Deductions"
      description="When a product passes 20 / 60 / 120 units sold in a store, ask the supplier for a lower cost price. Click a tier to message the supplier and log the new price. Cost of goods fills itself from supplier invoices, and the lower cost improves the margin on Product Rules and Profit & Loss."
      filters
      stats={[
        { label: "To Request", value: "0" },
        { label: "Waiting for Supplier", value: "0", color: "var(--orange)" },
        { label: "New Price Logged", value: "0", color: "var(--green)" },
        { label: "Products Tracked", value: "0" },
      ]}
      tabs={[
        { label: "All", count: 0, active: true },
        { label: "To Request", count: 0 },
        { label: "Waiting", count: 0 },
        { label: "Logged", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Product", "Store", "Units Sold", "Supplier", "Tiers (20+ / 60+ / 120+)", "Current Cost", "New Cost", "Date", "Status"]}
        emptyMessage="No price deductions yet. Products appear once they pass 20 units sold."
      />
    </PageShell>
  )
}
