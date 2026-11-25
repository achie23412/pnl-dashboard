// Who is logged in: "owner" (DASHBOARD_USER) or "coach" (COACH_USER). Stored in a signed,
// httpOnly cookie at login so the server can check it (e.g. only the Owner approves refunds).
import crypto from "crypto"
import { cookies } from "next/headers"

export type Role = "owner" | "coach"
export const ROLE_COOKIE = "pnl_role"

const secret = () => process.env.ROLE_SECRET || process.env.DASHBOARD_PASS || "pnl-dashboard"
const sign = (role: string) => crypto.createHmac("sha256", secret()).update(role).digest("hex").slice(0, 32)

export function roleCookieValue(role: Role): string {
  return `${role}.${sign(role)}`
}

export async function getRole(): Promise<Role | null> {
  const v = (await cookies()).get(ROLE_COOKIE)?.value
  if (!v) return null
  const [role, sig] = v.split(".")
  if ((role === "owner" || role === "coach") && sig === sign(role)) return role
  return null
}
