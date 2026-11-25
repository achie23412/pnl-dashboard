// GMC pre-launch check for a generated listing. Pure function, runs on client and server.
// "critical" = Merchant Center requirement / disapproval risk → blocks approval.
// "warning"  = Ascend listing SOP rule (or a claim not backed by the source) → fix or accept.

export type ListingDraft = {
  title: string
  description: string
  features: string[]
  fileNames: string[]
  price: number | null
  images: string[]
  variants: { title: string; price: string }[]
}

export type GmcIssue = { level: "critical" | "warning"; field: string; message: string; source: string }

const PROMO = [
  "free shipping", "free delivery", "sale", "% off", "discount", "best price", "cheapest", "cheap", "buy now",
  "limited time", "limited stock", "only today", "hurry", "order now", "coupon", "deal", "clearance", "bestseller", "best seller",
]
const SUPERLATIVES = ["best", "#1", "number one", "perfect", "ultimate", "world's", "guaranteed"]
const COLOURS = [
  "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "grey", "gray", "beige",
  "navy", "khaki", "cream", "ivory", "burgundy", "maroon", "olive", "camel", "tan", "gold", "silver", "teal", "mint",
  "apricot", "coffee", "wine", "lilac", "rose",
]
const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl", "small", "medium", "large", "plus size"]
// Attributes the SOP says never to state unless the source supplies them
const UNVERIFIED = [
  "waterproof", "water resistant", "breathable", "100%", "cotton", "linen", "silk", "wool", "cashmere", "leather",
  "polyester", "organic", "certified", "hypoallergenic", "made in", "machine wash", "hand wash", "uv protection",
  "anti-slip", "sustainable", "eco-friendly", "recycled", "vegan",
]

const has = (text: string, phrase: string) =>
  new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text)

export function checkListing(d: ListingDraft, sourceText = ""): GmcIssue[] {
  const issues: GmcIssue[] = []
  const GMC = "Google Merchant Center requirement"
  const SOP = "Ascend listing SOP"
  const title = d.title.trim()
  const desc = d.description.trim()
  const all = `${title} ${desc} ${d.features.join(" ")}`

  // ── Critical (GMC)
  if (!title) issues.push({ level: "critical", field: "Title", message: "Title is empty.", source: GMC })
  if (title.length > 150) issues.push({ level: "critical", field: "Title", message: `Title is ${title.length} characters; Google cuts off at 150.`, source: GMC })
  if (!desc) issues.push({ level: "critical", field: "Description", message: "Description is empty.", source: GMC })
  if (d.images.length === 0) issues.push({ level: "critical", field: "Images", message: "No product image.", source: GMC })
  if (!d.price || d.price <= 0) issues.push({ level: "critical", field: "Price", message: "No price set.", source: GMC })
  for (const p of PROMO) {
    if (has(all, p)) issues.push({ level: "critical", field: "Text", message: `Promotional text "${p}" in the listing.`, source: `${GMC} (no promotional text)` })
  }
  const caps = title.split(/\s+/).filter((w) => /^[A-Z]{4,}$/.test(w))
  if (caps.length) issues.push({ level: "critical", field: "Title", message: `ALL CAPS word(s): ${caps.join(", ")}.`, source: `${GMC} (editorial)` })
  if (/!/.test(title)) issues.push({ level: "critical", field: "Title", message: "Exclamation mark in the title.", source: `${GMC} (editorial)` })

  // ── Warnings (SOP)
  if (title && (title.length < 70 || title.length > 100))
    issues.push({ level: "warning", field: "Title", message: `Title is ${title.length} characters; the SOP aims for 70–100.`, source: SOP })
  const dashes = (title.match(/–/g) || []).length
  if (title && dashes !== 1) issues.push({ level: "warning", field: "Title", message: `Title has ${dashes} en dashes (–); the SOP uses exactly one.`, source: SOP })
  const colours = COLOURS.filter((c) => has(title, c))
  if (colours.length) issues.push({ level: "warning", field: "Title", message: `Colour in the title (${colours.join(", ")}); colour belongs in variants.`, source: SOP })
  const sizes = SIZES.filter((s) => has(title, s) && s.length > 1)
  if (sizes.length) issues.push({ level: "warning", field: "Title", message: `Size in the title (${sizes.join(", ")}); size belongs in variants.`, source: SOP })
  const words = title.toLowerCase().replace(/[–-]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  const repeated = Array.from(new Set(words.filter((w, i) => words.indexOf(w) !== i)))
  if (repeated.length) issues.push({ level: "warning", field: "Title", message: `Repeated word(s): ${repeated.join(", ")}.`, source: SOP })
  const sentences = desc ? (desc.match(/[.!?](\s|$)/g) || []).length : 0
  if (desc && sentences !== 5) issues.push({ level: "warning", field: "Description", message: `Description has ${sentences} sentences; the SOP uses exactly 5.`, source: SOP })
  if (d.features.length !== 3) issues.push({ level: "warning", field: "Key features", message: `${d.features.length} key features; the SOP uses exactly 3.`, source: SOP })
  if (d.fileNames.length !== 20) issues.push({ level: "warning", field: "File names", message: `${d.fileNames.length} file names; the SOP uses 20.`, source: SOP })
  for (const s of SUPERLATIVES) {
    if (has(all, s)) issues.push({ level: "warning", field: "Text", message: `Unsupported superlative "${s}".`, source: `${SOP} (GMC compliance)` })
  }
  const src = sourceText.toLowerCase()
  for (const u of UNVERIFIED) {
    if (has(all, u) && !src.includes(u)) {
      issues.push({ level: "warning", field: "Text", message: `"${u}" is in the new listing but not in the source product. Remove it unless you can verify it.`, source: `${SOP} (do not guess attributes)` })
    }
  }
  if (d.images.length === 1) issues.push({ level: "warning", field: "Images", message: "Only 1 image.", source: "Listing quality" })
  return issues
}

export const isReady = (issues: GmcIssue[]) => !issues.some((i) => i.level === "critical")
