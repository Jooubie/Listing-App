/**
 * Listing App "Joub" — Google Apps Script Write Proxy
 * --------------------------------------------------------------
 * What this does:
 *   1. Receives POST {imageBase64, barcode, platform, ...} from the PWA
 *   2. Uploads the JPEG to a Google Drive folder (anyone-with-link viewable)
 *   3. Appends a row to the "Captures" tab in your Google Sheet
 *
 * Deploy:
 *   1. Open the target sheet → Extensions → Apps Script
 *   2. Paste this file (replace everything)
 *   3. Fill in DRIVE_FOLDER_ID below (SPREADSHEET_ID is already set)
 *   4. Run `setup()` once to grant permissions
 *   5. Deploy → New deployment → Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   6. Copy the /exec URL into .env as VITE_APPS_SCRIPT_URL
 *      (Every code edit needs a new deployment version)
 */

// ═══════════════════════════════════════════════════════════
//  CONFIG — fill these in
// ═══════════════════════════════════════════════════════════
const SPREADSHEET_ID = '14EW2OpC2UAe_e17DJakT_K6R6hrqt9FC7RpwsBjQcrY';
const DRIVE_FOLDER_ID = '1N5bw1IrvQh7pQ4-5rqzyHr6LaaFaVYDS';
const SHEET_TAB_NAME = 'Captures';
// ═══════════════════════════════════════════════════════════

/**
 * GET — health check used by the PWA "Test Connection" button.
 * Ping this URL in a browser to verify deployment.
 */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      status: 'ok',
      message: 'Listing App Script is running',
      spreadsheet: SPREADSHEET_ID,
      folder: DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID_HERE' ? 'NOT_CONFIGURED' : 'configured',
      time: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST — main write endpoint. Body = JSON string (sent as text/plain to avoid CORS preflight).
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. Upload image to Drive if present
    let imageUrl = '';
    if (data.imageBase64) {
      const bytes = Utilities.base64Decode(data.imageBase64);
      const fileName = `${data.platform || 'product'}_${data.barcode || 'nobarcode'}_${Date.now()}.jpg`;
      const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = `https://drive.google.com/uc?id=${file.getId()}`;
    }

    // 2. Append the row
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_TAB_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_TAB_NAME);
      sheet.appendRow([
        'Timestamp', 'Platform', 'Photographer', 'Barcode',
        'Section', 'Category', 'Sub-Category', 'Product Type', 'Product Name',
        'Brand', 'AI Confidence', 'Notes', 'Image URL', 'Status'
      ]);
    }

    sheet.appendRow([
      new Date(data.timestamp),     // A  Timestamp
      data.platform,                // B  Platform
      data.photographerId,          // C  Photographer
      data.barcode,                 // D  Barcode
      data.section || '',           // E  Section
      data.category,                // F  Category
      data.subCategory,             // G  Sub-Category
      data.productType,             // H  Product Type
      data.product || data.productName || '', // I  Product Name
      data.brand,                   // J  Brand
      data.confidence,              // K  AI Confidence
      data.notes,                   // L  Notes
      imageUrl,                     // M  Image URL
      data.status || 'confirmed'    // N  Status
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        rowNumber: sheet.getLastRow()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.message,
        stack: err.stack
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Run once manually to grant Drive + Sheets permissions.
 * View → Logs to confirm.
 */
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Sheet name: ' + ss.getName());
  Logger.log('Sheet URL: ' + ss.getUrl());

  let sheet = ss.getSheetByName(SHEET_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TAB_NAME);
    Logger.log('Created tab: ' + SHEET_TAB_NAME);
  } else {
    Logger.log('Tab exists: ' + SHEET_TAB_NAME + ' (rows=' + sheet.getLastRow() + ')');
  }

  // Header row
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Platform', 'Photographer', 'Barcode',
      'Section', 'Category', 'Sub-Category', 'Product Type', 'Product Name',
      'Brand', 'AI Confidence', 'Notes', 'Image URL', 'Status'
    ]);
    Logger.log('Headers written.');
  }

  if (DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID_HERE') {
    Logger.log('⚠️  DRIVE_FOLDER_ID not set yet. Image upload will fail until you fill it in.');
  } else {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log('Drive folder: ' + folder.getName() + ' (' + folder.getUrl() + ')');
  }

  Logger.log('✅ Setup complete. Now Deploy → New deployment → Web app.');
}
