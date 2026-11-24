"use client"
import { PageShell } from "@/components/PageShell"

export default function CogsInvoicesPage() {
  return (
    <PageShell
      title="COGS Invoices"
      breadcrumb="Finance → COGS Invoices"
      description="Supplier invoices for COGS confirmation. Match ShipGoods data with actual invoices."
      stats={[
        { label: "Pending confirmation", value: "—" },
        { label: "Confirmed this month", value: "—" },
        { label: "Total invoiced", value: "—" },
        { label: "COGS changes (7d)", value: "—" },
      ]}
    />
  )
}
