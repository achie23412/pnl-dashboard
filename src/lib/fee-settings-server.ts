import { getServiceClient } from "@/lib/supabase"
import { toFeeSettings, type FeeSettings } from "@/lib/fee-settings"

// Server side: read the media buyer fee settings. On any error: no fees (all 0).
export async function loadFeeSettings(): Promise<FeeSettings> {
  try {
    const { data } = await getServiceClient().from("store_settings").select("store,media_buyer_fee_pct,media_buyer_fee_from")
    return toFeeSettings(data)
  } catch {
    return {}
  }
}
