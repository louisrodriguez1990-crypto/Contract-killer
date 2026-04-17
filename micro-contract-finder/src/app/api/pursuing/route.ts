import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.pursuingOpportunity.findMany({
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { noticeId, title, agency, awardCeiling, responseDeadline, uiLink } =
    body;

  if (!noticeId || !title) {
    return NextResponse.json(
      { error: "noticeId and title required" },
      { status: 400 }
    );
  }

  const item = await prisma.pursuingOpportunity.upsert({
    where: { noticeId },
    create: {
      noticeId,
      title,
      agency: agency || null,
      awardCeiling: awardCeiling ? Number(awardCeiling) : null,
      responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
      uiLink: uiLink || null,
    },
    update: {
      title,
      agency: agency || null,
      awardCeiling: awardCeiling ? Number(awardCeiling) : null,
      responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
      uiLink: uiLink || null,
    },
  });

  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const noticeId = req.nextUrl.searchParams.get("noticeId");
  if (!noticeId) {
    return NextResponse.json({ error: "noticeId required" }, { status: 400 });
  }
  await prisma.pursuingOpportunity
    .delete({ where: { noticeId } })
    .catch(() => null);
  return NextResponse.json({ success: true });
}
