import { NextRequest, NextResponse } from "next/server";
import { getScoredOpportunities } from "@/lib/sam-gov";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const naicsCodes = (
      searchParams.get("naics") ||
      process.env.DEFAULT_NAICS_CODES ||
      "541511,541512,541430,541810"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const keywords = (
      searchParams.get("keywords") ||
      process.env.DEFAULT_KEYWORDS ||
      "web design,website,web development,UX,WordPress"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const maxValue = Number(
      searchParams.get("maxValue") || process.env.DEFAULT_MAX_VALUE || 15000
    );

    const deadlineDays = Number(
      searchParams.get("deadlineDays") || process.env.DEFAULT_DEADLINE_DAYS || 7
    );

    const setAsideOnly = searchParams.get("setAsideOnly") === "true";

    const opps = await getScoredOpportunities({
      naicsCodes,
      keywords,
      maxValue,
      deadlineDaysAhead: deadlineDays,
      setAsideOnly,
    });

    return NextResponse.json({
      opportunities: opps,
      count: opps.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/opportunities] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
