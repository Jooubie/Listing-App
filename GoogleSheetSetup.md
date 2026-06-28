# Google Sheet Setup Guide

This document covers:

1. The required sheet column structure
2. The Google Apps Script code (the write proxy)
3. How to deploy and get your `VITE_APPS_SCRIPT_URL`

---

## 1. Sheet Structure

Create a Google Sheet and name the first tab **`Captures`**.

Set up these columns in row 1 (exact order matters for the Apps Script):

| Col | Header        | Type          | Source                                   |
| --- | ------------- | ------------- | ---------------------------------------- |
| A   | Timestamp     | DateTime      | Auto (Apps Script)                       |
| B   | Platform      | Text          | App (amazon/noon/al_nasser/jumia)        |
| C   | Photographer  | Text          | App                                      |
| D   | Barcode       | Text          | App (camera scan)                        |
| E   | Category      | Text          | Confirmed by photographer (AI suggested) |
| F   | Sub-Category  | Text          | Confirmed by photographer (AI suggested) |
| G   | Product Type  | Text          | Confirmed by photographer (AI suggested) |
| H   | Product Name  | Text          | Confirmed by photographer (AI suggested) |
| I   | Brand         | Text          | Confirmed by photographer (AI suggested) |
| J   | AI Confidence | Number (0–1) | Gemini Vision                            |
| K   | Notes         | Text          | Photographer                             |
| L   | Image URL     | URL           | Apps Script → Google Drive              |
| M   | Status        | Text          | `confirmed` or `needs_review`        |

### Recommended Sheet Formatting

- **Freeze row 1** (View → Freeze → 1 row)
- Format column A as `Date time`
- Format column J as `Percent` (multiply by 100)
- Add a filter to column M so Amr can quickly view `needs_review` items

### Data Validation Dropdowns (Optional but recommended)

Add dropdown validation to the following columns so Amr can correct AI mistakes directly in the sheet:

- **Column B (Platform):** `amazon, noon, al_nasser, jumia`
- **Column E (Category):** Your category list
- **Column M (Status):** `confirmed, needs_review, done`

---

## 2. Google Drive Folder for Images

1. Create a folder in Google Drive called **`Listing App Images`** (or any name).
2. Copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/`**`THIS_PART_IS_THE_ID`**
3. You'll paste this ID into the Apps Script below.

---

## 3. Apps Script Code

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete the default code and paste the code below
4. Replace the two constants at the top with your real values

```javascript
// ── CONFIGURE THESE TWO VALUES ──────────────────────────────────────────────
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEET_ID';   // from the sheet URL
const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID';  // folder for product images
// ────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Save image to Google Drive and get a shareable link
    let imageUrl = '';
    if (data.imageBase64) {
      const bytes = Utilities.base64Decode(data.imageBase64);
      const fileName = `${data.barcode || 'product'}_${Date.now()}.jpg`;
      const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // Convert to a direct viewable URL
      imageUrl = `https://drive.google.com/uc?id=${file.getId()}`;
    }

    // Write row to the Captures sheet
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Captures');

    sheet.appendRow([
      new Date(data.timestamp),   // A: Timestamp
      data.platform,              // B: Platform
      data.photographerId,        // C: Photographer
      data.barcode,               // D: Barcode
      data.category,              // E: Category
      data.subCategory,           // F: Sub-Category
      data.productType,           // G: Product Type
      data.productName,           // H: Product Name
      data.brand,                 // I: Brand
      data.confidence,            // J: AI Confidence
      data.notes,                 // K: Notes
      imageUrl,                   // L: Image URL
      data.status                 // M: Status
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, imageUrl }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Health check — GET request to verify the script is live
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Listing App Script is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## 4. Deploy the Script as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description:** Listing App Write Proxy
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`
6. Paste this URL as `VITE_APPS_SCRIPT_URL` in your `.env` file

> **Every time you edit the Apps Script**, you must create a **new deployment** or use **Manage Deployments → Edit** to update the existing one. Otherwise the old code stays live.

---

## 5. Environment File

Copy `.env.example` to `.env` and fill in your values:

```bash
VITE_GEMINI_API_KEY=AQ.Ab8RN6K6sBNukfLSFJC0Bqb4YtHyuX7DY8E4G6X2dQ0Wk8bscw
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
VITE_MOCK_MODE=false
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey
It's free with generous limits (1,500 requests/day on the free tier).

---

## 6. Taxonomy Updates

The category/sub-category/product type dropdowns in the app are defined in:
`src/data/taxonomy.ts`

When Amr provides his actual category structure, edit that file.
The AI prompt and all dropdowns in the review screen update automatically.
