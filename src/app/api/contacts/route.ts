import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { waId?: string; name?: string };
  const waId = (body.waId || "").replace(/[^\d]/g, "");
  if (!waId) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  const contact = await prisma.contact.upsert({
    where: { waId },
    update: {
      name: body.name || undefined,
      optedIn: true,
      optedInAt: new Date(),
    },
    create: {
      waId,
      name: body.name || waId,
      optedIn: true,
      optedInAt: new Date(),
    },
  });

  await prisma.auditEvent.create({
    data: {
      kind: "opt_in",
      detail: `Manual opt-in recorded for ${waId}`,
    },
  });

  return NextResponse.json({ contact });
}
