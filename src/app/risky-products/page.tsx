"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function RiskyProductsPage() {
  return (
    <PageShell
      title="Risky Products"
      breadcrumb="Back End → Customer Service → Risky Products"
      description="Products with 2+ complaints in the last 7 days. The supplier is asked what went wrong. The owner decides: keep, fix, or draft the product. Decisions are posted to Slack."
      filters
      stats={[
        { label: "Risky Products", value: "0" },
        { label: "Awaiting Decision", value: "0", color: "var(--orange)" },
        { label: "Drafted", value: "0", color: "var(--red)" },
        { label: "Fixed", value: "0", color: "var(--green)" },
      ]}
      tabs={[
        { label: "Active", count: 0, active: true },
        { label: "Awaiting Supplier", count: 0 },
        { label: "Decided", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Product", "Store", "Complaints (7d)", "Total Complaints", "Supplier Status", "Owner Decision", "Slack Posted", "Last Updated"]}
        emptyMessage="No risky products right now. Products with 2+ complaints in 7 days appear here."
      />
    </PageShell>
  )
}
