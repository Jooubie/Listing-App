/**
 * Listing App "Joub" — Google Apps Script Write Proxy  v3
 * ─────────────────────────────────────────────────────────
 * Receives a POST from the PWA (src/utils/sheets.ts → writeRowToSheet),
 * uploads the product photo to Drive, and appends a row to the Captures sheet
 * as status=pending. A timed trigger (classifyPending) then classifies each
 * pending row with Gemini server-side and fills the AI columns.
 *
 * Setup screen sends only: photographer name + platform (ecommerce). No factory.
 *
 * Incoming POST fields (JSON, sent as text/plain to dodge CORS preflight):
 *   timestamp, platform, barcode, photographerId,
 *   section, category, subCategory, product, size, price, color, brand,
 *   descriptionAr, descriptionEn, confidence, notes, status, imageBase64
 *
 * Sheet columns (A–X) — see HEADERS below. The app fills capture data + image;
 * the trigger fills AI fields; the owner fills Price + Edited Image 1/2 + Listing.
 *
 * Deploy:
 *   1. Open target sheet → Extensions → Apps Script → paste this file
 *   2. Confirm SPREADSHEET_ID + DRIVE_FOLDER_ID below
 *   3. Run setApiKey('YOUR_GEMINI_KEY') ONCE
 *   4. Run setup() ONCE (builds Captures + Dashboard tabs, dropdowns, AI trigger)
 *   5. Deploy → Manage deployments → Edit → New version → Deploy
 *      (keeps the same /exec URL so VITE_APPS_SCRIPT_URL stays valid)
 */

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
const SPREADSHEET_ID  = '14EW2OpC2UAe_e17DJakT_K6R6hrqt9FC7RpwsBjQcrY';
const DRIVE_FOLDER_ID = '1N5bw1IrvQh7pQ4-5rqzyHr6LaaFaVYDS';
// ═══════════════════════════════════════════════════════════

const CAPTURES_TAB  = 'Captures';
const DASHBOARD_TAB = 'Dashboard';

// Column order MUST match the write order in doPost()
const HEADERS = [
  'Timestamp',          // A
  'Date',               // B  (formula)
  'Ecommerce',          // C  (platform: amazon / noon / al_nasser / jumia)
  'Photographer',       // D
  'Barcode',            // E
  'Duplicate?',         // F  (formula)
  'Section',            // G
  'Category',           // H
  'Sub-Category',       // I
  'Product',            // J
  'Size',               // K
  'Price',              // L  (owner-filled)
  'Color',              // M
  'Brand',              // N
  'Description (AR)',   // O
  'Description (EN)',   // P
  'AI Confidence',      // Q
  'Notes',              // R
  'Status',             // S
  'Original Image',     // T  (=IMAGE preview, app-filled)
  'Original Image URL', // U  (raw link, app-filled — feed this to the AI editor)
  'Edited Image 1',     // V  (team pastes the edited render link)
  'Edited Image 2',     // W  (team pastes the second edited render link)
  'Listing Status'      // X  (team-managed)
];

// 1-based column indexes
const COL = {
  DATE: 2, BARCODE: 5, DUP: 6,
  SECTION: 7, CATEGORY: 8, SUBCAT: 9, PRODUCT: 10, SIZE: 11, PRICE: 12,
  COLOR: 13, BRAND: 14, DESC_AR: 15, DESC_EN: 16, CONFIDENCE: 17, NOTES: 18,
  STATUS: 19, ORIG_PREVIEW: 20, ORIG_URL: 21, EDITED1: 22, EDITED2: 23, LISTING: 24
};

// ── AI classification config ───────────────────────────────
const GEMINI_MODEL                = 'gemini-1.5-flash';
const CLASSIFY_BATCH_LIMIT        = 40;   // rows per run; ~3s each → ~2min, well under the 6-min cap
const CONFIDENCE_REVIEW_THRESHOLD = 0.6;  // below this → needs_review
const TRIGGER_EVERY_MINUTES       = 1;    // Apps Script minimum; 40 rows/min ≈ 2400/hr ceiling

// Platform brand colors for subtle row tinting (identity columns only)
const PLATFORM_COLORS = {
  amazon:    '#2d1b00',
  noon:      '#2d2900',
  al_nasser: '#1f0000',
  jumia:     '#1f0d00'
};

// ───────────────────────────────────────────────────────────
//  GET — health check
// ───────────────────────────────────────────────────────────
function doGet() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CAPTURES_TAB);
  const rows  = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  return json_({
    success: true,
    status: 'ok',
    message: 'Joub Listing App Script v3 is running',
    totalCaptures: rows,
    time: new Date().toISOString()
  });
}

// ───────────────────────────────────────────────────────────
//  POST — main write endpoint
// ───────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateCaptures_(ss);

    // 1. Upload image to Drive (if base64 payload present)
    let imageUrl = data.imageUrl || '';
    if (data.imageBase64) {
      const bytes    = Utilities.base64Decode(data.imageBase64);
      const fileName = `${data.platform || 'product'}_${data.barcode || 'nobarcode'}_${Date.now()}.jpg`;
      const blob     = Utilities.newBlob(bytes, 'image/jpeg', fileName);
      const file     = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = `https://drive.google.com/uc?id=${file.getId()}`;
    }

    // 2. Duplicate check against existing barcodes
    const barcode     = (data.barcode || '').toString().trim();
    const isDuplicate = checkDuplicate_(sheet, barcode);

    // 3. Build and append the row (one value per HEADERS entry)
    const captureTime = data.timestamp ? new Date(data.timestamp) : new Date();
    const row = sheet.getLastRow() + 1;

    sheet.appendRow([
      captureTime,                  // A  Timestamp
      '',                           // B  Date (formula below)
      data.platform        || '',   // C  Ecommerce
      data.photographerId  || '',   // D  Photographer
      barcode,                      // E  Barcode
      '',                           // F  Duplicate? (formula below)
      data.section         || '',   // G  Section
      data.category        || '',   // H  Category
      data.subCategory     || '',   // I  Sub-Category
      data.product         || '',   // J  Product
      data.size            || '',   // K  Size
      data.price           || '',   // L  Price
      data.color           || '',   // M  Color
      data.brand           || '',   // N  Brand
      data.descriptionAr   || '',   // O  Description (AR)
      data.descriptionEn   || '',   // P  Description (EN)
      data.confidence != null ? data.confidence : '', // Q  AI Confidence
      data.notes           || '',   // R  Notes
      data.status          || 'pending', // S  Status (AI fills, then flips)
      '',                           // T  Original Image (formula below)
      imageUrl,                     // U  Original Image URL
      '',                           // V  Edited Image 1 (team fills)
      '',                           // W  Edited Image 2 (team fills)
      'Not Listed'                  // X  Listing Status
    ]);

    // 4. Formulas
    const bc = colLetter_(COL.BARCODE);
    sheet.getRange(row, COL.DATE).setFormula(`=TEXT(A${row},"YYYY-MM-DD")`);
    sheet.getRange(row, COL.DUP).setFormula(
      `=IF(COUNTIF(${bc}$2:${bc}${row},${bc}${row})>1,"⚠️ DUPLICATE","")`
    );
    if (imageUrl) {
      sheet.getRange(row, COL.ORIG_PREVIEW).setFormula(`=IMAGE("${imageUrl}")`);
    }

    // 5. Visual cues
    colorRowByPlatform_(sheet, row, data.platform || '');
    if (isDuplicate) {
      sheet.getRange(row, COL.DUP).setBackground('#3d2800').setFontColor('#fbbf24');
    }

    return json_({ success: true, imageUrl, rowNumber: row, duplicate: isDuplicate });

  } catch (err) {
    console.error('[doPost]', err.message, err.stack);
    return json_({ success: false, error: err.message });
  }
}

// ───────────────────────────────────────────────────────────
//  SETUP — run once (safe: only touches Captures + Dashboard tabs)
// ───────────────────────────────────────────────────────────
function setup() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateCaptures_(ss);

  // Always (re)write the header row to the current layout so headers can never
  // drift out of sync with what doPost() appends. Tabs other than
  // 'Captures' / 'Dashboard' are never touched.
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  // Column widths (A–X)
  const widths = [155, 95, 95, 115, 140, 95, 110, 120, 120, 150, 60, 70, 80, 110, 220, 220, 90, 200, 95, 110, 230, 150, 150, 100];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(5); // keep Timestamp…Barcode visible when scrolling right
  sheet.setRowHeight(1, 36);

  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#1e293b').setFontColor('#94a3b8')
    .setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle');

  sheet.getRange(2, COL.CONFIDENCE, 5000, 1).setNumberFormat('0%'); // AI Confidence as %

  addDropdowns_(sheet);
  buildDashboard_(ss);
  ensureTrigger_(); // schedule server-side AI classification (every 1 min)

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log('Captures ready (rows=' + sheet.getLastRow() + '). Drive: ' + folder.getName());

  const hasKey = !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  Logger.log(hasKey
    ? '✅ Gemini key found. AI classification is armed.'
    : '⚠️ No Gemini key yet — run setApiKey("YOUR_GEMINI_KEY") once so AI can classify.');
  Logger.log('✅ Setup complete. Deploy → Manage deployments → New version to go live.');
}

// ───────────────────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────────────────
function getOrCreateCaptures_(ss) {
  let sheet = ss.getSheetByName(CAPTURES_TAB);
  if (!sheet) sheet = ss.insertSheet(CAPTURES_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setBackground('#1e293b').setFontColor('#94a3b8').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkDuplicate_(sheet, barcode) {
  if (!barcode || sheet.getLastRow() < 2) return false;
  const col = sheet.getRange(2, COL.BARCODE, sheet.getLastRow() - 1, 1).getValues();
  return col.some(r => (r[0] || '').toString().trim() === barcode);
}

function colorRowByPlatform_(sheet, row, platform) {
  const color = PLATFORM_COLORS[platform.toLowerCase()];
  if (color) sheet.getRange(row, 1, 1, COL.BARCODE).setBackground(color); // tint A..Barcode
}

function addDropdowns_(sheet) {
  const set = (col, values) => sheet.getRange(2, col, 5000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).build()
  );
  set(3,  ['amazon', 'noon', 'al_nasser', 'jumia']);            // C Ecommerce
  set(COL.STATUS, ['pending', 'confirmed', 'needs_review']);    // S Status
  set(COL.LISTING, ['Not Listed', 'Listed', 'Live']);          // X Listing Status
}

function buildDashboard_(ss) {
  let dash = ss.getSheetByName(DASHBOARD_TAB);
  if (!dash) dash = ss.insertSheet(DASHBOARD_TAB, 0);
  dash.clearContents();

  const C = `'${CAPTURES_TAB}'`;
  const rows = [
    ['Joub Listing App — Dashboard', ''],
    ['', ''],
    ['── Totals ──', ''],
    ['All captures',  `=COUNTA(${C}!E2:E)`],
    ['Today',         `=COUNTIF(${C}!B2:B,TEXT(TODAY(),"YYYY-MM-DD"))`],
    ['', ''],
    ['── By Ecommerce ──', ''],
    ['Amazon',        `=COUNTIF(${C}!C2:C,"amazon")`],
    ['Noon',          `=COUNTIF(${C}!C2:C,"noon")`],
    ['Al-Nasser',     `=COUNTIF(${C}!C2:C,"al_nasser")`],
    ['Jumia',         `=COUNTIF(${C}!C2:C,"jumia")`],
    ['', ''],
    ['── AI Queue ──', ''],
    ['Pending (AI)',  `=COUNTIF(${C}!S2:S,"pending")`],
    ['Needs Review',  `=COUNTIF(${C}!S2:S,"needs_review")`],
    ['Confirmed',     `=COUNTIF(${C}!S2:S,"confirmed")`],
    ['Duplicates',    `=COUNTIF(${C}!F2:F,"⚠️ DUPLICATE")`],
    ['', ''],
    ['── Image Editing ──', ''],
    ['Edited done',   `=COUNTIF(${C}!V2:V,"<>")`],
    ['Awaiting edit', `=COUNTA(${C}!U2:U)-COUNTIF(${C}!V2:V,"<>")`],
    ['', ''],
    ['── Listing Progress ──', ''],
    ['Not Listed',    `=COUNTIF(${C}!X2:X,"Not Listed")`],
    ['Listed',        `=COUNTIF(${C}!X2:X,"Listed")`],
    ['Live',          `=COUNTIF(${C}!X2:X,"Live")`],
    ['', ''],
    ['Last refreshed', `=NOW()`]
  ];

  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#e2e8f0');
  dash.setColumnWidth(1, 170);
  dash.setColumnWidth(2, 110);
  [3, 7, 13, 19, 23].forEach(r => dash.getRange(r, 1).setFontWeight('bold').setFontColor('#6366f1'));
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
//  AI CLASSIFICATION — runs server-side on a timed trigger.
//  The phone only uploads raw captures (status = pending); this fills the
//  AI columns and flips the status. The Gemini key lives in Script Properties,
//  never in the app bundle.
// ═══════════════════════════════════════════════════════════

// Closed taxonomy (kept in sync with src/data/taxonomy.ts)
const TAXONOMY_TEXT = [
  "Section: Apparel | Category: Men's Clothing | Sub-Category: Sweatshirts | Product: Sweatshirt",
  "Section: Apparel | Category: Men's Clothing | Sub-Category: T-Shirts | Product: T-Shirt",
  "Section: Apparel | Category: Men's Clothing | Sub-Category: Hoodies | Product: Hoodie",
  "Section: Apparel | Category: Men's Clothing | Sub-Category: Pants | Product: Pants",
  "Section: Apparel | Category: Men's Clothing | Sub-Category: Jackets | Product: Jacket",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Sweatshirts | Product: Sweatshirt",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: T-Shirts | Product: T-Shirt",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Hoodies | Product: Hoodie",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Dresses | Product: Dress",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Skirts | Product: Skirt",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Pants | Product: Pants",
  "Section: Apparel | Category: Women's Clothing | Sub-Category: Jackets | Product: Jacket",
  "Section: Apparel | Category: Kids' Clothing | Sub-Category: Sweatshirts | Product: Sweatshirt",
  "Section: Apparel | Category: Kids' Clothing | Sub-Category: T-Shirts | Product: T-Shirt",
  "Section: Apparel | Category: Kids' Clothing | Sub-Category: Pajamas | Product: Pajamas",
  "Section: Footwear | Category: Footwear | Sub-Category: Sneakers | Product: Sneakers",
  "Section: Footwear | Category: Footwear | Sub-Category: Sandals | Product: Sandals",
  "Section: Footwear | Category: Footwear | Sub-Category: Flip Flops | Product: Flip Flops",
  "Section: Footwear | Category: Footwear | Sub-Category: Boots | Product: Boots",
  "Section: Footwear | Category: Footwear | Sub-Category: Slippers | Product: Slippers",
  "Section: Footwear | Category: Footwear | Sub-Category: Formal Shoes | Product: Formal Shoes",
  "Section: Sports & Fitness | Category: Fitness Equipment | Sub-Category: Power Loops | Product: Power Loops",
  "Section: Sports & Fitness | Category: Fitness Equipment | Sub-Category: Resistance Bands | Product: Resistance Bands",
  "Section: Sports & Fitness | Category: Fitness Equipment | Sub-Category: Knee Support & Braces | Product: Knee Support",
  "Section: Sports & Fitness | Category: Fitness Equipment | Sub-Category: Dumbbells | Product: Dumbbells",
  "Section: Sports & Fitness | Category: Sports Accessories | Sub-Category: Swimming Goggles | Product: Swimming Goggles",
  "Section: Bags & Accessories | Category: Bags | Sub-Category: Handbags | Product: Handbag",
  "Section: Bags & Accessories | Category: Bags | Sub-Category: Backpacks | Product: Backpack",
  "Section: Bags & Accessories | Category: Accessories | Sub-Category: Wallets | Product: Wallet",
  "Section: Bags & Accessories | Category: Accessories | Sub-Category: Belts | Product: Belt",
  "Section: Bags & Accessories | Category: Accessories | Sub-Category: Sunglasses | Product: Sunglasses",
  "Section: Bags & Accessories | Category: Accessories | Sub-Category: Watches | Product: Watch",
  "Section: Bags & Accessories | Category: Jewelry | Sub-Category: Bracelets | Product: Bracelet",
  "Section: Bags & Accessories | Category: Jewelry | Sub-Category: Earrings | Product: Earrings",
  "Section: Toys | Category: Toys | Sub-Category: Action Figures | Product: Action Figure",
  "Section: Toys | Category: Toys | Sub-Category: Dolls | Product: Doll",
  "Section: Toys | Category: Toys | Sub-Category: Building Blocks | Product: Building Blocks",
  "Section: Toys | Category: Toys | Sub-Category: Puzzles | Product: Puzzle",
  "Section: Other | Category: Other | Sub-Category: Miscellaneous | Product: Other / Unclassified"
].join('\n');

// Save the Gemini key ONCE: in the editor run setApiKey('YOUR_KEY'), or set the
// 'GEMINI_API_KEY' property under Project Settings → Script Properties.
function setApiKey(key) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  Logger.log('GEMINI_API_KEY saved.');
}

// Trigger target — classifies up to CLASSIFY_BATCH_LIMIT pending rows per run.
function classifyPending() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) { Logger.log('⚠️ No GEMINI_API_KEY set — run setApiKey("...") once.'); return; }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CAPTURES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  let processed = 0;

  for (let i = 0; i < values.length; i++) {
    if (processed >= CLASSIFY_BATCH_LIMIT) break;
    const row      = i + 2;
    const status   = values[i][COL.STATUS - 1];
    const imageUrl = values[i][COL.ORIG_URL - 1];
    if (status !== 'pending' || !imageUrl) continue;

    try {
      const s = classifyImage_(imageUrl, apiKey);

      // Section..Size (cols 7–11)
      sheet.getRange(row, COL.SECTION, 1, 5).setValues([[
        s.section || '', s.category || '', s.sub_category || '', s.product || '', s.size || ''
      ]]);
      // Color..Notes (cols 13–18) — Price (12) is left for the owner
      sheet.getRange(row, COL.COLOR, 1, 6).setValues([[
        s.color || '', s.brand || '', s.description_ar || '', s.description_en || '',
        (s.confidence != null ? s.confidence : ''), s.notes || ''
      ]]);

      const newStatus = (Number(s.confidence) >= CONFIDENCE_REVIEW_THRESHOLD) ? 'confirmed' : 'needs_review';
      const statusCell = sheet.getRange(row, COL.STATUS).setValue(newStatus);
      if (newStatus === 'needs_review') statusCell.setBackground('#3d2800').setFontColor('#fbbf24');
      processed++;
    } catch (err) {
      sheet.getRange(row, COL.STATUS).setValue('needs_review').setBackground('#3d2800').setFontColor('#fbbf24');
      sheet.getRange(row, COL.NOTES).setValue('AI failed: ' + err.message);
      Logger.log('Row ' + row + ' classify failed: ' + err.message);
    }
  }
  Logger.log('classifyPending processed ' + processed + ' row(s).');
}

function classifyImage_(imageUrl, apiKey) {
  const idMatch = String(imageUrl).match(/[-\w]{25,}/);
  if (!idMatch) throw new Error('Could not parse Drive file id from image URL');
  const blob   = DriveApp.getFileById(idMatch[0]).getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());

  const prompt =
    'You are a professional product cataloging assistant for an e-commerce platform.\n' +
    'Analyze the product image and classify it strictly using the taxonomy below, ' +
    'and write marketing-grade product descriptions in Arabic and English.\n\n' +
    'Taxonomy (pick exact matches for section, category, sub_category, product):\n' + TAXONOMY_TEXT + '\n\n' +
    'Return ONLY valid JSON:\n' +
    '{"section":"","category":"","sub_category":"","product":"","size":"","color":"",' +
    '"description_ar":"","description_en":"","brand":"","confidence":0.0,"notes":""}\n' +
    'Rules: section/category/sub_category/product MUST be exact taxonomy values. ' +
    'color uses short codes (Wht, Blk, Wht-Gry, Blu, Red...). size only if visible else blank. ' +
    'brand if visible else "Unknown". confidence 0.0-1.0. Return ONLY the JSON object.';

  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: blob.getContentType() || 'image/jpeg', data: base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: { temperature: 0.1, topP: 0.8, maxOutputTokens: 512 }
  };

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }

  const json  = JSON.parse(res.getContentText());
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  let text    = parts[0] ? parts[0].text : '';
  if (!text) throw new Error('Empty Gemini response');
  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(text);
}

// (Re)creates the classification trigger at TRIGGER_EVERY_MINUTES. Removes any
// existing classifyPending trigger first so re-running setup() updates the interval.
function ensureTrigger_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'classifyPending') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('classifyPending').timeBased().everyMinutes(TRIGGER_EVERY_MINUTES).create();
  Logger.log('classifyPending trigger set to every ' + TRIGGER_EVERY_MINUTES + ' min.');
}
