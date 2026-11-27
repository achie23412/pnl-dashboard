// Build the reports and post them to the coach's Slack channel, in order: the Main Hub
// (all stores) first, then one Day by day P&L image per Google store.
import { buildCoachReport, messageText, postImage, slackConfigured, HUB_KEY } from "@/lib/coach-report"
import { buildHub } from "@/lib/coach-hub"
import { renderStoreImage, renderHubImage } from "@/lib/coach-report-image"

export async function sendCoachReport(): Promise<{ sent: string[]; errors: string[]; skipped?: string }> {
  const cfg = slackConfigured()
  if (!cfg.token || !cfg.channel) return { sent: [], errors: [], skipped: "SLACK_BOT_TOKEN / SLACK_COACH_CHANNEL not set in Vercel" }
  const [report, hub] = await Promise.all([buildCoachReport(), buildHub()])
  const sent: string[] = []
  const errors: string[] = []
  const jobs: { name: string; render: () => Response }[] = [
    { name: HUB_KEY, render: () => renderHubImage(hub) },
    ...report.stores.map((s) => ({ name: s.store, render: () => renderStoreImage(report, s) })),
  ]
  for (const j of jobs) {
    try {
      const png = await j.render().arrayBuffer()
      await postImage(`${report.reportDate} ${j.name}.png`, png, messageText(report.reportDate, j.name))
      sent.push(j.name)
    } catch (e) {
      errors.push(`${j.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { sent, errors }
}
