# YOURWAY Invoicing

**Public-source / private-data production architecture** for an Israeli exempt business issuing HYP/EasyCount receipts.

- **Current staged product vision:** [`docs/ROADMAP_HE.md`](docs/ROADMAP_HE.md) (AI request → screenshot intake → HYP accountant reporting → direct verified payments).
- Detailed implementation specification: [`docs/ARCHITECTURE_HE.md`](docs/ARCHITECTURE_HE.md) (some older manual-first assumptions are superseded by the roadmap).
- Hostinger Business Node.js (Node 22) + private MySQL database. `npm start` launches mobile admin UI.
- Production source may be **public**; secrets and real financial documents must never be checked into Git or CI artifacts.
- Sandbox is the default; production issue requires `HYP_ENV=production`, `HYP_ENABLE_LIVE=YES`, `HYP_ALLOW_PRODUCTION=YES`, a real production API key, and accountant/owner acceptance of an E2E test.
- One HYP document per verified payment; reservation in durable DB **before** external network call; ambiguity never retries automatically.
- HYP requests emailed receipt, notifies admin status, and stores legal PDF. Optional independent Google Drive OAuth backup and Drive screenshot inbox polling are provided; HYP's native Drive backup can be used instead.
- **Stage A:** An AI agent receives a natural-language, voice or image request from the owner and submits structured receipt details to this server; the owner's explicit instruction is the receipt authorization. The agent-to-server connector is not yet installed. The manual mobile form is a fallback.
- **Stage B:** Drive screenshot inbox/OCR assisted intake, optional and with exception handling. **Stage B.1:** use HYP's built-in accountant exports/automated reports before writing custom accounting reports. **Stage C:** verified Grow/other-provider transaction webhooks with no human action, while preventing duplicate issuance by Grow and HYP.

## First-time deployment

1. Use the separate PUBLIC `Trekyourway/invoicing` GitHub repository; do not make `Trekyourway/sandbox` public.
2. In Hostinger > Business > New Node.js web app choose `Trekyourway/invoicing`, main branch, temporary domain (no purchase).
3. Set Node v22, startup `npm start` / entry `src/server.mjs`, and environment variables per `.env.example`. Ensure `ADMIN_API_TOKEN` is randomly generated (32+ chars) and not shared.
4. Create MySQL DB in Hostinger, and set `DB_HOST=127.0.0.1`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Run `npm run migrate` through a supported trusted deployment/terminal mechanism; if unavailable, import `src/schema.sql` in hPanel phpMyAdmin for the assigned database.
5. Verify `https://<temporary-host>/health` returns `{"status":"ok"}`, `/` mobile UI loads, and `/api/status` is inaccessible without a token.
6. On GitHub configure Actions demo environment secrets only. Trigger the sandbox smoke test manually; verify the DEMO document, actual email received, PDF, and correct details in EasyCount DEMO.
7. Configure *one* private Drive backup: HYP built-in (when HYP account allows), or private OAuth refresh token on Hostinger. Verify a real PDF in Drive; screenshot inbox uses separate Drive folder with OAuth.
8. After accountant confirms document type, business profile and serial numbering, enable production API subscription/key and Hostinger's two production opt-ins. A real business payment is required to test a legal production receipt. Don't issue fictional production documents.
9. Hostinger Cron `node src/scan.mjs` for Drive inbox scanning, using the website's env file; see official Hostinger Node cron support. API polling is a supplement to the mobile admin UI.

## Commands

```bash
npm install
npm test
npm run migrate
npm start
```

## Known release blockers

- GitHub public repo and CI are green (49/49 tests).
- HYP DEMO live `createDoc` PASSED on 2026-11-20: receipt #30964, email delivered to the authorized test inbox, provider-issued original signed PDF verified and privately archived in Google Drive. See [`docs/E2E_DEMO_LIVE_2026-11-20.md`](docs/E2E_DEMO_LIVE_2026-11-20.md). **This was a manually orchestrated demo archive, not an automated production backup.**
- The temporary demo credential was placed in a public test workflow on explicit request; the workflow was removed from live branches and its run logs deleted, but historical Git objects may remain. **Rotate HYP DEMO key** before reuse. Production keys must never be public.
- HYP production API-capable subscription and payment issue remain unresolved; screenshot showed test-only key and billing error.
- Hostinger deployment + live MySQL + independent Google OAuth/automated backup have NOT been configured or verified.
- Live AI/voice/image agent intake and verified payment webhooks remain roadmap tasks.

Do not call this service production-ready until all release gates in the specification pass.