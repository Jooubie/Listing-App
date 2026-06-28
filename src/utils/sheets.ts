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
  factoryLocation: string;
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
  status?: 'confirmed' | 'needs_review';
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

  let imageBase64: string | undefined;
  if (row.imageBlob) {
    imageBase64 = await blobToBase64(row.imageBlob);
  }

  const payload = {
    timestamp,
    platform: row.platform,
    barcode: row.barcode,
    photographerId: row.photographerId,
    factoryLocation: row.factoryLocation,
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
    status: row.status ?? 'confirmed',
    imageBase64
  };

  // Apps Script deployed as Web App doesn't support CORS pre-flight on POST with JSON.
  // We use no-cors and accept opaque response; errors surface only if the fetch itself fails.
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Sheet write failed: HTTP ${response.status}`);
  }

  try {
    const result: SheetWriteResponse = await response.json();
    return result;
  } catch {
    // Apps Script no-cors returns opaque response — treat 2xx as success
    return { success: true };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
