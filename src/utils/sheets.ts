// Google Sheets integration via Google Apps Script Web App proxy.
// The Apps Script handles authentication, Drive image upload, and sheet row append.

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

export const isMockMode =
  import.meta.env.VITE_MOCK_MODE === 'true' ||
  !APPS_SCRIPT_URL;

export interface CaptureRow {
  platform: string;
  barcode: string;
  photographerId: string;
  section: string;
  category: string;
  subCategory: string;
  product: string;
  size: string;
  price: string;
  color: string;
  brand: string;
  descriptionAr: string;
  descriptionEn: string;
  confidence: number;
  notes: string;
  imageBlob?: Blob;
  status?: 'pending' | 'confirmed' | 'needs_review';
}

export interface SheetWriteResponse {
  success: boolean;
  imageUrl?: string;
  rowNumber?: number;
}

export async function writeRowToSheet(row: CaptureRow): Promise<SheetWriteResponse> {
  const timestamp = new Date().toISOString();

  if (isMockMode) {
    console.log('[Mock] Writing to Google Sheet:', { ...row, imageBlob: '[Blob]' });
    await new Promise(r => setTimeout(r, 900));
    return { success: true, imageUrl: 'https://lh3.googleusercontent.com/d/mock_image_id', rowNumber: 1 };
  }

  // Convert image blob to base64 — kept separate so failures don't block the row write
  let imageBase64: string | undefined;
  if (row.imageBlob) {
    try {
      imageBase64 = await blobToBase64(row.imageBlob);
      console.log(`[Sheets] Image base64 ready, size: ~${Math.round(imageBase64.length / 1024)}KB`);
    } catch (err) {
      console.warn('[Sheets] Image base64 conversion failed — submitting row without image:', err);
    }
  }

  const payload = {
    timestamp,
    platform: row.platform,
    barcode: row.barcode,
    photographerId: row.photographerId,
    section: row.section,
    category: row.category,
    subCategory: row.subCategory,
    product: row.product,
    size: row.size,
    price: row.price,
    color: row.color,
    brand: row.brand,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    confidence: row.confidence,
    notes: row.notes,
    status: row.status ?? 'pending',
    imageBase64
  };

  // Apps Script deployed as Web App — use text/plain to avoid CORS preflight.
  // Follow redirects explicitly (Apps Script sometimes redirects to a new URL).
  let response: Response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch (fetchErr) {
    throw new Error(`Network error reaching Apps Script: ${(fetchErr as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Apps Script returned HTTP ${response.status}`);
  }

  try {
    const result: SheetWriteResponse = await response.json();
    if (!result.success) {
      console.warn('[Sheets] Apps Script reported failure:', result);
      // Non-fatal: row was still written (Apps Script returns success:false only on image errors)
    }
    return result;
  } catch {
    // Opaque or non-JSON response — treat any 2xx as success
    return { success: true };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      if (!base64) reject(new Error('Empty base64 result'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
