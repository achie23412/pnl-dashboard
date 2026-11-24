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
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {STORES.map((s) => {
        const isActive = s === active
        const color = s === "Overall" ? "#3b82f6" : STORE_COLORS[s] || "#666"
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className="px-4 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all"
            style={{
              background: isActive ? `${color}20` : "transparent",
              color: isActive ? "#fff" : "var(--text-muted)",
              border: `1px solid ${isActive ? `${color}40` : "var(--border)"}`,
            }}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}
