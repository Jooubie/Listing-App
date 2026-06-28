# Listing App "Joub" — Photographer PWA

This is the mobile-first Progressive Web App (PWA) designed for warehouse photographers to quickly scan retail product barcodes and take product photographs.

The application acts as a high-speed capture buffer that writes directly to **Supabase Storage** and the **`captures`** table, decoupling real-time field scans from slow vision AI classification and Google Sheet synchronization.

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

# If VITE_MOCK_MODE=false, provide valid Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
VITE_SUPABASE_BUCKET=product-images
```

### 3. Start Development Server
```bash
npm run dev
```

---

## ⚙️ Backend vs. Mock Mode

The app supports two execution modes out of the box:

1. **Mock Mode (Default)**:
   * Enabled when `VITE_MOCK_MODE=true` or when Supabase variables are left empty.
   * Simulates image resizing, uploads, and database inserts in memory.
   * Generates local object URLs for previewing captures, enabling complete workflow testing without a database.
2. **Live Mode**:
   * Enabled when `VITE_MOCK_MODE=false` and credentials are provided.
   * Compresses the snapped image client-side to a maximum of 1600px (long edge, `0.8` JPEG quality).
   * Uploads the image to the Supabase Storage bucket at path `{platform}/{YYYY-MM-DD}/{uuid}.jpg` and retrieves its public URL.
   * Inserts a metadata row into the `captures` table with `status = 'pending'`, leaving all downstream classification fields blank.

---

## 🛜 Offline Stashing & Sync Queue

Photographers often scan in warehouses with unstable Wi-Fi. The application implements an offline-first strategy:

* **IndexedDB Cache**: If a submission fails due to network issues or the browser is in offline state, the scan (barcode, photographer ID, platform, and image blob) is queued locally using **IndexedDB**.
* **Frictionless Loop**: The app increments the photographer's tally and immediately returns to the scan screen, ensuring they are never blocked by network delays.
* **Automatic Background Sync**: When connection is restored, the application subscribes to the browser's `online` event, automatically draining the IndexedDB queue FIFO in the background. A syncing progress bar is displayed at the top of the interface.

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
