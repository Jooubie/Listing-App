# Backend — Supabase Data Layer

**Role in the system:** the fast write buffer between capture and processing, the image host, and the home of the taxonomy reference list. Supabase is what makes "keep scanning, never wait" possible — every scan is an instant insert.

---

## 1. Why Supabase (and why it sits before n8n)

- **Instant inserts.** A capture writes one row over the Supabase REST/JS client in milliseconds, so the PWA returns to ready immediately. The slow work (vision AI, Sheet sync) is decoupled into n8n.
- **Native image hosting.** Supabase **Storage** returns a public direct URL on upload — that single URL is what the vision model reads and what lands in Amr's Sheet (via an `IMAGE()` formula). One system handles both the image and the metadata row; no separate image host needed.
- **Taxonomy as data.** The closed Category/Sub-Category/Product Type list lives in a table, so updating categories later never means editing the n8n workflow or any code.
- **It's a real queue.** A `status` column turns the table into a work queue n8n drains in batches.

## 2. Storage decision

**Recommended:** one Supabase Storage bucket (e.g. `product-images`), public-read, images organized by `platform/date/`. The capture step uploads here and gets the public link in the same round trip.

**Alternative:** Google Drive (if Amr specifically wants images browsable in a Drive folder). Costs an extra hop and a second credential set. Only choose this if there's a real reason — otherwise Supabase Storage keeps the capture layer cohesive.

→ Confirm in Phase 0. The rest of the schema is unaffected either way (only where `image_url` points changes).

## 3. Schema (tables)

> Shapes only — no migrations written yet. Names are suggestions.

### `captures` — the work queue + final record per scan

| Column | Type | Filled by | Notes |
|---|---|---|---|
| `id` | uuid (pk) | DB default | |
| `platform` | text | PWA | enum-checked: amazon / noon / al_nasser / jumia |
| `barcode` | text | PWA | raw decoded value; index this for duplicate lookups |
| `image_url` | text | PWA | public direct link from Storage |
| `image_path` | text | PWA | internal Storage path |
| `photographer_id` | text | PWA | optional (Phase 2) |
| `category` | text | n8n (AI) | must match `taxonomy` |
| `sub_category` | text | n8n (AI) | must match `taxonomy` |
| `product_type` | text | n8n (AI) | must match `taxonomy` |
| `confidence` | numeric | n8n (AI) | 0–1, drives review flag |
| `review_flag` | text | n8n | e.g. `ok` / `low_confidence` / `no_taxonomy_match` / `duplicate` |
| `status` | text | PWA + n8n | lifecycle below |
| `synced_to_sheet` | bool | n8n | guards against double-writes to the Sheet |
| `created_at` | timestamptz | DB default | capture time |
| `processed_at` | timestamptz | n8n | when AI finished |

### `taxonomy` — the closed reference list (from Amr)

| Column | Type | Notes |
|---|---|---|
| `id` | int (pk) | |
| `category` | text | |
| `sub_category` | text | |
| `product_type` | text | |

- Exact structure depends on the client's file — **how it nests is an open input** (`Plan.md` §5.1). If Sub-Categories are fixed per Category, that hierarchy gets encoded here and into the AI prompt so the model can't pick an invalid combination.
- n8n reads this table at processing time and injects it into the vision prompt as the allowed set.

### `photographers` *(optional, Phase 2)*

Simple lookup of `id` → `name`/`factory`, if Amr wants clean tracing across sites.

## 4. Status lifecycle (the queue states)

```
pending      ← written by the PWA at capture
   │  (n8n picks it up in a batch)
processing   ← optional in-flight marker to avoid double-processing
   │
   ├─► done     ← AI classified successfully, taxonomy matched
   ├─► review   ← low confidence, no taxonomy match, or duplicate barcode
   └─► error    ← vision call failed after retries (n8n retries, then parks here)
        │
        ▼
   synced_to_sheet = true   ← after the row is written/updated in Amr's Sheet
```

Amr works mostly from a filtered view of `review` rows; `done` rows flow to the Sheet untouched.

## 5. Access model & keys

| Key / credential | Used by | Scope | Notes |
|---|---|---|---|
| **Supabase anon (publishable) key** | The PWA (browser) | Insert into `captures`, upload to Storage bucket | Safe to ship to the client; lock down with Row Level Security so it can only insert captures + upload, nothing else. |
| **Supabase service_role key** | n8n only (server-side on the VM) | Full read/update on `captures`, read `taxonomy` | **Never** ships to the browser. Lives only in n8n credentials. |
| **Supabase project URL** | PWA + n8n | — | Base endpoint. |

**Row Level Security (RLS):** enable on `captures`. The anon key may `insert` (and upload to the bucket) but not read others' data or update classification fields. n8n's service_role bypasses RLS for processing. Tighten before handing the PWA to photographers.

## 6. Environment summary (Supabase side)

What must exist before build:

- A Supabase project (free tier is fine at hundreds/day).
- Tables: `captures`, `taxonomy` (+ optional `photographers`).
- One Storage bucket, public-read (e.g. `product-images`).
- RLS policy on `captures`.
- Keys recorded securely: project URL, anon key (→ PWA env), service_role key (→ n8n credentials only).

> API keys and model credentials for the **vision model** and **Google Sheets** are listed in `Automation.md` §Environment, since they're consumed inside n8n, not by Supabase.

## 7. "Metadata extracted from the database sheet" — interpretation

Two readings of the requirement, both covered:

1. **Reference metadata is *given* from the DB:** the taxonomy (the allowed Category/Sub-Category/Product Type values) is stored in the `taxonomy` table and *given to* the vision model as the closed set it must choose from. The model doesn't free-text.
2. **Result metadata is *extracted* from the DB:** the AI-filled fields live in `captures` and are then read out (extracted) and written into Amr's Google Sheet by n8n.

So the database is both the source of the allowed labels and the store of the produced labels; the Sheet is the human-readable extract of the latter.
