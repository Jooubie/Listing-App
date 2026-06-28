import { useEffect, useState } from 'react';
import { SessionSetup } from './components/SessionSetup';
import { BarcodeScanner } from './components/BarcodeScanner';
import { PhotoCapture } from './components/PhotoCapture';
import { resizeImage } from './utils/image';
import { uploadImage, insertCaptureRow, isMockMode } from './utils/supabase';
import { enqueueCapture, getQueueSize, syncOfflineQueue } from './utils/queue';
import { CheckCircle2, Loader2, Wifi, Database } from 'lucide-react';

type Screen = 'setup' | 'scan' | 'capture' | 'submit';

export default function App() {
  // Persistence states
  const [photographerId, setPhotographerId] = useState<string>(() => {
    return localStorage.getItem('joubie_photographer_id') || '';
  });
  const [platform, setPlatform] = useState<string>(() => {
    return localStorage.getItem('joubie_platform') || '';
  });
  const [sessionCount, setSessionCount] = useState<number>(() => {
    const saved = localStorage.getItem('joubie_session_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Navigation and data states
  const [activeScreen, setActiveScreen] = useState<Screen>(() => {
    return localStorage.getItem('joubie_active_screen') as Screen || 'setup';
  });
  const [activeBarcode, setActiveBarcode] = useState<string>(() => {
    return localStorage.getItem('joubie_active_barcode') || '';
  });

  const [queueSize, setQueueSize] = useState(0);
  
  // Submit states
  const [submitStatus, setSubmitStatus] = useState<'processing' | 'success'>('processing');
  const [submitMessage, setSubmitMessage] = useState('');
  const [isOfflineStashed, setIsOfflineStashed] = useState(false);

  // Sync state
  const [syncProgress, setSyncProgress] = useState<{
    syncedCount: number;
    totalCount: number;
    currentItem?: any;
  } | null>(null);

  // Keep screen state in sync with localStorage for quick reloads
  useEffect(() => {
    if (activeScreen === 'setup') {
      localStorage.removeItem('joubie_active_screen');
    } else {
      localStorage.setItem('joubie_active_screen', activeScreen);
    }
  }, [activeScreen]);

  useEffect(() => {
    if (activeBarcode) {
      localStorage.setItem('joubie_active_barcode', activeBarcode);
    } else {
      localStorage.removeItem('joubie_active_barcode');
    }
  }, [activeBarcode]);

  // Load initial queue size and monitor online status
  useEffect(() => {
    getQueueSize().then(setQueueSize);

    const handleOnline = () => {
      triggerSync();
    };
    const handleOffline = () => {};

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Run a sync check immediately on mount if online
    if (navigator.onLine) {
      triggerSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Trigger sync of offline queue
  const triggerSync = async () => {
    const size = await getQueueSize();
    setQueueSize(size);
    if (size === 0) return;

    try {
      await syncOfflineQueue((progress) => {
        setSyncProgress(progress);
        getQueueSize().then(setQueueSize);
      });
    } catch (err) {
      console.warn('[App] Offline queue sync paused/failed due to connectivity issues.');
    } finally {
      setSyncProgress(null);
      getQueueSize().then(setQueueSize);
    }
  };

  const handleSessionComplete = (id: string, plat: string) => {
    setPhotographerId(id);
    setPlatform(plat);
    localStorage.setItem('joubie_photographer_id', id);
    localStorage.setItem('joubie_platform', plat);
    setActiveScreen('scan');
  };

  const handleBarcodeDecoded = (barcode: string) => {
    setActiveBarcode(barcode);
    setActiveScreen('capture');
  };

  const handleCaptureComplete = async (rawBlob: Blob) => {
    setActiveScreen('submit');
    setSubmitStatus('processing');
    setIsOfflineStashed(false);
    setSubmitMessage('Compressing photo...');

    let nextCount = sessionCount;

    try {
      // 1. Resize/compress image client-side to cap storage and network overhead
      const compressedBlob = await resizeImage(rawBlob, 1600, 0.8);

      // Check current network status before trying upload
      if (!navigator.onLine) {
        throw new Error('Device is offline');
      }

      setSubmitMessage('Uploading to Supabase buffer...');
      // 2. Upload photo
      const { publicUrl, storagePath } = await uploadImage(platform, compressedBlob);

      setSubmitMessage('Recording scan metadata...');
      // 3. Insert metadata record
      await insertCaptureRow({
        platform,
        barcode: activeBarcode,
        image_url: publicUrl,
        image_path: storagePath,
        photographer_id: photographerId,
        status: 'pending'
      });

      nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      localStorage.setItem('joubie_session_count', nextCount.toString());

      setSubmitStatus('success');
      setSubmitMessage('Saved successfully');
      
    } catch (error: any) {
      console.warn('[App] Active upload failed. Queueing item in IndexedDB...', error);
      
      // Fallback: Queue offline in IndexedDB
      try {
        setSubmitMessage('Offline. Saving locally...');
        await enqueueCapture({
          platform,
          barcode: activeBarcode,
          imageBlob: rawBlob, // stash raw photo so we don't lose quality if sync is delayed
          photographer_id: photographerId
        });
        
        const size = await getQueueSize();
        setQueueSize(size);

        nextCount = sessionCount + 1;
        setSessionCount(nextCount);
        localStorage.setItem('joubie_session_count', nextCount.toString());

        setIsOfflineStashed(true);
        setSubmitStatus('success');
        setSubmitMessage('Queued locally (Offline)');
      } catch (queueErr) {
        console.error('[App] Failed to save in IndexedDB queue!', queueErr);
        alert('Critical error: Could not save capture locally. Free storage space and retry.');
        setActiveScreen('capture');
        return;
      }
    }

    // Auto-return to Scan Screen after a short pause showing success checkmark
    setTimeout(() => {
      setActiveBarcode('');
      setActiveScreen('scan');
      // If we are back online, kick off queue sync in background
      if (navigator.onLine) {
        triggerSync();
      }
    }, 1200);
  };

  const handleResetSession = () => {
    if (confirm('Are you sure you want to change platform or photographer? This resets your session.')) {
      setActiveScreen('setup');
      localStorage.removeItem('joubie_active_screen');
    }
  };

  return (
    <div className="relative w-full h-full max-w-md mx-auto bg-slate-950 flex flex-col shadow-2xl">
      
      {/* Active screen router */}
      {activeScreen === 'setup' && (
        <SessionSetup
          onComplete={handleSessionComplete}
          initialPhotographerId={photographerId}
          initialPlatform={platform}
        />
      )}

      {activeScreen === 'scan' && (
        <BarcodeScanner
          platform={platform}
          photographerId={photographerId}
          onDecode={handleBarcodeDecoded}
          onChangeSession={handleResetSession}
          offlineCount={queueSize}
        />
      )}

      {activeScreen === 'capture' && (
        <PhotoCapture
          platform={platform}
          barcode={activeBarcode}
          onCapture={handleCaptureComplete}
          onBack={() => setActiveScreen('scan')}
          offlineCount={queueSize}
        />
      )}

      {/* Full-Screen Submit / Saving overlay */}
      {activeScreen === 'submit' && (
        <div className="absolute inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          {submitStatus === 'processing' ? (
            <div className="space-y-6">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                <div className="absolute w-8 h-8 rounded-full bg-indigo-500/10"></div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Digitizing Item</h2>
                <p className="text-sm text-slate-400 mt-2 font-medium">{submitMessage}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-scale-up">
              <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-full animate-bounce">
                <CheckCircle2 className="w-16 h-16 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-white tracking-wide">Saved ✓</h2>
                <div className="text-6xl font-black text-indigo-400 font-mono tracking-wider pt-2">
                  #{sessionCount}
                </div>
                <p className="text-xs text-slate-500 font-medium">Session count</p>
              </div>
              <div className="pt-4 border-t border-slate-900 max-w-xs mx-auto">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  Platform: {platform.toUpperCase()}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  Code: {activeBarcode}
                </div>
                {isOfflineStashed && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-950/40 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-full">
                    <Database className="w-3.5 h-3.5" /> Stashed in Offline Queue
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Background Sync Progress Overlay */}
      {syncProgress && (
        <div className="absolute top-16 left-4 right-4 z-40 p-4 bg-indigo-950/90 border border-indigo-500/30 rounded-2xl shadow-xl flex items-center gap-4 text-white backdrop-blur-md animate-fade-in">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Auto Syncing Queue...
            </h4>
            <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
              Syncing item {syncProgress.syncedCount + 1} of {syncProgress.totalCount} ({queueSize} remaining)
            </p>
          </div>
          <div className="text-xs font-extrabold text-indigo-300 font-mono bg-indigo-900/40 px-2.5 py-1 rounded-lg">
            {Math.round(((syncProgress.syncedCount) / syncProgress.totalCount) * 100)}%
          </div>
        </div>
      )}

      {/* Mock Mode Watermark */}
      {isMockMode && activeScreen !== 'setup' && (
        <div className="absolute bottom-1 right-2 z-30 pointer-events-none text-[8px] font-black text-rose-500 bg-rose-950/50 border border-rose-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
          Mock Mode
        </div>
      )}
    </div>
  );
}
