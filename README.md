# YOURWAY Invoicing — GitHub Actions First

**Current approach:** GitHub Actions runs temporary Node.js processes; HYP produces legal receipts and sends them by email; HYP's built-in Drive backup is recommended. No always-running Hostinger server or MySQL is required for owner-approved receipt issuance.

## What works
- Live HYP DEMO E2E was verified: HYP receipt 30964, email arrived, signed original PDF fetched and privately saved to Drive. This does not validate a production business account.
- GitHub CI contains tests for encryption, tampering, idempotency, failure handling and issuing logic.
- Real customers' names, emails, amounts and descriptions are **not put in public Git history**; client requests are RSA+AES encrypted with `keys/receipt_queue_public.pem` and placed as `requests/<uuid>.enc.json`.
- `Issue confirmed real receipts via HYP` is triggered by a new encrypted request on the main branch. Only owner-authorized paid transactions may enter this queue. All issue state is tracked through opaque HMAC markers under `receipts/state/`.
- `dont_send_email: 0` tells HYP to email the official document to the client as part of creating the receipt. A separate email API is not required.

## One-time secrets
Go to [GitHub Actions repository secrets](https://github.com/Trekyourway/invoicing/settings/secrets/actions) and set:
- `RECEIPT_PRIVATE_KEY_B64`: owner-only private decryption key from the separately supplied file. **Do not commit or share it.**
- `HYP_PRODUCTION_API_KEY`: production key for the real HYP business. Existing `HYP_DEMO_API_KEY` is used only as a temporary fallback if it in fact holds the production key, as reported by the owner. Remove the legacy alias after adding the canonical one.

GitHub code and receipt metadata are public. Sensitive source fields are encrypted. No running backend or Google service account is required. GitHub Actions are normally free in public repositories.

See the [Hebrew production instructions](docs/ACTIONS_PRODUCTION_HE.md) for operating and failure recovery, and [the HYP DEMO E2E evidence](docs/E2E_DEMO_LIVE_2026-11-20.md) for the existing verified demo.

## Important production gates
The real HYP plan/key and exempt-business profile must be valid; do not issue fictional receipts in production. The GitHub production action only runs after a user confirms payment was received and explicitly authorizes issuing a real receipt. HYP native Drive backup still needs to be enabled in the business portal. Some legacy `src/server.mjs` and MySQL code is retained for compatibility, but is **not used by the new production workflow**.

## Commands

```bash
npm test                  # automated tests; no real HYP side effects
node src/receipt-queue-encrypt.mjs --stdin < private-request.json
```

**Never commit the plaintext `private-request.json` file.** The CLI supports stdin so other assistants or local agents can pipe data without writing a file.