"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function CashflowPage() {
  return (
    <PageShell
      title="Cashflow & Balance"
      breadcrumb="Back End → Finance → Cashflow & Balance"
      description="Money in and money out. When Shopify pays out, when ad invoices are due, when supplier invoices hit. See your actual cash position per week."
      filters
      stats={[
        { label: "Cash Available", value: "€0.00" },
        { label: "Incoming (7d)", value: "€0.00", color: "var(--green)" },
        { label: "Outgoing (7d)", value: "€0.00", color: "var(--red)" },
        { label: "Net Forecast", value: "€0.00" },
      ]}
      tabs={[
        { label: "Overview", active: true },
        { label: "Payouts" },
        { label: "Invoices Due" },
        { label: "Forecast" },
      ]}
    >
      <GlassTable
        headers={["Date", "Type", "Description", "Store", "Amount", "Status", "Balance After"]}
        emptyMessage="No cashflow data yet. Connect payment processors and invoice sources."
      />
    </PageShell>
  )
}
