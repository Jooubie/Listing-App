# Research — Warehouse Photography PWA (2026)

## Overview

Market research on warehouse photography PWA workflows, pricing, architecture patterns, and automation trends for the "Joub" photographer listing app.

---

## 👤 Authentication Pattern (PIN-Based Shared Device)

**Key insight from market (Blimp, DDL, warehub-app, houseofmvps):**
Workers authenticate with a **short PIN (4–6 digits)** — not email/password. Nobody types credentials with gloves on.

**Proposed for Joub (first-open flow):**
| Field | Value |
|---|---|
| **Username** | Photographer's full name (e.g. "Ahmed Ali") |
| **Password** | Platform selection — exactly one of **4 values**: `Alnasser`, `amazon`, `noon`, `jumia` |
| **Storage** | SHA-256 hashed (WebCrypto) — never plaintext |
| **Session** | Memory-only token + sessionStorage (cleared on tab close) |
| **Remember** | Encrypted blob in localStorage keyed to device fingerprint |

**Why this works:**
- Photographer name → attribution for every capture
- Platform-as-password → instantly scopes all scans/photos to correct client
- 4 fixed options → no typos, no forgotten passwords, fast entry
- No backend call needed for auth (local validation against hashed list)

**Subsequent opens:**
- Pre-filled username hint (masked last 2 chars)
- Enter PIN (set on first open or hashed from platform selection)
- Session lasts until tab is closed

---

## 🔄 Best Workflow Patterns

**Core flow** across all market solutions:
```
Scan barcode → Capture photo → Auto-link → Background sync
```

**No manual steps** — no naming files, no moving folders, no sending emails.

### Step-Based State Machine (Production pattern from Flutter WMS, Angular WMS apps)

```
CaptureState {
  step: setup | scanBarcode | capturePhoto | review | done
  barcode: string?
  photoBlob: Blob?
  retakeCount: number
  photographerId: string
  platform: 'Alnasser' | 'amazon' | 'noon' | 'jumia'
}
```

**Rules:**
- Workers cannot skip steps
- Errors turn the screen red (no toasts in noisy warehouses)
- Audio beep on success, vibration on error
- Flash overlay on every scan

### Key Features from Market Leaders

| Feature | Source | Description |
|---|---|---|
| PIN shared device | Blimp, DDL | Any team member enters personal PIN on shared device, photos attributed correctly |
| Auto-link to barcode | Blimp | Scan barcode/QR, every photo in session tagged to correct reference |
| Offline-first | All | IndexedDB queue → auto-sync when online |
| Multi-packer attribution | warehub-app | Scan packer ID barcode → credit to correct worker |
| Guided workflows | Cleverence, Mobo | Step-by-step screens with prompts and validation |
| Exception paths | Cleverence | Reason codes + photos for damaged/short items |

---

## 🏗️ Architecture Patterns

### Offline-First Stack (Ranked by Complexity)

| Approach | Complexity | Best For |
|---|---|---|
| Custom IndexedDB queue (current Joub) | Medium | Single-device, simple sync |
| Dexie.js + manual sync engine | Medium | Clean promise-based API |
| PowerSync | Medium-High | True bidirectional sync, conflict resolution, RLS-aware |
| PowerSync + Supabase Realtime | High | Multi-user dashboards + field worker offline |

### Sync Engine Health (Must-Have UI)
- Queue length badge (always visible)
- Last sync timestamp
- Itemized errors with retry button
- Auto-drain on `online` event + periodic interval fallback (30s)

### Performance Targets (from production deployments)
- Sub-second device response (even offline)
- Sync within 30s of reconnection
- Zero data loss across 50+ airplane-mode tests

---

## 🧠 AI & Automation Trends

### On-Device (WASM / WebNN)
- **ZBar WASM** (`@undecaf/zbar-wasm`) — off-main-thread via Web Workers, faster than ZXing
- **Local SKU classifier** — tiny WASM model matches camera photo → SKU + bin location
- **QicScan pattern** — single frame captures barcodes + photos simultaneously

### Cloud Hybrid
- On-device: barcode extraction (fast, offline)
- Cloud async: OCR enrichment, damage detection, SKU validation
- Tools: Anthropic Claude (Cloudflare Worker proxy), Google Vision, Runflow Sentinel

### Automated Quality Scoring (Runflow Sentinel)
```
Generate → Score → Pass / Regenerate / Hold for human review
```
Configurable dimensions: face fidelity, fit accuracy, color match, background compliance

---

## 📊 Pricing Landscape (2026)

### Comparable Solutions

| Product | Model | Price Range | Notes |
|---|---|---|---|
| **Blimp** | SaaS/seat | Undisclosed | Warehouse photo app, offline, PIN sharing |
| **DDL Scanner** | PWA + optional Zebra | Contact | Full warehouse suite incl photo upload |
| **Flux (Optioryx)** | Usage tiers | Free → €1,200/mo | 500–5,000 cycles/mo, AI module add-ons |
| **SCO WMS Mobile** | Per license | $14.99–$29.99/mo | Basic scan/photo → AI label parsing |
| **Scanlily** | Item-based | Free → $80/mo | Asset management, UPC/EAN auto-populate |
| **Scandit SDK** | Per device | $20–$90/mo | Enterprise barcode SDK |
| **QicScan AI** | Contact | Undisclosed | Vision AI (batch scan + photo in one frame) |

### Full Warehouse TCO (2026)

| Scale | Devices | First-Year TCO |
|---|---|---|
| SMB | 10–20 | $45k–$110k |
| Mid-market | 40–80 | $160k–$430k |
| Enterprise | 150–400 | $550k–$1.8M |

Per-device software: $20–$60/mo (mid-market), $40–$90/mo (enterprise features)

---

## 🧩 Key Gaps: Current Joub vs Market Leaders

| Area | Current Joub | Market Best Practice |
|---|---|---|
| **Auth** | Photographer name text entry | 4–6 digit PIN (or platform-as-PIN), SHA-256 hashed, session token |
| **Workflow** | 3 sequential screens | Formal state machine with validation per step |
| **Barcode scanning** | @zxing/browser | ZBar WASM (faster via Web Workers) or Scanbot SDK (AR overlay) |
| **AI** | None | WASM local SKU classifier + cloud OCR enrichment |
| **Feedback** | Visual only | Audio beep + haptic + flash overlay on scan |
| **Multi-packer** | Single photographer | PIN per worker, auto-attribution, stats dashboard |
| **Sync UI** | Basic progress bar | Queue length badge, last sync time, itemized errors |
| **Real-time** | None | Supabase Realtime for office dashboard |
| **ERP integration** | None (manual export) | N8N webhook middleware or PowerSync connectors |

---

## 📚 Reference Projects & Repositories

| Project | Stack | Key Pattern |
|---|---|---|
| [warehub-app](https://github.com/imluoai/warehub-app) | Vanilla JS + Cloudflare KV | PIN auth, multi-packer, KV cross-device sync |
| [duka-ledger](https://github.com/johneliud/duka-ledger) | Next.js + PowerSync + SQLite | Local-first, PIN auth, delta sync |
| [nexus-wms](https://github.com/h-builds/nexus-wms) | Laravel + Vue 3 | Modular monolith, event sourcing, offline-first field agent |
| [mobo_barcode](https://github.com/mobo-open-source/mobo_barcode) | Flutter + Odoo RPC | Scan-to-action routing, audio/haptic/visual feedback |
| [scan-erp](https://github.com/drmcoder/scan-erp-docs) | Next.js + Firebase + Raspberry Pi | ESP32-CAM barcode scanning, edge printing |
| [smart-school-os](https://github.com/Wajid160/smart-school-os) | PWA + N8N + Supabase | Offline-first attendance, QR ID standard, n8n workflow automation |
| [BaseOps](https://johnapollosolal.medium.com/...) | Next.js + Supabase + Dexie.js | Mutation queue, timestamp-based conflict resolution |

---

## 🎯 Recommended Next Steps for Joub

1. **PIN auth system** — photographer name + platform (Alnasser/amazon/noon/jumia) as credentials
2. **Formal state machine** — refactor `SessionSetup → BarcodeScanner → PhotoCapture` into validated step machine
3. **Audio/haptic feedback** — beep on successful scan, vibration on error, flash overlay
4. **Sync status dashboard** — queue length, last sync, retry, itemized errors
5. **ERP/webhook integration** — N8N workflow that auto-posts captures to external systems
6. **Vision AI pilot** — ZBar WASM for faster scanning, then cloud OCR for label enrichment
