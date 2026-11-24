"use client"
import { PageShell } from "@/components/PageShell"

const TIERS = [
  { product: "Women's Block Heel Boots", supplier: "Supplier A", current: "$9.50", tier20: "$9.50", tier60: "$8.80", tier120: "$8.20", unitsSold: 45, nextTier: "60 units" },
  { product: "Men's Sherpa Jacket", supplier: "Supplier B", current: "$12.00", tier20: "$12.00", tier60: "$11.00", tier120: "$10.00", unitsSold: 72, nextTier: "120 units" },
  { product: "Women's Maxi Dress", supplier: "Supplier C", current: "$7.80", tier20: "$7.80", tier60: "$7.00", tier120: "$6.50", unitsSold: 18, nextTier: "20 units" },
]

export default function PriceDeductionsPage() {
  return (
    <PageShell
      title="Price Deductions"
      breadcrumb="Customer Service → Price Deductions"
      description="Supplier price negotiations at 20/60/120 unit tiers. Track progress toward each tier."
      stats={[
        { label: "Products tracked", value: "3" },
        { label: "At tier 1 (20)", value: "1" },
        { label: "At tier 2 (60)", value: "1" },
        { label: "Near next tier", value: "1", color: "var(--orange)" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Supplier", "Current", "20 units", "60 units", "120 units", "Sold", "Next tier"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{t.product}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{t.supplier}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{t.current}</td>
                <td className="px-3 py-2.5" style={{ color: t.unitsSold >= 20 ? "var(--green)" : "var(--text-dim)" }}>{t.tier20}</td>
                <td className="px-3 py-2.5" style={{ color: t.unitsSold >= 60 ? "var(--green)" : "var(--text-dim)" }}>{t.tier60}</td>
                <td className="px-3 py-2.5" style={{ color: t.unitsSold >= 120 ? "var(--green)" : "var(--text-dim)" }}>{t.tier120}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text)" }}>{t.unitsSold}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--orange)" }}>{t.nextTier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
