import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { AlertCircle, RefreshCw, Keyboard, Wifi, WifiOff, X, CheckCircle2 } from 'lucide-react';

interface BarcodeScannerProps {
  platform: string;
  photographerId: string;
  onDecode: (barcode: string) => void;
  onChangeSession: () => void;
  offlineCount: number;
  sessionCount: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  amazon: 'Amazon', noon: 'Noon', al_nasser: 'Al-Nasser', jumia: 'Jumia'
};

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  platform,
  photographerId,
  onDecode,
  onChangeSession,
  offlineCount,
  sessionCount
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<any>(null);
  const isStoppedRef = useRef(false);
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
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const triggerSuccessFeedback = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
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
    } catch { /* ignore */ }
    try { if ('vibrate' in navigator) navigator.vibrate(100); } catch { /* ignore */ }
  }, []);

  const stopScanner = useCallback(() => {
    isStoppedRef.current = true;
    if (controlsRef.current) {
      try { if (typeof controlsRef.current.stop === 'function') controlsRef.current.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    isStoppedRef.current = false;
    setErrorMsg(null);

    const hints = new Map<DecodeHintType, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE
    ]);

    const codeReader = new BrowserMultiFormatReader(hints);
    const vc: MediaTrackConstraints = selectedCameraId
      ? { deviceId: { exact: selectedCameraId } }
      : { facingMode: { ideal: 'environment' } };
    vc.width = { ideal: 1920 };
    vc.height = { ideal: 1080 };
    (vc as any).advanced = [{ focusMode: 'continuous' }];

    codeReader
      .decodeFromConstraints({ video: vc }, videoRef.current, (result, err) => {
        if (isStoppedRef.current) return;
        if (result) {
          const text = result.getText();
          if (!text || text.trim().length < 4 || !/^[A-Za-z0-9\-]+$/.test(text)) return;
          triggerSuccessFeedback();
          setDecodedValue(text);
          isStoppedRef.current = true;
          setTimeout(() => onDecodeRef.current(text), 350);
        }
        if (err && err.name !== 'NotFoundException') console.debug('[Scanner]', err);
      })
      .then((controls) => {
        if (isStoppedRef.current) { controls?.stop?.(); return; }
        controlsRef.current = controls;
        const track = (videoRef.current?.srcObject as MediaStream)?.getVideoTracks?.()[0];
        track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
        navigator.mediaDevices.enumerateDevices().then(devices => {
          setCameras(devices.filter(d => d.kind === 'videoinput'));
        });
      })
      .catch((err: any) => {
        if (isStoppedRef.current) return;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMsg('Camera permission denied. Allow camera access in your browser settings, then reload.');
        } else if (err.name === 'NotFoundError') {
          setErrorMsg('No camera found on this device.');
        } else if (err.name === 'NotReadableError') {
          setErrorMsg('Camera is in use by another app. Close it and reload.');
        } else {
          setErrorMsg(`Camera error: ${err.message || err.name}`);
        }
      });

    return () => stopScanner();
  }, [selectedCameraId, triggerSuccessFeedback, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualBarcode.trim();
    if (code) {
      triggerSuccessFeedback();
      setDecodedValue(code);
      setIsManualOpen(false);
      setManualBarcode('');
      setTimeout(() => onDecode(code), 400);
    }
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-black text-white overflow-hidden">

      {/* ── Top Status Bar ── */}
      <div
        className="z-10 w-full px-4 py-3 shrink-0 flex items-center justify-between bg-slate-950/90 border-b border-slate-800"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top))' }}
      >
        {/* Platform + photographer */}
        <div className="flex flex-col">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Platform</span>
          <span className="text-sm font-extrabold text-white leading-tight">{PLATFORM_LABELS[platform] || platform}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{photographerId}</span>
        </div>

        {/* Session counter — motivational big number */}
        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Scanned</span>
          <span className="text-3xl font-black text-emerald-400 leading-none">{sessionCount}</span>
          {offlineCount > 0 && (
            <span className="text-[9px] font-bold text-amber-400 mt-0.5">{offlineCount} queued</span>
          )}
        </div>

        {/* Right: status + change */}
        <div className="flex flex-col items-end gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isOnline
              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20'
              : 'text-rose-400 bg-rose-950/40 border-rose-500/20'
          }`}>
            {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <button
            id="change-session-btn"
            onClick={onChangeSession}
            className="px-3 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>
      </div>

      {/* ── Viewfinder (fills all remaining space) ── */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />

        {/* Scanning frame overlay */}
        {!decodedValue && !errorMsg && (
          <div className="relative z-10 flex flex-col items-center pointer-events-none">
            {/* Corner-bracket frame */}
            <div className="relative w-64 h-52">
              {/* Corners */}
              <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
              {/* Laser line */}
              <div className="absolute w-full h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] top-1/2 animate-bounce" />
            </div>
            <p className="mt-5 text-xs font-semibold text-white/70 bg-black/50 px-4 py-1.5 rounded-full tracking-wide">
              Align barcode in frame
            </p>
          </div>
        )}

        {/* Success flash */}
        {decodedValue && (
          <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center p-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-3" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Detected</span>
            <span className="text-2xl font-black text-white font-mono tracking-wider text-center break-all px-4">
              {decodedValue}
            </span>
          </div>
        )}

        {/* Camera error */}
        {errorMsg && !decodedValue && (
          <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-12 h-12 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white mb-1">Camera Error</h3>
              <p className="text-xs text-slate-400 max-w-xs">{errorMsg}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Panel ── */}
      <div
        className="z-10 w-full px-4 pt-3 pb-3 shrink-0 flex flex-col gap-2 bg-slate-950/95 border-t border-slate-800"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        {/* Camera selector (only when multiple cameras) */}
        {cameras.length > 1 && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Camera:</span>
            <select
              value={selectedCameraId ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setSelectedCameraId(val);
                if (val) localStorage.setItem('joubie_selected_camera_id', val);
                else localStorage.removeItem('joubie_selected_camera_id');
              }}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {cameras.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          </div>
        )}

        {/* Manual entry CTA */}
        <button
          id="manual-entry-btn"
          onClick={() => setIsManualOpen(true)}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white border-0 rounded-2xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-base shadow-lg shadow-indigo-500/20"
        >
          <Keyboard className="w-5 h-5" />
          Type Barcode Manually
        </button>
      </div>

      {/* ── Manual Entry Bottom Sheet ── */}
      {isManualOpen && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end" onClick={() => setIsManualOpen(false)}>
          <div
            className="w-full bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-white">Enter Barcode</h3>
                <p className="text-xs text-slate-400 mt-0.5">Type the numbers under the barcode lines</p>
              </div>
              <button
                onClick={() => { setIsManualOpen(false); setManualBarcode(''); }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <input
                id="manual-barcode-input"
                type="text"
                required
                inputMode="numeric"
                placeholder="e.g. 6223001234567"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                autoFocus
                className="w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white text-2xl tracking-widest font-mono text-center placeholder-slate-700 placeholder:text-base placeholder:tracking-normal"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setIsManualOpen(false); setManualBarcode(''); }}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  id="manual-submit-btn"
                  type="submit"
                  className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm"
                >
                  Confirm Barcode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
