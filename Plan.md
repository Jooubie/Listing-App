# Listing App Joub — Master Plan

**Status:** Planning / Architecture locked. No code written yet.
**Owner (build):** Eng. Abdelaziz Diab
**Client / Sheet owner:** Amr (manages product database across all factories)
**Last updated:** 2026-06-28

---

## 1. The Problem

A single client (Amr) needs to populate a product database covering items sold on four platforms — **Amazon, Noon, Al-Nasser, Jumia**. His photographers physically handle tons of products. Today there is no fast way to capture a product (barcode + photo) in the field and get it classified into the client's category structure without slow manual data entry.

## 2. The Solution (one line)

A **mobile-first capture app** feeds a **fast Supabase buffer**; **n8n** then batch-processes each item — hosting handled, vision-AI fills the taxonomy — and **syncs the result into Amr's Google Sheet**.

## 3. Architecture — the decoupled pipeline

The whole design rests on one principle: **separate fast capture from slow processing**, so photographers never wait on AI.

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE A — CAPTURE (real-time, milliseconds, photographer-facing)     │
│                                                                       │
│  PWA (mobile)                                                         │
│   1. Pick platform (button, persists)  ──┐                            │
│   2. Scan barcode (camera)               │                            │
│   3. Capture photo (camera)              │                            │
│      └─► upload photo to Supabase Storage → public direct link        │
│      └─► INSERT row into Supabase `captures` (status = pending)       │
│   4. Instantly move to next product (NO wait)                         │
└───────────────────────────────────────────┬───────────────────────────┘
                                            │  (rows pile up in Supabase)
┌───────────────────────────────────────────▼───────────────────────────┐
│  PHASE B — PROCESS (batched / queued, behind the scenes, in n8n)      │
│                                                                       │
│   n8n on VM                                                           │
│   1. Trigger on schedule (e.g. every 5–10 min) → fetch pending rows   │
│   2. Pull taxonomy reference list (closed set)                        │
│   3. Vision model reads the hosted image → returns Category /         │
│      Sub-Category / Product Type (must match taxonomy) + confidence   │
│   4. Validate; flag "Needs Review" if low confidence or no match      │
│   5. UPDATE Supabase row (status = done / review)                     │
│   6. SYNC row into Amr's Google Sheet                                 │
└───────────────────────────────────────────┬───────────────────────────┘
                                            │
┌───────────────────────────────────────────▼───────────────────────────┐
│  DELIVERABLE — Amr's Google Sheet (final, the only thing he touches)  │
│   Timestamp | Platform | Photographer | Barcode | Image | Category |  │
│   Sub-Category | Product Type | Confidence | Review flag | Status     │
└───────────────────────────────────────────────────────────────────────┘
```

**Why each tool is in the stack:**

| Tool | Role | Why it's here |
|---|---|---|
| **PWA** (web app, installable on phone) | Field capture UI | No app store, works on any phone, native camera + offline. See `UX.md`. |
| **Supabase** | Fast write buffer + image host + reference DB | Instant inserts so scanning never blocks; Storage gives public image links natively; taxonomy lives in a table. See `Backend.md`. |
| **n8n** (on your VM) | Orchestration / batch processor | Already running on your VM; handles the queue, vision call, validation, Sheet sync. See `Automation.md`. |
| **Vision model** (Gemini or GPT) | Classifier | Reads the photo, picks taxonomy values. Model choice in `Automation.md` §Model Selection. |
| **Google Sheet** | Final deliverable | Amr already gets share access; it's the agreed handoff surface. |

## 4. Confirmed decisions (locked)

- **No auto-publish.** The Google Sheet is the end goal. Nothing pushes live to Amazon/Noon/Al-Nasser/Jumia (those are third-party marketplaces with their own seller portals — out of scope).
- **Photo-based AI only.** No barcode-to-product-database lookup. Classification comes from the image, constrained to the client's taxonomy.
- **Closed taxonomy.** Client already has the Category → Sub-Category → Product Type list. AI picks from it; it does not invent labels.
- **Volume:** hundreds/day — comfortably within Supabase + n8n + vision API limits.
- **Engine:** n8n on the VM (8 GB RAM, GPU, 100 GB), replacing the earlier Apps Script idea.
- **Platform persists** once chosen, until the photographer changes it.

## 5. Open inputs needed before build (the real blockers)

1. **Taxonomy file** — the exact Category → Sub-Category → Product Type structure, and how it nests (does each Category have fixed Sub-Categories, or is it flat?). This drives the AI prompt and the Supabase reference table. → *Needed first.*
2. **Sheet structure** — one master sheet with a Platform column (recommended, easier pivots for Amr) vs. one tab per platform. → *Confirm with Amr.*
3. **Photographer tracking** — one extra tap to log who scanned what across factories (recommended) vs. platform-only. → *Confirm.*
4. **Image host final call** — Supabase Storage (recommended; see `Backend.md`) vs. Google Drive (if Amr wants images browsable in a Drive folder). → *Confirm.*
5. **PWA hosting** — where the capture page is served (must be HTTPS for camera). Vercel/Netlify free tier, the VM with a domain + SSL, or Supabase. → *Decide in `UX.md`.*

## 6. Where to start (first three moves)

1. **Get the taxonomy from Amr** and drop it into the project. Nothing downstream is final until this exists.
2. **Stand up Supabase** (config only): create the `captures` table, the `taxonomy` table, and one Storage bucket — schemas in `Backend.md`.
3. **Build the PWA capture flow** (Phase 1), then wire the **n8n workflow** (Phase 1) — specs in `UX.md` and `Automation.md`.

## 7. Build phases

| Phase | Scope | Goal |
|---|---|---|
| **0 — Inputs** | Taxonomy in hand, Supabase + Sheet + keys provisioned | Unblock build |
| **1 — MVP** | PWA capture → Supabase → n8n batch → vision (closed taxonomy) → Google Sheet | End-to-end happy path |
| **2 — Hardening** | Offline queue, duplicate-barcode detection, Needs-Review workflow, photographer tracking, retry/error handling | Field-ready, reliable |
| **3 — Optimization (later)** | Cost tuning, optional self-hosted vision model on the VM GPU, A/B model accuracy on real product photos | Scale + cost |

## 8. File index

- **`Plan.md`** — this file. Overview, architecture, phases, where to start.
- **`UX.md`** — photographer-facing PWA: screens, capture flow, offline behavior, edge cases.
- **`Backend.md`** — Supabase data layer: schema, storage, status lifecycle, environment & API keys.
- **`Automation.md`** — n8n workflow: node groups, batching, vision-AI prompt strategy, **GPT vs Gemini recommendation**, error handling.
