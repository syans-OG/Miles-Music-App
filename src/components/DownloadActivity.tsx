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
        className="flex w-[340px] items-center gap-2 rounded-[14px] border border-th-line bg-[color-mix(in_srgb,var(--th-elevated)_90%,transparent)] px-2.5 py-2 shadow-2xl backdrop-blur-md"
      >
        {status === 'downloading' ? (
          <>
            <div className="flex-shrink-0">
              <svg viewBox="0 0 20 20" className="h-5 w-5" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="10" cy="10" r="8" fill="none" stroke="var(--th-600)" strokeWidth="2.5" />
                <circle
                  cx="10"
                  cy="10"
                  r="8"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={ARC_LENGTH}
                  strokeDashoffset={ARC_LENGTH * (1 - progress)}
                  style={{ transition: 'stroke-dashoffset 0.65s cubic-bezier(0.16,1,0.3,1)', stroke: 'rgb(var(--th-a400))' }}
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-bold text-th-primary">
                {downloadTask.total > 1
                  ? `Downloading ${Math.min(downloadTask.processed + 1, downloadTask.total)} of ${downloadTask.total}`
                  : 'Downloading track'}
              </p>
              {currentItem && (
                <p className="truncate text-[10px] text-slate-400">{currentItem.title}</p>
              )}
            </div>
            <button type="button" onClick={() => void cancelDownloadTask()} className="download-activity-btn">
              Cancel
            </button>
          </>
        ) : status === 'success' ? (
          <>
            <span className="download-activity-badge success"><Check className="h-3 w-3" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-bold text-th-primary">{downloadTask.message}</p>
              {downloadTask.report && downloadTask.report.failed > 0 && (
                <p className="truncate text-[10px] text-rose-300">
                  {downloadTask.report.failed} track(s) failed to download.
                </p>
              )}
            </div>
            {retryable && downloadTask.report && downloadTask.report.failed > 0 && (
              <button type="button" onClick={() => void retryDownloadTask()} className="download-activity-btn primary">
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
            )}
          </>
        ) : status === 'error' ? (
          <>
            <span className="download-activity-badge error"><AlertTriangle className="h-3 w-3" /></span>
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-th-primary">{downloadTask.message}</p>
            {retryable && (
              <button type="button" onClick={() => void retryDownloadTask()} className="download-activity-btn primary">
                Retry
              </button>
            )}
          </>
        ) : (
          <>
            <span className="download-activity-badge cancelled"><X className="h-3 w-3" /></span>
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-th-primary">{downloadTask.message}</p>
          </>
        )}

        {status === 'error' || status === 'cancelled' ? (
          <button type="button" onClick={dismissDownloadTask} className="download-activity-btn">
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
};