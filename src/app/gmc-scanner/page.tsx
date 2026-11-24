"use client"
import { PageShell } from "@/components/PageShell"

export default function GMCScannerPage() {
  return (
    <PageShell
      title="GMC Pre-Launch Scanner"
      breadcrumb="Front End → GMC Pre-Launch Scanner"
      description="Scan products before listing to catch Google Merchant Center policy issues, missing fields, and feed errors."
      stats={[
        { label: "Products scanned", value: "34" },
        { label: "Issues found", value: "7", color: "var(--orange)" },
        { label: "Critical", value: "2", color: "var(--red)" },
        { label: "Ready to list", value: "27", color: "var(--green)" },
      ]}
    >
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Scan a product</div>
        <div className="flex gap-3">
          <input className="flex-1 bg-transparent border rounded-lg px-3 py-2 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder="Enter product URL or select from list..." />
          <button className="px-4 py-2 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Scan</button>
        </div>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Run a scan to check for GMC policy issues before you list a product.</div>
      </div>
    </PageShell>
  )
}
