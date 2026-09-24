# Fashion Inspo Libraries

An interactive menswear inspiration catalogue built around seasonal, old-money, and casual styling. The looks are Pinterest-led and matched to separate wardrobe references from Massimo Dutti, Zara, H&M, and UNIQLO, with full-body AI model visualizations, outfit budgets, styling notes, filters, saved looks, lighter alternatives, and guest-specific fit guidance.

## Public version

This repository intentionally contains only the static public experience:

- No authentication, accounts, checkout, payments or admin tools; server-side writes happen only through the optional push endpoint or the repository pipeline
- No private APIs, deployment credentials, project metadata, or environment secrets
- First-visit height and weight settings personalize general size and proportion guidance
- Guest fit settings, saved looks and the site's saved catalogue copy remain in the visitor's browser
- Category and brand controls work as one combined filter across Seasons, Old Money, and Casual
- Massimo Dutti and Zara each have 18 independently authored formula cards; H&M and UNIQLO each have 24
- Every formula uses a brand-only product basket and its own full-body model visualization
- All four brands include separate spring, summer, fall, and winter outfit cards
- The supplied Massimo Dutti, Zara, H&M, and UNIQLO wordmarks are used in the shadow-free brand controls
- Shopping actions open external retailer or search pages; this project does not sell products
- Prices and availability are styling references and may change
- Model images are AI-generated editorial visualizations

The interface uses a neutral pastel glass system with layered translucency, soft depth, responsive cards, and reduced-motion support.

Open `index.html` directly or serve the repository with any static web server. Live sync and the saved copy need http(s) (GitHub Pages or `localhost`); opened as a file, the page still works from the built-in copy in `data/seed.js`.

## Mix & Match (flagship)

Mix & Match is the landing view. Every item in every catalogue — verified products, seasonal-look items and each piece named in a formula — is its own wearable piece (282 today), drawn separately on a layered avatar by garment type, colour, pattern, fit and length. Anything can be combined with anything, inside one brand or across brands.

- Nine slots: outerwear, knit layer, top, bottoms, shoes, belt, watch, bag and eyewear; tuck the top in or out, open or close the jacket
- A live match chance scores colour, formality, season and proportion, with plain-language notes; every wardrobe card shows the chance it would give
- Shuffle rolls a weighted random outfit, Complete the look fills the empty slots with the best options, and locks keep chosen pieces in place
- Crossover or same-brand mode, season filter, search and sorting; colour previews, undo, saved outfits and shareable outfit links
- Match odds compare every catalogue with crossover mixes: outfits possible, share that come out Good or Strong, and the best sampled outfit
- Every lookboard, seasonal look and formula has a "Try on" button that loads its pieces onto the avatar
- Avatar skin, hair and build options; build follows the fit settings

The same engine is published as `data/wardrobe.json` and as `FashionLibrary.studio` in the page. See [API.md](API.md).

## Catalogue data and sync

Catalogue content no longer lives inside `index.html`. Each brand is one file, so more catalogues can be added without touching the page:

```
data/catalogues/<brand>.json   seasonal looks, formulas and products for one brand
data/lookboards.json           the shop-the-composition boards
data/wardrobe.json             generated: every Mix & Match piece, mappings and match odds
data/catalogue.json            manual verification ledger (overlaid onto products)
data/manifest.json             generated: content hash per catalogue
data/seed.js                   generated: built-in copy for first paint and file://
data/inbox/                    drop change files here; the pipeline merges them
```

**Opening fast.** The site keeps its own saved copy: catalogues in IndexedDB and every image, logo and script in the service-worker cache. Returning visits render straight from that copy (offline too) and never download the full library again. Images are stored quietly in the background after the first visit (skipped on data-saver connections). There is nothing for visitors to manage.

**Pull (source → site).** Open pages revalidate `data/manifest.json` every 5 minutes, when the tab regains focus and when the network returns. Only catalogues whose hash changed are downloaded, hash-checked and re-rendered in place, with a short "Catalogue updated" notice. Other open tabs update instantly via `BroadcastChannel`. For push-style updates set `window.FIL_CONFIG={liveUrl:'…'}` (or `<meta name="fil:live-url">`) to an EventSource endpoint; any message triggers a revalidation.

**Push (site → source).** Any product can be corrected from its detail view ("Price or stock changed?"). The correction shows immediately, is shared with other tabs, and is queued. With `FIL_CONFIG.pushUrl` set, the queue is POSTed there as a `fil-changes` bundle; otherwise "Export my changes" in the Catalogue updates panel downloads the same bundle. Put it in `data/inbox/`, and the pipeline applies it and publishes it to every visitor. Once a correction is published it is cleared locally.

**Pipeline.** `node scripts/catalogue-pipeline.mjs` merges the inbox, overlays the ledger, validates every catalogue (ids, prices, https links, assets on disk), then regenerates the manifest, seed and service-worker version. `--check-links` also flags removed product pages; `--check` fails when generated files are stale. The GitHub Action in `.github/workflows/catalogue-pipeline.yml` runs it on data changes, validates pull requests, and re-checks links every 6 hours.

**Adding a brand.** Copy an existing file in `data/catalogues/`, give it a new kebab-case `id`, `label`, `order` and optional `logo`, add its images to `assets/`, and run the pipeline. The brand switch, filters, studio and footer pick it up automatically.

Scripts can also use `window.FashionLibrary` (`catalogues()`, `product(id)`, `sync()`, `updateProduct(...)`, `exportChanges()`, `on('change', fn)`).

## Style categories

- Seasons: spring, summer, fall, and winter
- Old money: restrained tailoring, knitwear, linen, suede, and heritage palettes
- Casual: relaxed layers, clean proportions, and wearable daily combinations

## Disclaimer

This is an independent inspiration project and is not affiliated with, endorsed by, or sponsored by Pinterest, Massimo Dutti, Zara, H&M, or UNIQLO. Brand names belong to their respective owners.
