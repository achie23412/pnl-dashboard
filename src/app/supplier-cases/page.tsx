"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function SupplierCasesPage() {
  return (
    <PageShell
      title="Supplier Cases"
      breadcrumb="Back End → Supply Chain → Supplier Cases"
      description="Open conversations with suppliers about order problems, quality issues, or missing shipments. Each case groups related order issues and tracks the supplier's response."
      filters
      stats={[
        { label: "Open Cases", value: "0" },
        { label: "Awaiting Reply", value: "0", color: "var(--orange)" },
        { label: "Resolved (7d)", value: "0", color: "var(--green)" },
        { label: "Escalated", value: "0", color: "var(--red)" },
      ]}
      tabs={[
        { label: "All Cases", count: 0, active: true },
        { label: "Open", count: 0 },
        { label: "Awaiting Supplier", count: 0 },
        { label: "Resolved", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Case #", "Supplier", "Type", "Products", "Orders Affected", "Opened", "Last Update", "Status", "Slack Link"]}
        emptyMessage="No supplier cases open."
      />
    </PageShell>
  )
}
