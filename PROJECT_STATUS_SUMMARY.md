# Project Status Summary

## What This App Is

Joub is a mobile-first PWA for warehouse photographers. The core loop is:

1. Set photographer + platform
2. Scan barcode
3. Capture or upload a product photo
4. Save the capture
5. Retry sync automatically when online

## Current Architecture

* Frontend: React 19 + TypeScript + Vite
* UI: Tailwind CSS v4 + Lucide icons
* Scanning: `@zxing/browser`
* Offline queue: IndexedDB via `idb`
* Deployment: Vercel-friendly static build
* Backend write path: Google Apps Script web app (Drive image hosting + Sheets row append)
* AI classification: server-side in Apps Script via OpenRouter/Gemini on a 1-min timed trigger

## What Is Already Done

* Mobile-first session setup screen
* Barcode scanner with camera selection and manual fallback
* Photo capture screen with shutter, retake, skip, and file upload fallback
* IndexedDB offline queue
* Auto-sync on browser reconnect
* PWA build and service worker generation
* Mock mode for local development without live services
* Compact dashboard for captured, synced, and queued counts
* Manual batch sync action for operator confirmation
* Drive image hosting with a rendering `=IMAGE` preview + direct `/view` link per row
* Server-side AI classification (OpenRouter/Gemini) filling section/category/product/etc.

## What Is Missing Or Still Partial

* No on-device review/confirm screen — intentional; the owner revises in the Sheet
* Automated tests are not present
* Production-quality PNG app icons are still recommended for best installability

## Risks

* AI throughput is bounded by Apps Script quotas (~40 rows/min trigger, 6-min execution cap)
* Drive thumbnails can take a few seconds to generate after upload
* Secret-like values must stay in Script Properties, never in tracked docs or env files
* The app depends on camera permissions and HTTPS on mobile devices

## GitHub And Vercel Advice

* Keep `.env` out of git; only commit `.env.example`
* Use `main` for release-ready code and feature branches for changes
* Let Vercel build the frontend only; configure `VITE_APPS_SCRIPT_URL` and `VITE_MOCK_MODE` in project env vars
* Use preview deployments for every non-trivial change
* Tag releases after a verified build so the deployment history stays clear

## Verification

* `npm run build` passes successfully
* Current repo state is buildable with no compile errors
