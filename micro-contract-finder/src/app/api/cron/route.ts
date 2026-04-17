import { NextRequest, NextResponse } from "next/server";
import { getScoredOpportunities } from "@/lib/sam-gov";
import { sendOpportunityAlert } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Scheduled endpoint. Called by:
 *   - Vercel Cron (configured in vercel.json)
 *   - Railway/Render cron workers
 *   - A local `scripts/run-cron.js` for dev
 *
 * Protected by CRON_SECRET query param or Authorization header
 * to prevent public abuse.
 */
export async function GET(req: NextRequest) {
  // Auth check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.nextUrl.searchParams.get("secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const minScore = Number(process.env.ALERT_MIN_SCORE || 70);

  try {
    // Fetch current matching opportunities
    const naicsCodes = (
      process.env.DEFAULT_NAICS_CODES || "541511,541512,541430,541810"
    )
      .split(",")
      .map((s) => s.trim());

    const keywords = (
      process.env.DEFAULT_KEYWORDS ||
      "web design,website,web development,UX,WordPress"
    )
      .split(",")
      .map((s) => s.trim());

    const opps = await getScoredOpportunities({
      naicsCodes,
      keywords,
      maxValue: Number(process.env.DEFAULT_MAX_VALUE || 15000),
      deadlineDaysAhead: Number(process.env.DEFAULT_DEADLINE_DAYS || 7),
    });

    const highScore = opps.filter((o) => o.score >= minScore);

    // Diff against what we've already seen + alerted on
    const existingIds = new Set(
      (
        await prisma.seenOpportunity.findMany({
          where: { noticeId: { in: highScore.map((o) => o.noticeId) } },
          select: { noticeId: true, alertedAt: true },
        })
      )
        .filter((s) => s.alertedAt !== null)
        .map((s) => s.noticeId)
    );

    const newHighScore = highScore.filter((o) => !existingIds.has(o.noticeId));

    let alertResult: { sent: boolean; error?: string } = { sent: false };
    if (newHighScore.length > 0) {
      alertResult = await sendOpportunityAlert(newHighScore);
    }

    // Upsert all seen opps — mark as alerted if email succeeded
    for (const opp of opps) {
      const wasAlerted =
        alertResult.sent && newHighScore.some((n) => n.noticeId === opp.noticeId);
      await prisma.seenOpportunity.upsert({
        where: { noticeId: opp.noticeId },
        create: {
          noticeId: opp.noticeId,
          title: opp.title,
          agency: opp.fullParentPathName || opp.department || null,
          awardCeiling: Number(opp.awardCeiling || 0) || null,
          responseDeadline: opp.responseDeadLine
            ? new Date(opp.responseDeadLine)
            : null,
          score: opp.score,
          alertedAt: wasAlerted ? new Date() : null,
        },
        update: {
          score: opp.score,
          ...(wasAlerted ? { alertedAt: new Date() } : {}),
        },
      });
    }

    return NextResponse.json({
      success: true,
      opportunitiesFound: opps.length,
      highScore: highScore.length,
      newAlerted: alertResult.sent ? newHighScore.length : 0,
      emailError: alertResult.error,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/cron] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
