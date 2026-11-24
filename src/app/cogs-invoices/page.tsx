"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function COGSInvoicesPage() {
  return (
    <PageShell
      title="COGS Invoices"
      breadcrumb="Back End → Finance → COGS Invoices"
      description="Supplier invoices matched against orders. Each invoice row shows the products, quantities, unit costs, and whether the agreed price matches what was invoiced. Red lines mean the supplier charged more than the logged cost."
      filters
      stats={[
        { label: "Total Invoices", value: "0" },
        { label: "Total COGS", value: "$0.00" },
        { label: "Price Mismatches", value: "0", color: "var(--red)" },
        { label: "Pending Review", value: "0", color: "var(--orange)" },
      ]}
      tabs={[
        { label: "All Invoices", count: 0, active: true },
        { label: "Mismatches", count: 0 },
        { label: "Pending", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Invoice #", "Supplier", "Date", "Products", "Qty", "Invoice Amount", "Expected Amount", "Difference", "Status"]}
        emptyMessage="No invoices loaded yet. COGS invoices appear once supplier data is connected."
      />
    </PageShell>
  )
}
