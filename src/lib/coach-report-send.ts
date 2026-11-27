// Build the report and post one image per Google store to the coach's Slack channel, in order.
import { buildCoachReport, messageText, postImage, slackConfigured } from "@/lib/coach-report"
import { renderStoreImage } from "@/lib/coach-report-image"

export async function sendCoachReport(): Promise<{ sent: string[]; errors: string[]; skipped?: string }> {
  const cfg = slackConfigured()
  if (!cfg.token || !cfg.channel) return { sent: [], errors: [], skipped: "SLACK_BOT_TOKEN / SLACK_COACH_CHANNEL not set in Vercel" }
  const report = await buildCoachReport()
  const sent: string[] = []
  const errors: string[] = []
  for (const s of report.stores) {
    try {
      const png = await renderStoreImage(report, s).arrayBuffer()
      const file = `${report.reportDate} ${s.store}.png`
      await postImage(file, png, messageText(report, s))
      sent.push(s.store)
    } catch (e) {
      errors.push(`${s.store}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { sent, errors }
}
