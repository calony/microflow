/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  PiecewiseZMode,
  PiecewiseZTransform,
  CustomZZonesConfig,
  formatLocalGain,
} from '../lib/piecewiseZScale';
import { ThicknessUnit, formatThickness } from '../lib/units';
import { Plus, Trash2, Sparkles, X } from 'lucide-react';

interface BufferedNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  decimals?: number;
  onCommit: (next: number) => void;
  className?: string;
  ariaLabel?: string;
}

const BufferedNumberInput: React.FC<BufferedNumberInputProps> = ({
  value,
  min,
  max,
  decimals = 3,
  onCommit,
  className = '',
  ariaLabel,
}) => {
  const formatVal = (n: number) =>
    Number(n.toFixed(decimals)).toString();

  const [draft, setDraft] = useState<string>(() => formatVal(value));
  const [focused, setFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatVal(value));
    }
  }, [value, focused]);

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatVal(value));
      return;
    }
    let next = parsed;
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    onCommit(next);
    setDraft(formatVal(next));
  };

  return (
    <input
      type="number"
      step="any"
      aria-label={ariaLabel}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(formatVal(value));
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};

interface PiecewiseZPopoverProps {
  mode: PiecewiseZMode;
  onChangeMode: (next: PiecewiseZMode) => void;
  autoCompression: number;
  onChangeAutoCompression: (next: number) => void;
  customConfig: CustomZZonesConfig;
  onChangeCustomConfig: (next: CustomZZonesConfig) => void;
  zTransform: PiecewiseZTransform;
  autoPreviewTransform: PiecewiseZTransform;
  thicknessUnit: ThicknessUnit;
  onSeedCustomFromAuto: () => void;
  onClose: () => void;
}

export const PiecewiseZPopover: React.FC<PiecewiseZPopoverProps> = ({
  mode,
  onChangeMode,
  autoCompression,
  onChangeAutoCompression,
  customConfig,
  onChangeCustomConfig,
  zTransform,
  autoPreviewTransform,
  thicknessUnit,
  onSeedCustomFromAuto,
  onClose,
}) => {
  const { rawMinY, rawMaxY } = zTransform;
  const worldSpan = Math.max(10, rawMaxY - rawMinY);

  // Display bands top-to-bottom so top surface films appear at the top
  const bandsTopToBottom = [...zTransform.bands].reverse();

  const handleUpdateBreakpointUm = (bpIdx: number, nextUm: number) => {
    const sorted = [...customConfig.breakpointsNm]
      .filter((y) => y > rawMinY + 1 && y < rawMaxY - 1)
      .sort((a, b) => a - b);
    if (bpIdx < 0 || bpIdx >= sorted.length) return;

    const minAllowed = (bpIdx === 0 ? rawMinY : sorted[bpIdx - 1]) + 5;
    const maxAllowed = (bpIdx === sorted.length - 1 ? rawMaxY : sorted[bpIdx + 1]) - 5;
    if (minAllowed >= maxAllowed) return;

    const clampedNm = Math.max(minAllowed, Math.min(maxAllowed, nextUm * 1000));
    sorted[bpIdx] = Math.round(clampedNm * 100) / 100;

    onChangeCustomConfig({
      breakpointsNm: sorted,
      zoneGains:
        customConfig.zoneGains.length === sorted.length + 1
          ? customConfig.zoneGains
          : new Array(sorted.length + 1).fill(1),
    });
  };

  const handleUpdateZoneGain = (zoneIdx: number, nextGain: number) => {
    const safeGain = Math.max(0.001, Math.min(10000, nextGain));
    const bps = [...customConfig.breakpointsNm]
      .filter((y) => y > rawMinY + 1 && y < rawMaxY - 1)
      .sort((a, b) => a - b);
    const gains =
      customConfig.zoneGains.length === bps.length + 1
        ? [...customConfig.zoneGains]
        : new Array(bps.length + 1).fill(1);
    if (zoneIdx >= 0 && zoneIdx < gains.length) {
      gains[zoneIdx] = safeGain;
    }
    onChangeCustomConfig({ breakpointsNm: bps, zoneGains: gains });
  };

  const handleRemoveBreakpoint = (bpIdx: number) => {
    const bps = [...customConfig.breakpointsNm]
      .filter((y) => y > rawMinY + 1 && y < rawMaxY - 1)
      .sort((a, b) => a - b);
    if (bpIdx < 0 || bpIdx >= bps.length) return;
    const gains =
      customConfig.zoneGains.length === bps.length + 1
        ? [...customConfig.zoneGains]
        : new Array(bps.length + 1).fill(1);
    const mergedGain = Math.sqrt(gains[bpIdx] * gains[bpIdx + 1]);
    bps.splice(bpIdx, 1);
    gains.splice(bpIdx, 2, Math.round(mergedGain * 1000) / 1000);
    onChangeCustomConfig({ breakpointsNm: bps, zoneGains: gains });
  };

  const handleSplitTallestZone = () => {
    const bps = [...customConfig.breakpointsNm]
      .filter((y) => y > rawMinY + 1 && y < rawMaxY - 1)
      .sort((a, b) => a - b);
    const gains =
      customConfig.zoneGains.length === bps.length + 1
        ? [...customConfig.zoneGains]
        : new Array(bps.length + 1).fill(1);

    const boundaries = [rawMinY, ...bps, rawMaxY];
    let tallestIdx = 0;
    let tallestSpan = -1;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const sp = boundaries[i + 1] - boundaries[i];
      if (sp > tallestSpan) {
        tallestSpan = sp;
        tallestIdx = i;
      }
    }
    if (tallestSpan < 20) return;

    // Default first split near 90% height on thick substrates, otherwise midpoint
    const newBp =
      bps.length === 0 && worldSpan > 5000
        ? Math.round(rawMinY + tallestSpan * 0.9)
        : Math.round((boundaries[tallestIdx] + boundaries[tallestIdx + 1]) * 0.5);

    const nextBps = [...bps, newBp].sort((a, b) => a - b);
    const baseGain = gains[tallestIdx] ?? 1;
    const nextGains = [...gains];
    // Give upper split slightly higher gain when splitting substrate for the first time
    if (bps.length === 0) {
      nextGains.splice(tallestIdx, 1, Math.max(0.05, baseGain * 0.25), Math.max(1, baseGain * 5));
    } else {
      nextGains.splice(tallestIdx, 1, baseGain, baseGain);
    }

    onChangeCustomConfig({ breakpointsNm: nextBps, zoneGains: nextGains });
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1.5 z-40 w-80 sm:w-[360px] max-w-[calc(100vw-2rem)] bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-3 text-xs text-slate-200 space-y-2.5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-slate-100 text-xs">Piecewise Z-Axis Scaling</h4>
          <p className="text-[10px] text-slate-400">
            Compress thick substrates while keeping thin films legible
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
        {(['linear', 'auto', 'custom'] as PiecewiseZMode[]).map((m) => {
          const active = mode === m;
          const label = m === 'linear' ? 'Linear (1:1)' : m === 'auto' ? 'Auto' : 'Custom Zones';
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMode(m)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Linear Mode Content */}
      {mode === 'linear' && (
        <div className="rounded-lg bg-slate-950/70 border border-slate-800/90 p-2.5 space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            True 1:1 vertical coordinate mapping across the entire{' '}
            <span className="font-mono text-slate-200">
              {formatThickness(worldSpan, thicknessUnit)}
            </span>{' '}
            stack height.
          </p>
          {autoPreviewTransform.isActive && (
            <button
              type="button"
              onClick={() => onChangeMode('auto')}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-[11px] font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Enable Auto Piecewise ({autoPreviewTransform.bands.length} scale bands detected)
              </span>
            </button>
          )}
        </div>
      )}

      {/* Auto Mode Content */}
      {mode === 'auto' && (
        <div className="space-y-2.5">
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300 font-medium">Scale Compression</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {Math.round(autoCompression * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={autoCompression}
              onChange={(e) => onChangeAutoCompression(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[9.5px] text-slate-500">
              <span>Linear (0%)</span>
              <span>Balanced (75%)</span>
              <span>Max Balance (100%)</span>
            </div>
          </div>

          {zTransform.isActive ? (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
              {bandsTopToBottom.map((band) => {
                const isExpanded = band.localGain > 1.15;
                const isCompressed = band.localGain < 0.85;
                return (
                  <div
                    key={band.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/90 text-[10.5px]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-slate-200 truncate">
                        {formatThickness(band.worldSpan, thicknessUnit)}
                      </div>
                      <div className="text-[9.5px] font-mono text-slate-500 truncate">
                        Z: {(band.yMin / 1000).toFixed(2)}–{(band.yMax / 1000).toFixed(2)} µm
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono">
                      <span className="text-[10px] text-slate-400">
                        {Math.round(band.visualPct)}%
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                          isExpanded
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                            : isCompressed
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {formatLocalGain(band.localGain)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2 text-[10.5px] text-slate-400">
              All layers span a single order of magnitude — linear 1:1 scaling is active. Use{' '}
              <button
                type="button"
                onClick={onSeedCustomFromAuto}
                className="text-sky-400 hover:underline font-medium"
              >
                Custom Zones
              </button>{' '}
              to manually magnify any region.
            </div>
          )}

          <button
            type="button"
            onClick={onSeedCustomFromAuto}
            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
          >
            Edit as Custom Zones →
          </button>
        </div>
      )}

      {/* Custom Mode Content */}
      {mode === 'custom' && (
        <div className="space-y-2">
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
            {bandsTopToBottom.map((band, renderIdx) => {
              const zoneIdx = band.index;
              const userGain = band.userGain ?? 1;
              // Breakpoint immediately BELOW this band (between zoneIdx-1 and zoneIdx)
              const lowerBpIdx = zoneIdx - 1;
              return (
                <React.Fragment key={band.id}>
                  <div className="rounded-lg bg-slate-950/85 border border-slate-800 p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[10.5px]">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200">
                          Zone {zoneIdx + 1}
                        </span>{' '}
                        <span className="font-mono text-slate-400">
                          ({formatThickness(band.worldSpan, thicknessUnit)})
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-cyan-300 shrink-0">
                        {Math.round(band.visualPct)}% · {formatLocalGain(band.localGain)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">Weight (×):</span>
                      <div className="flex items-center gap-1">
                        {[0.1, 1, 10, 50].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleUpdateZoneGain(zoneIdx, preset)}
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border transition-colors ${
                              Math.abs(userGain - preset) < 1e-4
                                ? 'bg-sky-600/30 border-sky-500 text-sky-200'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                            }`}
                          >
                            {preset}×
                          </button>
                        ))}
                        <BufferedNumberInput
                          value={userGain}
                          min={0.001}
                          max={10000}
                          decimals={3}
                          ariaLabel={`Zone ${zoneIdx + 1} weight`}
                          onCommit={(v) => handleUpdateZoneGain(zoneIdx, v)}
                          className="w-14 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-white font-mono text-[10.5px] text-right focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  {lowerBpIdx >= 0 && renderIdx < bandsTopToBottom.length - 1 && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-slate-800/50 border border-dashed border-slate-700 text-[10px]">
                      <span className="text-sky-300 font-medium shrink-0">
                        Break Z (µm):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <BufferedNumberInput
                          value={band.yMin / 1000}
                          min={(rawMinY + 5) / 1000}
                          max={(rawMaxY - 5) / 1000}
                          decimals={3}
                          ariaLabel={`Breakpoint ${lowerBpIdx + 1} in microns`}
                          onCommit={(v) => handleUpdateBreakpointUm(lowerBpIdx, v)}
                          className="w-20 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-[10.5px] text-right focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveBreakpoint(lowerBpIdx)}
                          className="p-0.5 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
                          title="Remove breakpoint (merge zones)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSplitTallestZone}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-200 text-[11px] font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Split Zone</span>
            </button>
            <button
              type="button"
              onClick={onSeedCustomFromAuto}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
              title="Reset breakpoints from Auto decade detection"
            >
              <Sparkles className="w-3 h-3" />
              <span>Auto-Detect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
