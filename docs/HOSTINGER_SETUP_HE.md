# Hostinger Business — שלבי פריסה אחרי יצירת ריפו ציבורי
1. GitHub: השתמשי ב־`Trekyourway/invoicing` הציבורי שכבר נוצר. אין להציב בו תעודות מזהות, מפתחות, רשומות תשלום או PDF.
2. Hostinger > Business > Create website > Node.js > URL של הריפו הציבורי; בחרי `main` ודומיין זמני. Hostinger תומך ישירות בריפו ציבורי: https://www.hostinger.com/blog/product-updates-week-27-2026/
3. אם GitHub App לא רואה את הריפו, לכי ב-GitHub אל Settings > Applications > Installed GitHub Apps > Hostinger > Configure > Repository access ואשרי ריפו זה בלבד. https://www.hostinger.com/support/how-to-update-github-repository-permissions-for-node-js-hosting/
4. Node.js 22, Start: `npm start`, Entry: `src/server.mjs` אם נדרש. בדקי ש-Hostinger מזהה את סוג הפרויקט.
5. MySQL: צרי DB בחבילת Business, שמרי פרטי התחברות במשתני הסביבה של Hostinger, לא בגיט. הריצי `src/schema.sql` בתוך מסד נתונים ייעודי דרך phpMyAdmin או `npm run migrate` בסביבת שרת מאובטחת.
6. סודות ראשונים: `ADMIN_API_TOKEN` רנדומלי 32+ תווים; `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; השאירי `HYP_ENV=sandbox`, `HYP_ENABLE_LIVE=NO`, `HYP_ALLOW_PRODUCTION=NO` עד טסט דמו.
7. Hostinger > Environment variables: מפתחות HYP Demo (`HYP_API_KEY`, `HYP_API_EMAIL`, `HYP_DEVELOPER_EMAIL`) ומיפוי אמצעי תשלום לאחר אימות, ואז `HYP_ENABLE_LIVE=YES` *רק בסביבת דמו*.
8. אחרי פריסה: `<domain>/health` -> `{"status":"ok"}`; `<domain>/` -> מסך נייד; `/api/payments` ללא auth -> 401.
9. GitHub > Settings > Secrets and variables > Actions > Environment `hyp-demo`: הגדרי מפתח דמו וכתובת מייל בדיקה בלבד. Manual dispatch יפיק קבלה **בדמו** ולא בפרודקשן.
10. Drive: חיבור OAuth אישי בחשבון Google פרטי או הסנכרון המובנה ב-HYP. וודאי העתק PDF אמיתי, לא קובץ דמה.
11. הפקת פרודקשן: רק אחרי קבלה תקינה בדמו ופרטי עוסק/מספור/תשלום/שליחת מייל שנבדקו, הזיני Production API Key ל-Hostinger והפעילי את שני הדגלים. הטסט הראשון חייב להיות על תשלום עסקי אמיתי.

**שימי לב:** שינוי משתני סביבה ב-Hostinger עשוי לדרוש הפעלה/פריסה מחדש. בפריסה מחדש אין לשמור מצב קבלות ב-filesystem — המסד הוא מקור האמת התפעולי.