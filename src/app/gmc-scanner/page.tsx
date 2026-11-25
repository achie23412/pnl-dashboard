import { redirect } from "next/navigation"

// The GMC check lives in the Product Importer ("GMC check" tab).
export default function GMCScannerPage() {
  redirect("/product-importer?tab=gmc")
}
