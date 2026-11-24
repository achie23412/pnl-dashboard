"use client"
import { PageShell } from "@/components/PageShell"

export default function RefundsPage() {
  return (
    <PageShell
      title="Refunds"
      breadcrumb="Customer Service → Refunds"
      description="Owner review queue for refunds over €100. Add refund form, Shopify refund check, and refund history."
      stats={[
        { label: "Pending approval", value: "2", color: "var(--orange)" },
        { label: "Processed today", value: "3" },
        { label: "Total refunded (30d)", value: "€2,890" },
        { label: "Avg refund value", value: "€67" },
      ]}
      tabs={[
        { label: "Needs approval", count: 2, active: true },
        { label: "History", count: 43 },
        { label: "Add refund" },
      ]}
    >
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Add refund</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Store", placeholder: "Select store" },
            { label: "Order #", placeholder: "e.g. #1042" },
            { label: "Date", placeholder: "YYYY-MM-DD" },
          ].map((f) => (
            <div key={f.label}>
              <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{f.label}</div>
              <input className="w-full bg-transparent border rounded-lg px-3 py-1.5 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          {[
            { label: "Product", placeholder: "Product name" },
            { label: "Qty", placeholder: "1" },
            { label: "Reason", placeholder: "Select reason" },
            { label: "Amount (€)", placeholder: "0.00" },
          ].map((f) => (
            <div key={f.label}>
              <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{f.label}</div>
              <input className="w-full bg-transparent border rounded-lg px-3 py-1.5 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
        <div className="mb-3">
          <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Notes</div>
          <textarea className="w-full bg-transparent border rounded-lg px-3 py-1.5 text-[11px] h-14 resize-none" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder="Additional notes..." />
        </div>
        <button className="px-4 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Submit refund</button>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Refunds over €100 require owner approval before processing.</div>
      </div>
    </PageShell>
  )
}
