import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { uploadImage, insertCaptureRow } from './supabase';

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

/**
 * Add a capture item to the IndexedDB local queue
 */
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
  console.log('[Queue] Stashed offline capture in IndexedDB:', queuedItem.id);
  return queuedItem;
}

/**
 * Retrieve all items currently in the local queue
 */
export async function getQueuedCaptures(): Promise<QueuedItem[]> {
  const db = await getDB();
  const list = await db.getAll('queue');
  // Sort by created_at (ascending) to maintain FIFO sync order
  return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Remove an item from the local queue by its UUID
 */
export async function dequeueCapture(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('queue', id);
  console.log('[Queue] Removed synchronized capture from IndexedDB:', id);
}

/**
 * Check the size of the local queue
 */
export async function getQueueSize(): Promise<number> {
  const db = await getDB();
  const keys = await db.getAllKeys('queue');
  return keys.length;
}

let isSyncing = false;

/**
 * Processes all stashed captures in the queue (FIFO order).
 * Uploads media, writes rows, and removes items on success.
 * Stops and throws on the first connection failure.
 */
export async function syncOfflineQueue(
  onProgress?: (progress: { syncedCount: number; totalCount: number; currentItem?: QueuedItem }) => void
): Promise<void> {
  if (isSyncing) {
    console.log('[Sync] Queue sync is already in progress.');
    return;
  }

  isSyncing = true;
  try {
    const queue = await getQueuedCaptures();
    const totalCount = queue.length;
    
    if (totalCount === 0) {
      console.log('[Sync] No offline captures to sync.');
      return;
    }

    console.log(`[Sync] Found ${totalCount} queued captures. Starting synchronization...`);

    let syncedCount = 0;

    for (const item of queue) {
      if (onProgress) {
        onProgress({ syncedCount, totalCount, currentItem: item });
      }

      try {
        console.log(`[Sync] Uploading media for queued capture: ${item.id}...`);
        const { publicUrl, storagePath } = await uploadImage(item.platform, item.imageBlob);

        console.log(`[Sync] Writing DB row for queued capture: ${item.id}...`);
        await insertCaptureRow({
          platform: item.platform,
          barcode: item.barcode,
          image_url: publicUrl,
          image_path: storagePath,
          photographer_id: item.photographer_id,
          status: 'pending',
        });

        // Successful write, remove from local queue
        await dequeueCapture(item.id);
        syncedCount++;
        
      } catch (err) {
        console.error(`[Sync] Sync failed at item ${item.id}. Halting queue processing.`, err);
        throw err; // Stop executing remaining queue items
      }
    }

    if (onProgress) {
      onProgress({ syncedCount, totalCount });
    }
    
    console.log('[Sync] Synchronization complete!');
  } finally {
    isSyncing = false;
  }
}
