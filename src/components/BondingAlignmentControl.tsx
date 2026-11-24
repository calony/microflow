/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  SlidersHorizontal,
  Layers,
  Ban,
} from 'lucide-react';

export interface BondingAlignmentControlProps {
  waferWidth: number;
  importedWidth: number;
  alignment: 'left' | 'center' | 'right' | 'custom';
  offsetNm?: number;
  paddingMode: 'empty' | 'extend-edges';
  onChangeAlignment: (
    alignment: 'left' | 'center' | 'right' | 'custom',
    offsetNm?: number
  ) => void;
  onChangePaddingMode: (mode: 'empty' | 'extend-edges') => void;
  showPreview?: boolean;
  compact?: boolean;
}

export function resolveEffectiveShiftX(
  waferWidth: number,
  importedWidth: number,
  alignment: 'left' | 'center' | 'right' | 'custom',
  offsetNm?: number
): number {
  if (alignment === 'custom' && typeof offsetNm === 'number' && Number.isFinite(offsetNm)) {
    return offsetNm;
  }
  if (alignment === 'left') return 0;
  if (alignment === 'right') return waferWidth - importedWidth;
  return (waferWidth - importedWidth) / 2;
}

export const BondingAlignmentControl: React.FC<BondingAlignmentControlProps> = ({
  waferWidth,
  importedWidth,
  alignment,
  offsetNm,
  paddingMode,
  onChangeAlignment,
  onChangePaddingMode,
  showPreview = true,
  compact = false,
}) => {
  const effectiveShiftX = resolveEffectiveShiftX(
    waferWidth,
    importedWidth,
    alignment,
    offsetNm
  );

  const leftAnchor = 0;
  const centerAnchor = Math.round((waferWidth - importedWidth) / 2);
  const rightAnchor = waferWidth - importedWidth;

  const isLeftActive =
    alignment === 'left' || (alignment === 'custom' && Math.abs(effectiveShiftX - leftAnchor) <= 1);
  const isCenterActive =
    alignment === 'center' ||
    (alignment === 'custom' && Math.abs(effectiveShiftX - centerAnchor) <= 1);
  const isRightActive =
    alignment === 'right' ||
    (alignment === 'custom' && Math.abs(effectiveShiftX - rightAnchor) <= 1);
  const isCustomActive = !isLeftActive && !isCenterActive && !isRightActive;

  // Slider bounds: cover full anchor span, and expand gracefully if user typed an overhanging offset
  const baseSliderMin = Math.min(0, waferWidth - importedWidth);
  const baseSliderMax = Math.max(0, waferWidth - importedWidth);
  const sliderMin = Math.min(baseSliderMin, effectiveShiftX);
  const sliderMax = Math.max(baseSliderMax, effectiveShiftX);
  const sliderSpan = Math.max(100, sliderMax - sliderMin);
  const sliderStep = Math.max(10, Math.round(sliderSpan / 200));

  // Hard bounds for manual numeric entry (allows overhanging up to full wafer width on either side)
  const hardMinNm = -importedWidth;
  const hardMaxNm = waferWidth;

  const formattedUm = (effectiveShiftX / 1000).toFixed(2);
  const [isFocused, setIsFocused] = useState(false);
  const [draftUm, setDraftUm] = useState(formattedUm);

  useEffect(() => {
    if (!isFocused) {
      setDraftUm(formattedUm);
    }
  }, [formattedUm, isFocused]);

  const commitManualNm = (valNm: number) => {
    const clamped = Math.max(hardMinNm, Math.min(hardMaxNm, Math.round(valNm)));
    onChangeAlignment('custom', clamped);
  };

  // Determine whether any unbonded side exists inside [0, waferWidth]
  const hasLeftGap = effectiveShiftX > 1;
  const hasRightGap = effectiveShiftX + importedWidth < waferWidth - 1;
  const showPaddingControl = importedWidth < waferWidth - 1 || hasLeftGap || hasRightGap;

  // Compute human-readable placement summary
  const overlapStartNm = Math.max(0, effectiveShiftX);
  const overlapEndNm = Math.min(waferWidth, effectiveShiftX + importedWidth);
  const importedKeptStartNm = Math.max(0, -effectiveShiftX);
  const importedKeptEndNm = Math.min(importedWidth, waferWidth - effectiveShiftX);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {/* Quick Alignment Anchors */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-slate-300">
            Horizontal Alignment (1:1 Scale)
          </span>
          {isCustomActive && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
              Custom Offset
            </span>
          )}
        </div>
        <div
          className={`grid grid-cols-3 gap-1 ${
            compact ? 'p-0.5 rounded-md bg-slate-950 border border-slate-800' : ''
          }`}
        >
          {(
            [
              { id: 'left', label: 'Left', active: isLeftActive, val: leftAnchor, Icon: AlignLeft },
              {
                id: 'center',
                label: 'Center',
                active: isCenterActive,
                val: centerAnchor,
                Icon: AlignCenter,
              },
              {
                id: 'right',
                label: 'Right',
                active: isRightActive,
                val: rightAnchor,
                Icon: AlignRight,
              },
            ] as const
          ).map(({ id, label, active, val, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeAlignment(id, val)}
              className={`${
                compact ? 'py-1 px-1.5 rounded text-[10px]' : 'py-1.5 px-2 rounded-md text-[11px] border'
              } font-medium flex items-center justify-center gap-1 transition-colors ${
                active
                  ? compact
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-600 border-sky-500 text-white'
                  : compact
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Granular X-Shift Slider + Exact Input */}
      <div className="p-2 rounded-md bg-slate-950/70 border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-300 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-sky-400 shrink-0" />
            <span>Imported Left-Edge X</span>
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.05"
              min={(hardMinNm / 1000).toFixed(2)}
              max={(hardMaxNm / 1000).toFixed(2)}
              aria-label="Imported wafer X offset in micrometers"
              value={isFocused ? draftUm : formattedUm}
              onFocus={(e) => {
                setIsFocused(true);
                setDraftUm(formattedUm);
                e.target.select();
              }}
              onChange={(e) => {
                const raw = e.target.value;
                setDraftUm(raw);
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed)) {
                  commitManualNm(parsed * 1000);
                }
              }}
              onBlur={() => {
                const parsed = parseFloat(draftUm);
                if (Number.isFinite(parsed)) {
                  commitManualNm(parsed * 1000);
                }
                setIsFocused(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setDraftUm(formattedUm);
                  setIsFocused(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-20 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-right text-[11px] font-mono text-white focus:outline-none focus:border-sky-500"
            />
            <span className="text-[10px] text-slate-400 font-mono">µm</span>
          </div>
        </div>

        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={effectiveShiftX}
          onChange={(e) => commitManualNm(parseFloat(e.target.value))}
          aria-label="Imported wafer horizontal position slider"
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />

        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
          {overlapEndNm <= overlapStartNm ? (
            <span className="text-amber-300">No overlap with current wafer</span>
          ) : importedWidth > waferWidth && !hasLeftGap && !hasRightGap ? (
            <span>
              Kept imported slice: {(importedKeptStartNm / 1000).toFixed(2)} –{' '}
              {(importedKeptEndNm / 1000).toFixed(2)} µm
            </span>
          ) : (
            <span>
              Placed on wafer: {(overlapStartNm / 1000).toFixed(2)} –{' '}
              {(overlapEndNm / 1000).toFixed(2)} µm
            </span>
          )}
          <span className="text-slate-500">
            Span: {(waferWidth / 1000).toFixed(1)} µm
          </span>
        </div>
      </div>

      {/* Side Boundary Padding Mode (when imported wafer is narrower or exposes unbonded side) */}
      {showPaddingControl && (
        <div className="space-y-1">
          <span className="block text-[10px] font-medium text-slate-300">
            Side Boundary Padding
          </span>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px]">
            <button
              type="button"
              onClick={() => onChangePaddingMode('empty')}
              className={`py-1 px-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors ${
                paddingMode === 'empty'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Leave sides outside the imported wafer unbonded/empty"
            >
              <Ban className="w-2.5 h-2.5 shrink-0" />
              <span>Leave Sides Empty</span>
            </button>
            <button
              type="button"
              onClick={() => onChangePaddingMode('extend-edges')}
              className={`py-1 px-1.5 rounded font-medium flex items-center justify-center gap-1 transition-colors ${
                paddingMode === 'extend-edges'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Fill left and right sides with the same height and materials as the imported wafer boundaries"
            >
              <Layers className="w-2.5 h-2.5 shrink-0" />
              <span>Extend Edge Layers</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">
            {paddingMode === 'extend-edges'
              ? 'Fills uncovered left/right sides with the exact height and material stack of the imported wafer boundaries.'
              : 'Leaves uncovered left/right sides open (unbonded).'}
          </p>
        </div>
      )}

      {/* Live SVG X-Axis Overlap Preview */}
      {showPreview &&
        (() => {
          const minCoord = Math.min(0, effectiveShiftX);
          const maxCoord = Math.max(waferWidth, effectiveShiftX + importedWidth);
          const span = Math.max(1, maxCoord - minCoord);
          const curLeftPct = ((0 - minCoord) / span) * 100;
          const curWidthPct = (waferWidth / span) * 100;
          const impLeftPct = ((effectiveShiftX - minCoord) / span) * 100;
          const impWidthPct = (importedWidth / span) * 100;

          const svgW = 240;
          const padX = 8;
          const usableW = svgW - padX * 2;
          const curX = padX + (curLeftPct / 100) * usableW;
          const curRectW = Math.max(2, (curWidthPct / 100) * usableW);
          const impX = padX + (impLeftPct / 100) * usableW;
          const impRectW = Math.max(2, (impWidthPct / 100) * usableW);

          const leftPadX = curX;
          const leftPadW = Math.max(0, Math.min(curX + curRectW, impX) - curX);
          const rightPadStart = Math.max(curX, impX + impRectW);
          const rightPadW = Math.max(0, curX + curRectW - rightPadStart);

          return (
            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Alignment Preview</span>
                <span className="font-mono text-slate-300">
                  Shift {(effectiveShiftX / 1000).toFixed(2)} µm
                  {showPaddingControl && paddingMode === 'extend-edges' ? ' · Edge Fill' : ''}
                </span>
              </div>
              <svg
                viewBox="0 0 240 34"
                className="w-full h-9 rounded bg-slate-900 border border-slate-800"
                aria-label="Wafer bonding alignment preview"
              >
                <line
                  x1={curX}
                  y1={3}
                  x2={curX}
                  y2={31}
                  stroke="#38bdf8"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <line
                  x1={curX + curRectW}
                  y1={3}
                  x2={curX + curRectW}
                  y2={31}
                  stroke="#38bdf8"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />

                {/* Extended boundary fill bars when extend-edges is selected */}
                {showPaddingControl && paddingMode === 'extend-edges' && leftPadW > 0.5 && (
                  <rect
                    x={leftPadX}
                    y={6}
                    width={leftPadW}
                    height={8}
                    rx={1}
                    fill="#6366f1"
                    fillOpacity={0.35}
                    stroke="#818cf8"
                    strokeWidth={0.7}
                    strokeDasharray="2 1"
                  />
                )}
                {showPaddingControl && paddingMode === 'extend-edges' && rightPadW > 0.5 && (
                  <rect
                    x={rightPadStart}
                    y={6}
                    width={rightPadW}
                    height={8}
                    rx={1}
                    fill="#6366f1"
                    fillOpacity={0.35}
                    stroke="#818cf8"
                    strokeWidth={0.7}
                    strokeDasharray="2 1"
                  />
                )}

                {/* Imported Wafer Bar */}
                <rect
                  x={impX}
                  y={5}
                  width={impRectW}
                  height={10}
                  rx={2}
                  fill="#6366f1"
                  fillOpacity={0.85}
                  stroke="#a5b4fc"
                  strokeWidth={0.8}
                />
                {/* Current Base Wafer Bar */}
                <rect
                  x={curX}
                  y={19}
                  width={curRectW}
                  height={10}
                  rx={2}
                  fill="#0ea5e9"
                  fillOpacity={0.45}
                  stroke="#38bdf8"
                  strokeWidth={0.8}
                />
              </svg>
              <div className="flex items-center justify-between text-[9px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-xs bg-indigo-500/85" />
                  Imported ({(importedWidth / 1000).toFixed(2)} µm)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-xs bg-sky-500/50 border border-sky-400/70" />
                  Current ({(waferWidth / 1000).toFixed(2)} µm)
                </span>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
