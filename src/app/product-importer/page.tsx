"use client"
import { PageShell } from "@/components/PageShell"

export default function ProductImporterPage() {
  return (
    <PageShell
      title="Product Importer"
      breadcrumb="Front End → Product Importer"
      description="Import products from your saved list. Single or batch import with keyword advice and competitor pricing."
      stats={[
        { label: "Saved products", value: "24" },
        { label: "Imported this week", value: "6" },
        { label: "Pending review", value: "3", color: "var(--orange)" },
        { label: "Success rate", value: "92%" },
      ]}
    >
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Add new product</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Product URL</label>
            <input className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder="https://supplier.com/product..." />
          </div>
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Target store</label>
            <select className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}>
              <option>Walsh & Farley</option>
              <option>Carter & Collins</option>
              <option>Susan & Allen</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="px-4 py-2 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Import</button>
          </div>
        </div>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--text)" }}>Saved list</div>
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No saved products yet. Add a product URL above to get started.</div>
      </div>
    </PageShell>
  )
}
