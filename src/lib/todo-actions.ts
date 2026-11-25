// What to do for a calendar to-do, and where in the dashboard to do it.
// Keeps the calendar, Product Opportunities and Product Alerts in one flow.

export type CalendarAction = { fix: string; href: string | null; hrefLabel?: string }

const q = (s: string) => encodeURIComponent(s)

// Season names match the Product Opportunities season labels.
const LISTING_SEASONS: [RegExp, string][] = [
  [/nye|party/i, "Party / NYE"],
  [/winter/i, "Winter"],
  [/jan trending|new year/i, "New Year / activewear"],
  [/spring/i, "Spring"],
  [/summer/i, "Summer"],
  [/christmas|xmas|gift/i, "Christmas gifting"],
  [/autumn|fall/i, "Autumn"],
  [/valentine/i, "Valentine's"],
]

export function calendarAction(e: { label: string; type: string; note?: string; store?: string }): CalendarAction {
  const label = e.label.toLowerCase()

  // Season Board keyword tasks (from the Keyword Planner exports)
  if (/season keywords/.test(label)) {
    return /^push budget/.test(label)
      ? { fix: `${e.note ? e.note + " " : ""}Raise budget on the matching products in Google Ads (+20% steps per the SOP) as searches climb.`, href: "/season-board", hrefLabel: "Season Board" }
      : { fix: `${e.note ? e.note + " " : ""}On the Season Board, copy the list plan and add the missing products via the Product Importer.`, href: "/season-board", hrefLabel: "Season Board" }
  }

  // "List … products" / "Publish … collection": choose products for that season.
  if (/^list |publish .*collection/.test(label)) {
    const season = LISTING_SEASONS.find(([re]) => re.test(e.label))?.[1]
    return {
      fix: `Open Product Opportunities${season ? ` (${season})` : ""}: approve the best-fitting products, send them to the importer and import as drafts now, so Google can index them before demand peaks.`,
      href: season ? `/opportunities?season=${q(season)}` : "/opportunities",
      hrefLabel: "Product Opportunities",
    }
  }
  if (/draft|clean ?up|underperform|weekly product review/.test(label)) {
    return { fix: "Open Product Alerts and handle every alert: draft the critical ones first (each alert names its SOP rule and fix).", href: "/product-alerts", hrefLabel: "Product Alerts" }
  }
  if (/scale .*winners|winners/.test(label)) {
    return { fix: "On Product Performance, pick products well above their breakeven ROAS with steady sales, then scale them in Google Ads / Ads Manager (Google: +20% every 48–72h).", href: "/product-performance", hrefLabel: "Product Performance" }
  }
  if (/review|roas|performance|wind-down|wind down/.test(label)) {
    return { fix: `${e.note ? e.note + " " : ""}Compare each store's ROAS with its breakeven on Product Performance, then act on Product Alerts.`, href: "/product-performance", hrefLabel: "Product Performance" }
  }
  if (e.type === "sale") {
    return { fix: "Keep budgets up today; watch ROAS on the Main Hub during the day and don't cut on one weak hour.", href: "/", hrefLabel: "Main Hub" }
  }
  if (e.type === "shipping") {
    return {
      fix: `${e.store ? `${e.store}: ` : ""}add a delivery-cutoff note to the store (banner/product page) and stop promising delivery before the holiday after this date.`,
      href: null,
    }
  }
  if (e.type === "launch") {
    return { fix: e.note ? `${e.note} (do this in Ads Manager / Google Ads).` : "Switch campaigns/creatives as planned in Ads Manager / Google Ads.", href: null }
  }
  return { fix: e.note || "See the calendar note.", href: null }
}
