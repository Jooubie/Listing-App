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

const HEADERS = [
  'Timestamp',          // A
  'Date',               // B  (formula)
  'Ecommerce',          // C
  'Photographer',       // D
  'Barcode',            // E
  'Duplicate?',         // F  (formula)
  'Section',            // G
  'Category',           // H
  'Sub-Category',       // I
  'Product',            // J
  'Size',               // K
  'Price',              // L
  'Color',              // M
  'Brand',              // N
  'Description (AR)',   // O
  'Description (EN)',   // P
  'AI Confidence',      // Q
  'Notes',              // R
  'Status',             // S
  'Original Image',     // T
  'Original Image URL', // U
  'Edited Image 1',     // V
  'Edited Image 2',     // W
  'Listing Status'      // X
];

const COL = {
  DATE: 2, BARCODE: 5, DUP: 6,
  SECTION: 7, CATEGORY: 8, SUBCAT: 9, PRODUCT: 10, SIZE: 11, PRICE: 12,
  COLOR: 13, BRAND: 14, DESC_AR: 15, DESC_EN: 16, CONFIDENCE: 17, NOTES: 18,
  STATUS: 19, ORIG_PREVIEW: 20, ORIG_URL: 21, EDITED1: 22, EDITED2: 23, LISTING: 24
};

const AI_PROVIDER                 = 'openrouter';
const OPENROUTER_MODEL            = 'google/gemini-2.5-flash';
const GEMINI_MODEL                = 'gemini-2.0-flash';
const CLASSIFY_BATCH_LIMIT        = 40;
const CONFIDENCE_REVIEW_THRESHOLD = 0.6;
const TRIGGER_EVERY_MINUTES       = 1;

const PLATFORM_COLORS = {
  amazon: '#2d1b00', noon: '#2d2900', al_nasser: '#1f0000', jumia: '#1f0d00'
};

function doGet(e) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CAPTURES_TAB);
  const rows  = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;

  // ?action=diag → which provider/model is active and which keys exist (booleans only)
  if (e && e.parameter && e.parameter.action === 'diag') {
    const p = PropertiesService.getScriptProperties();
    return json_({
      success: true,
      aiProvider: AI_PROVIDER,
      openRouterModel: OPENROUTER_MODEL,
      geminiModel: GEMINI_MODEL,
      hasOpenRouterKey: !!p.getProperty('OPENROUTER_API_KEY'),
      hasGeminiKey: !!p.getProperty('GEMINI_API_KEY')
    });
  }

  // ?action=peek&n=3 → last N rows summary (ops/debug health check)
  if (e && e.parameter && e.parameter.action === 'peek' && sheet && rows > 0) {
    const n     = Math.min(parseInt(e.parameter.n, 10) || 3, 20);
    const start = Math.max(2, sheet.getLastRow() - n + 1);
    const count = sheet.getLastRow() - start + 1;
    const vals  = sheet.getRange(start, 1, count, HEADERS.length).getValues();
    const peek  = vals.map(function (r, i) {
      return {
        row:          start + i,
        barcode:      r[COL.BARCODE - 1],
        platform:     r[2],
        photographer: r[3],
        section:      r[COL.SECTION - 1],
        category:     r[COL.CATEGORY - 1],
        product:      r[COL.PRODUCT - 1],
        confidence:   r[COL.CONFIDENCE - 1],
        status:       r[COL.STATUS - 1],
        notes:        r[COL.NOTES - 1],
        imageUrl:     r[COL.ORIG_URL - 1]
      };
    });
    return json_({ success: true, totalCaptures: rows, rows: peek });
  }

  return json_({ success: true, status: 'ok', message: 'Joub v3 running', totalCaptures: rows, time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getOrCreateCaptures_(ss);

    let imageUrl = data.imageUrl || '';
    let previewUrl = '';
    if (data.imageBase64) {
      try {
        const bytes    = Utilities.base64Decode(data.imageBase64);
        const fileName = (data.platform || 'product') + '_' + (data.barcode || 'nobarcode') + '_' + Date.now() + '.jpg';
        const blob     = Utilities.newBlob(bytes, 'image/jpeg', fileName);
        const file     = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const fileId = file.getId();
        imageUrl   = driveViewUrl_(fileId);   // U: clickable link that actually opens
        previewUrl = driveThumbUrl_(fileId);  // T: thumbnail endpoint renders in =IMAGE()
      } catch (imgErr) {
        console.error('[doPost] Drive image upload failed (row will still be written):', imgErr.message);
      }
    }
    if (!previewUrl && imageUrl) previewUrl = driveThumbUrl_(driveIdFromUrl_(imageUrl));

    const barcode     = (data.barcode || '').toString().trim();
    const isDuplicate = checkDuplicate_(sheet, barcode);
    const captureTime = data.timestamp ? new Date(data.timestamp) : new Date();
    const row = sheet.getLastRow() + 1;

    sheet.appendRow([
      captureTime, '', data.platform || '', data.photographerId || '', barcode, '',
      data.section || '', data.category || '', data.subCategory || '', data.product || '',
      data.size || '', data.price || '', data.color || '', data.brand || '',
      data.descriptionAr || '', data.descriptionEn || '',
      data.confidence != null ? data.confidence : '', data.notes || '',
      data.status || 'pending', '', imageUrl, '', '', 'Not Listed'
    ]);

    var bc = colLetter_(COL.BARCODE);
    sheet.getRange(row, COL.DATE).setFormula('=TEXT(A' + row + ',"YYYY-MM-DD")');
    sheet.getRange(row, COL.DUP).setFormula('=IF(COUNTIF(' + bc + '$2:' + bc + row + ',' + bc + row + ')>1,"DUPLICATE","")');
    if (previewUrl) sheet.getRange(row, COL.ORIG_PREVIEW).setFormula('=IMAGE("' + previewUrl + '")');

    colorRowByPlatform_(sheet, row, data.platform || '');
    if (isDuplicate) sheet.getRange(row, COL.DUP).setBackground('#3d2800').setFontColor('#fbbf24');

    return json_({ success: true, imageUrl: imageUrl, rowNumber: row, duplicate: isDuplicate });
  } catch (err) {
    console.error('[doPost]', err.message, err.stack);
    return json_({ success: false, error: err.message });
  }
}

function setup() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateCaptures_(ss);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  var widths = [155, 95, 95, 115, 140, 95, 110, 120, 120, 150, 60, 70, 80, 110, 220, 220, 90, 200, 95, 110, 230, 150, 150, 100];
  widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(5);
  sheet.setRowHeight(1, 36);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#1e293b').setFontColor('#94a3b8').setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle');
  sheet.getRange(2, COL.CONFIDENCE, 5000, 1).setNumberFormat('0%');
  addDropdowns_(sheet);
  buildDashboard_(ss);
  ensureTrigger_();
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log('Captures ready (rows=' + sheet.getLastRow() + '). Drive: ' + folder.getName());
  var keyName = AI_PROVIDER === 'openrouter' ? 'OPENROUTER_API_KEY' : 'GEMINI_API_KEY';
  Logger.log(getApiKey_() ? 'Key found. AI armed.' : 'No key yet. Add ' + keyName + ' in Script Properties.');
  Logger.log('Setup complete. Deploy new version to go live.');
}

function getOrCreateCaptures_(ss) {
  var sheet = ss.getSheetByName(CAPTURES_TAB);
  if (!sheet) sheet = ss.insertSheet(CAPTURES_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setBackground('#1e293b').setFontColor('#94a3b8').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkDuplicate_(sheet, barcode) {
  if (!barcode || sheet.getLastRow() < 2) return false;
  var col = sheet.getRange(2, COL.BARCODE, sheet.getLastRow() - 1, 1).getValues();
  return col.some(function(r) { return (r[0] || '').toString().trim() === barcode; });
}

function colorRowByPlatform_(sheet, row, platform) {
  var color = PLATFORM_COLORS[platform.toLowerCase()];
  if (color) sheet.getRange(row, 1, 1, COL.BARCODE).setBackground(color);
}

function addDropdowns_(sheet) {
  var set = function(col, values) { sheet.getRange(2, col, 5000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).build()); };
  set(3, ['amazon', 'noon', 'al_nasser', 'jumia']);
  set(COL.STATUS, ['pending', 'confirmed', 'needs_review']);
  set(COL.LISTING, ['Not Listed', 'Listed', 'Live']);
}

function buildDashboard_(ss) {
  var dash = ss.getSheetByName(DASHBOARD_TAB);
  if (!dash) dash = ss.insertSheet(DASHBOARD_TAB, 0);
  dash.clearContents();
  var C = "'" + CAPTURES_TAB + "'";
  var rows = [
    ['Joub Dashboard', ''], ['', ''],
    ['Totals', ''],
    ['All captures', '=COUNTA(' + C + '!E2:E)'],
    ['Today', '=COUNTIF(' + C + '!B2:B,TEXT(TODAY(),"YYYY-MM-DD"))'], ['', ''],
    ['By Ecommerce', ''],
    ['Amazon', '=COUNTIF(' + C + '!C2:C,"amazon")'],
    ['Noon', '=COUNTIF(' + C + '!C2:C,"noon")'],
    ['Al-Nasser', '=COUNTIF(' + C + '!C2:C,"al_nasser")'],
    ['Jumia', '=COUNTIF(' + C + '!C2:C,"jumia")'], ['', ''],
    ['AI Queue', ''],
    ['Pending', '=COUNTIF(' + C + '!S2:S,"pending")'],
    ['Needs Review', '=COUNTIF(' + C + '!S2:S,"needs_review")'],
    ['Confirmed', '=COUNTIF(' + C + '!S2:S,"confirmed")'],
    ['Duplicates', '=COUNTIF(' + C + '!F2:F,"DUPLICATE")'], ['', ''],
    ['Image Editing', ''],
    ['Edited done', '=COUNTIF(' + C + '!V2:V,"<>")'],
    ['Awaiting edit', '=COUNTA(' + C + '!U2:U)-COUNTIF(' + C + '!V2:V,"<>")'], ['', ''],
    ['Listing Progress', ''],
    ['Not Listed', '=COUNTIF(' + C + '!X2:X,"Not Listed")'],
    ['Listed', '=COUNTIF(' + C + '!X2:X,"Listed")'],
    ['Live', '=COUNTIF(' + C + '!X2:X,"Live")'], ['', ''],
    ['Last refreshed', '=NOW()']
  ];
  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#e2e8f0');
  dash.setColumnWidth(1, 170);
  dash.setColumnWidth(2, 110);
  [3, 7, 13, 19, 23].forEach(function(r) { dash.getRange(r, 1).setFontWeight('bold').setFontColor('#6366f1'); });
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Drive image URL helpers ────────────────────────────────
// uc?id= is deprecated by Google for both =IMAGE() and hotlinking. The thumbnail
// endpoint renders reliably in-cell; /view is the clickable human/AI link.
function driveThumbUrl_(fileId) { return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000'; }
function driveViewUrl_(fileId)  { return 'https://drive.google.com/file/d/' + fileId + '/view'; }
function driveIdFromUrl_(url)    { var m = String(url || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

// One-time repair for rows captured before the URL fix. Rewrites column U to a
// clean /view link and column T to a thumbnail =IMAGE() so old photos render.
// Safe to re-run; skips rows with no parseable Drive id.
function fixImageUrls() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAPTURES_TAB);
  if (!sheet || sheet.getLastRow() < 2) { Logger.log('fixImageUrls: no rows.'); return; }
  var last = sheet.getLastRow();
  var urls = sheet.getRange(2, COL.ORIG_URL, last - 1, 1).getValues();
  var fixed = 0;
  for (var i = 0; i < urls.length; i++) {
    var id = driveIdFromUrl_(urls[i][0]);
    if (!id) continue;
    var row = i + 2;
    try { DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    sheet.getRange(row, COL.ORIG_URL).setValue(driveViewUrl_(id));
    sheet.getRange(row, COL.ORIG_PREVIEW).setFormula('=IMAGE("' + driveThumbUrl_(id) + '")');
    fixed++;
  }
  Logger.log('fixImageUrls repaired ' + fixed + ' row(s).');
}

var TAXONOMY_TEXT = [
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

function setOpenRouterKey(key) { PropertiesService.getScriptProperties().setProperty('OPENROUTER_API_KEY', key); Logger.log('OPENROUTER_API_KEY saved.'); }
function setApiKey(key) { PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key); Logger.log('GEMINI_API_KEY saved.'); }
function getApiKey_() {
  var p = PropertiesService.getScriptProperties();
  return AI_PROVIDER === 'openrouter' ? p.getProperty('OPENROUTER_API_KEY') : p.getProperty('GEMINI_API_KEY');
}

function classifyPending() {
  var apiKey = getApiKey_();
  if (!apiKey) { Logger.log('No API key for ' + AI_PROVIDER); return; }
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAPTURES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  var processed = 0;
  for (var i = 0; i < values.length; i++) {
    if (processed >= CLASSIFY_BATCH_LIMIT) break;
    var row = i + 2;
    if (values[i][COL.STATUS - 1] !== 'pending' || !values[i][COL.ORIG_URL - 1]) continue;
    try {
      var s = classifyImage_(values[i][COL.ORIG_URL - 1], apiKey);
      sheet.getRange(row, COL.SECTION, 1, 5).setValues([[s.section || '', s.category || '', s.sub_category || '', s.product || '', s.size || '']]);
      sheet.getRange(row, COL.COLOR, 1, 6).setValues([[s.color || '', s.brand || '', s.description_ar || '', s.description_en || '', (s.confidence != null ? s.confidence : ''), s.notes || '']]);
      var newStatus = (Number(s.confidence) >= CONFIDENCE_REVIEW_THRESHOLD) ? 'confirmed' : 'needs_review';
      var cell = sheet.getRange(row, COL.STATUS).setValue(newStatus);
      if (newStatus === 'needs_review') cell.setBackground('#3d2800').setFontColor('#fbbf24');
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
  var idMatch = String(imageUrl).match(/[-\w]{25,}/);
  if (!idMatch) throw new Error('Could not parse Drive file id');
  var blob   = DriveApp.getFileById(idMatch[0]).getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  var prompt = buildPrompt_();
  return (AI_PROVIDER === 'openrouter') ? classifyViaOpenRouter_(blob, base64, prompt, apiKey) : classifyViaGemini_(blob, base64, prompt, apiKey);
}

function buildPrompt_() {
  return 'You are a professional product cataloging assistant for an e-commerce platform.\nAnalyze the product image and classify it strictly using the taxonomy below, and write marketing-grade product descriptions in Arabic and English.\n\nTaxonomy (pick exact matches for section, category, sub_category, product):\n' + TAXONOMY_TEXT + '\n\nReturn ONLY valid JSON:\n{"section":"","category":"","sub_category":"","product":"","size":"","color":"","description_ar":"","description_en":"","brand":"","confidence":0.0,"notes":""}\nRules: section/category/sub_category/product MUST be exact taxonomy values. color uses short codes (Wht, Blk, Wht-Gry, Blu, Red...). size only if visible else blank. brand if visible else "Unknown". confidence 0.0-1.0. Return ONLY the JSON object.';
}

function classifyViaOpenRouter_(blob, base64, prompt, apiKey) {
  var dataUrl = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + base64;
  var body = { model: OPENROUTER_MODEL, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }], temperature: 0.1, max_tokens: 512 };
  var res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post', contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'HTTP-Referer': 'https://github.com/Jooubie/Listing-App', 'X-Title': 'Joub Listing App' },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('OpenRouter HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var json = JSON.parse(res.getContentText());
  var msg  = json.choices && json.choices[0] ? json.choices[0].message : null;
  return parseJson_(msg ? msg.content : '');
}

function classifyViaGemini_(blob, base64, prompt, apiKey) {
  var body = { contents: [{ parts: [{ inlineData: { mimeType: blob.getContentType() || 'image/jpeg', data: base64 } }, { text: prompt }] }], generationConfig: { temperature: 0.1, topP: 0.8, maxOutputTokens: 512 } };
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey, { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var json  = JSON.parse(res.getContentText());
  var parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  return parseJson_(parts[0] ? parts[0].text : '');
}

function parseJson_(text) {
  if (!text) throw new Error('Empty AI response');
  return JSON.parse(String(text).replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim());
}

function ensureTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'classifyPending') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('classifyPending').timeBased().everyMinutes(TRIGGER_EVERY_MINUTES).create();
  Logger.log('classifyPending trigger set to every ' + TRIGGER_EVERY_MINUTES + ' min.');
}
