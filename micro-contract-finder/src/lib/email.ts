import { Resend } from "resend";
import type { ScoredOpportunity } from "./sam-gov";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendOpportunityAlert(
  opportunities: ScoredOpportunity[]
): Promise<{ sent: boolean; error?: string }> {
  if (!resend) {
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const fromEmail = process.env.ALERT_FROM_EMAIL || "onboarding@resend.dev";
  const toEmail = process.env.ALERT_TO_EMAIL;

  if (!toEmail) {
    return { sent: false, error: "ALERT_TO_EMAIL not configured" };
  }

  if (opportunities.length === 0) {
    return { sent: false, error: "No opportunities to alert on" };
  }

  const subject =
    opportunities.length === 1
      ? `🎯 New contract match: ${opportunities[0].title.slice(0, 60)}`
      : `🎯 ${opportunities.length} new contract matches`;

  const html = buildAlertEmailHtml(opportunities);

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      return { sent: false, error: error.message };
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function buildAlertEmailHtml(opps: ScoredOpportunity[]): string {
  const rows = opps
    .map((opp) => {
      const deadline = opp.hoursToDeadline ?? 0;
      const deadlineStr =
        deadline < 24
          ? `${deadline}h left`
          : `${Math.floor(deadline / 24)}d ${deadline % 24}h`;
      const val = Number(opp.awardCeiling || opp.baseAndAllOptionsValue || 0);
      const valStr =
        val > 0
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(val)
          : "Not specified";
      const reasons = opp.scoreReasons.length
        ? opp.scoreReasons.join(" • ")
        : "baseline match";

      return `
        <tr>
          <td style="padding:16px;border-bottom:1px solid #e5e7eb;">
            <div style="display:inline-block;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">Score ${opp.score}</div>
            <div style="display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;margin-left:6px;">⏱ ${deadlineStr}</div>
            <h3 style="margin:8px 0 4px 0;font-size:16px;color:#111827;">${escapeHtml(opp.title)}</h3>
            <p style="margin:4px 0;font-size:13px;color:#6b7280;">
              ${escapeHtml(opp.fullParentPathName || opp.department || "Unknown agency")} &bull; ${valStr} &bull; NAICS ${opp.naicsCode || "—"}
            </p>
            <p style="margin:4px 0;font-size:12px;color:#2563eb;">${escapeHtml(reasons)}</p>
            ${opp.uiLink ? `<a href="${escapeHtml(opp.uiLink)}" style="display:inline-block;margin-top:8px;padding:6px 12px;background:#2563eb;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;">View on SAM.gov →</a>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;">
        <table style="max-width:640px;margin:0 auto;background:#ffffff;">
          <tr>
            <td style="padding:24px;background:#111827;color:#ffffff;">
              <h1 style="margin:0;font-size:18px;">🎯 Micro-Contract Alerts</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">${opps.length} new high-score opportunity${opps.length > 1 ? "ies" : ""} found</p>
            </td>
          </tr>
          ${rows}
          <tr>
            <td style="padding:16px;font-size:11px;color:#9ca3af;text-align:center;">
              Alerts sent only for opportunities scoring ≥ ${process.env.ALERT_MIN_SCORE || 70}. Adjust in .env.local.
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
