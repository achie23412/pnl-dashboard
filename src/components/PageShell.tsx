"use client"

interface StatCard {
  label: string
  value: string
  sub?: string
  color?: string
}

interface PageShellProps {
  title: string
  breadcrumb: string
  description?: string
  stats?: StatCard[]
  tabs?: { label: string; count?: number; active?: boolean }[]
  filters?: boolean
  children?: React.ReactNode
}

export function PageShell({ title, breadcrumb, description, stats, tabs, filters, children }: PageShellProps) {
  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Breadcrumb */}
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>
        {breadcrumb}
      </div>

      {/* Title row */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {filters && (
          <div className="flex items-center gap-2">
            <select
              className="text-[11px] px-3 py-1.5 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text)",
              }}
            >
              <option>All stores</option>
            </select>
            <div
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px]"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-muted)",
              }}
            >
              <span>Last 30 days</span>
            </div>
          </div>
        )}
      </div>

      {description && (
        <p className="text-[12px] mb-4 max-w-3xl" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}

      {/* Stats row */}
      {stats && stats.length > 0 && (
        <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, 1fr)` }}>
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>
                {s.label}
              </div>
              <div className="text-[18px] font-bold" style={{ color: s.color || "var(--text)" }}>
                {s.value}
              </div>
              {s.sub && (
                <div className="text-[9px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                  {s.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="flex gap-1 mb-4 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
          {tabs.map((t) => (
            <button
              key={t.label}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-all"
              style={{
                background: t.active ? "rgba(255,255,255,0.08)" : "transparent",
                color: t.active ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px]"
                  style={{
                    background: t.active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
                    color: t.active ? "#6366f1" : "var(--text-dim)",
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        className="rounded-xl"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {children || <PlaceholderTable />}
      </div>
    </div>
  )
}

function PlaceholderTable() {
  return (
    <div className="p-6">
      <div className="text-center py-16">
        <div className="text-[32px] mb-3 opacity-20">
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" className="mx-auto" style={{ color: "var(--text-dim)" }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        </div>
        <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
          No data connected yet
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          This page will show data once the data sources are connected.
        </div>
      </div>
    </div>
  )
}

interface GlassTableProps {
  headers: string[]
  rows?: string[][]
  emptyMessage?: string
}

export function GlassTable({ headers, rows, emptyMessage }: GlassTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2.5 font-semibold"
                style={{ color: "var(--text-dim)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-12 text-center" style={{ color: "var(--text-dim)" }}>
                {emptyMessage || "No data yet"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
