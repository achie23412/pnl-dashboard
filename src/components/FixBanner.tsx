"use client"
import { useEffect, useState } from "react"

export type FixContext = {
  title: string
  why: string
  fix: string
  source: string
  store: string | null
}

export function useFixContext(): FixContext | null {
  const [ctx, setCtx] = useState<FixContext | null>(null)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const title = sp.get("fix_title")
    if (!title) return
    setCtx({
      title,
      why: sp.get("fix_why") || "",
      fix: sp.get("fix_action") || "",
      source: sp.get("fix_source") || "",
      store: sp.get("fix_store") || null,
    })
  }, [])
  return ctx
}

export function FixBanner({ onApply }: { onApply?: (ctx: FixContext) => void }) {
  const ctx = useFixContext()
  const [dismissed, setDismissed] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    setDismissed(false)
    setApplied(false)
  }, [ctx?.title])

  if (!ctx || dismissed) return null

  const steps = ctx.fix
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0)

  return (
    <div
      className="rounded-xl p-4 mb-4 relative"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(239,68,68,0.06))",
        border: "1px solid rgba(99,102,241,0.25)",
      }}
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
        style={{ color: "var(--text-dim)" }}
        aria-label="Dismiss fix banner"
      >
        ✕
      </button>

      <div className="flex items-start gap-3 mb-3">
        <div
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[14px]"
          style={{ background: "rgba(99,102,241,0.2)" }}
        >
          🔧
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
            {ctx.title}
          </div>
          {ctx.store && (
            <div className="text-[10px] mt-0.5" style={{ color: "#a5b4fc" }}>
              {ctx.store}
            </div>
          )}
        </div>
      </div>

      {ctx.why && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-[11px] leading-relaxed"
          style={{ background: "rgba(0,0,0,0.15)", color: "var(--text-muted)" }}
        >
          <span className="font-semibold" style={{ color: "var(--text)" }}>Why: </span>
          {ctx.why}
        </div>
      )}

      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#a5b4fc" }}>
          How to fix
        </div>
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <div
                className="shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold mt-px"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
              >
                {i + 1}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: "var(--text)" }}>
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onApply && !applied && (
          <button
            onClick={() => {
              onApply(ctx)
              setApplied(true)
            }}
            className="px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Fix it →
          </button>
        )}
        {applied && (
          <span className="px-4 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }}>
            ✓ Applied
          </span>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-1.5 rounded-lg text-[11px]"
          style={{ color: "var(--text-dim)" }}
        >
          Dismiss
        </button>
        <div className="ml-auto text-[9px]" style={{ color: "var(--text-dim)" }}>
          {ctx.source.split(":")[0]}
        </div>
      </div>
    </div>
  )
}
