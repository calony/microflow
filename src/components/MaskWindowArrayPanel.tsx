/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MaskWindow } from '../types/microfab';
import {
  MaskWindowArrayDirection,
  MaskWindowArrayOptions,
  createMaskWindowArray,
} from '../lib/maskUtils';
import { Check, LayoutGrid, X } from 'lucide-react';

interface MaskWindowArrayPanelProps {
  sourceWindow: MaskWindow;
  sourceIndex: number;
  waferWidth: number;
  featureNounCap: string;
  unit?: 'um' | 'nm';
  onApply: (options: MaskWindowArrayOptions) => void;
  onClose: () => void;
}

export const MaskWindowArrayPanel: React.FC<MaskWindowArrayPanelProps> = ({
  sourceWindow,
  sourceIndex,
  waferWidth,
  featureNounCap,
  unit = 'um',
  onApply,
  onClose,
}) => {
  const widthNm = Math.max(10, Math.round(sourceWindow.xEnd - sourceWindow.xStart));
  const defaultPitchNm = Math.max(100, Math.round(widthNm * 2));

  const [count, setCount] = useState<number>(4);
  const [pitchNm, setPitchNm] = useState<number>(defaultPitchNm);
  const [direction, setDirection] = useState<MaskWindowArrayDirection>('right');

  const preview = useMemo(
    () =>
      createMaskWindowArray(
        [sourceWindow],
        sourceWindow.id,
        { count, pitchNm, direction },
        waferWidth
      ),
    [sourceWindow, count, pitchNm, direction, waferWidth]
  );

  const gapNm = pitchNm - widthNm;
  const formatLen = (nm: number) =>
    unit === 'nm'
      ? `${Math.round(nm)} nm`
      : `${(nm / 1000).toFixed(2)} µm`;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (preview.totalPlaced < 2 && preview.addedIds.length === 0) return;
    onApply({ count, pitchNm, direction });
  };

  return (
    <form
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 p-2.5 rounded-lg bg-slate-950/95 border border-sky-500/45 shadow-xl space-y-2 text-[11px]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
          <LayoutGrid className="w-3 h-3 text-sky-400 shrink-0" />
          <span>
            1D Array from {featureNounCap} #{sourceIndex + 1} ({formatLen(widthNm)} wide)
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Close array builder"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <label className="space-y-0.5 block">
          <span className="block text-[10px] text-slate-400 font-mono">Total Count</span>
          <input
            type="number"
            min={2}
            max={50}
            step={1}
            value={count}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setCount(Math.max(2, Math.min(50, v)));
            }}
            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 focus:border-sky-500 text-slate-100 font-mono text-xs focus:outline-none"
          />
        </label>

        <label className="space-y-0.5 block">
          <span className="block text-[10px] text-slate-400 font-mono">
            Pitch ({unit === 'nm' ? 'nm' : 'µm'})
          </span>
          <input
            type="number"
            min={unit === 'nm' ? 20 : 0.05}
            step={unit === 'nm' ? 50 : 0.1}
            value={unit === 'nm' ? pitchNm : Math.round((pitchNm / 1000) * 1000) / 1000}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) {
                setPitchNm(unit === 'nm' ? Math.round(v) : Math.round(v * 1000));
              }
            }}
            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 focus:border-sky-500 text-slate-100 font-mono text-xs focus:outline-none"
          />
        </label>

        <div className="space-y-0.5">
          <span className="block text-[10px] text-slate-400 font-mono">Direction</span>
          <div className="grid grid-cols-3 bg-slate-900 border border-slate-700 rounded p-0.5 text-[10px] font-mono">
            {(
              [
                { id: 'right', label: '+X' },
                { id: 'center', label: 'Center' },
                { id: 'left', label: '-X' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDirection(opt.id)}
                className={`py-0.5 rounded transition-colors ${
                  direction === opt.id
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="text-[10px] font-mono flex flex-wrap items-center gap-2">
          <span className={gapNm < 0 ? 'text-amber-300' : 'text-slate-400'}>
            {gapNm < 0
              ? `Overlap: ${formatLen(Math.abs(gapNm))}`
              : `Gap: ${formatLen(gapNm)}`}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-emerald-300">
            Adds {preview.addedIds.length}{' '}
            {preview.addedIds.length === 1 ? 'copy' : 'copies'} ({preview.totalPlaced} total)
          </span>
          {preview.skippedOutOfBounds > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300">
                {preview.skippedOutOfBounds} outside wafer bounds skipped
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={preview.addedIds.length === 0 && direction !== 'center'}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[10.5px] font-semibold transition-colors"
          >
            <Check className="w-3 h-3" />
            <span>Create Array</span>
          </button>
        </div>
      </div>
    </form>
  );
};
