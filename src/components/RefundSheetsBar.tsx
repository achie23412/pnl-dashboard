"use client"
// The Google Sheets CS logs refunds in (for now), with the last sync result.
import { ASCEND_SHEET_ID, ASCEND_TABS, LUME_SHEET_ID, LUME_TAB, LUME_FROM, sheetUrl } from "@/lib/refund-sheet-links"

export type SheetSync = { enriched: number; added: number; credits: number; notes: string[] } | null

export function RefundSheetsBar({ result, syncing, onSync }: { result: SheetSync; syncing: boolean; onSync: () => void }) {
  return (
    <div className="glass rounded-xl px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span className="font-semibold" style={{ color: "var(--text)" }}>Linked sheets</span>
      <a href={sheetUrl(ASCEND_SHEET_ID, ASCEND_TABS[0])} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>Ascend refund sheet (Store 1–10)</a>
      <a href={sheetUrl(LUME_SHEET_ID, LUME_TAB)} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>Lumé refund sheet</a>
      <span style={{ color: "var(--text-dim)" }}>Read every hour and each morning · Lumé from {LUME_FROM}</span>
      <button type="button" onClick={onSync} disabled={syncing} className="underline disabled:opacity-50" style={{ color: "var(--text-muted)" }}>
        {syncing ? "Reading sheets…" : "Read sheets now"}
      </button>
      {result && (
        <span style={{ color: "var(--text-dim)" }}>
          Last read: {result.enriched} reason{result.enriched === 1 ? "" : "s"} added to Shopify refunds · {result.added} new refund{result.added === 1 ? "" : "s"} · {result.credits} store credit{result.credits === 1 ? "" : "s"}
        </span>
      )}
      {result?.notes?.length ? (
        <span className="w-full" style={{ color: "var(--orange)" }}>{result.notes.join(" · ")}</span>
      ) : null}
    </div>
  )
}
