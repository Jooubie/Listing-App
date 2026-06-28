# Front-End PWA for Listing App "Joub"

Build a mobile-first Progressive Web App (PWA) that acts as a fast capture buffer for warehouse photographers. It scans barcodes, captures photos, resizes them, and submits them to Supabase (or stashes them in an IndexedDB queue when offline) to enable a rapid, frictionless capture loop.

## User Review Required

> [!IMPORTANT]
> - **Tailwind CSS Version:** We propose using Tailwind CSS v4 (the latest standard) for Vite. Please confirm if you prefer Tailwind CSS v3 or v4.
> - **Vite PWA Icons:** We will generate standard mock/placeholder SVG icons or basic Canvas-generated PNGs for the manifest. For a true PWA installation, we recommend having valid 192x192 and 512x512 PNG icons.
> - **Camera Permission (HTTPS):** Accessing native camera APIs (`getUserMedia` and ZXing barcode detection) in mobile browsers requires a secure context (HTTPS) or `localhost`. For testing on a physical mobile device, the app must be served over HTTPS (e.g., via a tunnel or free deployment like Vercel).

## Open Questions

- **Vite Boilerplate Overwrite:** The files `Plan.md`, `UX.md`, etc., are directly in the root of the workspace `c:\Users\youse\Downloads\joubie`. We will initialize the Vite app directly in this directory (`./`). This will add `package.json`, `tsconfig.json`, `vite.config.ts`, `src/`, etc., alongside the markdown files. Is this root-level structure acceptable, or would you prefer the app in a subdirectory (e.g. `/app`)? (We recommend initializing directly in `./` as it matches the instruction "Open Antigravity on this folder and paste everything below... You are working inside this project folder").

---

## Proposed Changes

We will group files into components, utilities, and configuration layers.

### [Vite & Project Scaffolding]
Configure Vite, TypeScript, Tailwind CSS, and the PWA plugin.

#### [NEW] [package.json](file:///c:/Users/youse/Downloads/joubie/package.json)
Contains all front-end dependencies:
- Core: `react`, `react-dom`
- Build/Dev: `vite`, `typescript`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`
- Styling: `tailwindcss`, `@tailwindcss/vite`
- Functionality: `@supabase/supabase-js`, `@zxing/browser`, `idb`, `lucide-react`
- PWA: `vite-plugin-pwa`

#### [NEW] [vite.config.ts](file:///c:/Users/youse/Downloads/joubie/vite.config.ts)
Configures the React plugin, Tailwind CSS v4 plugin, and the Vite PWA plugin (manifest, service worker paths, offline capability, cache strategies).

#### [NEW] [index.html](file:///c:/Users/youse/Downloads/joubie/index.html)
Initial HTML layout with mobile-responsive viewport, apple-mobile-web-app headers, theme colors, and the root mounting node.

#### [NEW] [.env.example](file:///c:/Users/youse/Downloads/joubie/.env.example)
Exposes template configurations:
- `VITE_SUPABASE_URL=`
- `VITE_SUPABASE_ANON_KEY=`
- `VITE_SUPABASE_BUCKET=product-images`
- `VITE_MOCK_MODE=true`

---

### [Core UI Components]
Premium, high-contrast, mobile-first screens with absolute responsiveness and one-handed thumb-reachable controls.

#### [NEW] [src/index.css](file:///c:/Users/youse/Downloads/joubie/src/index.css)
Declares the Tailwind CSS v4 imports and configures base rules for font sizing, smooth scrolling, transitions, and dark/light modes.

#### [NEW] [src/main.tsx](file:///c:/Users/youse/Downloads/joubie/src/main.tsx)
The React application entry point that registers the PWA service worker and mounts the `App` component.

#### [NEW] [src/App.tsx](file:///c:/Users/youse/Downloads/joubie/src/App.tsx)
The orchestrator of app state:
- Active screen router (`setup` | `scan` | `capture` | `submit`).
- Session state (`photographerId`, `platform`).
- Capture session counter (persists running tally of successful submissions).
- Offline queue count and sync progress indicator.
- Core layout enclosing active screens.

#### [NEW] [src/components/SessionSetup.tsx](file:///c:/Users/youse/Downloads/joubie/src/components/SessionSetup.tsx)
Session setup screen:
- Input for Photographer ID (saved to `localStorage`).
- Four large, thumb-friendly buttons for Platform selection (**Amazon**, **Noon**, **Al-Nasser**, **Jumia**).
- Simple validation (prevents entry until name and platform are picked).

#### [NEW] [src/components/BarcodeScanner.tsx](file:///c:/Users/youse/Downloads/joubie/src/components/BarcodeScanner.tsx)
The barcode scanning screen:
- Live camera viewfinder using `@zxing/browser`.
- Top banner displaying active session data (with a quick-toggle button to change platform or photographer ID).
- Auto-decode logic with success confirmation sounds/vibrations (where APIs allow).
- **Manual Input Modal:** A prominent fallback button allowing manual typing of the barcode if camera/lighting makes scanning impossible.

#### [NEW] [src/components/PhotoCapture.tsx](file:///c:/Users/youse/Downloads/joubie/src/components/PhotoCapture.tsx)
The product photography screen:
- Live camera stream styled to fill the mobile frame.
- Shutter button located at bottom-center.
- Transition screen with **[Use Photo]** (submits and advances) and **[Retake]** (resets stream) options.

---

### [Data & Sync Layer]
Interfaces with the physical APIs, Supabase, and local stashing database.

#### [NEW] [src/utils/supabase.ts](file:///c:/Users/youse/Downloads/joubie/src/utils/supabase.ts)
Handles initialization of the Supabase client:
- Detects if `VITE_MOCK_MODE=true` or if configuration variables are missing.
- In **Mock Mode**, it intercepts storage and database insert calls, logging them in detail, returning mock public URLs, and simulating network delays (500-1000ms).

#### [NEW] [src/utils/image.ts](file:///c:/Users/youse/Downloads/joubie/src/utils/image.ts)
Client-side image processing utility:
- Reads a captured image File/Blob.
- Draws to an HTML5 Canvas, resizing the long edge to ~1280–1600px.
- Encodes back to a high-quality JPEG blob (`quality: 0.8`) to keep network payload minimal.

#### [NEW] [src/utils/queue.ts](file:///c:/Users/youse/Downloads/joubie/src/utils/queue.ts)
Offline storage queue built with `idb` (IndexedDB):
- Standardized database structure storing `{ id, platform, barcode, imageBlob, photographerId, createdAt }`.
- Automatically stashes items when native `navigator.onLine` is false or Supabase requests fail.
- Subscribes to browser `online` events, running background uploads to drain the queue in FIFO order, updating the UI with syncing states and remaining items.

---

## Verification Plan

### Automated Tests
None. The app is a front-end PWA focusing on hardware access (cameras) and UI state loops, which are validated manually.

### Manual Verification
1. **End-to-End Happy Path (Mock Mode):**
   - Start the Vite server and load the app.
   - Enter photographer ID, select a platform, and tap next.
   - Mock a barcode scan or enter one manually.
   - Capture a mock image (webcam or uploaded placeholder), hit **Use Photo**.
   - Check that the loader appears, a success checkmark flashes, the counter increments, and you return to the Scan screen.
2. **Persistence Check:**
   - Refresh the browser in the middle of scanning. Verify the photographer ID, selected platform, and running tally are restored from `localStorage`.
3. **Offline Mode & Sync Queue Check:**
   - In Chrome DevTools, toggle network speed to "Offline".
   - Proceed to scan and capture 3 mock products.
   - Confirm that the UI alerts that you are offline and displays "3 Unsynced Items".
   - Turn the network to "Online".
   - Observe that the unsynced items sync automatically one by one, the unsynced count goes down to 0, and the main counter increments.
4. **Supabase Integration Test (Real Mode):**
   - Provide active `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables in `.env`.
   - Submit a capture and verify:
     - The image is saved in Supabase Storage under `{platform}/{YYYY-MM-DD}/{uuid}.jpg`.
     - A row is inserted in `captures` table with `status: 'pending'`, containing valid `image_url` and metadata, and with all AI/taxonomy fields left empty.
