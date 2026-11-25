import { redirect } from "next/navigation"

// The GMC pre-launch check now runs inside the product listing workflow (step 3).
export default function GMCScannerPage() {
  redirect("/product-importer")
}
