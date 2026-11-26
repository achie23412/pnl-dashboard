"use client"
import { useEffect, useState } from "react"
import { db } from "@/lib/db-client"
import { toFeeSettings, type FeeSettings } from "@/lib/fee-settings"

// Pages: media buyer fee settings per store ({} until loaded or when none are set = no fee)
export function useFeeSettings(): FeeSettings {
  const [s, setS] = useState<FeeSettings>({})
  useEffect(() => {
    db.from("store_settings")
      .select("store,media_buyer_fee_pct,media_buyer_fee_from")
      .then(({ data }) => setS(toFeeSettings(data as never)))
  }, [])
  return s
}
