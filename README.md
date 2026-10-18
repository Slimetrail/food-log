# Food Log
Personal, offline-first food log PWA: barcode scan (Open Food Facts), nutrition-label photo OCR (on-device Tesseract), calorie counter with a gentle minimum target, time since last meal + next-meal countdown, skipped-meal logging, water, goals with weekly charts, Mediterranean guidance from research data, meal planner + prep + grocery list with store-mode scanning.
Play/install: https://slimetrail.github.io/food-log/ (after publishing)

- No build step, no backend, no accounts. All personal data lives in the phone's IndexedDB. Nothing leaves the phone unless you tap Share (weekly check-in / research queue) or Export backup.
- Files: index.html, style.css, app.js, sw.js (versioned cache `foodlog-vN`, precaches everything incl. OCR engine + English data), manifest.webmanifest, icons/, vendor/ (ZXing, Tesseract.js 5 + core + eng traineddata), data/ (research JSON), data-seed/ (fallback targets transcribed from research recommendations), scripts/, test.py (Playwright).
- Research data: `node scripts/sync-data.js` copies JSON from /workspace/mediterranean-research into data/ and writes data/index.json (content hash + per-file version/revision). The app re-fetches data/ when online (network-first) and shows empty states for missing files. Guidance items without sources are never shown.
- Research queue: `node scripts/merge-scan-queue.js <exported.json>` appends exported items into /workspace/mediterranean-research/scan-queue.json (dedupe by barcode).
- Release: bump `?v=` in index.html and VER in sw.js. Run locally: `python3 -m http.server 8820`; tests: `/workspace/.pwvenv/bin/python test.py`.

General wellness guidance, not medical advice.
