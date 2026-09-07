# YelloMark Portal — Merged (Product Search + Vendor Directory)

Two sections behind a single Google Sign-In gate:

- **Product Search** — the M&S/Offikraft/Loyka catalog search (unchanged functionality)
- **Vendor Directory** — the Sunday Team vendor contact/onboarding tool, adapted to live in the same site and write to the same spreadsheet (new "Sunday Team" tab) and the same Drive folder (new "Sunday Team Documents" subfolder inside `yellomark_vendormanagement`)

## Before this will work, you must:

1. Create the **"Sunday Team"** tab in your Google Sheet (see the prompt provided in chat).
2. Replace your Apps Script project's code with the merged version (see `apps-script-merged.gs` provided in chat) and **deploy it as a Web App** (Deploy → New deployment → Web app). Copy the resulting URL.
3. Paste that URL into `app.js`, replacing:
   ```js
   const SUNDAY_TEAM_SCRIPT_URL = "PASTE_YOUR_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
4. Set up a Google Cloud OAuth Client ID (see chat steps) and paste it into `index.html`, replacing:
   ```html
   data-client_id="PASTE_YOUR_GOOGLE_CLIENT_ID_HERE"
   ```
5. Add Charan's and Ravi's Gmail addresses as **Test users** on the OAuth consent screen (Google Cloud Console) — required for either of them to be able to sign in at all.
6. `ADMIN_EMAILS` is already set to:
   ```js
   const ADMIN_EMAILS = [
     "narvindprakash@gmail.com",
     "charan.sunny@gmail.com",
   ];
   ```
   Anyone not listed here defaults to Vendor Directory access only — including any future employee (like Ravi) you haven't added yet.

7. **`SKIP_LOGIN_FOR_TESTING` is currently `true`** near the top of `app.js`. While it's true, the Google Sign-In screen is bypassed entirely and the site boots straight in with admin access (both sections visible) — useful for you and Charan to review progress without the OAuth Client ID being set up yet. **Set this to `false`** once real Google Sign-In should be enforced (required before Ravi starts using it, since he should NOT get admin access).

## How access control works (and its limits)

This is a **UI-level gate**, not a hardened security boundary — agreed as the right trade-off for two trusted teammates. Concretely:
- The email check happens in the browser (`app.js`), not on a server.
- The product CSV is still a publicly published Google Sheets link; anyone with that exact URL could read it directly regardless of login.
- The Apps Script Web App is deployed with "Anyone" access (required for the site to reach it at all).

The one *real* enforcement layer is at the Google Sign-In step itself: because the OAuth consent screen isn't verified/published, **only emails added as "Test users" in Google Cloud Console can complete sign-in at all** — everyone else is blocked by Google before ever reaching the site.

## File overview

```
index.html    Login screen + app shell (nav, both sections)
style.css     Visual design for everything, one consistent theme
app.js        Sign-in handling, role gating, product search, vendor directory
```

## Deploying updates

Same as before — edit files, `git add .`, `git commit -m "..."`, `git push`. GitHub Pages redeploys automatically within a minute or two.
