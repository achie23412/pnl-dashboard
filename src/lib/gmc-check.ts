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

// ── Live products (already in the store). Each issue says how to fix it.
export type LiveIssue = { level: "critical" | "warning"; field: string; message: string; fix: string; source: string }

export type LiveProductInput = {
  title: string
  descriptionText: string
  productType: string
  images: number
  variants: { price: number; compareAt: number | null; available: boolean }[]
}

export function checkLiveProduct(p: LiveProductInput): LiveIssue[] {
  const out: LiveIssue[] = []
  const GMC = "Google Merchant Center"
  const SOP = "Ascend listing SOP"
  const title = p.title.trim()
  const all = `${title} ${p.descriptionText}`

  // Critical: likely disapproval / not shown
  if (p.images === 0) out.push({ level: "critical", field: "Images", message: "No product image.", fix: "Add at least one clear product photo in Shopify (Products → Media).", source: GMC })
  if (!p.variants.length || p.variants.every((v) => !v.price || v.price <= 0))
    out.push({ level: "critical", field: "Price", message: "No price above 0.", fix: "Set a price on every variant.", source: GMC })
  if (!p.descriptionText.trim()) out.push({ level: "critical", field: "Description", message: "Description is empty.", fix: "Write a 5-sentence factual description (SOP format: main search term + what it looks like, no promo text).", source: GMC })
  if (title.length > 150) out.push({ level: "critical", field: "Title", message: `Title is ${title.length} characters (Google limit 150).`, fix: "Shorten to 70–100 characters, most important keywords first.", source: GMC })
  for (const w of PROMO) {
    if (has(all, w)) out.push({ level: "critical", field: "Text", message: `Promotional text "${w}".`, fix: `Remove "${w}" from the title/description; Google rejects promotional wording in product data.`, source: `${GMC} (promotional text)` })
  }
  const caps = title.split(/\s+/).filter((w) => /^[A-Z]{4,}$/.test(w))
  if (caps.length) out.push({ level: "critical", field: "Title", message: `ALL CAPS word(s): ${caps.join(", ")}.`, fix: "Write those words in normal capitalisation.", source: `${GMC} (editorial)` })
  if (/!/.test(title)) out.push({ level: "critical", field: "Title", message: "Exclamation mark in the title.", fix: "Remove the exclamation mark.", source: `${GMC} (editorial)` })
  const broken = p.variants.filter((v) => v.compareAt !== null && v.compareAt > 0 && v.compareAt <= v.price)
  if (broken.length) out.push({ level: "critical", field: "Price", message: `${broken.length} variant(s) have a compare-at price that is not higher than the price.`, fix: "Clear the compare-at price on those variants (or set it correctly); a 'sale' that isn't lower looks wrong to Google and shoppers.", source: GMC })

  // Warnings: stock + SOP quality
  const inStock = p.variants.filter((v) => v.available).length
  if (p.variants.length && inStock === 0)
    out.push({ level: "warning", field: "Stock", message: "Every variant is sold out.", fix: "Check the supplier stock. If it can't be restocked, draft the product (Drafting SOP) so ad spend doesn't go to an unbuyable item.", source: "Stock" })
  // The live Google stores follow coach Kevin's listing rule (55–70 characters), not the Ascend SOP's 70–100.
  if (title && (title.length < 55 || title.length > 70) && title.length <= 150)
    out.push({ level: "warning", field: "Title", message: `Title is ${title.length} characters (store rule 55–70).`, fix: "Rewrite to 55–70 characters: Gender + Style + Product type – key attributes, keyword first.", source: "Coach Kevin's listing rules" })
  const colours = COLOURS.filter((c) => has(title, c))
  if (colours.length) out.push({ level: "warning", field: "Title", message: `Colour in the title (${colours.join(", ")}).`, fix: "Move colour to the variant options and take it out of the title.", source: SOP })
  const sizes = SIZES.filter((s) => s.length > 2 && has(title, s))
  if (sizes.length) out.push({ level: "warning", field: "Title", message: `Size in the title (${sizes.join(", ")}).`, fix: "Sizes belong in the variants, not the title.", source: SOP })
  const words = title.toLowerCase().replace(/[–-]/g, " ").split(/\s+/).filter((w) => w.length > 3)
  const repeated = Array.from(new Set(words.filter((w, i) => words.indexOf(w) !== i)))
  if (repeated.length) out.push({ level: "warning", field: "Title", message: `Repeated word(s): ${repeated.join(", ")}.`, fix: "Use each word once in the title.", source: SOP })
  if (p.descriptionText.trim() && p.descriptionText.trim().length < 120)
    out.push({ level: "warning", field: "Description", message: "Very short description.", fix: "Expand to 5 factual sentences (shape, details, occasion).", source: SOP })
  for (const s of SUPERLATIVES) {
    if (has(all, s)) out.push({ level: "warning", field: "Text", message: `Unsupported claim "${s}".`, fix: `Remove "${s}" unless you can back it up.`, source: `${SOP} (GMC compliance)` })
  }
  if (p.images === 1) out.push({ level: "warning", field: "Images", message: "Only 1 image.", fix: "Add more angles; products with several photos convert better.", source: "Listing quality" })
  if (!p.productType.trim()) out.push({ level: "warning", field: "Product type", message: "No product type.", fix: "Set the product type in Shopify (e.g. Dresses); it helps the feed categorise the product.", source: "Feed quality" })
  return out
}
