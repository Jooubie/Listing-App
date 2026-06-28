import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, ArrowLeft, Wifi, WifiOff, Upload, ImageOff, X } from 'lucide-react';

interface PhotoCaptureProps {
  platform: string;
  barcode: string;
  onCapture: (blob: Blob | null) => void;
  onBack: () => void;
  offlineCount: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  amazon: 'Amazon', noon: 'Noon', al_nasser: 'Al-Nasser', jumia: 'Jumia'
};

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  platform, barcode, onCapture, onBack, offlineCount
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const startCamera = async () => {
    setErrorMsg(null);
    setIsCameraActive(false);
    setCameraLoading(true);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    const savedId = localStorage.getItem('joubie_selected_camera_id');
    const attempts: MediaStreamConstraints[] = [];
    if (savedId) {
      attempts.push({ video: { deviceId: { exact: savedId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      attempts.push({ video: { deviceId: { exact: savedId } }, audio: false });
    }
    attempts.push(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    );

    let stream: MediaStream | null = null;
    for (const c of attempts) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch { /* try next */ }
    }

    setCameraLoading(false);
    if (stream) {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); setIsCameraActive(true); }
        catch { setErrorMsg('Camera started but failed to display. Use buttons below.'); }
      }
    } else {
      setErrorMsg('Camera unavailable — use the buttons below.');
    }
  };

  useEffect(() => {
    startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); setIsCameraActive(false); }
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleShutter = () => {
    if (!videoRef.current || !isCameraActive) return;
    const v = videoRef.current;
    const w = v.videoWidth || 640, h = v.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(v, 0, 0, w, h);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); setIsCameraActive(false); }
    canvas.toBlob(blob => {
      if (blob) { setCapturedBlob(blob); setPreviewUrl(URL.createObjectURL(blob)); }
    }, 'image/jpeg', 0.95);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  const handleUsePhoto = () => {
    if (capturedBlob) { if (previewUrl) URL.revokeObjectURL(previewUrl); onCapture(capturedBlob); }
  };

  const handleSkip = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onCapture(null);
  };

  return (
    <div className="relative flex flex-col w-full h-full bg-black text-white overflow-hidden">

      {/* ── Top Bar ── */}
      <div
        className="z-10 w-full px-4 py-3 shrink-0 flex items-center justify-between bg-slate-950/90 border-b border-slate-800"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top))' }}
      >
        <button
          id="back-to-scanner-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white cursor-pointer py-1.5 px-2.5 hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-indigo-400" /> Scanner
        </button>

        <div className="flex flex-col items-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Barcode</span>
          <span className="text-sm font-black text-indigo-300 font-mono">{barcode}</span>
        </div>

        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isOnline ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20' : 'text-rose-400 bg-rose-950/40 border-rose-500/20'
        }`}>
          {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* ── Viewport ── */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Live video */}
        {!previewUrl && (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        )}

        {/* Preview image */}
        {previewUrl && (
          <img src={previewUrl} alt="Captured product" className="absolute inset-0 w-full h-full object-contain bg-slate-950" />
        )}

        {/* Loading spinner — small, centered, doesn't block buttons */}
        {cameraLoading && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Starting Camera…</p>
          </div>
        )}

        {/* Camera error — small banner inside viewport */}
        {errorMsg && !previewUrl && !cameraLoading && (
          <div className="absolute top-3 left-3 right-3 z-10 bg-amber-950/80 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-400 text-sm">⚠️</span>
            <p className="text-xs text-amber-200 flex-1">{errorMsg}</p>
            <button onClick={startCamera} className="text-amber-300 hover:text-white cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Controls ── */}
      <div
        className="z-10 w-full px-4 pt-4 shrink-0 flex flex-col gap-3 bg-slate-950/95 border-t border-slate-800"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        {/* ── CAPTURE STATE ── */}
        {!previewUrl && (
          <>
            {/* Shutter row: gallery | BIG SHUTTER | native camera */}
            <div className="flex items-center justify-between gap-4">
              {/* Upload from gallery */}
              <button
                id="upload-gallery-btn"
                onClick={() => galleryFileRef.current?.click()}
                className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Upload className="w-5 h-5 text-indigo-400" />
                <span className="text-[9px] text-slate-400 font-bold">Gallery</span>
              </button>

              {/* Shutter */}
              <button
                id="shutter-btn"
                onClick={handleShutter}
                disabled={!isCameraActive}
                className={`w-20 h-20 rounded-full border-[5px] flex items-center justify-center transition-all duration-150 active:scale-90 shrink-0 ${
                  isCameraActive
                    ? 'border-white bg-white/10 hover:bg-white/20 shadow-2xl cursor-pointer'
                    : 'border-slate-700 bg-slate-800 cursor-not-allowed opacity-50'
                }`}
              >
                <div className={`w-14 h-14 rounded-full ${isCameraActive ? 'bg-white' : 'bg-slate-600'}`} />
              </button>

              {/* Native camera (most reliable on mobile) */}
              <button
                id="native-camera-btn"
                onClick={() => cameraFileRef.current?.click()}
                className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Camera className="w-5 h-5 text-indigo-400" />
                <span className="text-[9px] text-slate-400 font-bold">Camera</span>
              </button>
            </div>

            {/* Skip */}
            <button
              id="skip-photo-btn"
              onClick={handleSkip}
              className="w-full py-3 text-slate-500 hover:text-slate-300 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs uppercase tracking-wider border border-slate-800 rounded-2xl hover:border-slate-700"
            >
              <ImageOff className="w-3.5 h-3.5" />
              Skip Photo — Submit Without Image
            </button>

            {/* Status */}
            <div className="text-[10px] font-medium text-slate-600 flex items-center justify-center gap-3">
              <span>{PLATFORM_LABELS[platform] || platform}</span>
              <span className="w-1 h-1 bg-slate-700 rounded-full" />
              <span>{offlineCount} queued</span>
            </div>

            {/* Hidden inputs */}
            <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            <input ref={galleryFileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </>
        )}

        {/* ── PREVIEW STATE ── */}
        {previewUrl && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                id="retake-btn"
                onClick={handleRetake}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-indigo-400" /> Retake
              </button>
              <button
                id="use-photo-btn"
                onClick={handleUsePhoto}
                className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer text-base shadow-lg shadow-emerald-500/20 transition-colors"
              >
                <Check className="w-5 h-5" /> Use Photo
              </button>
            </div>
            <button
              id="discard-btn"
              onClick={handleSkip}
              className="w-full py-2.5 text-slate-600 hover:text-slate-400 font-semibold flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Discard &amp; Submit Without Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
