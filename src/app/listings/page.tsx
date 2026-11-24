"use client"
import { PageShell } from "@/components/PageShell"

const DEMO = [
  { product: "Women's Block Heel Ankle Boots", stores: "CC, WF", status: "Live", listed: "2026-10-15", gmc: "Approved" },
  { product: "Men's Sherpa Lined Corduroy Jacket", stores: "WF, SA", status: "Live", listed: "2026-10-20", gmc: "Approved" },
  { product: "Women's Wedding Guest Maxi Dress", stores: "CC", status: "Draft", listed: "2026-11-01", gmc: "Pending" },
  { product: "Men's Warm Lined Slippers", stores: "BK, WF", status: "Live", listed: "2026-09-28", gmc: "Approved" },
]

export default function ListingsPage() {
  return (
    <PageShell title="Listings" breadcrumb="Front End → Listings" description="Every product and which stores it is listed on. Check coverage gaps and GMC status.">
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Stores", "Status", "Listed", "GMC"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.product}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.stores}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: r.status === "Live" ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
                    color: r.status === "Live" ? "#22c55e" : "#94a3b8",
                  }}>{r.status}</span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.listed}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: r.gmc === "Approved" ? "rgba(34,197,94,0.15)" : "rgba(249,115,22,0.15)",
                    color: r.gmc === "Approved" ? "#22c55e" : "#f97316",
                  }}>{r.gmc}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
