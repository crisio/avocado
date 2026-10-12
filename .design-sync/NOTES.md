# design-sync notes

- Shape: package (no Storybook). Kit lives in `ui/`, built with `npm run build:ui` → `ui/dist`. Run the converter from the repo root with `--node-modules ./node_modules --entry ./ui/dist/index.js`.
- Playwright: use `playwright@1.62.1` in `.ds-sync/` (matches cached chromium-1234 in ~/Library/Caches/ms-playwright).
- The kit's base styles (body font Hanken Grotesk, ink, ground, box-sizing) only apply under `.av-root` (the app sets it on `<body>` in index.html). There is no kit export for it, so `.design-sync/root.js` (AvocadoRoot) is shipped via `extraEntries` and used as `cfg.provider`. Without it every preview renders body text in Times.
- `ui/src/styles.css` lists plain 'Hanken Grotesk' / 'Bricolage Grotesque' as fallbacks → `[FONT_MISSING]`. Fixed with `.design-sync/fonts/aliases.css` (in `extraFonts`), mapping the plain names to the fontsource variable woff2s.
- MealCard `badge` (Chip) stretches to the body width — that's the kit's real layout, not a preview bug.

## Run status (2026-10-11) — PAUSED mid first sync
- Project "Avocado · Fresco" (836f6761-…) created and pinned. First batch uploaded: base files + Button, MealCard, TextField.
- All 25 previews authored in `.design-sync/previews/`; the other 22 are captured but NOT yet graded or uploaded. No `_ds_sync.json` uploaded → project is un-anchored (safe state).
- Resume: the retry is pinned → atomic path. Grade the 22 sheets, author `conventions.md`, run the driver, upload everything, `_ds_sync.json` last.
