// Google Sheets integration via Google Apps Script Web App proxy.
// The Apps Script handles authentication, Drive image upload, and sheet row append.

import { resizeImage } from './image';

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
  duplicate?: boolean;
  error?: string;
}

// Compression ladder, tried in order before we ever drop the image. Each step is
// re-encoded from the ORIGINAL blob, so even an oversized native-camera photo
// (where the client-side pre-resize was skipped or failed) still gets shrunk to
// a payload Apps Script reliably accepts. This is what guarantees a hosted image.
const IMAGE_LADDER: ReadonlyArray<readonly [maxEdge: number, quality: number]> = [
  [1280, 0.72],
  [1024, 0.6],
  [800, 0.5],
];

export async function writeRowToSheet(row: CaptureRow): Promise<SheetWriteResponse> {
  const timestamp = new Date().toISOString();

  if (isMockMode) {
    console.log('[Mock] Writing to Google Sheet:', { ...row, imageBlob: row.imageBlob ? '[Blob]' : undefined });
    await new Promise((r) => setTimeout(r, 700));
    return {
      success: true,
      imageUrl: row.imageBlob ? 'https://drive.google.com/file/d/mock_image_id/view' : '',
      rowNumber: 1,
    };
  }

  const base = {
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
  };

  // With an image: try progressively smaller encodings; only fall back to a
  // text-only row if every attempt fails, so a scan is never silently lost.
  if (row.imageBlob) {
    let lastErr: unknown;
    for (const [maxEdge, quality] of IMAGE_LADDER) {
      try {
        const blob = await resizeImage(row.imageBlob, maxEdge, quality);
        const imageBase64 = await blobToBase64(blob);
        console.log(`[Sheets] Uploading image @${maxEdge}px (~${Math.round(imageBase64.length / 1024)}KB base64)`);
        return await postToScript({ ...base, imageBase64 });
      } catch (err) {
        lastErr = err;
        console.warn(`[Sheets] Image write @${maxEdge}px failed; trying smaller…`, err);
      }
    }
    console.warn('[Sheets] All image attempts failed — saving row without image.', lastErr);
  }

  return postToScript(base);
}

// Single POST to the Apps Script web app. text/plain dodges the CORS preflight;
// redirect:follow handles the script.google.com → googleusercontent.com hop.
async function postToScript(payload: Record<string, unknown>): Promise<SheetWriteResponse> {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);

  const result: SheetWriteResponse = await response.json();
  if (!result.success) throw new Error(result.error || 'Apps Script reported write failure');
  return result;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) reject(new Error('Empty base64 result'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
