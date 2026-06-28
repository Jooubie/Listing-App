import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Barcode, AlertCircle, RefreshCw, Keyboard, Wifi, WifiOff, Zap, ZapOff, Package } from 'lucide-react';

interface BarcodeScannerProps {
  platform: string;
  photographerId: string;
  onDecode: (barcode: string) => void;
  onChangeSession: () => void;
  offlineCount: number;
  sessionCount: number;
  quickMode: boolean;
  onToggleQuickMode: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  platform,
  photographerId,
  onDecode,
  onChangeSession,
  offlineCount,
  sessionCount,
  quickMode,
  onToggleQuickMode
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const isStoppedRef = useRef(false);
  // Ref to latest onDecode — prevents camera restart when parent re-renders
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(() =>
    localStorage.getItem('joubie_selected_camera_id')
  );
  const [decodedValue, setDecodedValue] = useState<string | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSuccessFeedback = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch (e) {
      console.warn('Audio beep failed:', e);
    }
    if ('vibrate' in navigator) {
      try { navigator.vibrate(100); } catch (e) { /* ignore */ }
    }
  }, []);

  const stopScanner = useCallback(() => {
    isStoppedRef.current = true;
    if (controlsRef.current) {
      try {
        if (typeof controlsRef.current.stop === 'function') {
          controlsRef.current.stop();
        }
      } catch (e) { /* ignore */ }
      controlsRef.current = null;
    }
    // Also stop any lingering tracks on the video element
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    isStoppedRef.current = false;
    setErrorMsg(null);

    // Optimize ZXing decoder for mobile: limit formats + do NOT use TRY_HARDER
    // (TRY_HARDER is too slow per-frame on phones → missed detections in motion)
    const hints = new Map<DecodeHintType, any>();
    const formats = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE
    ];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

    const codeReader = new BrowserMultiFormatReader(hints);

    // Build constraints: use explicit deviceId when user picked one,
    // otherwise ask for the environment (rear) camera
    const videoConstraints: MediaTrackConstraints = selectedCameraId
      ? { deviceId: { exact: selectedCameraId } }
      : { facingMode: { ideal: 'environment' } };

    // Request a HIGH-RESOLUTION feed. This is the key fix for "camera shows but
    // won't decode": mobile browsers default to ~640x480, which is too coarse to
    // resolve the thin bars of an EAN-13/UPC barcode. Asking for 1080p gives ZXing
    // enough pixels to decode; the browser automatically caps to the device maximum.
    videoConstraints.width = { ideal: 1920 };
    videoConstraints.height = { ideal: 1080 };

    // Best-effort continuous autofocus (silently ignored where unsupported).
    // NOTE: 'autoFocus' is not a valid MediaTrackConstraint — only 'focusMode' is.
    (videoConstraints as any).advanced = [{ focusMode: 'continuous' }];

    codeReader
      .decodeFromConstraints({ video: videoConstraints }, videoRef.current, (result, err) => {
        if (isStoppedRef.current) return;

        if (result) {
          const text = result.getText();
          // Filter out short noise / false-positives and ensure format is valid (alphanumeric/dashes)
          if (!text || text.trim().length < 4 || !/^[A-Za-z0-9-]+$/.test(text)) {
            return;
          }
          triggerSuccessFeedback();
          setDecodedValue(text);
          isStoppedRef.current = true;
          setTimeout(() => onDecodeRef.current(text), 350);
        }
        // NotFoundException fires every frame while no barcode is in view — ignore it
        if (err && err.name !== 'NotFoundException') {
          console.debug('[Scanner] ZXing error:', err);
        }
      })
      .then((controls) => {
        if (isStoppedRef.current) {
          // Component unmounted before promise resolved
          if (controls && typeof controls.stop === 'function') controls.stop();
          return;
        }
        controlsRef.current = controls;

        // Re-apply continuous focus on the live track. Some Android devices ignore
        // focusMode in the initial getUserMedia but honor it via applyConstraints.
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks?.()[0];
        if (track && typeof track.applyConstraints === 'function') {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {
            /* device doesn't support manual focus control — ignore */
          });
        }

        // Enumerate cameras AFTER the stream is live so labels are populated
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setCameras(videoDevices);
        });
      })
      .catch((err: any) => {
        if (isStoppedRef.current) return;
        console.error('[Scanner] Failed to start:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMsg('Camera permission denied. Tap the camera icon in your browser address bar and allow access, then reload.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMsg('No camera found on this device.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setErrorMsg('Camera is in use by another app. Close it and reload.');
        } else {
          setErrorMsg(`Camera error: ${err.message || err.name}`);
        }
      });

    return () => {
      stopScanner();
    };
  }, [selectedCameraId, triggerSuccessFeedback, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      triggerSuccessFeedback();
      const code = manualBarcode.trim();
      setDecodedValue(code);
      setIsManualOpen(false);
      setManualBarcode('');
      setTimeout(() => onDecode(code), 500);
    }
  };

  const getPlatformLabel = (id: string) => {
    const map: Record<string, string> = {
      amazon: 'Amazon',
      noon: 'Noon',
      al_nasser: 'Al-Nasser',
      jumia: 'Jumia'
    };
    return map[id] || id;
  };

  return (
    <div className="relative flex flex-col justify-between w-full h-full bg-slate-950 text-white overflow-hidden">

      {/* Top Banner Status Bar */}
      <div className="z-10 w-full px-4 py-3 glass shrink-0 flex items-center justify-between" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Platform</span>
          <span className="text-sm font-extrabold text-white">{getPlatformLabel(platform)}</span>
        </div>

        {/* Session Tally — big visible counter for high-volume motivation */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanned</span>
          <span className="text-2xl font-black text-emerald-400 leading-none flex items-center gap-1">
            <Package className="w-4 h-4" />
            {sessionCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {isOnline ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2 py-0.5 border border-emerald-500/20 rounded-full">
                <Wifi className="w-3 h-3" /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-950/40 px-2 py-0.5 border border-rose-500/20 rounded-full">
                <WifiOff className="w-3 h-3" /> Offline
              </span>
            )}
            {offlineCount > 0 && (
              <span className="text-[11px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 border border-amber-500/20 rounded-full">
                {offlineCount} queued
              </span>
            )}
          </div>

          <button
            onClick={onChangeSession}
            className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>
      </div>

      {/* Main Viewfinder Section */}
      <div className="relative flex-1 flex items-center justify-center bg-slate-950">

        <video
          ref={videoRef}
          className="w-full h-full object-cover bg-slate-950"
          muted
          playsInline
          autoPlay
        />

        {/* Laser Overlay Guide */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="w-64 h-64 border-2 border-indigo-400/50 rounded-2xl relative flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.15)]">
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>
            <div className="w-full h-[2px] bg-red-500 shadow-[0_0_10px_#ef4444] absolute top-1/2 left-0 animate-bounce"></div>
          </div>
          <p className="mt-6 text-xs font-semibold text-indigo-300 tracking-wider bg-slate-950/75 px-4 py-1.5 rounded-full border border-indigo-500/20">
            Align barcode inside square
          </p>
        </div>

        {/* Decoded Value Flash */}
        {decodedValue && (
          <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center p-6 animate-fade-in">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-full mb-4 animate-scale-up">
              <Barcode className="w-12 h-12 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-400">Barcode Detected</h3>
            <span className="text-3xl font-extrabold text-white tracking-wider mt-2 font-mono break-all text-center">
              {decodedValue}
            </span>
          </div>
        )}

        {/* Error Overlay */}
        {errorMsg && !decodedValue && (
          <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Camera Error</h3>
            <p className="text-sm text-slate-400 max-w-xs mb-6">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Reload Page
            </button>
          </div>
        )}
      </div>

      {/* Bottom Controls Panel */}
      <div className="z-10 w-full px-4 pt-4 pb-3 glass shrink-0 flex flex-col gap-3 items-center" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        {cameras.length > 1 && (
          <div className="w-full flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 shrink-0">Camera:</span>
            <select
              value={selectedCameraId ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setSelectedCameraId(val);
                if (val) {
                  localStorage.setItem('joubie_selected_camera_id', val);
                } else {
                  localStorage.removeItem('joubie_selected_camera_id');
                }
              }}
              className="flex-1 bg-slate-900 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white font-medium"
            >
              {cameras.map((device, idx) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Mode Toggle — high-speed capture (skips AI Review) */}
        <button
          onClick={onToggleQuickMode}
          className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-md border ${
            quickMode
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-emerald-500/20'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/50'
          }`}
        >
          {quickMode ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          {quickMode ? 'Quick Capture ON' : 'Quick Capture OFF'}
        </button>

        <button
          onClick={() => setIsManualOpen(true)}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700/50 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-md"
        >
          <Keyboard className="w-5 h-5 text-indigo-400" />
          Type Barcode Manually
        </button>

        <div className="text-[11px] font-medium text-slate-500">
          Photographer: <span className="text-slate-300 font-semibold">{photographerId}</span>
        </div>
      </div>

      {/* Manual Entry Dialog */}
      {isManualOpen && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Manual Barcode Entry</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the numbers printed below the product's barcode lines.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <input
                type="text"
                required
                pattern="[a-zA-Z0-9-]+"
                title="Only alphanumeric characters and dashes allowed"
                placeholder="e.g. 6223001234567"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white text-lg tracking-wider font-mono text-center"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setIsManualOpen(false); setManualBarcode(''); }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors cursor-pointer text-sm"
                >
                  Submit Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
