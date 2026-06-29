# Phases And Gaps

## Phase 1 - Scaffolding Done

* Vite React TypeScript app initialized
* Tailwind and PWA plugin configured
* Mobile shell and layout established

## Phase 2 - Capture Workflow Done

* Session setup is implemented
* Barcode scanning is implemented
* Photo capture is implemented
* Manual barcode fallback is implemented

## Phase 3 - Offline Reliability Done

* Queueing with IndexedDB is implemented
* Failed writes are retried when the browser comes back online
* Sync progress UI exists
* Batch sync dashboard now surfaces queue, done, and online state

## Phase 4 - Backend Write Path Done

* Google Apps Script write proxy is wired in and deployed via clasp
* Drive image hosting with rendering `=IMAGE` preview + direct `/view` link per row
* Upload path retries the image at smaller sizes before falling back to a text-only row
* Mock mode supports backend-free development

## Phase 5 - AI Classification Done

* Server-side classification pipeline (OpenRouter/Gemini) on a 1-min timed trigger
* Fills section/category/sub-category/product/size/color/brand/descriptions/confidence
* Flips status `pending` → `confirmed` / `needs_review` by a confidence threshold
* Correction happens in the Google Sheet (no on-device review screen by design)

## Phase 6 - Still Missing

* End-to-end automated tests
* Error reporting and telemetry
* Formal release checklist for Vercel + Apps Script

## Key Gaps To Track

* AI throughput is bounded by Apps Script quotas (~40 rows/min, 6-min execution cap)
* Supabase has been fully removed; do not reintroduce it without a clear trigger (see status summary)

## Recommended Next Order

1. Add tests for sync and queue behavior
2. Add lightweight error reporting/telemetry for field failures
3. Prepare a production release checklist for Vercel env + Apps Script deploys
4. Keep the docs aligned with the live Google Sheets workflow
