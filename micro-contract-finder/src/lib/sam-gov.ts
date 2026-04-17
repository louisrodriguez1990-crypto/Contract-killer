// SAM.gov Opportunities API v2 client.
// Docs: https://open.gsa.gov/api/opportunities-api/

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  department?: string;
  subTier?: string;
  office?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  archiveType?: string;
  archiveDate?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  classificationCode?: string;
  active?: string;
  awardCeiling?: string | number;
  baseAndAllOptionsValue?: string | number;
  description?: string;
  uiLink?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { name?: string; code?: string };
    country?: { name?: string };
  };
  organizationType?: string;
}

export interface SamSearchParams {
  keywords?: string[];
  naicsCodes?: string[];
  maxValue?: number;
  deadlineDaysAhead?: number;
  postedDaysBack?: number;
  setAsideOnly?: boolean;
  limit?: number;
}

export interface ScoredOpportunity extends SamOpportunity {
  score: number;
  hoursToDeadline: number | null;
  scoreReasons: string[];
}

const SAM_BASE = "https://api.sam.gov/opportunities/v2/search";

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Fetch opportunities from SAM.gov and filter client-side for value + keywords.
 * SAM.gov's API doesn't support value-ceiling or free-text filters server-side
 * for open solicitations, so we pull a broader set by NAICS and filter here.
 */
export async function fetchOpportunities(
  params: SamSearchParams = {}
): Promise<SamOpportunity[]> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SAM_GOV_API_KEY missing. Add it to .env.local (get one at sam.gov → Account Details)."
    );
  }

  const {
    naicsCodes = ["541511", "541512", "541430", "541810"],
    deadlineDaysAhead = 7,
    postedDaysBack = 60,
    limit = 100,
  } = params;

  const today = new Date();
  const pastDate = new Date(today.getTime() - postedDaysBack * 86400000);
  const futureDate = new Date(today.getTime() + deadlineDaysAhead * 86400000);

  const query = new URLSearchParams({
    api_key: apiKey,
    limit: String(limit),
    postedFrom: formatDate(pastDate),
    postedTo: formatDate(today),
    rdlfrom: formatDate(today),
    rdlto: formatDate(futureDate),
    ptype: "o,k", // Solicitation + Combined Synopsis/Solicitation
  });

  naicsCodes.forEach((code) => query.append("ncode", code));

  const response = await fetch(`${SAM_BASE}?${query.toString()}`, {
    headers: { Accept: "application/json" },
    // Next.js fetch cache — we want fresh data every refresh.
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SAM.gov auth failed (${response.status}). Check SAM_GOV_API_KEY is valid and approved.`
      );
    }
    if (response.status === 429) {
      throw new Error(
        "SAM.gov rate limit hit (1,000 requests/day free tier). Try again tomorrow."
      );
    }
    throw new Error(
      `SAM.gov API error ${response.status}: ${body.slice(0, 200)}`
    );
  }

  const data = await response.json();
  return (data.opportunitiesData || []) as SamOpportunity[];
}

/**
 * Filter opportunities by max value and keyword match.
 * Keywords use OR logic — match if ANY appears in title or description.
 */
export function filterOpportunities(
  opps: SamOpportunity[],
  options: { maxValue?: number; keywords?: string[]; setAsideOnly?: boolean }
): SamOpportunity[] {
  const { maxValue = 15000, keywords = [], setAsideOnly = false } = options;
  const kwLower = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

  return opps.filter((opp) => {
    // Value check — include opps with unknown value (often micro-purchases).
    const val = Number(opp.awardCeiling || opp.baseAndAllOptionsValue || 0);
    if (val > 0 && val > maxValue) return false;

    // Keyword check
    if (kwLower.length > 0) {
      const text = `${opp.title || ""} ${opp.description || ""}`.toLowerCase();
      if (!kwLower.some((kw) => text.includes(kw))) return false;
    }

    // Set-aside filter
    if (setAsideOnly && !opp.typeOfSetAside) return false;

    return true;
  });
}

/**
 * Compute "opportunity score" 0-100.
 * Higher = more likely under-bid and worth pursuing.
 * Proxies for "no bidders" since SAM doesn't expose bidder count:
 *   - Deadline proximity (open contracts closing soon → fewer responses)
 *   - Micro-purchase value range (< $10k gets less attention)
 *   - Small-business set-aside (narrower competition pool)
 *   - Unspecified value (often indicates small/simple scope)
 */
export function scoreOpportunity(opp: SamOpportunity): ScoredOpportunity {
  let score = 50;
  const reasons: string[] = [];

  const hoursToDeadline = opp.responseDeadLine
    ? Math.round(
        (new Date(opp.responseDeadLine).getTime() - Date.now()) / 3600000
      )
    : null;

  if (hoursToDeadline !== null) {
    if (hoursToDeadline < 24) {
      score += 30;
      reasons.push("closing in under 24 hours");
    } else if (hoursToDeadline < 48) {
      score += 20;
      reasons.push("closing in under 48 hours");
    } else if (hoursToDeadline < 72) {
      score += 15;
      reasons.push("closing within 72 hours");
    } else if (hoursToDeadline < 120) {
      score += 5;
    }
  }

  const val = Number(opp.awardCeiling || opp.baseAndAllOptionsValue || 0);
  if (val > 0 && val < 10000) {
    score += 10;
    reasons.push("true micro-purchase value (< $10k)");
  } else if (val > 0 && val < 15000) {
    score += 5;
    reasons.push("simplified acquisition range");
  }

  if (opp.typeOfSetAside) {
    score += 10;
    reasons.push(
      `${opp.typeOfSetAsideDescription || opp.typeOfSetAside} set-aside (narrower pool)`
    );
  }

  if (val === 0) {
    score += 5;
    reasons.push("value unspecified (often small scope)");
  }

  return {
    ...opp,
    score: Math.min(score, 100),
    hoursToDeadline,
    scoreReasons: reasons,
  };
}

/**
 * Full pipeline: fetch → filter → score → sort.
 */
export async function getScoredOpportunities(
  params: SamSearchParams & { keywords?: string[] }
): Promise<ScoredOpportunity[]> {
  const raw = await fetchOpportunities(params);
  const filtered = filterOpportunities(raw, {
    maxValue: params.maxValue,
    keywords: params.keywords,
    setAsideOnly: params.setAsideOnly,
  });
  const scored = filtered.map(scoreOpportunity);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
