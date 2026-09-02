import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { markRead } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.contact.update({
    where: { id },
    data: { unreadCount: 0 },
  });

  const lastInbound = [...contact.messages]
    .reverse()
    .find((message) => message.direction === "inbound" && message.wamid);
  if (lastInbound?.wamid) {
    markRead(lastInbound.wamid).catch(() => {});
  }

  return NextResponse.json({ contact: { ...contact, unreadCount: 0 } });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    optedIn?: boolean;
    blocked?: boolean;
    name?: string;
  };

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      ...(typeof body.optedIn === "boolean"
        ? { optedIn: body.optedIn, optedInAt: body.optedIn ? new Date() : null }
        : {}),
      ...(typeof body.blocked === "boolean" ? { blocked: body.blocked } : {}),
      ...(body.name ? { name: body.name } : {}),
    },
  });

  return NextResponse.json({ contact });
}
