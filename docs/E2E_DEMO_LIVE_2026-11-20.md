# HYP Demo Live E2E verification — 2026-11-20

- Repository: `Trekyourway/invoicing` (public).
- [Actual live HYP DEMO issue test](https://github.com/Trekyourway/invoicing/actions/runs/44803850715): `ISSUED`, `email_acknowledged=true`.
- Actual HYP demo email arrived in the authorized test inbox (not a simulated email).
- HYP demo receipt number: **30964**, issued 2026-11-20, recipient `YOURWAY TEST`, 1.00 ILS, payment type `Other`.
- [Actual original PDF retrieval test](https://github.com/Trekyourway/invoicing/actions/runs/44804491612): valid PDF original, 95,116 bytes.
- Digitally signed PDF: cryptographic signature valid; certificate issuer unknown in the local trust store.
- Original PDF independently stored in a **private** Google Drive DEMO folder and verified by metadata readback.
- Original SHA-256: `41169669ee8fc38d22984d47b09c85b85dc9e27331bb52b49b10902f864c6238`.

This is a test document, not a legal business receipt. A backend server's unattended Google Drive backup was NOT tested; the verified file was manually uploaded during E2E testing.

Security: one-time DEMO key was temporarily hard-coded on a PUBLIC test branch by express user approval. Temporary branches restored to `main`; GitHub run logs erased by API. Rotate the demo key; orphan Git objects may persist.

Remaining work for production: Hostinger deploy, private MySQL, service OAuth/backup, business HYP production plan/key, accountant-check of receipt configuration, and AI/voice/image/Grow connections.
