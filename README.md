# Deft Inbox — WhatsApp Cloud API

Official WhatsApp Business inbox. Sends and receives only through Meta Graph API (`graph.facebook.com`).

## Live site

https://whats-app-apiii-production.up.railway.app/

- Privacy policy: https://whats-app-apiii-production.up.railway.app/privacy
- Webhook: https://whats-app-apiii-production.up.railway.app/api/webhooks/whatsapp
- Verify token: `deft-decor-webhook`

## Run locally

```bash
npm install
npx prisma db push
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:3000 → **Settings** and paste the Cloud API credentials.

## Railway env vars

Set these in Railway → Variables:

- `APP_PIN` — operator PIN for the inbox (recommended in production)
- `SESSION_SECRET` — random string for cookie signing
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WABA_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN=deft-decor-webhook`
- `DATABASE_URL=file:./prisma/dev.db`

## Safety rules

- Free text only inside the 24-hour customer service window
- Templates require opt-in
- 6-second pair rate per recipient
- Daily cap on new template recipients
- `STOP` / unsubscribe blocks the contact
