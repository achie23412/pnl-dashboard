"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function ProfitLossPage() {
  return (
    <PageShell
      title="Profit & Loss"
      breadcrumb="Back End → Finance → Profit & Loss"
      description="Full P&L per store for any date range. Revenue minus ad spend, COGS, payment fees, refunds, chargebacks, and other costs. The bottom line is your real profit."
      filters
      stats={[
        { label: "Revenue", value: "€0.00" },
        { label: "Ad Spend", value: "€0.00" },
        { label: "COGS", value: "€0.00" },
        { label: "Fees & Refunds", value: "€0.00" },
        { label: "Net Profit", value: "€0.00", color: "var(--green)" },
      ]}
      tabs={[
        { label: "Summary", active: true },
        { label: "By Store" },
        { label: "By Product" },
        { label: "Daily Breakdown" },
      ]}
    >
      <GlassTable
        headers={["Date", "Store", "Revenue", "Ad Spend", "COGS", "Payment Fees", "Refunds", "Chargebacks", "Other Costs", "Net Profit", "Margin"]}
        emptyMessage="No P&L data loaded yet."
      />
    </PageShell>
  )
}
