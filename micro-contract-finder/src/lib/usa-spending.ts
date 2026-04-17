// USAspending.gov API client — used to show agency-level competitive intel
// on any opportunity's detail view. Does NOT require an API key (public).
// Docs: https://api.usaspending.gov/

export interface AgencyAwardSummary {
  totalAwards: number;
  totalValue: number;
  avgValue: number;
  topRecipients: { name: string; count: number; totalValue: number }[];
}

/**
 * Fetch recent similar awards from USAspending to gauge competition.
 * Looks back 12 months at awards by this agency in this NAICS under $50k.
 */
export async function getAgencyAwardPattern(
  agencyName: string,
  naicsCode: string
): Promise<AgencyAwardSummary | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const response = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            time_period: [{ start_date: fmt(startDate), end_date: fmt(endDate) }],
            agencies: [{ type: "awarding", tier: "toptier", name: agencyName }],
            naics_codes: [naicsCode],
            award_amounts: [{ lower_bound: 0, upper_bound: 50000 }],
            award_type_codes: ["A", "B", "C", "D"], // contract types
          },
          fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date"],
          page: 1,
          limit: 100,
          sort: "Award Amount",
          order: "desc",
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const results: Array<{
      "Recipient Name"?: string;
      "Award Amount"?: number;
    }> = data.results || [];

    if (results.length === 0) {
      return { totalAwards: 0, totalValue: 0, avgValue: 0, topRecipients: [] };
    }

    const totalValue = results.reduce(
      (sum, r) => sum + (Number(r["Award Amount"]) || 0),
      0
    );

    // Aggregate by recipient
    const byRecipient = new Map<
      string,
      { count: number; totalValue: number }
    >();
    for (const r of results) {
      const name = r["Recipient Name"] || "Unknown";
      const amt = Number(r["Award Amount"]) || 0;
      const existing = byRecipient.get(name) || { count: 0, totalValue: 0 };
      byRecipient.set(name, {
        count: existing.count + 1,
        totalValue: existing.totalValue + amt,
      });
    }

    const topRecipients = Array.from(byRecipient.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);

    return {
      totalAwards: results.length,
      totalValue,
      avgValue: totalValue / results.length,
      topRecipients,
    };
  } catch (err) {
    console.error("USAspending enrichment failed:", err);
    return null;
  }
}
