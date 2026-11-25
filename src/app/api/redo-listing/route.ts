import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { LISTING_SOP_PROMPT } from "@/lib/listing-sop"

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    )
  }

  const body = await req.json()
  const { productInfo, competitorUrl, imageDescription, store } = body

  if (!productInfo && !competitorUrl && !imageDescription) {
    return NextResponse.json(
      { error: "Provide at least one of: productInfo, competitorUrl, or imageDescription" },
      { status: 400 },
    )
  }

  const parts: string[] = []
  if (productInfo) parts.push(`Product information:\n${productInfo}`)
  if (competitorUrl) parts.push(`Competitor URL for reference (write original copy, never copy):\n${competitorUrl}`)
  if (imageDescription) parts.push(`Product image description:\n${imageDescription}`)
  if (store) parts.push(`Target store: ${store}`)

  const userMessage = parts.join("\n\n")

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: LISTING_SOP_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")

    const parsed = parseListing(text)

    return NextResponse.json({ raw: text, parsed })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function parseListing(text: string) {
  const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/)
  const descMatch = text.match(/Description:\s*([\s\S]+?)(?=\n\s*Key Features:|$)/)
  const featuresMatch = text.match(/Key Features:\s*([\s\S]+?)(?=\n\s*File Names:|$)/)
  const filesMatch = text.match(/File Names:\s*([\s\S]+?)$/)

  const features = featuresMatch
    ? featuresMatch[1]
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => l.trim())
    : []

  const fileNames = filesMatch
    ? filesMatch[1]
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => l.trim())
    : []

  return {
    title: titleMatch ? titleMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
    features,
    fileNames,
  }
}
