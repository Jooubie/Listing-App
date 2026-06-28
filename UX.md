# UX — Photographer Capture App (PWA)

**Audience:** Amr's photographers, in the field, across factories.
**Design priority:** speed and repetition. The flow must let one person scan hundreds of products with the fewest taps and zero waiting.

---

## 1. Why a PWA (not a native app)

- **No app store.** Photographers open a link, optionally "Add to Home Screen," and it behaves like an installed app.
- **Camera access** for both barcode scanning and photo capture works in the mobile browser — *requires the page be served over HTTPS* (secure context). This is the one hard hosting constraint (see §7).
- **Cross-device.** Any Android/iOS phone, no per-device install or maintenance.
- **Offline-capable.** A service worker + local queue lets capture continue when factory Wi-Fi drops (Phase 2).

## 2. Core principle: capture is instant, processing is invisible

The photographer's job ends at "photo taken." The app uploads the image to Supabase Storage and writes one row to Supabase — both fast — then immediately returns to a ready-to-scan state. **The vision AI and Sheet sync happen later, in n8n, and the photographer never sees or waits for them.** (See `Plan.md` §3 and `Automation.md`.)

## 3. Screen flow

```
[ Start / Session Setup ]
   • Photographer name or ID   ← one-time per session (Phase 2; recommended)
   • Platform selector: [ Amazon ] [ Noon ] [ Al-Nasser ] [ Jumia ]
        → selection saved to localStorage, persists across all uploads
        → shown as a small banner on every screen ("Platform: Noon  [change]")
        ↓
[ Scan Screen ]  ← the loop lives here
   • Live camera viewfinder for barcode
   • Auto-detects & decodes barcode → shows the number for a beat
        ↓
[ Capture Screen ]
   • Live camera → take product photo
   • Quick preview: [ Use Photo ]  [ Retake ]
        ↓
[ Submit (automatic) ]
   • Upload photo → Supabase Storage (public link)
   • Insert row → Supabase `captures` (status = pending)
   • Brief success tick ("Saved ✓ — #1,248")
        ↓
   • Auto-return to Scan Screen, platform still selected
   • Repeat
```

### Platform persistence

- Selected once at session start, stored in `localStorage`.
- Stamped onto every captured row automatically — no re-selection between products.
- A always-visible "change platform" affordance lets a photographer switch when they move to a different platform's stock.

### Barcode scanning

- Client-side library — **`html5-qrcode`** or **`@zxing/browser`** (ZXing). Both decode 1D retail barcodes (EAN-13, UPC-A) and QR via the phone camera. No external API, no extra hardware scanner.
- On a successful decode, the value is held in state and the flow advances to photo capture.

### Photo capture

- Standard browser camera capture. Compress/resize client-side before upload (e.g. cap the long edge ~1280–1600 px) — smaller payloads upload faster on factory Wi-Fi **and** cost less per vision call. Do **not** send full-resolution photos to the classifier; classification doesn't need them.

## 4. The capture record (what each scan sends to Supabase)

| Field | Source | Notes |
|---|---|---|
| `platform` | Session selector | One of the four, persisted |
| `barcode` | Scanned | Raw decoded value |
| `image_url` | Supabase Storage | Public direct link, returned on upload |
| `image_path` | Supabase Storage | Internal path for housekeeping |
| `photographer_id` | Session setup | Optional (Phase 2) |
| `status` | App | Always `pending` at capture |
| `created_at` | App / DB default | Timestamp |

The classification fields (Category, Sub-Category, Product Type, Confidence, Review flag) are **left empty here** — n8n fills them later.

## 5. Confirmation & feedback

- A fast, unambiguous success state (tick + running count) so the photographer trusts the save and moves on.
- On failure (no network and queue full, or upload error): clear retry, never a silent drop.

## 6. Edge cases to design for

| Case | Behavior |
|---|---|
| **Wi-Fi drops mid-shift** | Phase 2: queue captures locally (IndexedDB) via service worker; auto-sync to Supabase when back online. Photographer keeps scanning uninterrupted. |
| **Duplicate barcode** (retake, or two photographers overlap) | Don't block at capture. n8n detects the duplicate during processing and flags the row "Duplicate — Review" rather than overwriting (see `Automation.md`). |
| **Bad / blurry photo** | "Retake" on the preview screen before submit. |
| **Wrong platform left selected** | Always-visible platform banner + one-tap change reduces this. |
| **Barcode won't scan** | Allow manual entry of the barcode number as a fallback. |

## 7. Hosting the PWA (decision needed)

Camera access requires HTTPS. Options:

1. **Vercel / Netlify free tier** — simplest, instant HTTPS, good for a static PWA. *Recommended for speed.*
2. **The VM** (already have it) — serve the PWA there with a domain + SSL (e.g. via a reverse proxy). Keeps everything on infrastructure you control, alongside n8n.
3. **Supabase hosting** — keeps the front-end next to the data layer.

→ Pick one in Phase 0. The choice doesn't affect the backend design.

## 8. What this screen explicitly does NOT do

- No AI on-device. No classification in the app.
- No writing to Google Sheets directly.
- No publishing anywhere.

Capture only. Everything else is downstream.
