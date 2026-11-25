"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function SupplierCasesPage() {
  return (
    <PageShell
      title="Supplier Cases"
      breadcrumb="Supply Chain → Supplier Cases"
      description="Escalated supplier issues (quality disputes, missing shipments, price disagreements) and how far each case is."
      stats={[
        { label: "Open cases", value: "—" },
        { label: "Resolved (30d)", value: "—" },
        { label: "Avg resolution", value: "—" },
        { label: "Active suppliers", value: "—" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will list each open supplier case with its status, the problem and what we asked for (replacement batch,
        credit). Cases aren&apos;t stored in the dashboard yet, so nothing shows here.
      </EmptyState>
    </PageShell>
  )
}
