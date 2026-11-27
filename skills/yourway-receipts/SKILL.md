---
name: yourway-receipts
description: Legacy compatibility router for YOURWAY receipts and payment requests. Read one of the two focused skills instead; never act on the old combined instructions.
---

# YOURWAY – ניתוב לסקילים החדשים

**מסמך תאימות בלבד, לא סקיל תפעולי.**

הסקיל המשולב פוצל לשני סקילים עצמאיים:
- **קבלה רשמית לאחר תשלום:** [yourway-receipt](../yourway-receipt/SKILL.md).
- **דרישת תשלום לפני תשלום:** [yourway-payment-request](../yourway-payment-request/SKILL.md).

קבלות מופקות ב-HYP מסוג 400 בלבד, לאחר אישור בעלת העסק שהכסף התקבל. דרישות תשלום מופקות כתבנית HTML/PDF עצמאית, לא ב-HYP.

אם המשתמשת אומרת 'yourway-receipts' ללא תיאור משימה, יש לברר אם הכוונה לקבלה או לדרישת תשלום, או להסיק זאת מהבקשה עצמה. אין לבצע פעולה מתוך הכללים הישנים של הסקיל המאוחד. אין חשבוניות בתהליך הפעיל.

מסמך אפיון והפעלת ChatGPT/Claude: [docs/YOURWAY_RECEIPT_AND_PAYMENT_REQUEST_SPEC_HE.md](../../docs/YOURWAY_RECEIPT_AND_PAYMENT_REQUEST_SPEC_HE.md).
