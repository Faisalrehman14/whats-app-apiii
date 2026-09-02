export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureWebhookSubscription } = await import("@/lib/whatsapp");
  ensureWebhookSubscription().catch((error) => {
    console.error("Webhook subscribe on boot failed", error);
  });
}
