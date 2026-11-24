"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function OrderIssuesPage() {
  return (
    <PageShell
      title="Order Issues"
      breadcrumb="Back End → Supply Chain → Order Issues"
      description="Orders with fulfillment problems: wrong item shipped, missing item, damaged in transit, returned to sender. Each row links to the Shopify order and the supplier case."
      filters
      stats={[
        { label: "Open Issues", value: "0" },
        { label: "Awaiting Supplier", value: "0", color: "var(--orange)" },
        { label: "Resolved (7d)", value: "0", color: "var(--green)" },
        { label: "Avg Resolution Time", value: "0d" },
      ]}
      tabs={[
        { label: "All Issues", count: 0, active: true },
        { label: "Wrong Item", count: 0 },
        { label: "Missing", count: 0 },
        { label: "Damaged", count: 0 },
        { label: "Returned", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Order", "Store", "Customer", "Issue Type", "Product", "Supplier", "Reported", "Status", "Resolution"]}
        emptyMessage="No order issues reported yet."
      />
    </PageShell>
  )
}
