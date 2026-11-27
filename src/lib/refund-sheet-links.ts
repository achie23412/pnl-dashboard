// Sheet ids for the refund sheets (safe for the browser: no server imports)
export const ASCEND_SHEET_ID = "1ukZs1R0P4Z0FYiVX4hapb1E_e1hUadOwPbxa5n7nn_4"
export const ASCEND_TABS = [2038217242, 1885869105, 1398658176, 614896530, 1773582589, 1424803024, 909164551, 1387182714, 971111327, 333393489]
export const LUME_SHEET_ID = "1U2-krvX98P2ZnReCiuoh0AhPxsQYGo0lEuUkxU915Rs"
export const LUME_TAB = 1739680988
export const LUME_FROM = "2026-10-01" // read the Lumé sheet from October: matches the Shopify refund import window (45 days) so older sheet rows add their reason to imported refunds
export const sheetUrl = (id: string, gid?: number) => `https://docs.google.com/spreadsheets/d/${id}/edit${gid ? `#gid=${gid}` : ""}`
