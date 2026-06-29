# Listing App "Joub" — Photographer PWA

This is the mobile-first Progressive Web App (PWA) designed for warehouse photographers to quickly scan retail product barcodes and take product photographs.

The application acts as a high-speed capture buffer that stores scans locally when needed, then writes rows through a Google Apps Script proxy into Google Sheets. It is optimized for fast field capture, offline retries, and a minimal mobile workflow.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```bash
# Set VITE_MOCK_MODE to true to run fully backend-free
VITE_MOCK_MODE=true

# If VITE_MOCK_MODE=false, provide the deployed Google Apps Script URL
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 3. Start Development Server
```bash
npm run dev
```

---

## ⚙️ Backend vs. Mock Mode

The app supports two execution modes out of the box:

1. **Mock Mode (Default)**:
   * Enabled when `VITE_MOCK_MODE=true` or when the Apps Script URL is missing.
   * Simulates image resizing and row writes in memory.
   * Generates local object URLs for previewing captures, enabling complete workflow testing without a database.
2. **Live Mode**:
   * Enabled when `VITE_MOCK_MODE=false` and `VITE_APPS_SCRIPT_URL` is set.
   * Compresses the snapped image client-side to keep payloads small.
   * Posts the capture payload to the Google Apps Script web app, which writes the row and image reference into Google Sheets.

---

## 🛜 Offline Stashing & Sync Queue

Photographers often scan in warehouses with unstable Wi-Fi. The application implements an offline-first strategy:

* **IndexedDB Cache**: If a submission fails due to network issues or the browser is in offline state, the scan (barcode, photographer ID, platform, and image blob) is queued locally using **IndexedDB**.
* **Frictionless Loop**: The app increments the photographer's tally and immediately returns to the scan screen, ensuring they are never blocked by network delays.
* **Automatic Background Sync**: When connection is restored, the application subscribes to the browser's `online` event, automatically draining the IndexedDB queue FIFO in the background. A syncing progress bar is displayed at the top of the interface.

## Project Notes

* Supabase has been removed — the only backend is the Google Apps Script web app (see `GoogleSheetSetup.md`).
* AI classification is **server-side** by design: the phone uploads raw captures as `pending`; an Apps Script timed trigger classifies each row with OpenRouter/Gemini and flips the status. No AI key ships in the app bundle, and there is intentionally no on-device review/confirm screen — the owner revises in the Sheet.
* Photos are hosted on Google Drive; the sheet stores a `thumbnail` preview (`=IMAGE`) and a direct `/view` link per row. On upload failure the app retries the image at smaller sizes before, as a last resort, saving the row without an image.
* The operator flow includes a compact live dashboard with captured, synced, and queued counts plus a manual batch-sync action.
* The production loop is: scan barcode → capture one clean product photo → keep moving → sync the batch while the sheet and AI finish the listing data.

---

## 🔒 Camera Access & HTTPS Constraint

Modern browsers enforce strict security boundaries. **Accessing device cameras (for barcode scanning and photo capture) requires a secure context (HTTPS) or `localhost`.**

* **Local testing**: Accessing the app via `http://localhost:5173` will work out of the box in your desktop browser.
* **Mobile device testing**: To test on a physical smartphone, you must serve the application over HTTPS. You can:
  * Deploy the built bundle to a free static host (e.g. Vercel, Netlify).
  * Use a secure tunnel tool (e.g. `ngrok`, `localtunnel`) to map your local port to an HTTPS endpoint.
  * Access the dev server using a secure remote connection over your LAN.

---

## 🛠️ Build & Production Verification
To compile and test the production-ready build:
```bash
# Compile and build files
npm run build

# Preview the production build locally
npm run preview
```
The PWA service worker is built automatically via Workbox, ensuring assets are cached and available offline.
