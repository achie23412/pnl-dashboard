import type { Metadata } from "next"
import "./globals.css"
import { NavBar } from "@/components/NavBar"

export const metadata: Metadata = {
  title: "PNL — Command Center",
  description: "E-commerce Profit & Loss Dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NavBar />
        <div style={{ marginLeft: "var(--sidebar-w)" }}>{children}</div>
      </body>
    </html>
  )
}
