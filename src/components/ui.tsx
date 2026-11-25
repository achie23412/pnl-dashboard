"use client"
// Shared building blocks so every page looks and reads the same.
// Rules of use: see STYLE.md in the repo root.
import Link from "next/link"

type Tone = "red" | "green" | "amber" | "blue" | "grey" | "accent"

const TONE: Record<Tone, { fg: string; bg: string; border: string }> = {
  red: { fg: "#f87171", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" },
  green: { fg: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.3)" },
  amber: { fg: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)" },
  blue: { fg: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)" },
  grey: { fg: "var(--text-muted)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" },
  accent: { fg: "#c7d2fe", bg: "rgba(99,102,241,0.18)", border: "rgba(99,102,241,0.4)" },
}

// A card. Optional title row with something on the right (buttons, counts).
export function Panel({
  title,
  sub,
  right,
  children,
  pad = true,
  className = "",
}: {
  title?: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
  pad?: boolean // false for full-bleed tables
  className?: string
}) {
  return (
    <div className={`glass rounded-xl ${pad ? "p-4" : "overflow-hidden"} ${className}`}>
      {(title || right) && (
        <div className={`flex flex-wrap items-center justify-between gap-2 ${pad ? "mb-3" : "px-4 pt-3 pb-2"}`}>
          <div>
            {title && <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{title}</div>}
            {sub && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>{sub}</div>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function Badge({ tone = "grey", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  const t = TONE[tone]
  return (
    <span title={title} className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap" style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  )
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"
const BTN: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--accent)", color: "#fff", border: "1px solid transparent" },
  secondary: { background: "rgba(255,255,255,0.05)", color: "var(--text)", border: "1px solid rgba(255,255,255,0.1)" },
  danger: { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" },
  ghost: { background: "transparent", color: "var(--text-muted)", border: "1px solid transparent" },
}

export function Button({
  variant = "secondary",
  size = "md",
  href,
  children,
  ...rest
}: {
  variant?: ButtonVariant
  size?: "sm" | "md"
  href?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${
    size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"
  }`
  if (href) {
    return (
      <Link href={href} className={cls} style={BTN[variant]}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" {...rest} className={`${cls} ${rest.className || ""}`} style={{ ...BTN[variant], ...rest.style }}>
      {children}
    </button>
  )
}

// One-line message above content. error = something failed, warning = data may be incomplete,
// info = how something works, success = an action worked.
export function Notice({ tone = "info", children }: { tone?: "error" | "warning" | "info" | "success"; children: React.ReactNode }) {
  const t = TONE[tone === "error" ? "red" : tone === "warning" ? "amber" : tone === "success" ? "green" : "blue"]
  return (
    <div className="rounded-lg px-3 py-2 mb-4 text-[11px]" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.border}` }}>
      {children}
    </div>
  )
}

export function Loading({ children = "Loading…" }: { children?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl py-12 text-center text-[11px]" style={{ color: "var(--text-dim)" }}>
      {children}
    </div>
  )
}

// Nothing to show. Say why and what to do next.
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl py-12 px-6 text-center">
      <div className="text-[12px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>{title}</div>
      {children && <div className="text-[11px] max-w-md mx-auto" style={{ color: "var(--text-dim)" }}>{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// Small uppercase label used above tables and grouped content.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
      {children}
    </div>
  )
}

// Table header cell + body cell classes, so every table lines up the same.
export const TH = "px-3 py-2 text-[9px] font-semibold uppercase tracking-wider"
export const TD = "px-3 py-2 text-[11px]"
export const ROW_BORDER = { borderTop: "1px solid rgba(255,255,255,0.04)" }
