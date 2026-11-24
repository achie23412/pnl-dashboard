"use client"
import { PageShell } from "@/components/PageShell"

export default function ProfitLossPage() {
  return (
    <PageShell
      title="Profit & Loss"
      breadcrumb="Finance → Profit & Loss"
      description="Per-store and overall P&L with Windsor ad-account mapping. All amounts in EUR."
      stats={[
        { label: "Revenue", value: "—" },
        { label: "Ad Spend", value: "—" },
        { label: "COGS", value: "—" },
        { label: "Operating Profit", value: "—" },
        { label: "Avg ROAS", value: "—" },
      ]}
      filters
    />
  )
}
