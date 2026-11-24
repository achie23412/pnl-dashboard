"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function DisputesPage() {
  return (
    <PageShell
      title="Disputes / Chargebacks"
      breadcrumb="Back End → Disputes & Chargebacks → Disputes / Chargebacks"
      description="Shopify chargebacks per store, fed live by Disputifier. 'To fight' is the CS Specialist's work list: submit evidence before the deadline. A missed deadline loses the dispute automatically."
      filters
      stats={[
        { label: "To Fight", value: "0", color: "var(--red)" },
        { label: "Waiting on Bank", value: "0", color: "var(--orange)" },
        { label: "Won", value: "0", color: "var(--green)" },
        { label: "Lost", value: "0" },
        { label: "Prevented (Refunded)", value: "0", color: "var(--blue)" },
      ]}
      tabs={[
        { label: "To Fight", count: 0, active: true },
        { label: "Waiting on Bank", count: 0 },
        { label: "Prevented (refunded)", count: 0 },
        { label: "Won", count: 0 },
        { label: "Lost", count: 0 },
        { label: "All", count: 0 },
      ]}
    >
      <div className="p-6">
        {/* Warning banner */}
        <div
          className="rounded-lg px-4 py-3 mb-4 flex items-center gap-2"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "#ef4444" }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-[11px] font-medium" style={{ color: "#ef4444" }}>
            0 evidence deadlines within 7 days — click to filter to just these.
          </span>
        </div>

        {/* Chargebacks section */}
        <div className="mb-6">
          <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            1. Chargebacks (live in Shopify)
          </div>
          <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
            Every real Shopify chargeback lands here. Each case moves through the tabs by itself; the dashboard checks the status in Shopify every hour.
          </div>
          <GlassTable
            headers={["Order Date", "Dispute Date", "Days", "Case ID", "Deadline", "Store", "Order No.", "Amount", "Network Reason", "Specific Reason"]}
            emptyMessage="No chargebacks. Chargebacks appear here once Disputifier is connected."
          />
        </div>

        {/* Prevented by alerts */}
        <div className="mb-6">
          <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            2. Prevented by alerts
          </div>
          <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
            The Disputifier webhook sends no reason or fee. Amount and &quot;refunded&quot; are filled from Shopify every hour. Upload Disputifier&apos;s alert export (Alerts → Export CSV) once a week.
          </div>
          <div className="flex gap-2 mb-3">
            <button
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)" }}
            >
              Choose File
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Upload
            </button>
          </div>
          <GlassTable
            headers={["Date", "Type", "Store", "Order", "Amount", "Fee", "Status", "Reason"]}
            emptyMessage="No prevented alerts yet."
          />
        </div>

        {/* Reporting */}
        <div className="mb-6">
          <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            3. Reporting
          </div>
          <div className="text-[10px] mb-4" style={{ color: "var(--text-dim)" }}>
            Per store, for the selected date range: chargebacks, the alerts that prevented them, and what it all cost. Amounts are in each store&apos;s own currency.
          </div>
          <div className="grid grid-cols-3 gap-4">
            {["Walsh & Farley", "Carter & Collins", "Susan & Allen"].map((store) => (
              <div
                key={store}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>{store}</div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>Chargebacks</div>
                    <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>0</div>
                  </div>
                  <div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>CB Amount</div>
                    <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>€0</div>
                  </div>
                  <div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>Dispute Fees</div>
                    <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>€0</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>Total Sales</div>
                    <div className="text-[12px] font-bold" style={{ color: "var(--text)" }}>€0</div>
                  </div>
                  <div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>CB Rate</div>
                    <div className="text-[12px] font-bold" style={{ color: "var(--green)" }}>0%</div>
                  </div>
                </div>
                <div
                  className="rounded-lg px-3 py-2 text-[11px] font-semibold flex justify-between"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Total cost (chargebacks + fees + alerts)</span>
                  <span style={{ color: "var(--text)" }}>€0.00</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div>
          <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>
            4. Settings
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>Dispute Fee Per Store</div>
              <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
                Leave empty for Shopify Payments: Shopify&apos;s $15 chargeback fee is already included in the chargeback amount.
              </div>
              {["Walsh & Farley (EUR)", "Carter & Collins (GBP)", "Susan & Allen (USD)"].map((store) => (
                <div key={store} className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] w-40" style={{ color: "var(--text-muted)" }}>{store}</span>
                  <input
                    className="bg-transparent border rounded px-2 py-1 text-[11px] w-20"
                    style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
                    defaultValue="0.00"
                  />
                </div>
              ))}
            </div>
            <div>
              <div className="text-[11px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>Specific Reason Options</div>
              <div className="flex flex-wrap gap-2">
                {["FULFILMENT: Missing item", "FULFILMENT: Wrong item received", "SIZING: Too small", "QUALITY: Bad quality"].map((r) => (
                  <span
                    key={r}
                    className="px-2.5 py-1 rounded-full text-[10px]"
                    style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
