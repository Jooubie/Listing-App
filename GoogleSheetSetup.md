# Google Sheet + Apps Script Setup

This is the backend for the Joub capture PWA: the app POSTs each scan to a Google
Apps Script web app, which **hosts the photo on Drive, writes a row to the
`Captures` sheet, and classifies the product with AI server-side**.

The script is the source of truth for the sheet layout — you do **not** build
columns by hand. Running `setup()` once creates the `Captures` + `Dashboard`
tabs, all 24 columns, dropdowns, formatting, and the AI trigger.

---

## 1. Files

| File | Role |
| --- | --- |
| `gas/Code.js` | The script that is actually deployed (pushed via clasp) and the single source of truth. |

The script reads its keys from **Script Properties**, never from the code or the
app bundle. No secrets live in this repo.

---

## 2. Sheet columns (auto-created by `setup()`)

The `Captures` tab is columns **A–X**. The app fills capture data + image; the
AI trigger fills the classification fields; the owner/team fill price, edited
images, and listing status.

| Col | Header | Filled by |
| --- | --- | --- |
| A | Timestamp | App |
| B | Date | Formula |
| C | Ecommerce | App (amazon / noon / al_nasser / jumia) |
| D | Photographer | App |
| E | Barcode | App |
| F | Duplicate? | Formula |
| G | Section | AI |
| H | Category | AI |
| I | Sub-Category | AI |
| J | Product | AI |
| K | Size | AI |
| L | Price | Owner |
| M | Color | AI |
| N | Brand | AI |
| O | Description (AR) | AI |
| P | Description (EN) | AI |
| Q | AI Confidence | AI |
| R | Notes | AI / photographer |
| S | Status | `pending` → `confirmed` / `needs_review` |
| T | Original Image | `=IMAGE(...)` preview (app) |
| U | Original Image URL | Direct `/view` link (app) |
| V | Edited Image 1 | Team |
| W | Edited Image 2 | Team |
| X | Listing Status | Team (`Not Listed` / `Listed` / `Live`) |

**Image hosting note:** photos go to a Drive folder shared *anyone-with-link*.
Column **T** uses Drive's `thumbnail?id=…` endpoint (the only Drive URL that
still renders inside `=IMAGE()`), and column **U** is the clickable
`…/file/d/<id>/view` link. The old `uc?id=` format is deprecated by Google and
no longer renders — do not reintroduce it.

---

## 3. Configure the script

In `gas/Code.js`, set the two IDs at the top:

```javascript
const SPREADSHEET_ID  = '...';   // from the sheet URL
const DRIVE_FOLDER_ID = '...';   // Drive folder for product images
```

AI provider is selected by `AI_PROVIDER` (`'openrouter'` or `'gemini'`).

Add the matching key in **Project Settings → Script Properties**:

- `OPENROUTER_API_KEY` — when `AI_PROVIDER = 'openrouter'`
- `GEMINI_API_KEY` — when `AI_PROVIDER = 'gemini'`

(Or run `setOpenRouterKey('...')` / `setApiKey('...')` once from the editor.)

---

## 4. Deploy

Preferred (this repo is already linked — see the clasp memory/notes):

```bash
npx @google/clasp push --force
npx @google/clasp deploy -i <DEPLOYMENT_ID> -d "describe change"
```

Deploying **to the existing deployment id** keeps the same `/exec` URL, so the
frontend `VITE_APPS_SCRIPT_URL` stays valid. A bare `clasp deploy` creates a new
URL and breaks the app.

Manual alternative: **Extensions → Apps Script**, paste `gas/Code.js`,
**Deploy → Manage deployments → Edit → New version**.

After deploying the first time, run `setup()` once from the editor to build the
tabs, dropdowns, and AI trigger.

---

## 5. Frontend env

`.env` (never committed) needs:

```bash
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
VITE_MOCK_MODE=false
```

There is **no** AI key in the frontend — classification is server-side.

---

## 6. Health check

- `GET <exec-url>` → `{ success, status, totalCaptures, ... }`
- `GET <exec-url>?action=peek&n=3` → summary of the last N rows (barcode,
  status, category, image URL) for quick monitoring.

---

## 7. Taxonomy

The closed taxonomy the AI must classify into lives in `src/data/taxonomy.ts`
and is mirrored as `TAXONOMY_TEXT` in the script. Keep the two in sync when the
category structure changes.
