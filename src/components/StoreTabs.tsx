"use client"
import { STORES, STORE_COLORS } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"

export function StoreTabs({
  active,
  onChange,
}: {
  active: StoreName
  onChange: (s: StoreName) => void
}) {
  return (
    <div className="glass rounded-xl p-1.5 inline-flex gap-1 overflow-x-auto">
      {STORES.map((s) => {
        const isActive = s === active
        const color = s === "Overall" ? "#6366f1" : STORE_COLORS[s] || "#666"
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="relative px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all"
            style={{
              background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
              color: isActive ? "#fff" : "var(--text-dim)",
            }}
          >
            {isActive && (
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full"
                style={{ background: color }}
              />
            )}
            <div className="flex items-center gap-1.5">
              {s !== "Overall" && (
                <div
                  className="w-1.5 h-1.5 rounded-full transition-opacity"
                  style={{
                    background: color,
                    opacity: isActive ? 1 : 0.4,
                  }}
                />
              )}
              {s}
            </div>
          </button>
        )
      })}
    </div>
  )
}
