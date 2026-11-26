# הוצאה משימוש של מסלולי חשבוניות HYP – 26.11.2026

**החלטת בעלת העסק:** עוסק פטור משתמשת ב-HYP להפקת **קבלות בלבד**, ומשתמשת במסמך עצמאי ל**דרישת תשלום**. לא מפיקים יותר חשבונית עסקה במסגרת האוטומציה.

## מה הוסר מעץ העבודה הפעיל
- GitHub workflows: invoices-production.yml, invoice-reconcile.yml, payment-demand-production.yml.
- סקריפטים ליצירת HYP type-300: invoice.mjs, invoice-issue-once.mjs, invoice-reconcile.mjs, payment-demand-issue-once.mjs.
- בדיקות ייעודיות למסלולים האלה (invoice.test.mjs, payment-demand-manual.test.mjs), שהחלפו בבדיקת המדיניות החדשה.
- רישומי invoice-requests, payment-demand-requests, invoice-reconcile-requests, invoices/state **לא נמחקו**. הם נותרים כראיה היסטורית ואינם מפעילים זרימת עבודה.

## מה נשאר פעיל
- HYP /api/createDoc עבור **קבלה** type 400, רק לאחר אישור כסף שהתקבל, דרך receipts-production.yml.
- תבנית [דרישת תשלום](../templates/yourway-payment-request.html) עם שמירה כ-PDF **ללא שום קריאה ל-HYP**.
- ledger-sync עבור **תקבולים שהתקבלו וקבלות שהונפקו**, אם חיבור Google Sheets הופעל ואומת; אין להכניס דרישות פתוחות להכנסות.

## הגבלות חשובות
- שינוי הקוד או השבתת workflows **אינם מבטלים, מתקנים או מוחקים מסמכים קיימים בחשבון HYP**.
- אם צריך לתקן מסמך היסטורי, יש לבדוק קודם את HYP ואת הנהלת החשבונות כדי להימנע ממסמכים כפולים.
- Source code ישן נגיש בהיסטוריית Git בלבד. אין להפעיל ממנו HYP type 300.
- דרישות תשלום הן מסמכי גבייה עצמאיים ולא חשבוניות/קבלות.
- זה שינוי תהליך הנפקה, לא חוות דעת משפטית או ביטול חיובים שכבר נוצרו.
