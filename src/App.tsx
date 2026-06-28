import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { resizeImage } from './utils/image';
import { isMockMode } from './utils/sheets';
import { enqueueCapture, getQueueSize, syncOfflineQueue } from './utils/queue';
import { Loader2, Wifi } from 'lucide-react';
import type { ReviewData } from './components/AIReview';

const SessionSetup = lazy(() =>
  import('./components/SessionSetup').then((m) => ({ default: m.SessionSetup }))
);
const BarcodeScanner = lazy(() =>
  import('./components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);
const PhotoCapture = lazy(() =>
  import('./components/PhotoCapture').then((m) => ({ default: m.PhotoCapture }))
);
const AIReview = lazy(() =>
  import('./components/AIReview').then((m) => ({ default: m.AIReview }))
);

type Screen = 'setup' | 'scan' | 'capture' | 'review';

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
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [syncProgress, setSyncProgress] = useState<{
    syncedCount: number;
    totalCount: number;
    currentItem?: any;
  } | null>(null);

  // Quick Capture mode — skip AI Review, auto-queue with background AI
  const [quickMode, setQuickMode] = useState<boolean>(() =>
    localStorage.getItem('joubie_quick_mode') === 'true'
  );

  const toggleQuickMode = useCallback(() => {
    setQuickMode(prev => {
      const next = !prev;
      localStorage.setItem('joubie_quick_mode', next.toString());
      return next;
    });
  }, []);

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

  // Photo captured → compress → Quick Mode skips review, Standard Mode goes to AI Review
  const handleCaptureComplete = async (rawBlob: Blob) => {
    try {
      const compressed = await resizeImage(rawBlob, 1600, 0.8);

      if (quickMode) {
        // QUICK MODE: enqueue immediately, skip AI Review screen.
        // AI classification runs in background during sync (queue.ts).
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

        // Reset and return to scan immediately
        setActiveBarcode('');
        setActiveScreen('scan');
        triggerSync();
      } else {
        // STANDARD MODE: go to AI Review screen
        setCapturedBlob(compressed);
        setActiveScreen('review');
      }
    } catch (err) {
      console.error('[App] Capture processing failed:', err);
      alert('Failed to process photo. Please try again.');
      setActiveScreen('scan');
    }
  };

  // Review confirmed → save with AI details to queue → update counts → back to scan
  const handleReviewConfirm = async (data: ReviewData) => {
    try {
      // 1. Queue the item immediately (even when online) with the reviewed fields
      await enqueueCapture({
        platform,
        barcode: activeBarcode,
        imageBlob: data.imageBlob,
        photographer_id: photographerId,
        factory_location: factoryLocation,
        section: data.section,
        category: data.category,
        subCategory: data.subCategory,
        productType: data.productType,
        productName: data.productName,
        brand: data.brand,
        size: data.size,
        color: data.color,
        descriptionAr: data.descriptionAr,
        descriptionEn: data.descriptionEn,
        notes: data.notes,
        confidence: data.confidence
      });

      // 2. Update queue size and increment session tally
      const size = await getQueueSize();
      setQueueSize(size);
      
      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      localStorage.setItem('joubie_session_count', nextCount.toString());

      // 3. Return to scan screen
      setCapturedBlob(null);
      setActiveBarcode('');
      setActiveScreen('scan');

      // 4. Trigger background sync in parallel (non-blocking)
      triggerSync();
    } catch (err) {
      console.error('[App] Save confirmed details failed:', err);
      alert('Failed to save details. Please try again.');
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
            quickMode={quickMode}
            onToggleQuickMode={toggleQuickMode}
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

      {activeScreen === 'review' && capturedBlob && (
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
            <p className="text-xs font-semibold uppercase tracking-wider">Loading AI Review...</p>
          </div>
        }>
          <AIReview
            platform={platform}
            barcode={activeBarcode}
            photographerId={photographerId}
            imageBlob={capturedBlob}
            onConfirm={handleReviewConfirm}
            onRetake={() => {
              setCapturedBlob(null);
              setActiveScreen('capture');
            }}
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
