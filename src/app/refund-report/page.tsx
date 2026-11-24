"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function RefundReportPage() {
  return (
    <PageShell
      title="Refund Report"
      breadcrumb="Back End → Finance → Refund Report"
      description="All refunds per store. Shows refund rate against revenue, broken down by reason. Target: under 5%. High refund rates risk payment processor holds."
      filters
      stats={[
        { label: "Total Refunded", value: "€0.00" },
        { label: "Refund Rate", value: "0%", color: "var(--green)" },
        { label: "Top Reason", value: "—" },
        { label: "Refunds This Week", value: "0" },
      ]}
      tabs={[
        { label: "All Refunds", count: 0, active: true },
        { label: "By Reason", count: 0 },
        { label: "By Product", count: 0 },
        { label: "By Store", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Date", "Order", "Store", "Product", "Amount", "Reason", "Refund Type", "Status"]}
        emptyMessage="No refund data loaded yet."
      />
    </PageShell>
  )
}
