"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function CSReportsPage() {
  return (
    <PageShell
      title="Reports"
      breadcrumb="Customer Service → Reports"
      description="Refund rate per store, refunds by reason and by collection, funnel acceptance rate and store credit use."
      stats={[
        { label: "Avg acceptance rate", value: "—" },
        { label: "Top reason", value: "—" },
        { label: "Highest refund store", value: "—" },
        { label: "Store credit used", value: "—" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will show refund breakdowns by store, reason and collection, plus store credit use, once refund records are
        stored in the dashboard. Nothing is connected yet, so there are no numbers.
      </EmptyState>
    </PageShell>
  )
}
