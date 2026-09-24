# Catalogue inbox

Drop `fil-changes` JSON files here (exported from the site's **Catalogue updates → Export my changes**).
On the next run, `scripts/catalogue-pipeline.mjs` applies them to `data/catalogues/`, moves them to
`data/inbox/applied/`, and republishes the manifest, seed and wardrobe so every open page picks them up.
