# House Church Dinner

Shared sign-up app for the every-other-Thursday house church dinner: Oct 15 yumm bowl menu, main dish sign-ups, sides (anyone can add, edit and claim), food ideas, and kids helpers.

## Layout
- `src/app.html` is the app itself (one file: HTML, CSS and JavaScript). **Edit this.**
- `build.py` builds both deploy targets from it.
- `dist/cloudflare/worker.js` is the Cloudflare Worker (page + API in one file). **Paste this into the Worker.**
- `dist/house-church-dinner-netlify.zip` (and `dist/netlify/`) is the Netlify version.
- `cloudflare/` holds the Cloudflare backend (`backend.js`, D1 storage) and the page shim. `netlify/` holds the Netlify function (Blobs storage) and its shim.

## Deploy to Cloudflare (Worker + D1)
1. Storage & databases > D1 SQL database > Create, name it `house-church` (leave it empty; the Worker creates its tables).
2. Compute > Workers & Pages > Create > Start with Hello World! > name it > Deploy > Edit code.
3. Select all, delete, paste the full contents of `dist/cloudflare/worker.js`, Deploy.
4. Settings > Bindings > Add > D1 database. The variable name must be exactly `DB`. Pick `house-church`. Deploy again if asked.
5. Open the `*.workers.dev` link. Check `/api/list?path=slots` returns `{"docs":[]}` (or saved data).

To update later: change `src/app.html`, run `python3 build.py`, paste the new `dist/cloudflare/worker.js` into Edit code, Deploy. Data stays in D1.

No passcode is used. Optional: add a secret named `GROUP_CODE` to require one for changes.

## Data model (same on both hosts)
`slots/<ingredient>`, `mains/<YYYY-MM-DD>`, `sides/<date>/items/<id>`, `kids/<date>-<1|2>`, `bowl-other/<id>`, `ideas/<id>`.

## Schedule rules (in `src/app.html`)
Every other Thursday from 2026-10-15, through 2027-07-31, next six shown. Nov 26 and Dec 24 are skipped (`SKIP_DATES`). December uses only Dec 3 and Dec 17. The list rolls forward each day.
