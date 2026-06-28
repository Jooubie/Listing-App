import React, { useState } from 'react';
import { Camera, User, Globe } from 'lucide-react';

interface SessionSetupProps {
  onComplete: (photographerId: string, platform: string) => void;
  initialPhotographerId?: string;
  initialPlatform?: string;
}

const PLATFORMS = [
  { id: 'amazon', name: 'Amazon', color: 'border-amber-500/30 text-amber-400 bg-amber-950/20 hover:bg-amber-500/20 active:bg-amber-500/30' },
  { id: 'noon', name: 'Noon', color: 'border-yellow-500/30 text-yellow-400 bg-yellow-950/20 hover:bg-yellow-500/20 active:bg-yellow-500/30' },
  { id: 'al_nasser', name: 'Al-Nasser', color: 'border-red-500/30 text-red-400 bg-red-950/20 hover:bg-red-500/20 active:bg-red-500/30' },
  { id: 'jumia', name: 'Jumia', color: 'border-orange-500/30 text-orange-400 bg-orange-950/20 hover:bg-orange-500/20 active:bg-orange-500/30' }
];

export const SessionSetup: React.FC<SessionSetupProps> = ({
  onComplete,
  initialPhotographerId = '',
  initialPlatform = ''
}) => {
  const [photographerId, setPhotographerId] = useState(initialPhotographerId);
  const [platform, setPlatform] = useState(initialPlatform);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (photographerId.trim() && platform) {
      onComplete(photographerId.trim(), platform);
    }
  };

  const isFormValid = photographerId.trim() && platform;

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full p-6 bg-slate-950 text-slate-100">
      {/* Brand Header */}
      <div className="flex flex-col items-center mb-10 text-center">
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl mb-4 shadow-lg shadow-indigo-500/10">
          <Camera className="w-10 h-10 text-indigo-400" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Joub Capture
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-xs">
          High-speed product digitizer for warehouse logistics
        </p>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="w-full max-w-md p-6 rounded-3xl glass shadow-2xl">
        <div className="space-y-6">
          {/* Photographer ID input */}
          <div className="space-y-2">
            <label htmlFor="photographer-id" className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <User className="w-4 h-4 text-indigo-400" />
              Photographer Name / ID
            </label>
            <input
              id="photographer-id"
              type="text"
              required
              placeholder="e.g. Amr Diab, Photo Station 2"
              value={photographerId}
              onChange={(e) => setPhotographerId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500 transition-all font-medium"
            />
          </div>

          {/* Platform selection list */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Globe className="w-4 h-4 text-indigo-400" />
              Select Active Platform
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((plat) => (
                <button
                  key={plat.id}
                  type="button"
                  onClick={() => setPlatform(plat.id)}
                  className={`flex flex-col items-center justify-center p-4 border rounded-2xl font-bold transition-all duration-200 cursor-pointer ${
                    platform === plat.id
                      ? `${plat.color.split(' ')[0]} ${plat.color.split(' ')[1]} ring-2 ring-indigo-500 shadow-lg scale-102`
                      : 'border-slate-800 text-slate-400 bg-slate-900/50 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="text-base tracking-wide">{plat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all duration-200 shadow-lg cursor-pointer ${
              isFormValid
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/20 active:scale-98'
                : 'bg-slate-800 text-slate-500 border border-slate-700/20 cursor-not-allowed'
            }`}
          >
            Start Scan Session
          </button>
        </div>
      </form>

      {/* Footer metadata */}
      <div className="mt-8 text-center">
        <div className="text-xs text-slate-500 font-medium">
          Joub Logistics &copy; {new Date().getFullYear()}
        </div>
        <div className="text-[9px] text-slate-600 font-mono mt-1">
          Build {__APP_BUILD_TIME__}
        </div>
      </div>
    </div>
  );
};
