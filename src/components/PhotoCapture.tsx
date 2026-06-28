import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, ArrowLeft, Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface PhotoCaptureProps {
  platform: string;
  barcode: string;
  onCapture: (blob: Blob) => void;
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
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Try back camera first, fall back to any video device
    const constraintsList = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];

    let stream: MediaStream | null = null;
    for (const constraints of constraintsList) {
      try {
        console.log('[Capture] Trying camera constraints:', constraints);
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break; // Successfully got stream
      } catch (e) {
        console.warn('[Capture] Failed constraints configuration:', constraints, e);
      }
    }

    if (stream) {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Make sure play works (safari/ios requires playsInline + muted)
        try {
          await videoRef.current.play();
          setIsCameraActive(true);
        } catch (playErr) {
          console.error('[Capture] Video play error:', playErr);
          setErrorMsg('Failed to start camera viewport stream.');
        }
      }
    } else {
      setErrorMsg('Camera access denied or device has no camera.');
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Snap photo from the current video frame
  const handleShutter = () => {
    if (!videoRef.current || !streamRef.current || !isCameraActive) return;

    const video = videoRef.current;
    
    // Create canvas matching actual video source aspect ratio
    const width = video.videoWidth || video.width || 640;
    const height = video.videoHeight || video.height || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, width, height);

    // Stop camera track immediately to save battery & release lock
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }

    // Capture canvas as Blob
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    }, 'image/jpeg', 0.95); // High quality for raw snap, resized later
  };

  // Reset and restart camera
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  // Accept and submit photo
  const handleUsePhoto = () => {
    if (capturedBlob) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      onCapture(capturedBlob);
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
    <div className="relative flex flex-col justify-between w-full h-full bg-slate-950 text-white overflow-hidden animate-fade-in">
      
      {/* Top Banner Status Bar */}
      <div className="z-10 w-full px-4 py-3 glass flex items-center justify-between">
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

        {/* Sync Status Badge */}
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

      {/* Viewport Box */}
      <div className="relative flex-1 flex items-center justify-center bg-slate-950">
        
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
            alt="Product Snap Preview"
            className="w-full h-full object-contain bg-slate-950"
          />
        )}

        {/* Viewfinder crosshairs (Only during active camera) */}
        {!previewUrl && isCameraActive && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-72 h-72 border border-white/20 rounded-xl relative">
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/10"></div>
              <div className="absolute left-1/2 top-0 w-[1px] h-full bg-white/10"></div>
              {/* Corner hints */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/45"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/45"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white/45"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/45"></div>
            </div>
            <p className="absolute bottom-6 text-xs text-slate-400 font-semibold bg-slate-950/75 px-4 py-1.5 rounded-full">
              Position product in center
            </p>
          </div>
        )}

        {/* Camera Load / Error Overlays */}
        {errorMsg && (
          <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Camera Feed Failed</h3>
            <p className="text-sm text-slate-400 mb-6">{errorMsg}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Retry Camera
            </button>
          </div>
        )}
      </div>

      {/* Bottom Panel Actions */}
      <div className="z-10 w-full px-6 py-6 glass flex flex-col items-center gap-4">
        
        {/* Shutter Button (Capture state) */}
        {!previewUrl && (
          <div className="w-full flex justify-center py-2">
            <button
              onClick={handleShutter}
              disabled={!isCameraActive}
              className={`w-20 h-20 rounded-full border-4 border-white/80 flex items-center justify-center cursor-pointer transition-all duration-200 ${
                isCameraActive 
                  ? 'bg-red-500 hover:bg-red-600 active:scale-95 shadow-lg shadow-red-500/20 shutter-btn-active' 
                  : 'bg-slate-800 border-slate-700 cursor-not-allowed'
              }`}
            >
              <Camera className="w-8 h-8 text-white" />
            </button>
          </div>
        )}

        {/* Action buttons (Preview state) */}
        {previewUrl && (
          <div className="w-full flex gap-4 animate-scale-up">
            <button
              onClick={handleRetake}
              className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-md"
            >
              <RefreshCw className="w-4 h-4 text-indigo-400" />
              Retake Photo
            </button>
            <button
              onClick={handleUsePhoto}
              className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-lg shadow-indigo-500/20"
            >
              <Check className="w-5 h-5 text-emerald-400" />
              Use Photo
            </button>
          </div>
        )}

        {/* photographer status helper */}
        <div className="text-[11px] font-medium text-slate-500 flex items-center gap-4">
          <span>Platform: <span className="text-slate-300 font-semibold">{getPlatformLabel(platform)}</span></span>
          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
          <span>Queued: <span className="text-slate-300 font-semibold">{offlineCount}</span></span>
        </div>
      </div>
    </div>
  );
};
