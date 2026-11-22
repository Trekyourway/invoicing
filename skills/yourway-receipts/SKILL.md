---
name: yourway-receipts
description: Manage real YOURWAY payments and receipts end-to-end, including screenshot/voice intake, client matching, HYP production issuance, confirmation of customer email, private ledger update, idempotency and prepayment demands.
---

# YOURWAY | ניהול תקבולים ומסמכים — סקיל עבודה

Scope: receipts, trek planning, personal coaching, AI coaching, consulting, project milestones and payment requests. Campaign/lead acquisition automation is a **different skill** and must not be expanded here.

## Core sources and roles
1. **HYP/EasyCount**: the official source of tax/accounting documents, document numbers, issued receipt PDF and export to the accountant.
2. **Private Google Sheet**: search connected Drive for the exact existing title `רישום קבלות שיר 26`, tab `הכנסות והוצאות BIT/PAYBOX 2026`. This is the owner's operational income ledger across treks, coaching, mentoring and AI. Never create a duplicate finance sheet. Prior-year counterpart: `רישום הוצאות קבלות שיר 2025`.
3. **Clients/projects**: match to the appropriate private Drive file, previous trek client sheet, calendar event or lead sheet. Matching a person to the campaigns is not mandatory and must never happen for an unrelated referral/client.
4. **GitHub public repo** `Trekyourway/invoicing`: code + **encrypted receipt requests and non-PII state only**. Do NOT commit customer names, amounts, emails, originals, PDF links, sensitive identifiers or any credentials in plaintext.

## User intake (text, voice or Bit/PayBox/bank screenshot)
- Extract separately: payer name, amount, transfer date, payment platform, provider reference, service or project and stated status.
- If the screenshot says "ממתין", do NOT infer successful receipt. Ask the owner if it was actually received. A clear owner confirmation ("קיבלתי, תוציא") authorizes issuance of the identified confirmed payments.
- Never infer that a transfer, refund, internal balance movement, family transfer, interest or reimbursement is business revenue; if uncertain, classify as pending review.
- Look up the payer across available connected documents and client database to find legal/customer name, **confirmed** recipient email and service description. Never invent an email address.
- Ask for only the remaining material details. When the user supplies multiple receipts, process each independently, one document per actual received transfer; use distinct provider references.

## Duplicate gate, always before issuance
- Compare provider reference + payment method to current receipts/state and relevant ledger.
- If source state is RESERVED, RECONCILE_WITH_HYP, ISSUED or ISSUED_CHECK_DELIVERY, do not blindly rerun or issue a second receipt. Check HYP documents first.
- If missing a unique reference, use conservative fingerprint; ask owner if truly two separate transfers.
- Keep unique reference stable in the encrypted payload and the private ledger.

## After payment was received
1. Confirm business eligibility: HYP account business details, document type `קבלה` (type 400 for exempt business) and a real HYP Production API key. Never use a Demo key against Production or vice versa.
2. Build **encrypted-only** request, using the public key at `keys/receipt_queue_public.pem` with `src/receipt-crypto.mjs` and the existing encryption helper. Encrypt locally/in a trusted runtime *before* uploading anything to public GitHub. Never put PII in workflow inputs, GitHub logs, plaintext issues, branch names or GitHub PR descriptions.
3. Commit one `requests/<uuid>.enc.json` per payment through the repo's existing action flow. The queue auto-executes through `.github/workflows/receipts-production.yml`. Do not rerun manually after ambiguous provider errors.
4. Read GitHub run, inspect non-PII receipt markers. Only mark `ISSUED` when HYP returned a confirmed document; distinguish `email_acknowledged` (provider accepted sending) from **actual client inbox delivery**.
5. Retrieve official HYP document number/PDF URL from HYP or private document source, if possible; do not fabricate numbers. If not retrieved, note `מספר מסמך טרם אומת`.
6. Sync the **existing private 2026 ledger** through `src/ledger-sync.mjs` automatically after successful HYP issuance **only if Google authorization is configured**. The ledger has fixed ID `1b6aXwgN1RWVUXTiEU6AcENkXFM_xDDrL3QkyHLw9204`, tab `הכנסות והוצאות BIT/PAYBOX 2026`, columns A–J. The sync records paid date, business category, legal client name, payment method, amount, HYP issuance, mail acknowledgement and provider document number/PDF when returned. Keep formulas/totals and preserve all previous income entries. If not configured, explicitly report `ledger_not_configured` and never imply the sync occurred. Fallback to manual connector updates only after actual readback and duplicate review.
7. If payer is an ad-generated lead, update its CRM sheet as a separate scoped operation; avoid sending Meta CRM event without the owner's authorization / existing protocol. Referrals, treks, coaching are not campaign leads by default.
8. The accounting official record is HYP. PDF backups should use HYP's built-in private Google Drive backup when enabled. The private ledger is NOT a replacement for issued legal documents.
9. Report compactly: number issued, amounts, client, date, email acknowledged versus confirmed delivery, **separate HYP issuance from Sheets sync**, ledger location and remaining unverified details. If the Google write fails after HYP issuance, label as `LEDGER_PENDING` and run the read-only reconciliation path; **never issue the receipt again**. No self-copy email necessary by default.

## Before payment / proposal / work order / milestones
- Determine if the user asks for `הצעת מחיר`, `הזמנת עבודה`, or `חשבונית עסקה (דרישת תשלום)`. These documents are **not receipts**. Do not issue a receipt until owner-confirmed payment or verified payment provider webhook.
- For a signed/accepted offer, source the current agreed scope/amount/milestones from approved client proposal/Drive/calendar; do not treat tentative draft or calendar appointment as a signed payment agreement.
- Use HYP's quote or proforma flow after confirming supported document type and provider API schema; do not guess document type numeric IDs. Client-facing email must be explicitly authorized before sending a new demand.
- Payment link/card collection is only available when enabled by HYP/acquirer; HYP document API alone does **not** charge the customer. Manual Bit/PayBox receipt requires owner's explicit confirmation; an authentic integrated payment-provider webhook can enable unattended matching later.
- After verified payment, issue legal receipt once and reconcile to the preceding payment request.

## Privacy / quality
- Never log or post client financial details to PUBLIC GitHub.
- Do not assume you receive a copy of customer emails. The owner can enable copy-to-self in HYP: `הגדרות → ניהול ספרים והגדרות ייצוא → כתובת מייל אליה ישלח העתק נוסף מכל מסמך`. The owner currently prefers avoiding receipt inbox clutter; do not enable without request.
- Report only what tools verified; if a connector is missing, do not claim an automatic Drive/Sheet sync exists.
- Do not automatically issue invoices or receipts due to calendar reminders alone.
- This SKILL.md provides a repository-based operational protocol; it is **not** proof that a custom ChatGPT plugin was installed or auto-runs in every chat.

## Automation contract: HYP -> existing Google Sheet
- **HYP is accounting truth, Sheets is an operational mirror.** Never describe an annual spreadsheet total as today's income. Only count confirmed business entries, and flag rows marked `לבדיקה` separately.
- The production receipt workflow invokes `executeReceipt` once. After HYP returns `ISSUED`, `src/receipt-executor.mjs` persists the opaque state in GitHub first and then runs `src/ledger-sync.mjs`. Ledger failure must never cause HYP re-issuance. Preserve HYP's document number and verified PDF link privately in the Sheet when returned; never write them to public GitHub state/logs.
- The read-only recovery workflow `.github/workflows/ledger-reconcile.yml` scans encrypted requests plus opaque HYP status (only `ISSUED`/`ISSUED_CHECK_DELIVERY`) every hour, and adds/reconciles missing ledger rows. It **does not call HYP to create any document**, and cannot recover a prior provider document number that was not captured.
- Sync only after checking the exact existing tab's header and summary formulas. The idempotency token `HYP_SYNC_ID:<opaque HMAC>` is stored only in private column J. An existing row with that token is never inserted again. One uniquely matching legacy row (same date, legal client, method and amount, already marked receipted) may be adopted rather than duplicated; ambiguous matches stop for review.
- New income is inserted directly **above** the `סה״כ` row. Formula ranges are extended and method subtotals recalculated. Preserve distinct totals for Bit, PayBox and bank transfers; verify after the write. Never overwrite summary or historical rows, and never add a new private workbook.
- Google Sheets auth is optional but **must be explicitly configured** in GitHub Actions Secrets: `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_B64` with Editor access to this one Sheet, **or** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` with Sheets edit scope. Do not copy tokens into public code, issues, Actions logs or chats. Without working credentials, only HYP issuance is automated; Sheets sync stays unconfigured.
- Keep future-year entries out of the 2026 sheet. Create/verify the next year's ledger and its mapping before allowing 2027 write operations.
- HYP email acknowledgement means the provider accepted an email request; it does **not** prove inbox delivery. Confirm the legal name and business identifier from the payer's instruction, not from a person's WhatsApp display name. For bank transfers, record the transfer's reference and payer bank details separately from the business's receiving bank account.
- If an HYP payment-demand/invoice was issued under a different customer name, do not silently cancel/replace it as part of receipt synchronization. Flag a separate customer/document correction workflow and follow the accountant's/HYP's formal procedure. Never generate a second open payment demand for an already-paid 400 ₪ transaction.
- The existing GitHub public skill file does not, by itself, install a persistent ChatGPT plugin. AI can follow this workflow when invoked; unattended background sync only starts once GitHub credentials and the workflow have been deployed and verified. No unverified claims of full automation.
