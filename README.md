# House Church Dinner

Shared sign-up app for the every-other-Thursday house church dinner: Oct 15 yumm bowl menu, main dish sign-ups, sides (anyone can add, edit and claim), food ideas, and kids helpers. Hosted on Cloudflare (Worker + D1 database). Not on Netlify.

## Layout
- `src/app.html` is the app itself (one file: HTML, CSS, JavaScript). **Edit this.**
- `build.py` turns it into `dist/cloudflare/worker.js` (page + API in one Worker file). **Always run it after editing, and commit the result.**
- `cloudflare/backend.js` (D1 storage and API) and `cloudflare/shim.js` (page-side helper) are the other inputs to the build.
- `wrangler.toml.example` is the config Cloudflare needs for Git deploys (see below).

## Update workflow
1. Edit `src/app.html`.
2. `python3 build.py`
3. Commit and push to `main`. Cloudflare redeploys the Worker from GitHub.

## Cloudflare setup
- D1 database `house-church` (empty; the Worker creates its tables on first request), bound to the Worker with the variable name exactly `DB`.
- Git deploy: Worker > Settings > Builds > Connect to Git, repo `Cloudship-Digital/house-church`, branch `main`, no build command, deploy command `npx wrangler deploy`. Copy `wrangler.toml.example` to `wrangler.toml`, fill in the Worker name and D1 database id, and commit it.
- No passcode is used. Optional: add a secret named `GROUP_CODE` to require one for changes.

## Data model
`slots/<ingredient>`, `mains/<YYYY-MM-DD>`, `sides/<date>/items/<id>`, `kids/<date>-<1|2>`, `bowl-other/<id>`, `ideas/<id>`.

## Schedule rules (in `src/app.html`)
Every other Thursday from 2026-10-15 through 2027-07-31, next six shown. Nov 26 and Dec 24 are skipped (`SKIP_DATES`). December uses only Dec 3 and Dec 17. The list rolls forward each day.
