"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function FulfillmentRisksPage() {
  return (
    <PageShell
      title="Fulfillment Risks"
      breadcrumb="Back End → Supply Chain → Fulfillment Risks"
      description="Products and suppliers with fulfillment problems: high failure rate, slow shipping, frequent customer complaints about delivery. Flagged automatically when thresholds are crossed."
      filters
      stats={[
        { label: "High Risk Products", value: "0" },
        { label: "Risky Suppliers", value: "0", color: "var(--red)" },
        { label: "Avg Delivery Days", value: "0" },
        { label: "Fulfillment Rate", value: "0%" },
      ]}
      tabs={[
        { label: "All Risks", count: 0, active: true },
        { label: "Products", count: 0 },
        { label: "Suppliers", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Product/Supplier", "Type", "Store", "Issue", "Orders Affected", "Failure Rate", "Avg Delivery", "Flagged Since", "Action"]}
        emptyMessage="No fulfillment risks flagged. Risks appear when failure rates exceed thresholds."
      />
    </PageShell>
  )
}
