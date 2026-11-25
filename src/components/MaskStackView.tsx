/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { ProcessFlow, PhotomaskLevel, MaskWindow } from '../types/microfab';
import {
  calculateMaskMetrics,
  getMaskArrowStepSizes,
  getMaskVariantLinks,
  RETICLE_PALETTE,
} from '../lib/maskUtils';
import {
  Crosshair,
  Layers,
  Plus,
  Redo2,
  Sliders,
  Undo2,
} from 'lucide-react';

type MaskCoordUnit = 'um' | 'nm';

interface MaskStackViewProps {
  flow: ProcessFlow;
  masks: PhotomaskLevel[];
  selectedMaskId: string;
  onSelectMask: (maskId: string) => void;
  waferWidth: number;
  apertureUnit: MaskCoordUnit;
  onChangeApertureUnit: (unit: MaskCoordUnit) => void;
  dragPreviewWindows: MaskWindow[] | null;
  dragState: {
    winId: string;
    type: 'resize-start' | 'resize-end' | 'move';
    initialWindows?: Array<{ id: string; xStart: number; xEnd: number }>;
  } | null;
  trackMarquee: {
    startNm: number;
    currentNm: number;
  } | null;
  selectedWindowIds: string[];
  activeTrackRef: React.RefObject<HTMLDivElement | null>;
  onTrackPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onWindowPointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    win: MaskWindow,
    type: 'resize-start' | 'resize-end' | 'move'
  ) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onOpenSingleTrack: () => void;
  onAddWindow?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const fmtCoord = (nm: number, unit: MaskCoordUnit, umDecimals = 3): string => {
  if (unit === 'nm') return `${Math.round(nm).toLocaleString()} nm`;
  return `${Number((nm / 1000).toFixed(umDecimals))} µm`;
};

const fmtTick = (nm: number, unit: MaskCoordUnit): string => {
  if (unit === 'nm') return `${Math.round(nm).toLocaleString()} nm`;
  return `${Number((nm / 1000).toFixed(2))} µm`;
};

export const MaskStackView: React.FC<MaskStackViewProps> = ({
  flow,
  masks,
  selectedMaskId,
  onSelectMask,
  waferWidth,
  apertureUnit,
  onChangeApertureUnit,
  dragPreviewWindows,
  dragState,
  trackMarquee,
  selectedWindowIds,
  activeTrackRef,
  onTrackPointerDown,
  onWindowPointerDown,
  onPointerMove,
  onPointerUp,
  onOpenSingleTrack,
  onAddWindow,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const [scope, setScope] = useState<'all' | 'assigned'>('all');
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [showComposite, setShowComposite] = useState<boolean>(true);
  const [hoverNm, setHoverNm] = useState<number | null>(null);
  const overlayColumnRef = useRef<HTMLDivElement>(null);

  const orderedRows = useMemo(() => {
    const lithoStepIndexById = new Map<string, { stepNumber: number; title: string }>();
    flow.steps.forEach((step, idx) => {
      if (step.type === 'lithography') {
        lithoStepIndexById.set(step.id, { stepNumber: idx + 1, title: step.title });
      }
    });

    const enriched = masks.map((mask, origIdx) => {
      const links = getMaskVariantLinks(flow, mask);
      const primaryLink = links.find((l) => l.isActiveVariant) || links[0];
      const fallbackStep = mask.assignedStepId
        ? lithoStepIndexById.get(mask.assignedStepId) || null
        : null;
      const stepNumber = primaryLink
        ? primaryLink.stepIndex + 1
        : fallbackStep?.stepNumber ?? null;
      const stepTitle = primaryLink
        ? primaryLink.step.title
        : fallbackStep?.title ?? null;
      const isActiveVariant =
        links.length === 0 ? true : links.some((l) => l.isActiveVariant);

      return {
        mask,
        origIdx,
        stepNumber,
        stepTitle,
        isAssigned: stepNumber !== null,
        isActiveVariant,
        color: mask.color || RETICLE_PALETTE[origIdx % RETICLE_PALETTE.length],
      };
    });

    const assigned = enriched
      .filter((r) => r.isAssigned)
      .sort((a, b) => (a.stepNumber ?? 9999) - (b.stepNumber ?? 9999));
    const unassigned = enriched.filter((r) => !r.isAssigned);

    return {
      assigned,
      unassigned,
      displayed: scope === 'assigned' ? assigned : [...assigned, ...unassigned],
    };
  }, [flow, masks, scope]);

  const selectedMask = useMemo(
    () => masks.find((m) => m.id === selectedMaskId) || masks[0] || null,
    [masks, selectedMaskId]
  );

  const selectedMaskWindows = useMemo(() => {
    if (!selectedMask) return [];
    return dragPreviewWindows ?? selectedMask.windows ?? [];
  }, [selectedMask, dragPreviewWindows]);

  const alignmentEdges = useMemo(() => {
    if (!showGuides || !selectedMask) return [];
    const seen = new Set<number>();
    const edges: number[] = [];
    for (const w of selectedMaskWindows) {
      const s = Math.round(w.xStart);
      const e = Math.round(w.xEnd);
      if (!seen.has(s)) {
        seen.add(s);
        edges.push(s);
      }
      if (!seen.has(e)) {
        seen.add(e);
        edges.push(e);
      }
    }
    return edges;
  }, [showGuides, selectedMask, selectedMaskWindows]);

  const selectedColor = useMemo(() => {
    const row = orderedRows.assigned.find((r) => r.mask.id === selectedMask?.id)
      || orderedRows.unassigned.find((r) => r.mask.id === selectedMask?.id);
    return row?.color || selectedMask?.color || '#38bdf8';
  }, [orderedRows, selectedMask]);

  const { fineNm, coarseNm } = useMemo(
    () => getMaskArrowStepSizes(waferWidth),
    [waferWidth]
  );

  const handleTrackColumnMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = overlayColumnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const nm = Math.max(
      0,
      Math.min(waferWidth, ((e.clientX - rect.left) / rect.width) * waferWidth)
    );
    setHoverNm(Math.round(nm));
  };

  const selectedFeatureSummary = useMemo(() => {
    if (!selectedMask) return null;
    const wins = selectedMaskWindows;
    const targetIds =
      selectedWindowIds.length > 0
        ? selectedWindowIds
        : wins.length === 1
        ? [wins[0].id]
        : [];
    if (targetIds.length === 0) {
      return `${wins.length} ${selectedMask.maskField === 'light-field' ? 'blocker' : 'window'}${wins.length === 1 ? '' : 's'}`;
    }
    if (targetIds.length === 1) {
      const idx = wins.findIndex((w) => w.id === targetIds[0]);
      const win = idx >= 0 ? wins[idx] : null;
      if (!win) return null;
      return `W-${idx + 1}: ${fmtCoord(win.xStart, apertureUnit)} → ${fmtCoord(win.xEnd, apertureUnit)} (Δ ${fmtCoord(win.xEnd - win.xStart, apertureUnit)})`;
    }
    return `${targetIds.length} features selected`;
  }, [selectedMask, selectedMaskWindows, selectedWindowIds, apertureUnit]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950 overflow-hidden">
      {/* Compact Stack Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/75 border-b border-slate-800 shrink-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Aligned Reticle Stack</span>
          </div>

          {/* Scope filter */}
          <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                scope === 'all'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({masks.length})
            </button>
            <button
              type="button"
              onClick={() => setScope('assigned')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                scope === 'assigned'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Assigned ({orderedRows.assigned.length})
            </button>
          </div>

          {/* Toggles */}
          <button
            type="button"
            onClick={() => setShowGuides((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors ${
              showGuides
                ? 'bg-amber-500/15 border-amber-500/45 text-amber-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Project vertical edge alignment lines from the selected mask across every other reticle"
          >
            <Crosshair className="w-3 h-3" />
            <span>Guides</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComposite((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors ${
              showComposite
                ? 'bg-sky-500/15 border-sky-500/45 text-sky-200'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Show semi-transparent composite overlay strip of all visible masks"
          >
            <span>Composite</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Unit switcher */}
          <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 text-[10.5px] font-mono">
            <button
              type="button"
              onClick={() => onChangeApertureUnit('um')}
              className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                apertureUnit === 'um'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              µm
            </button>
            <button
              type="button"
              onClick={() => onChangeApertureUnit('nm')}
              className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                apertureUnit === 'nm'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              nm
            </button>
          </div>

          {onUndo && onRedo && (
            <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
                title="Undo edit (Ctrl+Z)"
              >
                <Undo2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
                title="Redo edit (Ctrl+Y)"
              >
                <Redo2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {onAddWindow && selectedMask && (
            <button
              type="button"
              onClick={onAddWindow}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
              title={`Add feature to ${selectedMask.name}`}
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSingleTrack}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
            title="Switch to full 1D Track & coordinate table for selected mask"
          >
            <Sliders className="w-3 h-3 text-sky-400" />
            <span>Details</span>
          </button>
        </div>
      </div>

      {/* Main Aligned Stack Grid */}
      {orderedRows.displayed.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-xs text-slate-500">
          {masks.length === 0
            ? 'No mask levels defined yet. Create a mask level to inspect alignment.'
            : 'No assigned masks in the process flow. Switch filter to "All" to view unassigned reticles.'}
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto min-h-0"
          onMouseLeave={() => setHoverNm(null)}
        >
          <div className="relative min-w-0">
            {/* Sticky Shared Ruler & Composite Strip */}
            <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xs border-b border-slate-800">
              {/* Coordinate Scale Header Row */}
              <div className="flex items-stretch">
                <div className="w-36 sm:w-48 md:w-52 shrink-0 px-2.5 py-1.5 border-r border-slate-800/90 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  <span>Reticle Layer</span>
                  <span className="text-slate-500 tabular-nums">
                    {orderedRows.displayed.length}L
                  </span>
                </div>

                {/* Shared Coordinate Ruler */}
                <div
                  ref={overlayColumnRef}
                  onMouseMove={handleTrackColumnMouseMove}
                  className="relative flex-1 min-w-0 px-2 py-1 select-none"
                >
                  <div className="relative h-4 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                    <span>{fmtTick(0, apertureUnit)}</span>
                    <span className="hidden sm:inline">{fmtTick(waferWidth * 0.25, apertureUnit)}</span>
                    <span>{fmtTick(waferWidth * 0.5, apertureUnit)}</span>
                    <span className="hidden sm:inline">{fmtTick(waferWidth * 0.75, apertureUnit)}</span>
                    <span>{fmtTick(waferWidth, apertureUnit)}</span>

                    {/* Hover X Readout floating on ruler */}
                    {hoverNm !== null && (
                      <div
                        className="absolute top-0 -translate-x-1/2 px-1.5 py-0 rounded bg-cyan-500/95 text-slate-950 font-mono text-[9.5px] font-bold tabular-nums pointer-events-none shadow-sm whitespace-nowrap"
                        style={{
                          left: `${Math.max(4, Math.min(96, (hoverNm / waferWidth) * 100))}%`,
                        }}
                      >
                        {fmtCoord(hoverNm, apertureUnit)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Optional Composite Overlay Row */}
              {showComposite && (
                <div className="flex items-stretch border-t border-slate-800/70 bg-slate-900/45">
                  <div className="w-36 sm:w-48 md:w-52 shrink-0 px-2.5 py-1 border-r border-slate-800/90 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-300 truncate">
                      Composite Overlay
                    </span>
                    <span className="font-mono text-[9.5px] text-slate-500 tabular-nums">
                      All
                    </span>
                  </div>
                  <div
                    className="flex-1 min-w-0 px-2 py-1"
                    onMouseMove={handleTrackColumnMouseMove}
                  >
                    <div className="relative h-5 rounded bg-slate-950 border border-slate-800 overflow-hidden">
                      {/* Gridlines */}
                      {[25, 50, 75].map((pct) => (
                        <div
                          key={pct}
                          className="absolute top-0 bottom-0 w-px bg-slate-800/70 pointer-events-none"
                          style={{ left: `${pct}%` }}
                        />
                      ))}

                      {orderedRows.displayed.map((row) => {
                        const wins =
                          row.mask.id === selectedMask?.id
                            ? selectedMaskWindows
                            : row.mask.windows;
                        const isSel = row.mask.id === selectedMask?.id;
                        return wins.map((w, wIdx) => {
                          const leftPct = (w.xStart / waferWidth) * 100;
                          const widthPct = ((w.xEnd - w.xStart) / waferWidth) * 100;
                          return (
                            <div
                              key={`comp_${row.mask.id}_${w.id || wIdx}`}
                              className="absolute top-0.5 bottom-0.5 rounded-[2px] pointer-events-none"
                              style={{
                                left: `${leftPct}%`,
                                width: `${Math.max(0.6, widthPct)}%`,
                                backgroundColor: row.color,
                                opacity: isSel ? 0.65 : 0.3,
                                border: isSel ? `1px solid ${row.color}` : undefined,
                              }}
                            />
                          );
                        });
                      })}

                      {hoverNm !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-cyan-400/90 pointer-events-none z-20"
                          style={{ left: `${(hoverNm / waferWidth) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stacked Mask Rows */}
            <div className="divide-y divide-slate-800/75">
              {orderedRows.displayed.map((row, displayIdx) => {
                const { mask, stepNumber, isAssigned, isActiveVariant, color } = row;
                const isSelected = selectedMask?.id === mask.id;
                const isLF = mask.maskField === 'light-field';
                const wins = isSelected ? selectedMaskWindows : mask.windows;
                const mMetrics = calculateMaskMetrics(
                  isSelected ? { ...mask, windows: wins } : mask,
                  waferWidth
                );
                const prevRow = displayIdx > 0 ? orderedRows.displayed[displayIdx - 1] : null;
                const showUnassignedHeader =
                  scope === 'all' &&
                  !isAssigned &&
                  (displayIdx === 0 || Boolean(prevRow?.isAssigned));

                return (
                  <React.Fragment key={mask.id}>
                    {showUnassignedHeader && (
                      <div className="px-2.5 py-1 bg-slate-900/60 text-[10px] font-mono uppercase tracking-wider text-amber-400/90">
                        Unassigned Reticles
                      </div>
                    )}
                    <div
                      onClick={() => onSelectMask(mask.id)}
                      className={`group flex items-stretch cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-950/30 ring-1 ring-inset ring-sky-500/45'
                          : 'hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Left Label Cell (strictly fixed width so all tracks stay vertically aligned) */}
                      <div className="w-36 sm:w-48 md:w-52 shrink-0 px-2.5 py-1.5 border-r border-slate-800/90 flex flex-col justify-center min-w-0">
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-mono text-[10.5px] font-semibold text-slate-400 shrink-0">
                              {mask.layerCode || `L${row.origIdx + 1}`}
                            </span>
                            <span
                              className={`text-xs font-semibold truncate ${
                                isSelected ? 'text-white' : 'text-slate-200 group-hover:text-sky-200'
                              }`}
                              title={mask.name}
                            >
                              {mask.name}
                            </span>
                          </div>
                          {stepNumber !== null ? (
                            <span
                              className={`font-mono text-[10px] tabular-nums shrink-0 ${
                                isActiveVariant ? 'text-sky-400' : 'text-slate-500'
                              }`}
                              title={row.stepTitle ? `Step ${stepNumber}: ${row.stepTitle}` : undefined}
                            >
                              S{stepNumber}
                            </span>
                          ) : (
                            <span className="font-mono text-[9.5px] text-amber-400/80 shrink-0">
                              --
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-[9.5px] font-mono tabular-nums text-slate-400 truncate">
                          <span className={isLF ? 'text-sky-300' : 'text-slate-300'}>
                            {isLF ? 'LF' : 'DF'}
                          </span>
                          <span>·</span>
                          <span>{mask.polarity === 'negative' ? 'Neg' : 'Pos'}</span>
                          <span>·</span>
                          <span>{wins.length}f</span>
                          <span>·</span>
                          <span className="text-amber-400/90">{mMetrics.clearPercentage}%</span>
                        </div>
                      </div>

                      {/* Right Aligned Track Cell */}
                      <div
                        className="flex-1 min-w-0 px-2 py-1.5 flex items-center"
                        onMouseMove={handleTrackColumnMouseMove}
                      >
                        <div
                          ref={isSelected ? activeTrackRef : undefined}
                          tabIndex={isSelected ? 0 : -1}
                          onPointerDown={isSelected ? onTrackPointerDown : undefined}
                          onPointerMove={isSelected ? onPointerMove : undefined}
                          onPointerUp={isSelected ? onPointerUp : undefined}
                          onPointerCancel={isSelected ? onPointerUp : undefined}
                          className={`relative w-full h-8 rounded-md overflow-hidden select-none touch-none border focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/70 ${
                            isLF
                              ? isSelected
                                ? 'bg-sky-200/30 border-sky-400/60'
                                : 'bg-sky-200/20 border-sky-400/35'
                              : isSelected
                              ? 'bg-slate-950 border-sky-500/60'
                              : 'bg-slate-950 border-slate-800/90'
                          }`}
                        >
                          {/* Quarter Gridlines matching top ruler */}
                          {[25, 50, 75].map((pct) => (
                            <div
                              key={pct}
                              className="absolute top-0 bottom-0 w-px bg-slate-800/60 pointer-events-none"
                              style={{ left: `${pct}%` }}
                            />
                          ))}

                          {/* Selected-Mask Alignment Projection Guides across all rows */}
                          {showGuides &&
                            alignmentEdges.map((edgeNm) => (
                              <div
                                key={`g_${edgeNm}`}
                                className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                                style={{
                                  left: `${(edgeNm / waferWidth) * 100}%`,
                                  backgroundImage: isSelected
                                    ? `repeating-linear-gradient(to bottom, ${selectedColor}cc 0, ${selectedColor}cc 3px, transparent 3px, transparent 6px)`
                                    : 'repeating-linear-gradient(to bottom, rgba(251,191,36,0.55) 0, rgba(251,191,36,0.55) 3px, transparent 3px, transparent 6px)',
                                }}
                              />
                            ))}

                          {/* Marquee on selected row */}
                          {isSelected && trackMarquee && (() => {
                            const minPct =
                              (Math.min(trackMarquee.startNm, trackMarquee.currentNm) /
                                waferWidth) *
                              100;
                            const maxPct =
                              (Math.max(trackMarquee.startNm, trackMarquee.currentNm) /
                                waferWidth) *
                              100;
                            return (
                              <div
                                className="absolute top-0 bottom-0 bg-sky-400/20 border-x border-sky-400 pointer-events-none z-30"
                                style={{
                                  left: `${minPct}%`,
                                  width: `${Math.max(0.5, maxPct - minPct)}%`,
                                }}
                              />
                            );
                          })()}

                          {/* Apertures / Chrome Blockers */}
                          {wins.map((win, wIdx) => {
                            const leftPct = (win.xStart / waferWidth) * 100;
                            const widthPct = ((win.xEnd - win.xStart) / waferWidth) * 100;
                            const isFeatActive =
                              isSelected &&
                              (selectedWindowIds.includes(win.id) ||
                                Boolean(
                                  dragState?.initialWindows?.some((t) => t.id === win.id)
                                ));
                            const widthNm = Math.round(win.xEnd - win.xStart);

                            return (
                              <div
                                key={win.id || `stack_w_${wIdx}`}
                                onClick={(e) => {
                                  if (!isSelected) return;
                                  e.stopPropagation();
                                }}
                                onPointerDown={
                                  isSelected
                                    ? (e) => onWindowPointerDown(e, win, 'move')
                                    : undefined
                                }
                                className={`absolute top-0.5 bottom-0.5 rounded flex items-center justify-center ${
                                  isSelected ? 'cursor-grab' : 'cursor-pointer'
                                } ${
                                  isFeatActive
                                    ? 'ring-2 ring-white z-20 brightness-110'
                                    : isSelected
                                    ? 'z-10 hover:brightness-110'
                                    : 'z-10 opacity-85 hover:opacity-100'
                                } ${isLF ? 'border' : ''}`}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${Math.max(0.8, widthPct)}%`,
                                  backgroundColor: isLF ? '#0f172a' : color,
                                  borderColor: isLF ? color : undefined,
                                }}
                                title={`${mask.name} · W-${wIdx + 1}: ${fmtCoord(win.xStart, apertureUnit)} – ${fmtCoord(win.xEnd, apertureUnit)} (Δ ${fmtCoord(widthNm, apertureUnit)})`}
                              >
                                {isSelected && (
                                  <>
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/30"
                                      onPointerDown={(e) =>
                                        onWindowPointerDown(e, win, 'resize-start')
                                      }
                                      title="Drag to resize left edge"
                                    />
                                    {widthPct >= 7 && (
                                      <span className="font-mono text-[9.5px] font-bold px-1 rounded bg-black/50 text-white pointer-events-none truncate tabular-nums">
                                        {fmtCoord(widthNm, apertureUnit)}
                                      </span>
                                    )}
                                    <div
                                      className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/30"
                                      onPointerDown={(e) =>
                                        onWindowPointerDown(e, win, 'resize-end')
                                      }
                                      title="Drag to resize right edge"
                                    />
                                  </>
                                )}
                              </div>
                            );
                          })}

                          {/* Vertical hover hairline */}
                          {hoverNm !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-cyan-400/80 pointer-events-none z-30"
                              style={{ left: `${(hoverNm / waferWidth) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Compact Stack Footer Status Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-800 bg-slate-900/60 text-[11px] shrink-0">
        <div className="flex items-center gap-2 min-w-0 truncate">
          {selectedMask ? (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedColor }}
              />
              <span className="font-semibold text-slate-200 truncate">
                {selectedMask.layerCode ? `${selectedMask.layerCode} · ` : ''}
                {selectedMask.name}
              </span>
              {selectedFeatureSummary && (
                <span className="font-mono text-[10.5px] text-sky-300 tabular-nums truncate">
                  · {selectedFeatureSummary}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500">Select any row to inspect or adjust alignment</span>
          )}
        </div>
        <span className="hidden md:inline font-mono text-[10px] text-slate-500 tabular-nums shrink-0">
          Drag/resize selected row · ←/→ {fmtCoord(fineNm, apertureUnit)} (Shift{' '}
          {fmtCoord(coarseNm, apertureUnit)})
        </span>
      </div>
    </div>
  );
};
