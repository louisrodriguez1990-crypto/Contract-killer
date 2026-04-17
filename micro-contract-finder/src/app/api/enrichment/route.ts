import { NextRequest, NextResponse } from "next/server";
import { getAgencyAwardPattern } from "@/lib/usa-spending";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agency = req.nextUrl.searchParams.get("agency");
  const naics = req.nextUrl.searchParams.get("naics");

  if (!agency || !naics) {
    return NextResponse.json(
      { error: "Missing required params: agency, naics" },
      { status: 400 }
    );
  }

  const data = await getAgencyAwardPattern(agency, naics);
  return NextResponse.json(data);
}
