export const metadata = {
  title: "Privacy Policy — Deft Decor WhatsApp Inbox",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[#e9edef]">
      <p className="text-sm text-[#8696a0]">Deft Decor</p>
      <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[#8696a0]">Last updated: 2 September 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-6 text-[#cfd4d8]">
        <p>
          Deft Decor (&quot;we&quot;, &quot;us&quot;) uses the official WhatsApp Business Cloud API,
          provided by Meta Platforms, to message customers who have opted in. This policy
          explains what we collect and why.
        </p>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Information we process</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>WhatsApp phone numbers of customers who message us or opt in</li>
            <li>Message content, templates, delivery status, and timestamps</li>
            <li>Display names provided by WhatsApp</li>
            <li>Opt-in / opt-out and block status</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">How we use it</h2>
          <p>
            We use this information only to operate customer support and service chats on
            WhatsApp, send opted-in notifications, and keep the account within WhatsApp
            messaging policies. We do not sell personal data.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Sharing</h2>
          <p>
            Messages are transmitted through Meta / WhatsApp Cloud API. We do not share
            customer chats with unrelated third parties except when required by law.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Retention</h2>
          <p>
            Conversation history is stored so our team can reply. Customers can ask us to
            delete their chat data. Sending STOP on WhatsApp opts the number out of further
            template messages.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-white">Contact</h2>
          <p>
            For privacy requests related to WhatsApp messaging, contact Deft Decor through
            the same WhatsApp business thread or the Meta Business Suite account that owns
            this app.
          </p>
        </section>
      </div>
    </main>
  );
}
