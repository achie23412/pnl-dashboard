# Dashboard style guide

One look, one way of working, one voice on every page.

## Page layout
- Page title = the sidebar label exactly; breadcrumb = "Section → Title" (e.g. "Finance → COGS Invoices").
- Every page uses `PageShell` (breadcrumb, title, one-sentence description, up to 5 stat cards, optional `actions` on the right of the title).
- Under the stats: filters in one row (`FilterBar`), then the content in `Panel`s, top to bottom in the order you work.
- No extra wrapper boxes, no custom page padding or `max-w-7xl`. PageShell handles spacing.

## Controls
- Filters on a list: `FilterSelect` (pick several, Only show / Hide). Single choices: `PillSelect`. Never a native `<select>`.
- Dates: `SingleDatePicker` / the shared date range.
- Buttons: `Button` — `primary` for the one main action of a section, `secondary` for the rest, `danger` for delete/kill, `ghost` for small links like "Clear".
- Status labels: `Badge` — red = must fix / losing money, amber = check, green = good / done, blue = info, grey = no data.
- Messages: `Notice` — error (failed), warning (data may be incomplete), info, success.
- Loading: `Loading` with "Loading <what>…". Empty: `EmptyState` saying why it's empty and what to do.
- Tables: `TH` / `TD` / `ROW_BORDER` from `ui.tsx`. Numbers right-aligned with `tabular-nums`.

## Voice
- Plain, short English. Sentence case everywhere except page titles (those match the sidebar) ("Price suggestions", not "PRICE SUGGESTIONS" or "Price Suggestions" in body text). Small uppercase labels only via `SectionLabel` / `TH`.
- No emoji in the UI.
- Say what it means and what to do: "3 products below breakeven. Lower the bid or draft them." not "Warning!!".
- Errors: "Couldn't load <what>: <reason>." plus the fix if we know it.
- Money in EUR (€) unless the source is USD (COGS, ShipGoods), then say "$" and "USD".
- Dates: "Tue 25 Nov". Counts: "12 products", not "12 Product(s)".
- Every rule or number says where it comes from (Simo, TSA, Ascend SOP, Kevin, ShipGoods, Windsor).
