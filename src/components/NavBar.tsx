"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/db-client"

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function HomeIcon() {
  return <Icon d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" />
}
function BriefingIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )
}
function ReportIcon() {
  return <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />
}
function CalendarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function RulesIcon() {
  return <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
}
function PerfIcon() {
  return <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />
}
function ProductsIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  )
}
function PriceIcon() {
  return <Icon d="M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
function ListIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function ScannerIcon() {
  return <Icon d="M2 7l4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7 M4 12V7h16v5 M12 22V7 M2 12h20" />
}
function SeasonIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
function CompetitorIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function PLIcon() {
  return <Icon d="M12 20V10 M18 20V4 M6 20v-4" />
}
function RefundReportIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}
function CashflowIcon() {
  return <Icon d="M2 17l10 5 10-5 M2 12l10 5 10-5 M12 2L2 7l10 5 10-5-10-5z" />
}
function InvoiceIcon() {
  return <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6" />
}
function SupplierCostIcon() {
  return <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01" />
}
function InboxIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}
function RefundCSIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}
function StoreCreditIcon() {
  return <Icon d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M1 10h22" />
}
function ReportsIcon() {
  return <Icon d="M18 20V10 M12 20V4 M6 20v-4" />
}
function QualityIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function RiskyIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function PriceDeductionIcon() {
  return <Icon d="M7 20l4-16m2 16l4-16 M3 8h18 M3 16h18" />
}
function OrderIssueIcon() {
  return <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
}
function SupplierCaseIcon() {
  return <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
}
function ShipmentIcon() {
  return <Icon d="M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
}
function FulfillmentRiskIcon() {
  return <Icon d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" />
}
function DisputeIcon() {
  return <Icon d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M12 2a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2 2 2 0 0 0 2-2v0a2 2 0 0 0-2-2z" />
}
function SettingsIcon() {
  return <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
}
function TeamIcon() {
  return <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
}
function WorkflowIcon() {
  return <Icon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2" />
}
function KeywordIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  )
}
function SparkleIcon() {
  return <Icon d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
}
function ResearchIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
}

interface NavSection {
  label: string
  items: NavItem[]
  collapsible?: boolean
}

// Extra words the sidebar search matches, beyond the page name and section.
const SEARCH_WORDS: Record<string, string> = {
  "/": "home overview pnl profit roas revenue spend kpi alerts today",
  "/daily-report": "day yesterday coach report profit %",
  "/calendar": "events todo to-do tasks must do season holiday black friday shipping cutoff",
  "/product-performance": "products roas breakeven be roas margin cogs winners date",
  "/opportunities": "competitor products launch season approve research trends new products",
  "/product-importer": "import kopy listing redo listing gmc pre-launch scanner merchant center check draft shopify",
  "/product-alerts": "draft drafting sop rules kill exclude alerts problems fix",
  "/competitors": "competitor tracker trendtrack stores visits trustpilot",
  "/keyword-maker": "competitor finder keyword maker search google shopping find new stores research",
  "/price-suggestions": "price pricing markup",
  "/price-ladder": "price ladder steps increase slow gradual",
  "/season-board": "season seasonal calendar trends",
  "/drafting-system": "draft drafting sop rules kill remove offline adgain roas threshold aov weekly cleanup",
  "/gmc-health": "gmc merchant center disapproved disapproval counterfeit feed limit price suggestion google health",
  "/google-scaling": "google ads scaling scale budget pmax test campaign exclude exclusions winners winner campaign brand search roas cpc oak ascend sop",
}

const DONE_PAGES = new Set(["/", "/inbox-queue", "/quality-checks", "/risky-products", "/price-deductions", "/disputes", "/workflows", "/cs-reports", "/cashflow", "/daily-report", "/calendar", "/competitors", "/advisor", "/product-performance", "/opportunities", "/product-importer", "/product-alerts", "/supplier-costs", "/price-suggestions", "/price-ladder", "/listings", "/product-rules", "/gmc-scanner", "/season-board", "/profit-loss", "/cogs-invoices", "/refunds", "/store-credit", "/refund-report", "/order-issues", "/supplier-cases", "/shipments", "/fulfillment-risks", "/team-hub", "/keyword-maker", "/drafting-system", "/store-settings", "/gmc-health", "/google-scaling"])

const NAV_SECTIONS: NavSection[] = [
  {
    label: "HOME",
    items: [
      { href: "/", label: "Main Hub", icon: <BriefingIcon /> },
      { href: "/daily-report", label: "Daily Report", icon: <ReportIcon /> },
      { href: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
    ],
  },
  {
    label: "FRONT END",
    items: [
      // In the order you work: find → list → check → measure → act.
      // 1. Find products
      { href: "/competitors", label: "Competitor Tracker", icon: <CompetitorIcon /> },
      { href: "/keyword-maker", label: "Competitor Finder", icon: <ScannerIcon /> },
      { href: "/season-board", label: "Season Board", icon: <SeasonIcon /> },
      { href: "/opportunities", label: "Product Opportunities", icon: <ProductsIcon /> },
      // 2. List them
      { href: "/product-importer", label: "Product Importer", icon: <ImportIcon /> },
      { href: "/listings", label: "Listings", icon: <ListIcon /> },
      // 3. Measure and act on what's live
      { href: "/product-performance", label: "Product Performance", icon: <PerfIcon /> },
      { href: "/product-alerts", label: "Product Alerts", icon: <AlertIcon /> },
      { href: "/product-rules", label: "Product Rules", icon: <RulesIcon /> },
      { href: "/drafting-system", label: "Drafting System", icon: <RulesIcon /> },
      { href: "/gmc-health", label: "GMC Health", icon: <AlertIcon /> },
      { href: "/google-scaling", label: "Google Ads Scaling", icon: <PerfIcon /> },
      { href: "/price-suggestions", label: "Price Suggestions", icon: <PriceIcon /> },
      { href: "/price-ladder", label: "Price Ladder", icon: <PriceIcon /> },
    ],
  },
  {
    label: "FINANCE",
    items: [
      // Overview first, then the money in/out, then the cost details.
      { href: "/profit-loss", label: "Profit & Loss", icon: <PLIcon /> },
      { href: "/cashflow", label: "Cashflow & Balance", icon: <CashflowIcon /> },
      { href: "/supplier-costs", label: "Supplier Costs", icon: <SupplierCostIcon /> },
      { href: "/cogs-invoices", label: "COGS Invoices", icon: <InvoiceIcon /> },
      { href: "/refund-report", label: "Refund Report", icon: <RefundReportIcon /> },
    ],
  },
  {
    label: "CUSTOMER SERVICE",
    items: [
      { href: "/inbox-queue", label: "Inbox Queue", icon: <InboxIcon /> },
      { href: "/refunds", label: "Refunds", icon: <RefundCSIcon /> },
      { href: "/store-credit", label: "Store Credit", icon: <StoreCreditIcon /> },
      { href: "/cs-reports", label: "Reports", icon: <ReportsIcon /> },
      { href: "/quality-checks", label: "Quality Checks", icon: <QualityIcon /> },
      { href: "/risky-products", label: "Risky Products", icon: <RiskyIcon /> },
      { href: "/price-deductions", label: "Price Deductions", icon: <PriceDeductionIcon /> },
    ],
  },
  {
    label: "SUPPLY CHAIN",
    items: [
      { href: "/order-issues", label: "Order Issues", icon: <OrderIssueIcon /> },
      { href: "/supplier-cases", label: "Supplier Cases", icon: <SupplierCaseIcon /> },
      { href: "/shipments", label: "Shipments", icon: <ShipmentIcon /> },
      { href: "/fulfillment-risks", label: "Fulfillment Risks", icon: <FulfillmentRiskIcon /> },
    ],
  },
  {
    label: "DISPUTES & CHARGEBACKS",
    items: [
      { href: "/disputes", label: "Disputes / Chargebacks", icon: <DisputeIcon /> },
    ],
  },
  {
    label: "",
    items: [
      { href: "/advisor", label: "Advisor", icon: <SparkleIcon /> },
      { href: "/team-hub", label: "Team Hub", icon: <TeamIcon /> },
      { href: "/workflows", label: "Workflows", icon: <WorkflowIcon /> },
      { href: "/store-settings", label: "Store Settings", icon: <SettingsIcon /> },
    ],
  },
]

function StoreSelector() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 mx-2.5 rounded-lg cursor-pointer"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        All
      </div>
      <div>
        <div className="text-[10px] font-medium" style={{ color: "var(--text)" }}>All stores</div>
        <div className="text-[8px]" style={{ color: "var(--text-dim)" }}>5 stores · 48 products · 3 live</div>
      </div>
    </div>
  )
}

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [supplierBadge, setSupplierBadge] = useState(0)

  useEffect(() => {
    db.from("refresh_log")
      .select("completed_at")
      .order("completed_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.completed_at) setLastRefresh(data[0].completed_at)
      })
    fetch("/api/supplier-data")
      .then((r) => r.json())
      .then((d) => {
        if (d.summary?.cogs_out_of_range) setSupplierBadge(d.summary.cogs_out_of_range)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (pathname === "/login") return null

  // All sections always open; the search box filters pages by name, section and keywords.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (section: NavSection, item: NavSection["items"][number]) => {
    if (!terms.length) return true
    const hay = `${item.label} ${section.label} ${item.href} ${SEARCH_WORDS[item.href] || ""}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  }
  const badgeMap: Record<string, number> = {}
  if (supplierBadge > 0) badgeMap["/supplier-costs"] = supplierBadge
  const visibleSections = NAV_SECTIONS.map((section) => ({
    section,
    items: section.items.filter((i) => matches(section, i)).map((i) => badgeMap[i.href] ? { ...i, badge: badgeMap[i.href] } : i),
  })).filter((x) => x.items.length > 0)
  const firstHit = visibleSections[0]?.items[0]

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-[60] w-9 h-9 rounded-lg flex items-center justify-center md:hidden"
        style={{ background: "rgba(8,11,22,0.85)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth={2} strokeLinecap="round">
          {mobileOpen
            ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside
      className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{
        width: "var(--sidebar-w)",
        background: "rgba(8,11,22,0.95)",
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
          D
        </div>
        <div>
          <div className="text-[12px] font-bold tracking-tight" style={{ color: "var(--text)" }}>Dashboard</div>
          <div className="text-[8px] uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>Operations</div>
        </div>
      </div>

      <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Store selector */}
      <div className="py-2">
        <StoreSelector />
      </div>

      <div className="mx-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* Search */}
      <div className="px-2.5 pt-2">
        <div className="relative">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstHit) {
                router.push(firstHit.href)
                setQuery("")
                setMobileOpen(false)
              }
              if (e.key === "Escape") setQuery("")
            }}
            placeholder="Search pages…  ( / )"
            aria-label="Search pages"
            className="w-full rounded-lg pl-7 pr-2 py-1.5 text-[11px] outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)" }}
          />
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        {visibleSections.length === 0 && (
          <div className="text-[10px] px-2.5 py-2" style={{ color: "var(--text-dim)" }}>No page matches “{query}”.</div>
        )}
        {visibleSections.map(({ section, items }) => {
          return (
            <div key={section.label || "bottom"}>
              {section.label && (
                <div
                  className="text-[9px] font-semibold uppercase tracking-wider px-2.5 mb-0.5 mt-2 select-none"
                  style={{ color: "var(--text-dim)" }}
                >
                  {section.label}
                </div>
              )}
              {items.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { setMobileOpen(false); setQuery("") }}
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
                      <span className="truncate">{item.label}</span>
                      {!DONE_PAGES.has(item.href) && (
                        <span className="shrink-0 text-[7px] opacity-50" style={{ color: "var(--text-dim)" }}>
                          (not done yet)
                        </span>
                      )}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
            </div>
          )
        })}

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
          {lastRefresh && (
            <div className="mt-1 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#34d399" }} />
              <span>
                Last refresh: {new Date(lastRefresh).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
    </>
  )
}
