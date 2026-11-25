// Hardcoded marketing/season calendar (shared by the Calendar page and Product Opportunities).
export type HardcodedEvent = {
  date: string
  label: string
  type: "deadline" | "sale" | "prep" | "shipping" | "season" | "launch"
  store?: string
  note?: string
}

export const HARDCODED_EVENTS: HardcodedEvent[] = [
  { date: "2026-11-27", label: "Black Friday", type: "sale", note: "Peak ad spend day. All stores max budget." },
  { date: "2026-11-28", label: "Black Saturday", type: "sale", note: "BF weekend — keep budgets high." },
  { date: "2026-11-29", label: "BF Sunday", type: "sale", note: "Momentum day — don't cut spend." },
  { date: "2026-11-30", label: "Cyber Monday", type: "sale", note: "Last big promo day. Push remaining BF stock." },
  { date: "2026-12-01", label: "List winter products", type: "prep", note: "Publish winter coats, knitwear, boots for Google indexing. Algorithm needs 2-3 weeks before peak." },
  { date: "2026-12-01", label: "December campaigns live", type: "launch", note: "Switch creatives to Christmas/gift angle. All stores." },
  { date: "2026-12-02", label: "Free Shipping Day prep", type: "prep", note: "Prep banners/badges for Dec 14 Free Shipping Day." },
  { date: "2026-12-05", label: "List NYE & party products", type: "prep", note: "NYE dresses, sparkly items, party accessories. Google needs indexing time before Dec 20+ searches." },
  { date: "2026-12-07", label: "Green Monday", type: "sale", note: "2nd biggest online shopping day in Dec. Push gift angles." },
  { date: "2026-12-08", label: "Review Q4 ROAS", type: "deadline", note: "Mid-Q4 check: draft underperformers (SOP rule 1-5), scale winners." },
  { date: "2026-12-10", label: "IE shipping cutoff soon", type: "shipping", store: "WF", note: "Walsh & Farley: last safe order date for pre-Xmas delivery ~Dec 14 (ShipGoods EU 10-15 days)." },
  { date: "2026-12-10", label: "List Jan trending products", type: "prep", note: "Athleisure, gym wear, cozy loungewear for 'New Year New Me'. List NOW for Google algorithm." },
  { date: "2026-12-12", label: "UK shipping cutoff soon", type: "shipping", store: "CC", note: "Carter & Collins: flag last order date for guaranteed Xmas delivery." },
  { date: "2026-12-14", label: "Free Shipping Day", type: "sale", note: "Offer free shipping across all stores. Big conversion driver." },
  { date: "2026-12-14", label: "US shipping cutoff soon", type: "shipping", store: "SA", note: "Susan & Allen: last safe date for Xmas delivery (varies by carrier)." },
  { date: "2026-12-15", label: "Switch to 'Last Chance' angle", type: "launch", note: "Creatives → urgency: 'Order now for Xmas delivery'. Gift cards as backup offer." },
  { date: "2026-12-17", label: "Draft slow Christmas stock", type: "deadline", note: "Draft products that won't sell before Xmas. Free up ad budget for winners." },
  { date: "2026-12-18", label: "Super Saturday", type: "sale", note: "Last big shopping Saturday before Xmas. In-store rush → online last-chancers." },
  { date: "2026-12-20", label: "Gift card push starts", type: "launch", note: "Past shipping cutoffs → push digital gift cards and e-vouchers hard." },
  { date: "2026-12-21", label: "Winter Solstice", type: "season", note: "Shortest day. 'Winter essentials' angle for content." },
  { date: "2026-12-24", label: "Christmas Eve", type: "sale", note: "Last-minute digital/gift card sales. Reduce ad spend on physical products." },
  { date: "2026-12-25", label: "Christmas Day", type: "season", note: "Low ad spend. People browse with gift money. Prep Boxing Day campaigns." },
  { date: "2026-12-26", label: "Boxing Day / Q5 starts", type: "sale", note: "Q5 begins! CPMs drop 30-50%, gift card spend floods in. Scale aggressively." },
  { date: "2026-12-27", label: "Scale Q5 winners", type: "launch", note: "Double budgets on winners. Low CPMs + high intent = best ROAS window of the year." },
  { date: "2026-12-28", label: "List spring preview products", type: "prep", note: "Early spring: light jackets, transitional pieces, Valentine's gifts. Google needs 3+ weeks." },
  { date: "2026-12-31", label: "New Year's Eve", type: "season", note: "NYE outfit searches peak. Party/sparkle product push." },
  { date: "2027-01-01", label: "New Year's Day / Q5 peak", type: "sale", note: "Resolution shoppers. Athleisure, wellness, self-improvement products spike." },
  { date: "2027-01-02", label: "New Year sales continue", type: "sale", note: "Q5 momentum. Keep budgets elevated — CPMs still low." },
  { date: "2027-01-03", label: "Review holiday performance", type: "deadline", note: "Full Q4 + Q5 review. Identify winners to keep, losers to draft." },
  { date: "2027-01-04", label: "List Valentine's products", type: "prep", note: "Valentine's search starts mid-Jan. List jewelry, gifts, accessories NOW for Google indexing." },
  { date: "2027-01-05", label: "Weekly product review", type: "deadline", note: "Drafting SOP review rules 6-11. Check ROAS, refund rates, margin on all live products." },
  { date: "2027-01-06", label: "Q5 wind-down check", type: "deadline", note: "CPMs start normalizing. Evaluate which Q5 budgets to pull back." },
  { date: "2027-01-07", label: "Publish spring collection", type: "prep", note: "Transition from winter clearance to spring arrivals. Light layers, rain gear, pastels." },
]
