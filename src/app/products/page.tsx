import { redirect } from "next/navigation"

// Products were merged into Product Performance (one product page).
export default function ProductsPage() {
  redirect("/product-performance")
}
