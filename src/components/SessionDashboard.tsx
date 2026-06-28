import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface SessionDashboardProps {
  scannedCount: number;
  doneCount: number;
  queuedCount: number;
  isOnline: boolean;
  isSyncing?: boolean;
  onSyncBatch?: () => void;
}

export function SessionDashboard({
  scannedCount,
  doneCount,
  queuedCount,
  isOnline,
  isSyncing = false,
  onSyncBatch,
}: SessionDashboardProps) {
  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur-sm px-3 py-2.5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${
            isOnline
              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20'
              : 'text-rose-400 bg-rose-950/40 border-rose-500/20'
          }`}>
            {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>

          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <span className="px-2 py-1 rounded-full bg-slate-900 border border-slate-800">Captured {scannedCount}</span>
            <span className="px-2 py-1 rounded-full bg-slate-900 border border-slate-800">Synced {doneCount}</span>
            <span className="px-2 py-1 rounded-full bg-slate-900 border border-slate-800">Queue {queuedCount}</span>
          </div>

          {onSyncBatch && (
            <button
              type="button"
              onClick={onSyncBatch}
              disabled={isSyncing || queuedCount === 0}
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                isSyncing || queuedCount === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing' : queuedCount > 0 ? 'Confirm batch' : 'Ready'}
            </button>
          )}
        </div>

        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          {queuedCount > 0
            ? `${queuedCount} capture${queuedCount === 1 ? '' : 's'} waiting to sync to the sheet.`
            : 'Ready for the next product.'}
        </p>
      </div>
    </div>
  );
}
