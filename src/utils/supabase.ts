import { createClient } from '@supabase/supabase-js';

// Environment variables configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET || 'product-images';

// Determine if we should run in mock mode
export const isMockMode = 
  import.meta.env.VITE_MOCK_MODE === 'true' || 
  !supabaseUrl || 
  !supabaseAnonKey;

// Real Supabase client instance (initialized only if not in mock mode)
const supabase = !isMockMode ? createClient(supabaseUrl, supabaseAnonKey) : null;

export interface CaptureInput {
  platform: string;
  barcode: string;
  image_url: string;
  image_path: string;
  photographer_id: string;
  status: 'pending';
}

export interface CaptureResponse {
  id: string;
  platform: string;
  barcode: string;
  image_url: string;
  image_path: string;
  photographer_id: string;
  status: 'pending';
  created_at: string;
}

/**
 * Uploads a JPEG Blob to Supabase Storage or mocks the upload.
 */
export async function uploadImage(
  platform: string,
  blob: Blob
): Promise<{ publicUrl: string; storagePath: string }> {
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const uuid = crypto.randomUUID();
  const storagePath = `${platform}/${dateStr}/${uuid}.jpg`;

  if (isMockMode) {
    console.log(`[Mock Mode] Uploading image to Storage bucket "${supabaseBucket}" at path "${storagePath}"...`);
    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // In Mock Mode, we generate a object URL of the blob so the PWA can display it in Amr's formula list if needed,
    // or just return a dummy Supabase mock URL. Creating an object URL allows rendering the photo locally.
    const mockUrl = URL.createObjectURL(blob);
    console.log(`[Mock Mode] Image upload complete. Public URL: ${mockUrl}`);
    return { publicUrl: mockUrl, storagePath };
  }

  if (!supabase) {
    throw new Error('Supabase client is not initialized');
  }

  // Live Mode: Upload file to storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(supabaseBucket)
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload error: ${uploadError.message}`);
  }

  // Retrieve public URL
  const { data: urlData } = supabase.storage
    .from(supabaseBucket)
    .getPublicUrl(storagePath);

  if (!urlData || !urlData.publicUrl) {
    throw new Error('Failed to get public URL for uploaded image');
  }

  console.log(`[Live Mode] Uploaded to path ${uploadData.path}. Public URL: ${urlData.publicUrl}`);
  return { publicUrl: urlData.publicUrl, storagePath };
}

/**
 * Inserts a record into the `captures` table or mocks the insertion.
 */
export async function insertCaptureRow(input: CaptureInput): Promise<CaptureResponse> {
  if (isMockMode) {
    console.log('[Mock Mode] Inserting record into "captures" table:', input);
    // Simulate database insert delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const mockResponse: CaptureResponse = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...input
    };
    console.log('[Mock Mode] Row insertion complete:', mockResponse);
    return mockResponse;
  }

  if (!supabase) {
    throw new Error('Supabase client is not initialized');
  }

  // Live Mode: Insert capture metadata row
  const { data, error } = await supabase
    .from('captures')
    .insert([input])
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase DB insert error: ${error.message}`);
  }

  console.log('[Live Mode] Row insertion complete:', data);
  return data as CaptureResponse;
}
