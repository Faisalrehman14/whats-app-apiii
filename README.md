# Deft Inbox — WhatsApp Cloud API

Official WhatsApp Business inbox. Sends and receives only through Meta Graph API (`graph.facebook.com`). Unofficial WhatsApp Web clients are not used.

## Run locally

```bash
npm install
npx prisma db push
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:3000 → **Settings** and paste:

- Access token
- Phone number ID
- WhatsApp Business Account ID
- App secret

## Webhook

Meta needs HTTPS. In another terminal:

```bash
ngrok http 3000
```

Callback URL: `https://YOUR-NGROK/api/webhooks/whatsapp`  
Verify token: `deft-decor-webhook`  
Subscribe to the `messages` field.

## Safety rules (keeps the number off restriction)

- Free text only inside the 24-hour customer service window
- Templates require opt-in
- 6-second pair rate per recipient
- Daily cap on new template recipients
- `STOP` / unsubscribe blocks the contact
