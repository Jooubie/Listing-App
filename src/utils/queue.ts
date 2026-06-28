import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { writeRowToSheet } from './sheets';

// The phone only captures raw data. AI classification happens server-side in the
// Google Apps Script (a timed trigger fills section/category/product/etc.).
export interface QueuedItem {
  id: string;
  platform: string;
  barcode: string;
  imageBlob: Blob;
  photographer_id: string;
  created_at: string;
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

// Uploads each queued capture to the sheet as a 'pending' row (photo + barcode +
// who/where). The Apps Script trigger then classifies it with Gemini and flips
// the status to confirmed / needs_review. No AI runs on the phone.
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

    console.log(`[Sync] Uploading ${totalCount} captures...`);
    let syncedCount = 0;

    for (const item of queue) {
      onProgress?.({ syncedCount, totalCount, currentItem: item });

      try {
        await writeRowToSheet({
          platform: item.platform,
          barcode: item.barcode,
          photographerId: item.photographer_id,
          // AI fields intentionally empty — filled server-side by the Apps Script
          section: '',
          category: '',
          subCategory: '',
          product: '',
          size: '',
          price: '',
          color: '',
          brand: '',
          descriptionAr: '',
          descriptionEn: '',
          notes: '',
          confidence: 0,
          imageBlob: item.imageBlob,
          status: 'pending',
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
