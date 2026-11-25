/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';
import type { ProcessFlow } from '../types/microfab';
import type { ThicknessUnit } from '../lib/units';
import type { ProcessVideoProgress } from '../lib/processVideoExport';

export function ProcessVideoExportButton({ flow, playSpeed, thicknessUnit }: {
  flow: ProcessFlow;
  playSpeed: number;
  thicknessUnit: ThicknessUnit;
}) {
  const [progress, setProgress] = useState<ProcessVideoProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const hasEnabledSteps = flow.steps.some((step) => step.enabled);

  const handleDownload = async () => {
    if (controller.current) return;
    const abortController = new AbortController();
    controller.current = abortController;
    setError(null);
    setProgress({ phase: 'preparing', completed: 0, total: 0 });
    try {
      const { exportProcessSequenceVideo, downloadProcessVideo } = await import('../lib/processVideoExport');
      const result = await exportProcessSequenceVideo(flow, playSpeed, thicknessUnit, abortController.signal, (next) => {
        if (mounted.current) setProgress(next);
      });
      if (!abortController.signal.aborted) downloadProcessVideo(result.blob, result.filename);
    } catch (err) {
      if (mounted.current && !abortController.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Could not create the video. Please try again.');
      }
    } finally {
      controller.current = null;
      if (mounted.current) setProgress(null);
    }
  };

  const label = !progress ? 'Download Video (MP4)' : progress.phase === 'preparing'
    ? 'Preparing video…' : progress.phase === 'finalizing' ? 'Finishing video…'
    : `Creating video ${Math.round(100 * progress.completed / progress.total)}%`;

  return (
    <div className="px-2.5 py-1.5 border-b border-slate-800 bg-slate-950/50 shrink-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!hasEnabledSteps || progress !== null}
          title={hasEnabledSteps ? 'Download the full process sequence as MP4 video for Windows or Mac. Uses the selected playback speed.' : 'Add an enabled process step to download a video.'}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {progress ? <LoaderCircle className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
          <span role={progress ? 'status' : undefined}>{label}</span>
        </button>
        {progress && (
          <button type="button" onClick={() => controller.current?.abort()} aria-label="Cancel video export"
            className="p-1.5 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" title="Cancel video export">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[11px] text-rose-300 leading-relaxed">{error}</p>}
    </div>
  );
}
