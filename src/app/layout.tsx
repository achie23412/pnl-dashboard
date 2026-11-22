import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "P&L Dashboard",
  description: "E-commerce Profit & Loss Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
