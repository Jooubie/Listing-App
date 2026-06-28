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

## Phase 4 - Backend Write Path Partial

* Google Apps Script write proxy is wired in
* Google Sheet setup instructions exist
* Mock mode supports backend-free development

## Phase 5 - Still Missing

* Real AI classification pipeline
* Review and correction screen
* End-to-end automated tests
* Error reporting and telemetry
* Final deployment checklist for Vercel and Apps Script releases

## Key Gaps To Track

* Docs still contain historical planning notes that mention earlier Supabase ideas
* `GoogleSheetSetup.md` was cleaned and now matches the current sheet-driven flow

## Recommended Next Order

1. Lock the docs to the actual live architecture
2. Decide whether Supabase stays as future work or gets removed
3. Add the AI/review phase only after the current capture loop is stable
4. Add tests for sync and queue behavior
5. Prepare production Vercel env settings and a release checklist
6. Keep the docs aligned with the live Google Sheets workflow
