"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function RiskyProductsPage() {
  return (
    <PageShell
      title="Risky Products"
      breadcrumb="Customer Service → Risky Products"
      description="Early warning: products with 2+ complaints in 7 days, so the supplier can be told."
      stats={[
        { label: "Risky now", value: "—" },
        { label: "Supplier notified", value: "—" },
        { label: "Cleared (30d)", value: "—" },
        { label: "Threshold", value: "2+ in 7 days", sub: "complaints per product" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will list each product that hits 2+ complaints in 7 days, with the complaint reasons and when the supplier
        was told. Complaint data isn&apos;t connected yet, so nothing shows here.
      </EmptyState>
    </PageShell>
  )
}
