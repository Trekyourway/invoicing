# YOURWAY | קבלות ודרישות תשלום

**מדיניות מעודכנת: 26.11.2026 — עוסק פטור.**

המערכת תומכת בשני מסלולים נפרדים:

| מסלול | מתי | כלי | תוצר |
| --- | --- | --- | --- |
| **דרישת תשלום עצמאית** | לפני תשלום | [תבנית HTML של YOURWAY](templates/yourway-payment-request.html) | מסמך גבייה להורדה כ-PDF (לא קבלה ולא חשבונית) |
| **קבלה רשמית** | רק לאחר אישור שהכסף התקבל | HYP/EasyCount production, doc type 400 | קבלה רשמית + בקשת שליחה ללקוח |

**אין במסלולים הפעילים הפקת חשבוניות.** הוסרו זרימות HYP type-300 (חשבונית עסקה) והקוד שהפעיל אותן. היסטוריית מסמכים, בקשות ומצבי הנפקה ישנים נשמרת לצורך חשבונאות וביקורת. אין לבצע מחיקות או תיקונים במערכת HYP באופן אוטומטי.

## שני סקילים עצמאיים – מיום 27.11.2026

| סקיל | מתי מפעילים | מסמך | סביבת עבודה |
| --- | --- | --- | --- |
| [yourway-receipt](skills/yourway-receipt/SKILL.md) | כסף כבר התקבל ואושר | קבלה רשמית HYP type 400 | HYP, GitHub, גיליון פרטי |
| [yourway-payment-request](skills/yourway-payment-request/SKILL.md) | נדרש לבקש כסף לפני גבייה | דרישת תשלום YOURWAY PDF | תבנית HTML, הצעה/לקוח, מייל מאושר |

**ChatGPT:** "קראי את skills/yourway-receipt/SKILL.md ופעלי לפיו, קיבלתי..." או "קראי את skills/yourway-payment-request/SKILL.md, מצורפת ההצעה...". אין צורך לכתוב JSON; אפשר לצרף צילום מסך. **אין הבטחה שהסקיל מותקן אוטומטית ב-ChatGPT**.

**Claude Code:** פתחי את הריפו והשתמשי ב-\`/yourway-receipt\` או \`/yourway-payment-request\`. הרשומות נמצאות ב-\`.claude/skills/<name>/SKILL.md\` ומפנות להוראות המקור. גם הפעולות עצמן דורשות הרשאות ואישור בעלת העסק.

**אפיון ו-QA:** [מסמך מטרות, תרחישים והוראות עבודה](docs/YOURWAY_RECEIPT_AND_PAYMENT_REQUEST_SPEC_HE.md). עותק Google Docs נמצא בתיקיית Drive הקיימת [YOURWAY-Invoicing](https://drive.google.com/drive/folders/1OHAHnWbt9JRTG7wMSXAdE11IEhPSMSdu): [לפתוח](https://docs.google.com/document/d/1YnCnhzuS2W_ZtRC5wr1jXipoUNJnyTol1zMypFIFGog/edit).

הסקיל הישן [yourway-receipts](skills/yourway-receipts/SKILL.md) נשמר רק כמפנה תאימות, לא כמסלול ביצוע עצמאי. לא שולחים מסמכים בגלל פתיחת סקיל בלבד.

## דרישת התשלום העצמאית
[פתיחת התבנית](templates/yourway-payment-request.html) — מבוססת על הקובץ שהוכן 26.11.2026: עיצוב YOURWAY AI, שם חברה לחיוב וח.פ., מקבל שירות, קטלוג שירותים עם כמות ומחיר, סך לתשלום, אפשרויות Bit/PayBox/העברה בנקאית, הדפסה ושמירה ב-PDF. **אין קישור תשלום, אין שליחה אוטומטית ואין קריאה ל-HYP.**

כדי להשתמש בתבנית, הורידו אותה ופתחו בדפדפן. גרסת GitHub ציבורית **אינה מכילה שמות/מיילים/ח.פ. של לקוחות או מספרי חשבון בנק אמיתיים**: מלאו אותם בפרטיות לפני יצירת המסמך. יש לאשר את פרטי התשלום והנמען לפני שליחה במייל. דרישה שלא שולמה אינה נרשמת כהכנסה.

## הפקת קבלה
- קוד פעיל: [skills/yourway-receipt/SKILL.md](skills/yourway-receipt/SKILL.md) ו-[receipts-production.yml](.github/workflows/receipts-production.yml).
- רק תקבול מאושר, עם שם לקוח, מייל, סכום, תאריך, אמצעי ואסמכתה. קלט רגיש מוצפן לפני העלאה לתיקיית requests/.
- HYP היא מקור המסמך החשבונאי. GitHub Actions מחזיק state אטום למניעת כפילות; אין ניסיון הנפקה עיוור לאחר כשל/timeout.
- סנכרון התקבול ל[גיליון ההכנסות הקיים](https://docs.google.com/spreadsheets/d/1b6aXwgN1RWVUXTiEU6AcENkXFM_xDDrL3QkyHLw9204/edit) באמצעות ledger-sync מחייב הרשאת Google נפרדת בתוך GitHub Secrets, ואינו בהכרח פעיל. בדקו בלוג הריצה אם דווח NOT_CONFIGURED או LEDGER_PENDING.
- HYP email acknowledgement אינו אישור מסירה לתיבת הדוא״ל; מספר מסמך ו-PDF מחייבים אימות מול מקור רשמי.

## נהלים
- [סקיל קבלה](skills/yourway-receipt/SKILL.md)
- [סקיל דרישת תשלום](skills/yourway-payment-request/SKILL.md)
- [פרוטוקול אבני דרך](docs/MILESTONE_BILLING_PROTOCOL_HE.md)
- [הפעלת קבלות רשמיות ב-GitHub Actions](docs/ACTIONS_PRODUCTION_HE.md)
- [חיבור גיליון הכנסות והרשאות](docs/LEDGER_SYNC_RUNBOOK_HE.md)
- [היסטוריית מסלולי חשבוניות שהוצאו משימוש](docs/RETIRED_HYP_INVOICES_HE.md)

לא הופעל מנגנון רציף חדש שמאזין לתשלומים או שולח דרישות לבד. תבנית הדרישה היא כלי מקומי. אוטומציה בין דרישות לתשלומים ולקבלות היא עבודה עתידית, שדורשת מאגר לקוחות/עסקאות מאובטח.
