import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, ArrowLeft, Wifi, WifiOff, AlertCircle, Upload, X, ImageOff } from 'lucide-react';

interface PhotoCaptureProps {
  platform: string;
  barcode: string;
  onCapture: (blob: Blob | null) => void;
  onBack: () => void;
  offlineCount: number;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  platform,
  barcode,
  onCapture,
  onBack,
  offlineCount
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);  // opens camera on mobile
  const galleryFileRef = useRef<HTMLInputElement>(null); // opens gallery on mobile

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cameraLoading, setCameraLoading] = useState(true);

  // Track online/offline status
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

  // Initialize camera stream
  const startCamera = async () => {
    setErrorMsg(null);
    setIsCameraActive(false);
    setCameraLoading(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

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
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e) {
        console.warn('[Capture] Failed constraints:', c, e);
      }
    }

    setCameraLoading(false);

    if (stream) {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
          setIsCameraActive(true);
        } catch (err) {
          console.error('[Capture] Play error:', err);
          setErrorMsg('Camera started but failed to display feed.');
        }
      }
    } else {
      setErrorMsg('Camera unavailable — use "Take Photo" or "Upload" below.');
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Handle file picked from input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      setIsCameraActive(false);
    }
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    // Reset input so same file can be reselected
    e.target.value = '';
  };

  // Snap from live video frame
  const handleShutter = () => {
    if (!videoRef.current || !isCameraActive) return;
    const video = videoRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      setIsCameraActive(false);
    }
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      }
    }, 'image/jpeg', 0.95);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  const handleUsePhoto = () => {
    if (capturedBlob) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onCapture(capturedBlob);
    }
  };

  // Skip photo — submit without image
  const handleSkipPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onCapture(null);
  };

  const getPlatformLabel = (id: string) => {
    const map: Record<string, string> = { amazon: 'Amazon', noon: 'Noon', al_nasser: 'Al-Nasser', jumia: 'Jumia' };
    return map[id] || id;
  };

  return (
    <div className="relative flex flex-col justify-between w-full h-full bg-slate-950 text-white overflow-hidden animate-fade-in">

      {/* Top Banner */}
      <div className="z-10 w-full px-4 py-3 glass shrink-0 flex items-center justify-between" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white cursor-pointer py-1 px-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-indigo-400" /> Scanner
        </button>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Barcode</span>
          <span className="text-sm font-mono font-extrabold text-indigo-300">{barcode}</span>
        </div>

        <div className="flex items-center gap-1">
          {isOnline ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 border border-emerald-500/20 rounded-full">
              <Wifi className="w-3 h-3" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 border border-rose-500/20 rounded-full">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
      </div>

      {/* Camera / Preview viewport */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">

        {/* Live Camera Feed */}
        {!previewUrl && (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}

        {/* Snapped Image Preview */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Product Preview"
            className="w-full h-full object-contain bg-slate-950"
          />
        )}

        {/* Loading spinner while camera boots */}
        {cameraLoading && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-10 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Starting Camera…</p>
          </div>
        )}

        {/* Camera error overlay — stays UNDERNEATH bottom panel */}
        {errorMsg && !previewUrl && (
          <div className="absolute inset-0 bg-slate-950/95 z-10 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <div>
              <h3 className="text-base font-bold text-white mb-1">Camera Unavailable</h3>
              <p className="text-xs text-slate-400">{errorMsg}</p>
            </div>
            <button
              onClick={startCamera}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl flex items-center gap-2 border border-slate-600 transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Retry Camera
            </button>
          </div>
        )}
      </div>

      {/* Bottom Panel */}
      <div className="z-10 w-full px-4 pt-4 pb-3 glass shrink-0 flex flex-col items-center gap-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>

        {/* ── CAPTURE MODE ── */}
        {!previewUrl && (
          <>
            {/* Big Shutter Button */}
            <div className="flex items-center justify-center gap-8 w-full py-1">
              {/* Spacer for symmetry */}
              <div className="w-12 h-12" />

              {/* Shutter */}
              <button
                id="shutter-btn"
                onClick={handleShutter}
                disabled={!isCameraActive}
                className={`w-20 h-20 rounded-full border-[5px] flex items-center justify-center transition-all duration-150 active:scale-90 ${
                  isCameraActive
                    ? 'border-white bg-white/10 hover:bg-white/20 shadow-2xl shadow-white/10 cursor-pointer'
                    : 'border-slate-700 bg-slate-800 cursor-not-allowed opacity-40'
                }`}
              >
                <div className={`w-14 h-14 rounded-full transition-all ${isCameraActive ? 'bg-white' : 'bg-slate-600'}`} />
              </button>

              {/* Upload from gallery */}
              <button
                id="upload-gallery-btn"
                type="button"
                onClick={() => galleryFileRef.current?.click()}
                className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center justify-center cursor-pointer transition-colors shadow-md"
                title="Upload from gallery"
              >
                <Upload className="w-5 h-5 text-indigo-400" />
              </button>
            </div>

            {/* Take Photo button (triggers native camera on mobile as fallback) */}
            <button
              id="take-photo-native-btn"
              type="button"
              onClick={() => cameraFileRef.current?.click()}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm"
            >
              <Camera className="w-4 h-4 text-indigo-400" />
              Take Photo (Native Camera)
            </button>

            {/* Skip Photo */}
            <button
              id="skip-photo-btn"
              type="button"
              onClick={handleSkipPhoto}
              className="w-full py-2.5 text-slate-500 hover:text-slate-300 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs uppercase tracking-wider"
            >
              <ImageOff className="w-3.5 h-3.5" />
              Skip Photo — Submit Without Image
            </button>

            {/* Hidden file inputs */}
            <input
              ref={cameraFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={galleryFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}

        {/* ── PREVIEW MODE ── */}
        {previewUrl && (
          <div className="w-full flex flex-col gap-3 animate-scale-up">
            <div className="flex gap-3">
              <button
                id="retake-btn"
                onClick={handleRetake}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm"
              >
                <RefreshCw className="w-4 h-4 text-indigo-400" /> Retake
              </button>
              <button
                id="use-photo-btn"
                onClick={handleUsePhoto}
                className="flex-2 flex-grow py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-lg shadow-indigo-500/20"
              >
                <Check className="w-5 h-5 text-emerald-300" /> Use Photo
              </button>
            </div>
            <button
              id="skip-preview-btn"
              type="button"
              onClick={handleSkipPhoto}
              className="w-full py-2.5 text-slate-500 hover:text-slate-300 font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs uppercase tracking-wider"
            >
              <X className="w-3.5 h-3.5" /> Discard &amp; Submit Without Image
            </button>
          </div>
        )}

        {/* Status row */}
        <div className="text-[11px] font-medium text-slate-500 flex items-center gap-4">
          <span>Platform: <span className="text-slate-300 font-semibold">{getPlatformLabel(platform)}</span></span>
          <span className="w-1 h-1 bg-slate-700 rounded-full" />
          <span>Queued: <span className="text-slate-300 font-semibold">{offlineCount}</span></span>
        </div>
      </div>
    </div>
  );
};
