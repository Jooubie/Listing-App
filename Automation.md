# Automation — n8n Workflow

**Role in the system:** the batch processor. n8n drains the Supabase queue, runs the vision model against each already-hosted image, validates the result against the taxonomy, updates Supabase, and syncs the finished row into Amr's Google Sheet. It is the entire "Phase B" of the pipeline (`Plan.md` §3).

**Runs on:** your VM (8 GB RAM, GPU, 100 GB) with n8n already installed.

> **Sequence note:** the image is hosted *at capture time* by the PWA → Supabase Storage, so by the time n8n runs, `image_url` already exists on the row. The vision model reads that link — n8n never uploads the image itself.

---

## 1. Workflow node groups

Mirrors a clean, grouped layout (same discipline as a good n8n template), rebuilt for the Supabase → Sheet flow.

### Group 1 — Trigger & Fetch Batch  *(the queue drain)*
- **Schedule Trigger** — every 5–10 min (this *is* the batching mechanism). Alternative: a Supabase webhook/Realtime event to trigger on new inserts, but a schedule is simpler and naturally batches.
- **Supabase / Postgres node** — `SELECT` rows `WHERE status = 'pending'` with a `LIMIT` (batch size, e.g. 10–20). Keep the batch small enough to respect vision-API rate limits and VM memory.
- *(optional)* **Update to `processing`** — lock the fetched rows so overlapping runs don't double-process.
- **Loop / Split In Batches** — iterate the fetched rows.

### Group 2 — Duplicate Check
- **Supabase lookup** — does an earlier `done` row share this barcode?
- **IF** — if duplicate: set `review_flag = duplicate`, **skip the vision call** (saves API cost), route straight to the update group. If new: continue.

### Group 3 — Taxonomy Load
- **Supabase node** — read the `taxonomy` table once per batch; build the **allowed-set** string (the closed list of valid Category/Sub-Category/Product Type, with the nesting rules) to inject into the prompt.

### Group 4 — Vision Classification
- **Vision model node / HTTP Request** — send `image_url` + the allowed-set → model returns **JSON only**: `{ category, sub_category, product_type, confidence }`. Use the provider's structured-output / JSON mode. Model choice in §3 below.
- **Code node — parse & validate** — parse JSON; confirm each returned value **exists in the taxonomy** (and that the Category→Sub-Category→Type combination is legal). Set `review_flag`:
  - `low_confidence` if confidence below threshold (tune on real data, e.g. < 0.6)
  - `no_taxonomy_match` if the model returned anything outside the list
  - `ok` otherwise

### Group 5 — Update Supabase
- **Supabase node** — `UPDATE` the row: `category`, `sub_category`, `product_type`, `confidence`, `review_flag`, `status` (`done` / `review` / `error`), `processed_at`.

### Group 6 — Sync to Google Sheet
- **Google Sheets node** — Append (or Update-if-exists) a row in Amr's Sheet:
  `Timestamp | Platform | Photographer | Barcode | Image | Category | Sub-Category | Product Type | Confidence | Review flag | Status`
  - Put the image in as a `=IMAGE("<image_url>")` formula so Amr sees thumbnails inline.
  - One master sheet with a Platform column is recommended for filtering/pivoting (confirm — `Plan.md` §5.2).
- **Supabase node** — set `synced_to_sheet = true` to prevent double-writes.

### Group 7 — Error Handling & Retries
- Enable **retry** on the vision node (transient API errors).
- On final failure → set `status = 'error'` and leave the row for the next run / manual look.
- *(optional)* **Notification** — a per-batch summary (e.g. Slack or email) of how many landed in `review`, so Amr knows what to correct. Disable if not wanted.

```
[Schedule] → [Fetch pending (LIMIT N)] → [lock: processing] → loop:
   → [Duplicate?] ──yes──────────────────────────────┐
        │no                                           │
   → [Load taxonomy] → [Vision → JSON] → [Parse+validate]
        │                                             │
        └──────────────► [Update Supabase] ◄──────────┘
                              │
                         [Append to Google Sheet] → [mark synced]
                              │
                         (errors → status=error, retry next run)
```

## 2. Prompt strategy (closed-taxonomy classification)

No code yet — the shape:

- **System role:** "You are a product classifier. Return ONLY valid JSON. Choose values strictly from the provided lists; never invent a category."
- **User message:** the `image_url`, plus the taxonomy allowed-set (Categories, their Sub-Categories, and valid Product Types), plus the required JSON schema `{ category, sub_category, product_type, confidence }`.
- **Hard constraints baked in:** the model must pick from the closed list; if unsure, return its best guess **and** a low `confidence` rather than a label outside the list. The validate step (Group 4) is the safety net that catches any drift.

This constrained-choice approach is what makes photo-only classification usable — the model is selecting from a fixed menu, not writing free-text labels.

## 3. Model Selection — GPT vs Gemini

You have credits for both, so the right move is to **default to the cheap workhorse and validate on your own photos.**

**Landscape (mid-2026):** the current flagships are Gemini 3.x (Pro / Flash) and GPT-5.x on the OpenAI side. For your task, the flagship tier is overkill — classifying a product photo into a fixed list is a "simple" vision job, not deep reasoning.

**The production pattern that fits you:** a widely-recommended cost strategy is to run the bulk of image work on a cheap **Flash-tier** model and only escalate to a frontier model for the low-confidence cases, and to resize images down before sending them for classification rather than shipping full-resolution photos. For most production workloads, the cost-efficient strategy is to use a Flash-tier model for the bulk of processing and escalate to a frontier model only for low-confidence results, and to resize images to an appropriate resolution rather than sending very large images for classification tasks.

**Recommendation:**

| | Pick | Why |
|---|---|---|
| **Primary (bulk)** | **Gemini Flash-tier** (e.g. Gemini 3.5 Flash) | Cheapest per image at volume, fast, reliable structured/JSON output, and it lives in the same Google ecosystem your data lands in (Sheets). Gemini is positioned as the most cost-efficient frontier option with production-ready structured output and function calling. Gemini is the most cost-efficient frontier option, and its structured output plus function calling support is the most production-ready for multimodal API integrations at scale. It's also strong at pulling structured data out of imperfect, poor-quality photos — which is exactly what field product shots are. Gemini extracts structured data from poor-quality document photos, outperforming baseline models by over 50%. |
| **Escalation / fallback** | **GPT-5.x vision** for `low_confidence` items | Strong at spatial reasoning and real-world scene understanding, useful for the ambiguous photos the Flash model isn't sure about. GPT-5 Vision is strongest at spatial reasoning and real-world scene understanding. Route only the low-confidence rows here to keep cost down. |

**Before committing:** run a **one-time A/B on a sample of Amr's actual product photos** against your real taxonomy — not benchmark images. Whichever classifies *your* products more accurately wins for the bulk role; the other becomes the escalation model. This "test on your own inputs, reassess periodically" approach is the standard advice and matters more than any leaderboard, because the landscape shifts month to month. Test with your actual workflow inputs rather than benchmark prompts, and reassess regularly because the model landscape shifts continually.

**Bottom line:** start on **Gemini Flash** for cost and ecosystem fit, keep **GPT** wired in for low-confidence escalation and as the A/B comparison. Both credits get used; cost stays low.

*Later option:* with the VM's GPU you could self-host an open vision model (e.g. via Ollama) to drop per-call cost to zero at high volume — but only after you've proven accuracy with a hosted API first. Park this in Phase 3 (`Plan.md` §7).

## 4. Environment & credentials (n8n side)

Everything n8n needs to authenticate. Store these in n8n's credential store, not in nodes.

| Credential | For | Notes |
|---|---|---|
| **Supabase service_role key + project URL** | Read/update `captures`, read `taxonomy` | Server-side only; full access. Never in the PWA. |
| **Google Sheets credential** (OAuth2 or service account) | Write to Amr's Sheet | If service account, share the Sheet with the service-account email. |
| **Vision API key — Google AI / Gemini** | Primary classifier | Your Gemini credits. |
| **Vision API key — OpenAI (GPT)** | Escalation / A-B | Your GPT credits. |
| *(optional)* **Slack / email credential** | Review-batch alerts | Only if you enable Group 7 notifications. |

**Tunables to set once and adjust on real data:**
- Batch size (Group 1 `LIMIT`) — balance throughput vs. rate limits.
- Schedule interval (5–10 min) — how "live" the Sheet feels vs. API call clustering.
- Confidence threshold (Group 4) — what counts as `low_confidence`.
- Image max resolution (set in the PWA, see `UX.md` §3) — smaller = cheaper + faster.

## 5. What n8n explicitly does NOT do

- It does not host images (Supabase Storage already did, at capture).
- It does not publish to any marketplace.
- It does not talk to the photographer — it runs unattended on a schedule.
