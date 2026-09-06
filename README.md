# YelloMark Vendor Catalog Search

A static site that searches across all vendor products (M&S, Offikraft, Loyka, and
any future vendor) in one place, reading live data from the published Google Sheets
"Master" tab.

## How it works

- `app.js` fetches the published Master tab CSV on page load (client-side, no backend).
- [PapaParse](https://www.papaparse.com/) parses the CSV.
- [Fuse.js](https://www.fusejs.io/) powers fuzzy search across product name, category, and vendor.
- Vendor and category filter chips are generated automatically from whatever data is in the sheet — add a new vendor or category and it appears with no code changes.
- Clicking a card opens a detail panel with what's in the Master tab (full vendor-specific detail like Fabric/Contents can be wired in later — see "Next steps" below).

## Files

```
index.html    Page structure
style.css     Visual design
app.js        Data fetching, search, filtering, rendering
```

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `yellomark-portal`). Keep it **public**
   (GitHub Pages on a free plan requires a public repo, or GitHub Pro for private).

2. From this folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial YelloMark portal"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/yellomark-portal.git
   git push -u origin main
   ```

3. On GitHub: go to the repo → **Settings → Pages** → under "Build and deployment",
   set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)` → **Save**.

4. GitHub will give you a live URL, typically:
   `https://YOUR_USERNAME.github.io/yellomark-portal/`
   It can take a minute or two to go live after the first push.

## Updating data

You don't need to touch this repo to update products — the site always reads the
live published CSV. Just edit the Google Sheet; auto-republish is already enabled,
so changes appear on the site within a minute (browser cache aside).

If you ever change the sheet's published URL, update the `MASTER_CSV_URL` constant
at the top of `app.js`.

## Known limitations (v1)

- **Detail panel is Master-tab-only.** Vendor-specific fields (Fabric, Color,
  Specifications, Contents) live in the vendor tabs, not the Master tab, so they
  don't show in the detail popup yet. Next step: publish each vendor tab as its
  own CSV and fetch the matching row on click, using the `Vendor Sheet Reference`
  column to know which sheet/row to pull.
- **Images depend on the Apps Script step** having been run (see project chat)
  to convert Drive folder paths into real hotlink URLs. Until then, thumbnails
  will show "No image".
- **No pagination** — fine at ~150 products, worth adding if the catalog grows
  into the thousands.
