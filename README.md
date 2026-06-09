sa# Women's Clothing Store (Sample)

This workspace contains a minimal, easy-to-manage online store for women's clothing.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Set your Stripe secret key (test mode) and run:

```bash
export STRIPE_SECRET_KEY=sk_test_...
npm start
```

3. Open http://localhost:3000

Admin

- Visit `/admin.html` to add products (image URL or upload).

Notes

- Payment uses Stripe Checkout. Use test keys while developing.
- Contact number and return policy are shown in the site footer.

Webhook

- POST `/webhook` records Stripe events to `orders.json`.
	- To verify signatures, set `STRIPE_WEBHOOK_SECRET` before running.
	- To test locally without Stripe signing, `curl` a JSON payload to `/webhook`.

Example test webhook:

```bash
curl -X POST http://localhost:3000/webhook \
	-H "Content-Type: application/json" \
	-d '{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_123"}}}'
```

Signed webhook verification

1. Install the Stripe CLI and run:

```bash
stripe listen --forward-to localhost:3000/webhook
```

2. The CLI prints a webhook signing secret (starts with `whsec_`). Set it before starting the server:

```bash
export STRIPE_WEBHOOK_SECRET=whsec_...
export STRIPE_SECRET_KEY=sk_test_...
npm start
```

With `STRIPE_WEBHOOK_SECRET` set, the server will validate incoming webhook signatures.

Deployment

This app can be deployed to platforms that run Node.js apps (Render, Heroku, Railway, etc.). Basic steps for Heroku or similar services:

1. Create an app on the host.
2. Set environment variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NOTIFY_EMAIL`, SMTP vars if you want email).
3. Push the repository to the host (or connect via Git).
4. Ensure the start command is `npm start` (already configured).

Files added for publishing:

- `LICENSE` — MIT license
- `.env.example` — example environment variables
- `Procfile` — Heroku/Render process file

Security reminder: never commit real secrets. Use the host's environment variable settings.

