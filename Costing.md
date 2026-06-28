# Costing & Client Pricing — Listing App Joub

**Purpose:** the complete financial picture — what it costs *you* to run the AI pipeline, and the client-facing pricing plan for Amr. Self-contained: model choice, per-SKU economics, and the three subscription tiers all live here.
**Pricing source:** official developer pages — `ai.google.dev/gemini-api/docs/pricing` and `developers.openai.com` — as of **June 2026**. *Re-verify before any signed contract; AI pricing moves often.*
**Capacity basis:** 3–4 photographers, batch listing, up to ~10,000 new SKUs/month, one vision call per SKU.

---

## 1. TL;DR

The pipeline now does more than classify — it also **shortens the product name, writes a short description, detects color, and classifies the item** — so we move up from the rock-bottom tier to a **middle model** for output quality. Even so, the AI cost to fill **10,000 SKUs is ~$10/month** (~$5 batched). Against your client prices ($35 / $90 / $280), **gross margin sits around 90–95% at every tier.** The only real cost variable is image storage, not the AI.

## 2. What the AI produces per SKU (the expanded field set)

The vision model reads the photographer's main product photo and the scanned barcode rides along from the app. The model fills:

| Field | Type | Notes |
|---|---|---|
| **Short Name** | generative (short) | Cleaned, shortened product name |
| **Short Description** | generative (1 line) | Brief product blurb |
| **Color** | detected | Primary color(s) from the image |
| **Item Class** | classification | **Apparel / Footwear / Accessory** |
| **Category / Sub-Category / Product Type** | classification (closed taxonomy) | From the client's taxonomy list |
| **Confidence** | numeric | Drives the Needs-Review flag |

> **Open item to confirm:** does **Item Class (Apparel/Footwear/Accessory)** equal the *top level* of the client's existing Category taxonomy, or is it a separate coarse field? This changes whether the AI returns 3 taxonomy fields or 4. Resolve when the taxonomy file lands (see §11).

### Target Sheet columns (what the app uploads and syncs)

`Timestamp | Platform | Photographer | Barcode | Image | Short Name | Short Description | Color | Item Class | Category | Sub-Category | Product Type | Confidence | Review Flag | Status`

## 3. Operational context (the setup this prices)

- **Commercial portal = the client's subscription tier.** That's the relationship between you and Amr; he pays a monthly plan by volume.
- **Barcode on the photographer's mobile** triggers the queue: scan + photo → your side runs the vision process → the Sheet updates with the AI data + the scanned barcode. Amr only ever touches the shared Sheet.
- **Capture is fairly standardized** — products shot on a table, footwear on a shoe board/roof, kept clear as the main product photo. Standardized, well-lit, single-subject photos are *easy* for a vision model, which is exactly why a **middle model is enough** and a flagship would be wasted spend.

## 4. Model choice — the middle tier

Now that name + description quality matters, the budget Flash-Lite/Nano tier is a touch light for the generative part. The middle tier is the sweet spot: good writing, reliable structured output, multimodal, still cheap.

| Pick | Rate (in / out per 1M) | Why |
|---|---|---|
| **Gemini 2.5 Flash** ⭐ | **$0.30 / $2.50** | Recommended. Native to the Google ecosystem your Sheet lives in; strong at structured + light generative output. |
| **GPT-5 Mini** | $0.25 / $2.00 | Equivalent alternative; slightly cheaper headline. Worth A/B-ing on real photos. |

For reference, the tiers above and below (per 1M in/out): budget **Gemini 2.5 Flash-Lite / GPT-4.1 Nano $0.10/$0.40**; flagship **Gemini 3.1 Pro $2/$12**, **GPT-5.5 $5/$30**. The flagships are 20–50× the middle tier and buy little on standardized product photos.

**Still an option:** run the budget tier for the bulk and escalate only `low_confidence` SKUs to the middle/flagship model. If Flash-Lite's descriptions turn out good enough on your standardized shots, that's even cheaper. Decide from the A/B (§11).

## 5. Per-SKU token budget (with the expanded output)

| Component | Tokens/SKU | Notes |
|---|---|---|
| Taxonomy + system + schema (input) | ~1,500 | Repeated every call → **cacheable** (§6) |
| Image (input, medium detail) | ~300 | Lever via resize/detail |
| Instructions (input) | ~200 | |
| **Total input** | **~2,000** | |
| Short name + description + color + class + taxonomy + confidence (output) | **~180** | Up from ~80 for the old classify-only JSON |

## 6. Cost to fill — by volume, on the middle model (Gemini 2.5 Flash)

| Volume | Input | Output | **Standard/mo** | **Batch (−50%)** |
|---|---|---|---|---|
| **1,000 SKU** | 2M × $0.30 = $0.60 | 0.18M × $2.50 = $0.45 | **≈ $1.05** | ≈ $0.53 |
| **3,000 SKU** | 6M × $0.30 = $1.80 | 0.54M × $2.50 = $1.35 | **≈ $3.15** | ≈ $1.58 |
| **10,000 SKU** | 20M × $0.30 = $6.00 | 1.8M × $2.50 = $4.50 | **≈ $10.50** | ≈ $5.25 |

*(GPT-5 Mini runs slightly lower: ~$8.60 standard / ~$4.30 batched at 10k SKU.)*

## 7. Cost levers (all stack)

1. **Right tier** — middle, not flagship. Biggest driver.
2. **Cache the taxonomy** — identical every call; cached input is ~10× cheaper than fresh input.
3. **Resize images + low/medium detail** — keeps the image portion to ~64–300 tokens vs ~1,290+.
4. **Batch API (−50%)** — your n8n runs on a schedule, not live, so the up-to-24h Batch tier fits perfectly and halves every token.
5. **Escalate, don't default** — cheap tier for the bulk, pricier model only for low-confidence SKUs.

## 8. Full run-cost picture (your side)

| Component | Monthly cost |
|---|---|
| **Vision AI** (10k SKU, middle model) | ~$10.50 standard / ~$5.25 batched |
| **n8n** | $0 — self-hosted on your VM |
| **PWA hosting** | $0 — free tier (HTTPS for camera) |
| **Google Sheet** | $0 |
| **Supabase DB / queue** | $0 likely — free tier covers small text rows at this volume |
| **Image storage** | the variable — see §9 |

## 9. The one real variable — image storage (Drive)

Images must stay hosted as long as the Sheet links to them, so storage **grows monthly**.

At ~200 KB/image: **10k/mo ≈ 2 GB/mo ≈ ~24 GB/year.**

- **Google Drive** (your chosen host): free to **15 GB** (~7–8 months at 10k/mo), then **Google One 100 GB ≈ ~$2/month** — roughly 4 years of runway.
- Aggressive resize (~50–80 KB) stretches the free window further.
- Alternative: Supabase Pro (~$25/mo, ~100 GB) if you'd rather keep one system.

**So storage is ~$0 for the first several months, then ~$2/month.** Still the dominant line item — which tells you how cheap the whole thing is.

## 10. Client pricing & unit economics

Your proposed plans, costed against the middle model + storage:

| Plan | Your price | Price/SKU | AI cost (std) | + Storage | **Your est. cost** | **Gross margin** |
|---|---|---|---|---|---|---|
| **1,000 SKU** | **$35** | $0.0350 | ~$1.05 | ~$0 | **~$1–2** | **~95%** |
| **3,000 SKU** | **$90** | $0.0300 | ~$3.15 | ~$0–2 | **~$3–5** | **~95%** |
| **10,000 SKU** | **$280** | $0.0280 | ~$10.50 | ~$2 | **~$8–13** | **~95%** |

**Margins are excellent — the AI is a rounding error against your price.** Two notes before you publish the plan:

1. **Per-SKU price now decreases cleanly with volume** — $35/1k = **$0.035**, $90/3k = **$0.030**, $280/10k = **$0.028**. Setting the 3k plan to $90 removed the earlier kink (where 3k was cheaper per unit than 10k), so the discount curve is monotonic — a client doing the math sees a consistent volume discount.
2. **You're selling the pipeline, not tokens.** Price on value delivered — photographer throughput, manual-listing hours eliminated — which you're already doing. The ~$10 AI cost is your margin, not your ceiling, so there's room to hold or raise prices on value.

## 11. Open inputs that sharpen the quote

- **Taxonomy size.** If the category list injected on every call is large, the ~1,500-token input assumption rises (caching offsets most of it). The taxonomy file pins the per-SKU cost to the cent.
- **Item Class vs Category mapping** (§2) — confirms 3 vs 4 taxonomy fields in the output.
- **A/B before locking the model.** Run ~50 of Amr's real photos through Gemini 2.5 Flash and GPT-5 Mini (and Flash-Lite, to test if budget is good enough), score name/description/color/class quality against the taxonomy, then commit. Cheap-vs-middle is the wrong axis if the cheaper tier already nails these standardized shots.

## 12. Recommendation

- **Model:** Gemini 2.5 Flash (middle) as primary; A/B against GPT-5 Mini and budget Flash-Lite on real photos.
- **Mode:** paid tier (never free tier for client data — Gemini's free tier may train on it), Batch pricing, taxonomy cached, images resized.
- **Budget to plan around:** **~$5–13/month all-in at 10k SKU** (AI + storage). Everything else is $0.
- **Pricing:** margins are ~90%+ at every tier; the per-SKU curve is now clean ($0.035 → $0.030 → $0.028) with the 3k plan set to $90.
