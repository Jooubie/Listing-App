import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { writeRowToSheet } from './sheets';
import { analyzeProductImage } from './gemini';
import { TAXONOMY } from '../data/taxonomy';

export interface QueuedItem {
  id: string;
  platform: string;
  barcode: string;
  imageBlob: Blob;
  photographer_id: string;
  factory_location: string;
  created_at: string;
  section?: string;
  category?: string;
  subCategory?: string;
  productType?: string;
  productName?: string;
  brand?: string;
  size?: string;
  color?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  notes?: string;
  confidence?: number;
}

interface QueueDB extends DBSchema {
  queue: {
    key: string;
    value: QueuedItem;
  };
}

let dbPromise: Promise<IDBPDatabase<QueueDB>> | null = null;

function getDB(): Promise<IDBPDatabase<QueueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QueueDB>('joubie-capture-queue', 1, {
      upgrade(db) {
        db.createObjectStore('queue', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function enqueueCapture(item: {
  platform: string;
  barcode: string;
  imageBlob: Blob;
  photographer_id: string;
  factory_location: string;
  section?: string;
  category?: string;
  subCategory?: string;
  productType?: string;
  productName?: string;
  brand?: string;
  size?: string;
  color?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  notes?: string;
  confidence?: number;
}): Promise<QueuedItem> {
  const db = await getDB();
  const queuedItem: QueuedItem = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...item,
  };
  await db.put('queue', queuedItem);
  console.log('[Queue] Stashed capture:', queuedItem.id);
  return queuedItem;
}

export async function getQueuedCaptures(): Promise<QueuedItem[]> {
  const db = await getDB();
  const list = await db.getAll('queue');
  return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function dequeueCapture(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('queue', id);
  console.log('[Queue] Removed synced capture:', id);
}

export async function getQueueSize(): Promise<number> {
  const db = await getDB();
  const keys = await db.getAllKeys('queue');
  return keys.length;
}

let isSyncing = false;

// Offline items sync directly to the sheet as "needs_review" since we can't
// show the AI review UI during background sync. Amr will see them flagged in the sheet.
export async function syncOfflineQueue(
  onProgress?: (progress: { syncedCount: number; totalCount: number; currentItem?: QueuedItem }) => void
): Promise<void> {
  if (isSyncing) {
    console.log('[Sync] Already in progress.');
    return;
  }

  isSyncing = true;
  try {
    const queue = await getQueuedCaptures();
    const totalCount = queue.length;
    if (totalCount === 0) return;

    console.log(`[Sync] Syncing ${totalCount} captures...`);
    let syncedCount = 0;

    for (const item of queue) {
      onProgress?.({ syncedCount, totalCount, currentItem: item });

      try {
        let section = item.section || '';
        let category = item.category || '';
        let subCategory = item.subCategory || '';
        let product = item.productType || item.productName || '';
        let size = item.size || '';
        let color = item.color || '';
        let descriptionAr = item.descriptionAr || '';
        let descriptionEn = item.descriptionEn || '';
        let brand = item.brand || '';
        let confidence = item.confidence || 0;
        let notes = item.notes || '';

        // If the item doesn't have reviewed details (e.g. Quick Capture mode),
        // run Gemini analysis now during background sync.
        if (!category) {
          try {
            const suggestion = await analyzeProductImage(item.imageBlob);
            category = suggestion.category;
            subCategory = suggestion.sub_category;
            product = suggestion.product;
            brand = suggestion.brand;
            notes = suggestion.notes;
            confidence = suggestion.confidence;
            descriptionAr = suggestion.description_ar;
            descriptionEn = suggestion.description_en;
            color = suggestion.color;
            size = suggestion.size;
          } catch (geminiErr: any) {
            console.warn(`[Sync] Gemini classification failed for item ${item.id}. Saving empty.`, geminiErr);
            notes = `Gemini Vision failed during sync: ${geminiErr.message || 'Unknown error'}`;
          }
        }

        // Fill section from taxonomy if not already set
        if (!section) {
          section = TAXONOMY.find(t => t.category === category)?.section || 'Other';
        }

        await writeRowToSheet({
          platform: item.platform,
          barcode: item.barcode,
          photographerId: item.photographer_id,
          factoryLocation: item.factory_location || '',
          section,
          category,
          subCategory,
          product: product || `Product ${item.barcode}`,
          size,
          price: '',
          color,
          brand: brand || 'Unknown',
          descriptionAr,
          descriptionEn,
          notes,
          confidence,
          imageBlob: item.imageBlob,
          status: category ? 'confirmed' : 'needs_review'
        });

        await dequeueCapture(item.id);
        syncedCount++;
      } catch (err) {
        console.error(`[Sync] Failed at item ${item.id}. Stopping.`, err);
        throw err;
      }
    }

    onProgress?.({ syncedCount, totalCount });
    console.log('[Sync] Complete.');
  } finally {
    isSyncing = false;
  }
}
