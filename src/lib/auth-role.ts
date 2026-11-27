// Who is logged in: "owner" (DASHBOARD_USER), "coach" (COACH_USER) or "cs" (CS_USER, customer
// service: only the pages in src/lib/cs-access.ts). The role is part of the
// signed pnl_session cookie (src/lib/session.ts), so the server can check it (e.g. only the Owner
// approves refunds).
import { cookies } from "next/headers"
import { SESSION_COOKIE, verifySession, type Role } from "@/lib/session"

export type { Role }
// Old separate role cookie; login removes it
export const ROLE_COOKIE = "pnl_role"

export async function getRole(): Promise<Role | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value)
}
