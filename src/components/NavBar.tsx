"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/", label: "P&L Dashboard", icon: "📊" },
  { href: "/refunds", label: "Refunds", icon: "↩" },
  { href: "/research", label: "Research", icon: "🔍" },
  { href: "/competitors", label: "Competitors", icon: "👁" },
  { href: "/import", label: "Import", icon: "📦" },
]

export function NavBar() {
  const pathname = usePathname()
  if (pathname === "/login") return null

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-1 px-4 h-12 border-b"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <span className="text-sm font-bold mr-4" style={{ color: "var(--text)" }}>
        PNL
      </span>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--bg)" : "transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
