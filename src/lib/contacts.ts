import { prisma } from "@/lib/db";
import { normalizeWaId, waIdAliases } from "@/lib/phone";

export async function findContactByWaId(input: string) {
  const aliases = waIdAliases(input);
  if (!aliases.length) return null;
  return prisma.contact.findFirst({
    where: { waId: { in: aliases } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function canonicalizeContacts() {
  const contacts = await prisma.contact.findMany();
  for (const contact of contacts) {
    const canonical = normalizeWaId(contact.waId);
    if (!canonical || canonical === contact.waId) continue;
    const other = await prisma.contact.findUnique({ where: { waId: canonical } });
    if (!other) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { waId: canonical },
      });
      continue;
    }
    await prisma.message.updateMany({
      where: { contactId: contact.id },
      data: { contactId: other.id },
    });
    await prisma.contact.update({
      where: { id: other.id },
      data: {
        name: other.name || contact.name,
        optedIn: other.optedIn || contact.optedIn,
        optedInAt: other.optedInAt || contact.optedInAt,
        lastInboundAt: laterDate(other.lastInboundAt, contact.lastInboundAt),
        lastOutboundAt: laterDate(other.lastOutboundAt, contact.lastOutboundAt),
        unreadCount: other.unreadCount + contact.unreadCount,
        blocked: other.blocked || contact.blocked,
      },
    });
    await prisma.contact.delete({ where: { id: contact.id } });
  }
}

function laterDate(a?: Date | null, b?: Date | null) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}
