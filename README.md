# פתקית

אפליקציית פתקים ותזכורות חמה, שמותקנת באייפון כאתר במסך הבית.

## מה יש כאן

| תיקייה | מה זה |
|---|---|
| `docs/` | האפליקציה עצמה: `index.html`, `sw.js` (עבודה בלי אינטרנט והתראות), `manifest.webmanifest`, אייקונים. GitHub Pages מגיש את התיקייה הזו. |
| `docs/config.js` | הכתובת של שרת ההתראות והמפתח הציבורי שלו. |
| `push-worker/` | שרת ההתראות (Cloudflare Worker). הטלפון שולח אליו את רשימת התזכורות הקרובות, וכל דקה הוא שולח את מה שהגיע זמנו. |
| `tools/` | יצירת האייקונים ובדיקות. |
| `.secrets/vapid.json` | המפתח הפרטי של ההתראות. **לא עולה ל־git.** |

## איפה נשמר המידע

- כל הפתקים נשמרים רק בטלפון (localStorage). בהגדרות יש ״לשמור גיבוי״ ו״לשחזר מגיבוי״.
- לשרת ההתראות נשלחים רק מועדי ההתראות והטקסט שלהן, ל־45 הימים הקרובים לכל היותר בדברים שחוזרים.

## הרצה מקומית

```bash
python3 -m http.server 5173 --directory docs
```

## בדיקות

```bash
node tools/test-worker.mjs
```

```bash
cd tools && npm i --no-save http_ece@1.2.0 && node test-webpush.mjs
```

## העלאה (פעם אחת)

1. **האתר:** ריפו ב־GitHub, ואז Settings → Pages → Branch `main`, תיקייה `/docs`.
2. **שרת ההתראות:** חשבון Cloudflare חינמי, ואז מתוך `push-worker/`:
   ```bash
   npm install
   npx wrangler login
   npx wrangler kv namespace create PITKIT
   ```
   להעתיק את ה־id ל־`wrangler.toml`, למלא את `VAPID_SUBJECT` ו־`ALLOWED_ORIGINS` בכתובת האתר, ואז:
   ```bash
   npx wrangler secret put VAPID_PRIVATE
   npx wrangler deploy
   ```
3. להכניס את כתובת ה־Worker ל־`pushUrl` ב־`docs/config.js` ולהעלות שוב.
4. באייפון: לפתוח את האתר ב־Safari ← שיתוף ← ״הוספה למסך הבית״ ← לפתוח מהאייקון ← הגדרות ← ״להפעיל התראות״.
