"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

function DashboardIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )
}

function RefundIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function ResearchIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

interface NavSection {
  label: string
  items: { href: string; label: string; icon: React.ReactNode }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Command Center", icon: <DashboardIcon /> },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/refunds", label: "Refunds", icon: <RefundIcon /> },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/research", label: "Products", icon: <ResearchIcon /> },
      { href: "/competitors", label: "Competitors", icon: <EyeIcon /> },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/keywords", label: "Keywords", icon: <KeyIcon /> },
      { href: "/keyword-maker", label: "Keyword Maker", icon: <SparkleIcon /> },
      { href: "/import", label: "Import", icon: <ImportIcon /> },
    ],
  },
]

export function NavBar() {
  const pathname = usePathname()
  if (pathname === "/login") return null

  return (
    <aside
      className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
      style={{
        width: "var(--sidebar-w)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2.5 px-5 h-16">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff" }}
        >
          P
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>PNL</div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Dashboard</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider px-3 mb-1.5"
              style={{ color: "var(--text-dim)" }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all mb-0.5"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.1))"
                      : "transparent",
                    color: active ? "#fff" : "var(--text-muted)",
                    borderLeft: active ? "2px solid #3b82f6" : "2px solid transparent",
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div
          className="rounded-lg px-3 py-2.5 text-[11px]"
          style={{
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.15)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium mb-0.5" style={{ color: "var(--text)" }}>5 Stores Active</div>
          All amounts in EUR
        </div>
      </div>
    </aside>
  )
}
