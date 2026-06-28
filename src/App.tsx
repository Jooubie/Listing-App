import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { resizeImage } from './utils/image';
import { isMockMode } from './utils/sheets';
import { enqueueCapture, getQueueSize, syncOfflineQueue } from './utils/queue';
import { Loader2, Wifi } from 'lucide-react';

const SessionSetup = lazy(() =>
  import('./components/SessionSetup').then((m) => ({ default: m.SessionSetup }))
);
const BarcodeScanner = lazy(() =>
  import('./components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);
const PhotoCapture = lazy(() =>
  import('./components/PhotoCapture').then((m) => ({ default: m.PhotoCapture }))
);

// NOTE: there is intentionally NO review/confirm screen. The photographer just
// scans → captures → the item auto-queues, and AI classifies it in the
// background during sync (see queue.ts). The owner revises in the Google Sheet.
type Screen = 'setup' | 'scan' | 'capture';

export default function App() {
  const [photographerId, setPhotographerId] = useState<string>(() =>
    localStorage.getItem('joubie_photographer_id') || ''
  );
  const [platform, setPlatform] = useState<string>(() =>
    localStorage.getItem('joubie_platform') || ''
  );
  const [factoryLocation, setFactoryLocation] = useState<string>(() =>
    localStorage.getItem('joubie_factory_location') || ''
  );
  const [sessionCount, setSessionCount] = useState<number>(() => {
    const saved = localStorage.getItem('joubie_session_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [activeScreen, setActiveScreen] = useState<Screen>(() =>
    (localStorage.getItem('joubie_active_screen') as Screen) || 'setup'
  );
  const [activeBarcode, setActiveBarcode] = useState<string>(() =>
    localStorage.getItem('joubie_active_barcode') || ''
  );
  const [queueSize, setQueueSize] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{
    syncedCount: number;
    totalCount: number;
    currentItem?: any;
  } | null>(null);

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

  useEffect(() => {
    getQueueSize().then(setQueueSize);

    const handleOnline = () => triggerSync();
    window.addEventListener('online', handleOnline);

    if (navigator.onLine) triggerSync();

    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const triggerSync = async () => {
    const size = await getQueueSize();
    setQueueSize(size);
    if (size === 0) return;

    try {
      await syncOfflineQueue((progress) => {
        setSyncProgress(progress);
        getQueueSize().then(setQueueSize);
      });
    } catch {
      console.warn('[App] Offline sync paused due to connectivity.');
    } finally {
      setSyncProgress(null);
      getQueueSize().then(setQueueSize);
    }
  };

  const handleSessionComplete = (id: string, plat: string, factory: string) => {
    setPhotographerId(id);
    setPlatform(plat);
    setFactoryLocation(factory);
    localStorage.setItem('joubie_photographer_id', id);
    localStorage.setItem('joubie_platform', plat);
    localStorage.setItem('joubie_factory_location', factory);
    setActiveScreen('scan');
  };

  const handleBarcodeDecoded = useCallback((barcode: string) => {
    setActiveBarcode(barcode);
    setActiveScreen('capture');
  }, []);

  // Photo captured → compress → auto-queue → straight back to scanning.
  // No review/confirm: the AI classifies the item in the background during the
  // queue sync (queue.ts runs Gemini when the row has no category yet).
  const handleCaptureComplete = async (rawBlob: Blob) => {
    try {
      const compressed = await resizeImage(rawBlob, 1600, 0.8);

      await enqueueCapture({
        platform,
        barcode: activeBarcode,
        imageBlob: compressed,
        photographer_id: photographerId,
        factory_location: factoryLocation,
      });

      const size = await getQueueSize();
      setQueueSize(size);

      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      localStorage.setItem('joubie_session_count', nextCount.toString());

      // Reset and return to scanning immediately — keep the loop fast
      setActiveBarcode('');
      setActiveScreen('scan');
      triggerSync();
    } catch (err) {
      console.error('[App] Capture processing failed:', err);
      alert('Failed to save capture. Please try again.');
      setActiveScreen('scan');
    }
  };

  const handleResetSession = () => {
    if (confirm('Change platform or photographer? This resets your session.')) {
      setActiveScreen('setup');
      localStorage.removeItem('joubie_active_screen');
    }
  };

  return (
    <div className="relative w-full h-dvh max-w-md mx-auto bg-slate-950 flex flex-col shadow-2xl">

      {activeScreen === 'setup' && (
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
            <p className="text-xs font-semibold uppercase tracking-wider">Loading Setup...</p>
          </div>
        }>
          <SessionSetup
            onComplete={handleSessionComplete}
            initialPhotographerId={photographerId}
            initialPlatform={platform}
            initialFactoryLocation={factoryLocation}
          />
        </Suspense>
      )}

      {activeScreen === 'scan' && (
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
            <p className="text-xs font-semibold uppercase tracking-wider">Loading Scanner...</p>
          </div>
        }>
          <BarcodeScanner
            platform={platform}
            photographerId={photographerId}
            onDecode={handleBarcodeDecoded}
            onChangeSession={handleResetSession}
            offlineCount={queueSize}
            sessionCount={sessionCount}
          />
        </Suspense>
      )}

      {activeScreen === 'capture' && (
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
            <p className="text-xs font-semibold uppercase tracking-wider">Loading Camera...</p>
          </div>
        }>
          <PhotoCapture
            platform={platform}
            barcode={activeBarcode}
            onCapture={handleCaptureComplete}
            onBack={() => setActiveScreen('scan')}
            offlineCount={queueSize}
          />
        </Suspense>
      )}

      {/* Background Sync Overlay */}
      {syncProgress && (
        <div className="absolute top-16 left-4 right-4 z-40 p-4 bg-indigo-950/90 border border-indigo-500/30 rounded-2xl shadow-xl flex items-center gap-4 text-white backdrop-blur-md animate-fade-in">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Syncing Queue...
            </h4>
            <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
              Item {syncProgress.syncedCount + 1} of {syncProgress.totalCount} ({queueSize} remaining)
            </p>
          </div>
          <div className="text-xs font-extrabold text-indigo-300 font-mono bg-indigo-900/40 px-2.5 py-1 rounded-lg">
            {Math.round((syncProgress.syncedCount / syncProgress.totalCount) * 100)}%
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
