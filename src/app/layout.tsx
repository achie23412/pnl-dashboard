import type { Metadata } from "next"
import "./globals.css"
import { NavBar } from "@/components/NavBar"

export const metadata: Metadata = {
  title: "P&L Dashboard",
  description: "E-commerce Profit & Loss Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <div className="pt-12">{children}</div>
      </body>
    </html>
  )
}
