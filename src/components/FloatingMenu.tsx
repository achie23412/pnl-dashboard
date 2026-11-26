"use client"
// Dropdown layer for every menu (PillSelect, FilterSelect, date pickers).
// Panels use a frosted-glass effect (backdrop-filter), which traps an absolutely positioned menu
// under the next panel on the page. This draws the menu in a layer on top of the whole page
// (portal to <body>, fixed position under its button), opens upwards when there's no room below,
// and follows the button on scroll and resize.
import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

export const MENU_BG = "#0f1320"

export function FloatingMenu({
  anchor,
  menuRef,
  align = "left",
  gap = 6,
  matchWidth = false,
  className = "",
  style,
  role,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  menuRef: RefObject<HTMLDivElement>
  align?: "left" | "right"
  gap?: number
  matchWidth?: boolean
  className?: string
  style?: CSSProperties
  role?: string
  children: ReactNode
}) {
  const [pos, setPos] = useState<CSSProperties>({ top: -9999, left: -9999, visibility: "hidden" })

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const m = menuRef.current
      if (!a || !m) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = m.offsetWidth
      const h = m.offsetHeight
      let left = align === "right" ? a.right - w : a.left
      left = Math.max(8, Math.min(left, vw - w - 8))
      const below = a.bottom + gap
      const fitsBelow = below + h <= vh - 8
      const top = fitsBelow || a.top - gap - h < 8 ? below : a.top - gap - h
      setPos({ top, left, ...(matchWidth ? { minWidth: a.width } : {}), visibility: "visible" })
    }
    place()
    // once more after fonts/content settle
    const raf = requestAnimationFrame(place)
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [anchor, menuRef, align, gap, matchWidth])

  if (typeof document === "undefined") return null
  return createPortal(
    <div
      ref={menuRef}
      role={role}
      className={className}
      style={{
        position: "fixed",
        zIndex: 1000,
        background: MENU_BG,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
        ...style,
        ...pos,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
