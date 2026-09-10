import React, { useEffect } from 'react';
import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';

const ARC_LENGTH = 2 * Math.PI * 8;

export const DownloadActivity: React.FC = () => {
  const { downloadTask, cancelDownloadTask, retryDownloadTask, dismissDownloadTask } = usePlayerStore(useShallow((state) => ({
    downloadTask: state.downloadTask,
    cancelDownloadTask: state.cancelDownloadTask,
    retryDownloadTask: state.retryDownloadTask,
    dismissDownloadTask: state.dismissDownloadTask,
  })));

  useEffect(() => {
    if (downloadTask?.status !== 'success') return;
    const timer = window.setTimeout(dismissDownloadTask, 2600);
    return () => window.clearTimeout(timer);
  }, [downloadTask?.requestId, downloadTask?.status, dismissDownloadTask]);

  if (!downloadTask) return null;

  const currentItem = downloadTask.currentSongId
    ? downloadTask.queue.find((item) => item.songId === downloadTask.currentSongId)
    : undefined;
  const progress = downloadTask.total > 0 ? downloadTask.processed / downloadTask.total : 0;
  const status = downloadTask.status;
  const retryable = downloadTask.status !== 'downloading' && downloadTask.retryable;

  return (
    <div key={`${downloadTask.requestId}-${status}`} className="download-activity-enter absolute bottom-3 left-1/2 z-[90]">
      <div
        role="status"
        aria-live="polite"
        className="flex w-[340px] items-center gap-2 rounded-[14px] border border-white/10 bg-[#14161c]/90 px-2.5 py-2 shadow-2xl backdrop-blur-md"
      >
        {status === 'downloading' ? (
          <>
            <div className="flex-shrink-0">
              <svg viewBox="0 0 20 20" className="h-5 w-5" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={ARC_LENGTH}
                  strokeDashoffset={ARC_LENGTH * (1 - progress)}
                  style={{ transition: 'stroke-dashoffset 0.65s cubic-bezier(0.16,1,0.3,1)' }}
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-bold text-white">
                {downloadTask.total > 1
                  ? `Mengunduh ${Math.min(downloadTask.processed + 1, downloadTask.total)} dari ${downloadTask.total}`
                  : 'Mengunduh lagu'}
              </p>
              {currentItem && (
                <p className="truncate text-[10px] text-slate-400">{currentItem.title}</p>
              )}
            </div>
            <button type="button" onClick={() => void cancelDownloadTask()} className="download-activity-btn">
              Batal
            </button>
          </>
        ) : status === 'success' ? (
          <>
            <span className="download-activity-badge success"><Check className="h-3 w-3" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-bold text-white">{downloadTask.message}</p>
              {downloadTask.report && downloadTask.report.failed > 0 && (
                <p className="truncate text-[10px] text-rose-300">
                  {downloadTask.report.failed} lagu gagal diunduh.
                </p>
              )}
            </div>
            {retryable && downloadTask.report && downloadTask.report.failed > 0 && (
              <button type="button" onClick={() => void retryDownloadTask()} className="download-activity-btn primary">
                <RotateCcw className="h-3 w-3" /> Coba Lagi
              </button>
            )}
          </>
        ) : status === 'error' ? (
          <>
            <span className="download-activity-badge error"><AlertTriangle className="h-3 w-3" /></span>
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-white">{downloadTask.message}</p>
            {retryable && (
              <button type="button" onClick={() => void retryDownloadTask()} className="download-activity-btn primary">
                Coba Lagi
              </button>
            )}
          </>
        ) : (
          <>
            <span className="download-activity-badge cancelled"><X className="h-3 w-3" /></span>
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-white">{downloadTask.message}</p>
          </>
        )}

        {status === 'error' || status === 'cancelled' ? (
          <button type="button" onClick={dismissDownloadTask} className="download-activity-btn">
            Tutup
          </button>
        ) : null}
      </div>
    </div>
  );
};