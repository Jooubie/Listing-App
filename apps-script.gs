/**
 * Listing App "Joub" — Google Apps Script Write Proxy  v2
 * ─────────────────────────────────────────────────────────
 * Receives a POST from the PWA (src/utils/sheets.ts → writeRowToSheet),
 * uploads the product photo to Drive, and appends a fully-structured row
 * to the Captures sheet — aligned 1:1 with the data the app actually sends.
 *
 * Incoming POST fields (JSON, sent as text/plain to dodge CORS preflight):
 *   timestamp, platform, barcode, photographerId, factoryLocation,
 *   section, category, subCategory, product, size, price, color, brand,
 *   descriptionAr, descriptionEn, confidence, notes, status, imageBase64
 *
 * Sheet columns (A–W) — see HEADERS below.
 *
 * Deploy:
 *   1. Open target sheet → Extensions → Apps Script → paste this file
 *   2. Confirm SPREADSHEET_ID + DRIVE_FOLDER_ID below
 *   3. Run `setup()` ONCE (creates tabs, headers, formatting, dropdowns, Dashboard)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   5. Copy the /exec URL → VITE_APPS_SCRIPT_URL (Vercel env / .env)
 *   ⚠️  Every code edit requires a NEW deployment version to go live.
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
  'Timestamp',        // A
  'Date',             // B  (formula)
  'Platform',         // C
  'Photographer',     // D
  'Factory',          // E
  'Barcode',          // F
  'Duplicate?',       // G  (formula)
  'Section',          // H
  'Category',         // I
  'Sub-Category',     // J
  'Product',          // K
  'Size',             // L
  'Price',            // M
  'Color',            // N
  'Brand',            // O
  'Description (AR)', // P
  'Description (EN)', // Q
  'AI Confidence',    // R
  'Notes',            // S
  'Status',           // T
  'Image Preview',    // U  (=IMAGE formula)
  'Image URL',        // V
  'Listing Status'    // W
];

// 1-based column indexes for formula cells
const COL = { DATE: 2, BARCODE: 6, DUP: 7, CONFIDENCE: 18, STATUS: 20, PREVIEW: 21, IMAGE_URL: 22, LISTING: 23 };

// Platform brand colors for subtle row tinting (metadata columns only)
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
    message: 'Joub Listing App Script v2 is running',
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
      data.platform        || '',   // C  Platform
      data.photographerId  || '',   // D  Photographer
      data.factoryLocation || '',   // E  Factory
      barcode,                      // F  Barcode
      '',                           // G  Duplicate? (formula below)
      data.section         || '',   // H  Section
      data.category        || '',   // I  Category
      data.subCategory     || '',   // J  Sub-Category
      data.product         || '',   // K  Product
      data.size            || '',   // L  Size
      data.price           || '',   // M  Price
      data.color           || '',   // N  Color
      data.brand           || '',   // O  Brand
      data.descriptionAr   || '',   // P  Description (AR)
      data.descriptionEn   || '',   // Q  Description (EN)
      data.confidence != null ? data.confidence : '', // R  AI Confidence
      data.notes           || '',   // S  Notes
      data.status          || 'confirmed', // T  Status
      '',                           // U  Image Preview (formula below)
      imageUrl,                     // V  Image URL
      'Not Listed'                  // W  Listing Status
    ]);

    // 4. Formulas
    sheet.getRange(row, COL.DATE).setFormula(`=TEXT(A${row},"YYYY-MM-DD")`);
    sheet.getRange(row, COL.DUP).setFormula(
      `=IF(COUNTIF(F$2:F${row},F${row})>1,"⚠️ DUPLICATE","")`
    );
    if (imageUrl) {
      sheet.getRange(row, COL.PREVIEW).setFormula(`=IMAGE("${imageUrl}")`);
    }

    // 5. Visual cues
    colorRowByPlatform_(sheet, row, data.platform || '');
    if (isDuplicate) {
      sheet.getRange(row, COL.DUP).setBackground('#3d2800').setFontColor('#fbbf24');
    }
    if ((data.status || '') === 'needs_review') {
      sheet.getRange(row, COL.STATUS).setBackground('#3d2800').setFontColor('#fbbf24');
    }

    return json_({ success: true, imageUrl, rowNumber: row, duplicate: isDuplicate });

  } catch (err) {
    console.error('[doPost]', err.message, err.stack);
    return json_({ success: false, error: err.message });
  }
}

// ───────────────────────────────────────────────────────────
//  SETUP — run once
// ───────────────────────────────────────────────────────────
function setup() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateCaptures_(ss);

  // Column widths (A–W)
  const widths = [155, 95, 95, 115, 120, 140, 95, 110, 120, 120, 150, 60, 70, 80, 110, 220, 220, 90, 200, 95, 110, 240, 100];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(6); // keep Timestamp…Barcode visible when scrolling right
  sheet.setRowHeight(1, 36);

  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#1e293b').setFontColor('#94a3b8')
    .setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle');

  // Number/format hints
  sheet.getRange(2, COL.CONFIDENCE, 2000, 1).setNumberFormat('0%'); // AI Confidence as %

  addDropdowns_(sheet);
  buildDashboard_(ss);

  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log('Captures ready (rows=' + sheet.getLastRow() + '). Drive: ' + folder.getName());
  Logger.log('✅ Setup complete. Deploy → New deployment → Web app to go live.');
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
  if (color) sheet.getRange(row, 1, 1, 6).setBackground(color);
}

function addDropdowns_(sheet) {
  const set = (col, values) => sheet.getRange(2, col, 2000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).build()
  );
  set(3,  ['amazon', 'noon', 'al_nasser', 'jumia']);            // C Platform
  set(COL.STATUS, ['confirmed', 'needs_review']);               // T Status
  set(COL.LISTING, ['Not Listed', 'Listed', 'Live']);          // W Listing Status
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
    ['All captures',  `=COUNTA(${C}!F2:F)`],
    ['Today',         `=COUNTIF(${C}!B2:B,TEXT(TODAY(),"YYYY-MM-DD"))`],
    ['', ''],
    ['── By Platform ──', ''],
    ['Amazon',        `=COUNTIF(${C}!C2:C,"amazon")`],
    ['Noon',          `=COUNTIF(${C}!C2:C,"noon")`],
    ['Al-Nasser',     `=COUNTIF(${C}!C2:C,"al_nasser")`],
    ['Jumia',         `=COUNTIF(${C}!C2:C,"jumia")`],
    ['', ''],
    ['── Review Queue ──', ''],
    ['Needs Review',  `=COUNTIF(${C}!T2:T,"needs_review")`],
    ['Confirmed',     `=COUNTIF(${C}!T2:T,"confirmed")`],
    ['Duplicates',    `=COUNTIF(${C}!G2:G,"⚠️ DUPLICATE")`],
    ['', ''],
    ['── Listing Progress ──', ''],
    ['Not Listed',    `=COUNTIF(${C}!W2:W,"Not Listed")`],
    ['Listed',        `=COUNTIF(${C}!W2:W,"Listed")`],
    ['Live',          `=COUNTIF(${C}!W2:W,"Live")`],
    ['', ''],
    ['Last refreshed', `=NOW()`]
  ];

  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  dash.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#e2e8f0');
  dash.setColumnWidth(1, 170);
  dash.setColumnWidth(2, 110);
  [3, 7, 13, 18].forEach(r => dash.getRange(r, 1).setFontWeight('bold').setFontColor('#6366f1'));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
