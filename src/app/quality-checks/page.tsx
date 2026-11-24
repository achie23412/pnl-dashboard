"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function QualityChecksPage() {
  return (
    <PageShell
      title="Quality Checks"
      breadcrumb="Back End → Customer Service → Quality Checks"
      description="Products with 5+ units sold are tracked here. A product is flagged when it hits ≥10% quality refund rate AND ≥20 units sold. The supplier is asked for photos, video, size chart, sizing recommendation, and visual match percentage."
      filters
      stats={[
        { label: "Products Tracked", value: "0" },
        { label: "Flagged", value: "0", color: "var(--red)" },
        { label: "Supplier Asked", value: "0", color: "var(--orange)" },
        { label: "Resolved", value: "0", color: "var(--green)" },
      ]}
      tabs={[
        { label: "All Tracked", count: 0, active: true },
        { label: "Flagged", count: 0 },
        { label: "Waiting for Supplier", count: 0 },
        { label: "Resolved", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Product", "Store", "Units Sold", "Quality Refunds", "Refund Rate", "Supplier Status", "Photos", "Size Chart", "Visual Match", "Action"]}
        emptyMessage="No products flagged yet. Products appear once they hit the threshold (≥10% quality refund rate + ≥20 units)."
      />
    </PageShell>
  )
}
