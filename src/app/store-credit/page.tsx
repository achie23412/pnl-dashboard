"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function StoreCreditPage() {
  return (
    <PageShell
      title="Store Credit"
      breadcrumb="Back End → Customer Service → Store Credit"
      description="Track discount codes and gift cards given instead of refunds. Each row shows the code, amount, customer, reason, and whether it has been used. Status: To issue → Issued → Used."
      filters
      stats={[
        { label: "To Issue", value: "0", color: "var(--orange)" },
        { label: "Issued", value: "0", color: "var(--blue)" },
        { label: "Used", value: "0", color: "var(--green)" },
        { label: "Total Value", value: "€0.00" },
      ]}
      tabs={[
        { label: "All", count: 0, active: true },
        { label: "To Issue", count: 0 },
        { label: "Issued", count: 0 },
        { label: "Used", count: 0 },
      ]}
    >
      <div className="p-6">
        <button
          className="px-4 py-2 rounded-lg text-[11px] font-medium mb-6"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + Add Store Credit
        </button>
        <GlassTable
          headers={["Code", "Customer", "Store", "Amount", "Reason", "Status", "Issued Date", "Used Date", "Evidence"]}
          emptyMessage="No store credits yet."
        />
      </div>
    </PageShell>
  )
}
