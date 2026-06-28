import React, { useState } from 'react';
import { Camera, User, ChevronRight } from 'lucide-react';

interface SessionSetupProps {
  onComplete: (photographerId: string, platform: string) => void;
  initialPhotographerId?: string;
  initialPlatform?: string;
}

const PLATFORMS = [
  { id: 'amazon',    name: 'Amazon',    emoji: '📦', accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  { id: 'noon',      name: 'Noon',      emoji: '🟡', accent: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.25)'  },
  { id: 'al_nasser', name: 'Al-Nasser', emoji: '🔴', accent: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)'  },
  { id: 'jumia',     name: 'Jumia',     emoji: '🛒', accent: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
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
    <div className="flex flex-col w-full h-full bg-slate-950 text-slate-100 overflow-y-auto overscroll-none">
      {/* Header */}
      <div className="flex flex-col items-center pt-8 pb-5 px-6 text-center shrink-0">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10">
          <Camera className="w-7 h-7 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">Joub Capture</h1>
        <p className="mt-1 text-sm text-slate-400">Product photo digitizer</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 px-5 gap-4">

        {/* Photographer field */}
        <div className="space-y-2.5">
          <label htmlFor="photographer-id" className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            Your Name / ID
          </label>
          <input
            id="photographer-id"
            type="text"
            required
            placeholder="e.g. Amr Diab, Station 2"
            value={photographerId}
            onChange={(e) => setPhotographerId(e.target.value)}
            className="w-full px-4 py-4 bg-slate-900 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-600 font-medium text-base transition-all"
          />
        </div>

        {/* Platform selection */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Select Platform
          </label>
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map((plat) => {
              const selected = platform === plat.id;
              return (
                <button
                  key={plat.id}
                  type="button"
                  onClick={() => setPlatform(plat.id)}
                  style={selected ? { background: plat.bg, borderColor: plat.accent, color: plat.accent } : {}}
                  className={`flex items-center justify-center gap-2.5 p-4 border-2 rounded-2xl font-bold text-base transition-all duration-150 cursor-pointer active:scale-95 ${
                    selected
                      ? 'shadow-lg scale-[1.02]'
                      : 'border-slate-800 text-slate-400 bg-slate-900/50 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="text-xl">{plat.emoji}</span>
                  <span>{plat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="mt-auto pb-8 pt-2">
          <button
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all duration-200 flex items-center justify-center gap-2 ${
              isFormValid
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-98 shadow-lg shadow-indigo-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
            }`}
          >
            Start Scan Session
            {isFormValid && <ChevronRight className="w-5 h-5" />}
          </button>
          <p className="text-center text-xs text-slate-600 mt-4">Joub Logistics © {new Date().getFullYear()}</p>
        </div>
      </form>
    </div>
  );
};
