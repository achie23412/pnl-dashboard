"use client"
import { PageShell } from "@/components/PageShell"

export default function PriceDeductionsPage() {
  return (
    <PageShell
      title="Price Deductions"
      breadcrumb="Front End → Price Deductions"
      description="Volume-based price tiers from suppliers. Track when products hit the next discount tier."
      stats={[
        { label: "Products tracked", value: "—" },
        { label: "At tier 1 (20)", value: "—" },
        { label: "At tier 2 (60)", value: "—" },
        { label: "Near next tier", value: "—" },
      ]}
    />
  )
}
