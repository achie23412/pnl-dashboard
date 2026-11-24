"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

function DashboardIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )
}

function RefundIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function ResearchIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ImportIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
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
        background: "rgba(8,11,22,0.85)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
          style={{ background: "linear-gradient(135deg, #4E6AA7, #6366f1)", color: "#fff" }}
        >
          P
        </div>
        <div>
          <div className="text-[12px] font-bold tracking-tight" style={{ color: "var(--text)" }}>PNL</div>
          <div className="text-[8px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Dashboard</div>
        </div>
      </div>

      <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <div
              className="text-[9px] font-semibold uppercase tracking-wider px-2.5 mb-1"
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
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-px relative overflow-hidden"
                  style={{
                    background: active ? "rgba(255,255,255,0.07)" : "transparent",
                    color: active ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {active && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-full"
                      style={{ background: "#6366f1" }}
                    />
                  )}
                  <span style={{ opacity: active ? 1 : 0.5 }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Footer */}
      <div className="px-2.5 py-3">
        <div
          className="rounded-lg px-2.5 py-2 text-[9px]"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "var(--text-dim)",
          }}
        >
          <div className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>5 Stores Active</div>
          All amounts in EUR
        </div>
      </div>
    </aside>
  )
}
