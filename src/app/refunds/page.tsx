"use client"
import { PageShell } from "@/components/PageShell"
import { Panel, Button, Notice, EmptyState } from "@/components/ui"

const field = "w-full bg-transparent border rounded-lg px-3 py-1.5 text-[11px]"
const fieldStyle = { borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }

export default function RefundsPage() {
  return (
    <PageShell
      title="Refunds"
      breadcrumb="Customer Service → Refunds"
      description="Owner review queue for refunds over €100, a form to add a refund, a Shopify refund check and refund history."
      stats={[
        { label: "Pending approval", value: "—" },
        { label: "Processed today", value: "—" },
        { label: "Total refunded (30d)", value: "—" },
        { label: "Avg refund value", value: "—" },
      ]}
    >
      <Notice tone="info">
        Not connected yet: the form below doesn&apos;t save anything and there is no queue or history. Refunds over €100 will
        need owner approval before they are processed.
      </Notice>

      <Panel title="Add refund" className="mb-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Store", placeholder: "Select store" },
            { label: "Order #", placeholder: "e.g. #1042" },
            { label: "Date", placeholder: "YYYY-MM-DD" },
          ].map((f) => (
            <div key={f.label}>
              <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{f.label}</div>
              <input className={field} style={fieldStyle} placeholder={f.placeholder} />
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
              <input className={field} style={fieldStyle} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
        <div className="mb-3">
          <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Notes</div>
          <textarea className={`${field} h-14 resize-none`} style={fieldStyle} placeholder="Additional notes…" />
        </div>
        <Button variant="primary" disabled title="Not connected yet">
          Submit refund
        </Button>
      </Panel>

      <EmptyState title="No refunds to review">
        The approval queue and refund history will show here once refunds are stored in the dashboard.
      </EmptyState>
    </PageShell>
  )
}
