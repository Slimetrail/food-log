# Food Log
Personal, offline-first food log PWA: barcode scan (Open Food Facts), nutrition-label photo OCR (on-device Tesseract), calorie counter with a gentle minimum target, time since last meal + next-meal countdown, skipped-meal logging, water, goals with weekly charts, Mediterranean guidance from research data, meal planner + prep + grocery list with store-mode scanning.
Play/install: https://slimetrail.github.io/food-log/ (after publishing)

- No build step, no backend, no accounts. All personal data lives in the phone's IndexedDB. Nothing leaves the phone unless you tap Share (weekly check-in / research queue) or Export backup.
- Files: index.html, style.css, app.js, sw.js (versioned cache `foodlog-vN`, precaches everything incl. OCR engine + English data), manifest.webmanifest, icons/, vendor/ (ZXing, Tesseract.js 5 + core + eng traineddata), data/ (research JSON), data-seed/ (fallback targets transcribed from research recommendations), scripts/, test.py (Playwright).
- Research data: `node scripts/sync-data.js` copies JSON from /workspace/mediterranean-research into data/ and writes data/index.json (content hash + per-file version/revision). The app re-fetches data/ when online (network-first) and shows empty states for missing files. Guidance items without sources are never shown.
- Research queue: `node scripts/merge-scan-queue.js <exported.json>` appends exported items into /workspace/mediterranean-research/scan-queue.json (dedupe by barcode).
- Release: bump `?v=` in index.html and VER in sw.js. Run locally: `python3 -m http.server 8820`; tests: `/workspace/.pwvenv/bin/python test.py`.

General wellness guidance, not medical advice.

## Research data rev wiring (2026-10-17)
- `targets.json` rev1: protein/recovery/refuel/weight-alert numbers are recomputed from the latest logged weight (the file's `forProfile` values are ignored). Sodium is not flagged on field days (`maxMgField: null`). Fiber goal only in phase 2, paused when SNAQ ≤ 14 or no-appetite skips. Rapid refuel shows only after tapping "Hiking again within 8 h?".
- `medas.json` rev1: 14 yes/no items, a point when the answer matches `pointWhen` (wording already flips items 5/6/7/11). The wine item (`noTip`, `excludeFromSuggestions`) is never suggested. "I don't drink alcohol" sets max to 13. Shows raw score and trend only, with no cutoffs.
- `questionnaire.json` / `habits.json` / `medas.json`: an item whose `allergens[]` matches the user's allergies shows its `alternativesIfAllergic` text. If no alternative exists for that allergy, the item is hidden.
- `weekly-plan.json` rev2: top-level `mealPlan` (with dates) is used before `referenceMenu`. Days before `weekOf` are auto-filled.
- `meal-timing.json` rev2: desk countdown uses `countdown.dueAfterHours`/`latestHours` (3–4 h). Field days use the fueling interval (every 1 h on hikes over 1 h), the pre-hike meal window (1–4 h before) and recovery within 2 h. The user's own interval is used only when research gives no value.

## In-season produce
- `data/seasonal.json` comes from research (synced by `scripts/sync-data.js`, precached via `data/index.json`). If the file is missing or has no entry for the user's state, seasonal ranking switches off and the app says "Seasonal data not available for your state yet".
- Location is optional: a ZIP code (mapped to a state on the phone, no network) or a state picker; it falls back to the My store state. No GPS.
- ZIP→state uses the standard 3-digit ZIP prefix ranges published by USPS (Publication 65, *National Five-Digit ZIP Code and Post Office Directory*; the same table is summarized at https://en.wikipedia.org/wiki/List_of_ZIP_Code_prefixes). Military (AA/AE/AP) and unassigned prefixes return no state.
