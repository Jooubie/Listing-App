import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Barcode, AlertCircle, RefreshCw, Keyboard, Wifi, WifiOff } from 'lucide-react';

interface BarcodeScannerProps {
  platform: string;
  photographerId: string;
  onDecode: (barcode: string) => void;
  onChangeSession: () => void;
  offlineCount: number;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  platform,
  photographerId,
  onDecode,
  onChangeSession,
  offlineCount
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [decodedValue, setDecodedValue] = useState<string | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
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

  // Haptic and Audio success alerts
  const triggerSuccessFeedback = () => {
    // 1. Play offline Audio Synth Beep
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, ctx.currentTime); // 950Hz
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch (e) {
      console.warn('Web Audio beep failed:', e);
    }

    // 2. Play physical vibration pulse (100ms)
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch (e) {
        console.warn('Haptic vibration failed:', e);
      }
    }
  };

  // Enumerate cameras
  useEffect(() => {
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((devices) => {
        // Filter out devices without labels if possible, but keep all
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          // Look for back camera on mobile by default
          const backCam = videoDevices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.deviceId : videoDevices[0].deviceId);
        }
      })
      .catch((err) => {
        console.error('List video devices error:', err);
        setErrorMsg('Could not access camera list. Check permissions.');
      });
  }, []);

  // Initialize Barcode Reader
  useEffect(() => {
    if (!videoRef.current || !selectedCameraId) return;

    const codeReader = new BrowserMultiFormatReader();
    let isStopped = false;
    let controlsPromise: any = null;

    console.log(`[Scanner] Initializing camera device: ${selectedCameraId}`);
    
    controlsPromise = codeReader.decodeFromVideoDevice(
      selectedCameraId,
      videoRef.current,
      (result, err) => {
        if (isStopped) return;
        if (result) {
          const text = result.getText();
          console.log('[Scanner] Barcode decoded:', text);
          
          triggerSuccessFeedback();
          setDecodedValue(text);
          isStopped = true;

          // Brief delay showing the code, then advance to capture screen
          setTimeout(() => {
            onDecode(text);
          }, 800);
        }
        if (err && !(err.name === 'NotFoundException')) {
          // Errors like NotFoundException are thrown continuously while scanning, which is normal
          console.debug('[Scanner] ZXing internal scan details:', err);
        }
      }
    );

    return () => {
      isStopped = true;
      if (controlsPromise) {
        controlsPromise.then((controls: any) => {
          if (controls && typeof controls.stop === 'function') {
            controls.stop();
            console.log('[Scanner] Camera stream stopped.');
          }
        }).catch((err: any) => {
          console.error('[Scanner] Failed to stop stream cleanly:', err);
        });
      }
    };
  }, [selectedCameraId, onDecode]);

  // Form submit for manual barcode entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      triggerSuccessFeedback();
      const code = manualBarcode.trim();
      setDecodedValue(code);
      setIsManualOpen(false);
      setManualBarcode('');
      setTimeout(() => {
        onDecode(code);
      }, 500);
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
      <div className="z-10 w-full px-4 py-3 glass flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Platform</span>
          <span className="text-sm font-extrabold text-white">{getPlatformLabel(platform)}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network Indicator */}
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

            {/* Offline Cache Indicator */}
            {offlineCount > 0 && (
              <span className="text-[11px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 border border-amber-500/20 rounded-full">
                {offlineCount} queued
              </span>
            )}
          </div>

          {/* Change session button */}
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
        
        {/* Camera Video Feed */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />

        {/* Laser Overlay Guide (animated scan line) */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="w-64 h-64 border-2 border-indigo-400/50 rounded-2xl relative flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.15)]">
            {/* Corners */}
            <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
            <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>
            
            {/* Red Scan Line */}
            <div className="w-full h-[2px] bg-red-500 shadow-[0_0_10px_#ef4444] absolute top-1/2 left-0 animate-bounce"></div>
          </div>
          <p className="mt-6 text-xs font-semibold text-indigo-300 tracking-wider bg-slate-950/75 px-4 py-1.5 rounded-full border border-indigo-500/20">
            Align barcode inside square
          </p>
        </div>

        {/* Decoded Value Flash Alert */}
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

        {/* Error overlay */}
        {errorMsg && !decodedValue && (
          <div className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Camera Access Error</h3>
            <p className="text-sm text-slate-400 max-w-xs mb-6">
              {errorMsg}
            </p>
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
      <div className="z-10 w-full px-6 py-6 glass flex flex-col gap-4 items-center">
        {/* Camera Selector dropdown if multiple cameras exist */}
        {cameras.length > 1 && (
          <div className="w-full flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 shrink-0">Camera:</span>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
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

        {/* Keyboard Input fallback trigger */}
        <button
          onClick={() => setIsManualOpen(true)}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700/50 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer text-sm shadow-md"
        >
          <Keyboard className="w-5 h-5 text-indigo-400" />
          Type Barcode Manually
        </button>

        {/* Photographer metadata label */}
        <div className="text-[11px] font-medium text-slate-500">
          Photographer: <span className="text-slate-300 font-semibold">{photographerId}</span>
        </div>
      </div>

      {/* Manual Entry Fallback Dialog Modal */}
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
                title="Only alphanumeric characters, dashes and numbers allowed"
                placeholder="e.g. 6223001234567"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white text-lg tracking-wider font-mono text-center"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsManualOpen(false);
                    setManualBarcode('');
                  }}
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
