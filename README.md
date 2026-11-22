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
- `HYP_PRODUCTION_API_KEY`: production key for the real HYP business. Use the actual HYP Production API key displayed in the HYP API settings, not a copied PayPal IPN URL. An HYP error confirmed that the earlier token was invalid **for Demo**; it did not establish whether it is valid for Production. The retired demo workflow must never receive the production key.

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
## Private ledger sync (optional, gated)

New operational bridge (see `docs/LEDGER_SYNC_RUNBOOK_HE.md`): after HYP confirms issuance, the workflow can update the existing 2026 private Google Sheet **only when Google authorization is configured**. A separate scheduled workflow reconciles already-issued receipts every hour without calling HYP to issue anything. It uses opaque per-payment markers to avoid duplicate ledger rows, preserves the formulas and totals, and keeps the HYP document number/PDF URL in the private Sheet. For failure recovery, provider identifiers are persisted **encrypted** in public GitHub receipt state, never as readable text.

The ChatGPT Google Drive connection cannot automatically be reused inside GitHub Actions. Owner must set either `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_B64` (and share only this ledger with its service account) or `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` with Google Sheets edit scope in GitHub Actions Secrets. Without credentials, automatic Sheets writes **are not active**; the HYP issuance pipeline remains independent.

- Existing Sheet: `רישום קבלות שיר 26`, tab `הכנסות והוצאות BIT/PAYBOX 2026`.
- The ledger reflects confirmed receipts; it is not the legal accounting authority and its annual total must not be described as today's income.
- Older receipts cannot guarantee recovery of a number/PDF if HYP did not return/stash it before this change.
- No new real HYP invoices or receipts should be created to test ledger sync. Test via existing issued records and mock unit tests.

## Payment milestones and installments
See [the Hebrew milestone billing protocol](docs/MILESTONE_BILLING_PROTOCOL_HE.md): approved project payment schedule, one HYP transaction invoice for each due milestone (or one upfront full-project invoice, never both), and a receipt for each received transfer. This is a documented business process; automated milestone tracking and payment matching are not yet implemented.
