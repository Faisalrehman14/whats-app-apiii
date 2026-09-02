import { NextResponse } from "next/server";
import { canonicalizeContacts } from "@/lib/contacts";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await canonicalizeContacts().catch(() => {});
  const contacts = await prisma.contact.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    conversations: contacts.map((c) => ({
      id: c.id,
      waId: c.waId,
      name: c.name,
      optedIn: c.optedIn,
      blocked: c.blocked,
      lastInboundAt: c.lastInboundAt,
      lastOutboundAt: c.lastOutboundAt,
      unreadCount: c.unreadCount,
      lastMessage: c.messages[0]
        ? {
            body: c.messages[0].body,
            direction: c.messages[0].direction,
            status: c.messages[0].status,
            createdAt: c.messages[0].createdAt,
          }
        : null,
    })),
  });
}
