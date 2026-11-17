/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { MaskWindow, ProcessStep } from '../types/microfab';
import { resolveResistMaterialId } from '../lib/materials';
import { Plus, Trash2, ArrowLeftRight, MoveHorizontal, GripVertical, Scan, Edit2, Check, Lock, Unlock, ChevronUp, ChevronDown } from 'lucide-react';

interface MaskEditorProps {
  step: ProcessStep;
  waferWidth: number; // in nm
  onUpdateStep: (updated: ProcessStep) => void;
  onOpenMaskLevels?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

interface DragState {
  winId: string;
  type: 'resize-start' | 'resize-end' | 'move';
  startClientX: number;
  initialXStart: number;
  initialXEnd: number;
}

interface UmInputProps {
  valueNm: number;
  minNm?: number;
  maxNm: number;
  stepUm?: string;
  disabled?: boolean;
  onCommitNm: (valNm: number) => void;
  title?: string;
  className?: string;
}

const UmNumberInput: React.FC<UmInputProps> = ({
  valueNm,
  minNm = 0,
  maxNm,
  stepUm = '0.05',
  disabled = false,
  onCommitNm,
  title,
  className,
}) => {
  const formatted = (valueNm / 1000).toFixed(2);
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => {
    if (!isFocused) {
      setDraft(formatted);
    }
  }, [formatted, isFocused]);

  return (
    <input
      type="number"
      step={stepUm}
      min={(minNm / 1000).toFixed(2)}
      max={(maxNm / 1000).toFixed(2)}
      disabled={disabled}
      value={isFocused ? draft : formatted}
      title={title}
      onFocus={(e) => {
        if (disabled) return;
        setIsFocused(true);
        setDraft(formatted);
        e.target.select();
      }}
      onChange={(e) => {
        if (disabled) return;
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed) && parsed >= minNm / 1000) {
          onCommitNm(parsed * 1000);
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(draft);
        if (Number.isFinite(parsed)) {
          onCommitNm(Math.max(minNm, Math.min(maxNm, parsed * 1000)));
        }
        setIsFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(formatted);
          setIsFocused(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={
        className ||
        `w-16 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-right focus:outline-none focus:border-sky-500 ${
          disabled ? 'opacity-50 cursor-not-allowed text-slate-400' : ''
        }`
      }
    />
  );
};

export const MaskEditor: React.FC<MaskEditorProps> = ({
  step,
  waferWidth,
  onUpdateStep,
  onOpenMaskLevels,
  isMinimized: isMinimizedProp,
  onToggleMinimize,
}) => {
  const litho = step.lithography;
  if (!litho) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isEditingMaskName, setIsEditingMaskName] = useState<boolean>(false);
  const [editingMaskName, setEditingMaskName] = useState<string>(litho.maskName || '');
  const [internalMinimized, setInternalMinimized] = useState<boolean>(false);

  const isMinimized = isMinimizedProp ?? internalMinimized;
  const handleToggleMinimize =
    onToggleMinimize ?? (() => setInternalMinimized((prev) => !prev));

  useEffect(() => {
    setIsEditingMaskName(false);
    setEditingMaskName(step.lithography?.maskName || '');
  }, [step.id, step.lithography?.maskName]);

  const handleSaveMaskName = () => {
    const trimmed = editingMaskName.trim();
    if (trimmed && trimmed !== litho.maskName) {
      onUpdateStep({
        ...step,
        lithography: {
          ...litho,
          maskName: trimmed,
        },
      });
    } else {
      setEditingMaskName(litho.maskName || '');
    }
    setIsEditingMaskName(false);
  };

  const windows = litho.windows || [];

  const handleAddWindow = () => {
    // Add default window in the center 1/3 of the wafer
    const start = Math.round(waferWidth * 0.35);
    const end = Math.round(waferWidth * 0.65);
    const newWin: MaskWindow = {
      id: `w_${Date.now()}`,
      xStart: start,
      xEnd: end,
    };
    const updatedLitho = {
      ...litho,
      windows: [...windows, newWin],
    };
    onUpdateStep({
      ...step,
      lithography: updatedLitho,
    });
    setActiveWindowId(newWin.id);
  };

  const handleRemoveWindow = (id: string) => {
    const updatedLitho = {
      ...litho,
      windows: windows.filter((w) => w.id !== id),
    };
    onUpdateStep({
      ...step,
      lithography: updatedLitho,
    });
    if (activeWindowId === id) setActiveWindowId(null);
  };

  const handleUpdateWindowCoord = (
    id: string,
    field: 'xStart' | 'xEnd',
    val: number
  ) => {
    const roundedVal = Math.round(val);
    const updatedLitho = {
      ...litho,
      windows: windows.map((w) => {
        if (w.id !== id) return w;

        if (w.fixedWidth) {
          const width = Math.max(10, w.xEnd - w.xStart);
          if (field === 'xStart') {
            const nextStart = Math.max(0, Math.min(waferWidth - width, roundedVal));
            return {
              ...w,
              xStart: nextStart,
              xEnd: nextStart + width,
            };
          } else {
            const nextEnd = Math.max(width, Math.min(waferWidth, roundedVal));
            return {
              ...w,
              xStart: nextEnd - width,
              xEnd: nextEnd,
            };
          }
        }

        const clamped = Math.max(0, Math.min(waferWidth, roundedVal));
        const updated = { ...w, [field]: clamped };
        // Ensure start <= end when unlocked
        if (updated.xStart > updated.xEnd) {
          if (field === 'xStart') updated.xEnd = updated.xStart;
          else updated.xStart = updated.xEnd;
        }
        return updated;
      }),
    };
    onUpdateStep({
      ...step,
      lithography: updatedLitho,
    });
  };

  const handleToggleFixedWidth = (id: string) => {
    const updatedLitho = {
      ...litho,
      windows: windows.map((w) =>
        w.id === id ? { ...w, fixedWidth: !w.fixedWidth } : w
      ),
    };
    onUpdateStep({
      ...step,
      lithography: updatedLitho,
    });
  };

  const handleUpdateWindowWidth = (id: string, targetWidthNm: number) => {
    const clampedWidth = Math.max(10, Math.min(waferWidth, Math.round(targetWidthNm)));
    const updatedLitho = {
      ...litho,
      windows: windows.map((w) => {
        if (w.id !== id || w.fixedWidth) return w;
        const center = (w.xStart + w.xEnd) / 2;
        const half = clampedWidth / 2;
        let nextStart = center - half;
        let nextEnd = center + half;

        // Keep requested width within wafer bounds if expanding past edge
        if (nextStart < 0) {
          nextStart = 0;
          nextEnd = Math.min(waferWidth, clampedWidth);
        } else if (nextEnd > waferWidth) {
          nextEnd = waferWidth;
          nextStart = Math.max(0, waferWidth - clampedWidth);
        }

        return {
          ...w,
          xStart: Math.round(nextStart),
          xEnd: Math.round(nextEnd),
        };
      }),
    };
    onUpdateStep({
      ...step,
      lithography: updatedLitho,
    });
  };

  const maskField = litho.maskField ?? 'dark-field';
  const isLightField = maskField === 'light-field';
  const featureNoun = isLightField ? 'blocker' : 'aperture';
  const featureNounCap = isLightField ? 'Blocker' : 'Aperture';

  const togglePolarity = () => {
    const newPol = litho.polarity === 'positive' ? 'negative' : 'positive';
    onUpdateStep({
      ...step,
      lithography: {
        ...litho,
        polarity: newPol,
        resistMaterialId: resolveResistMaterialId(newPol, litho.resistMaterialId),
      },
    });
  };

  const toggleMaskField = () => {
    const nextField = isLightField ? 'dark-field' : 'light-field';
    onUpdateStep({
      ...step,
      lithography: {
        ...litho,
        maskField: nextField,
      },
    });
  };

  // Pointer drag start handler
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    win: MaskWindow,
    type: 'resize-start' | 'resize-end' | 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveWindowId(win.id);
    setDragState({
      winId: win.id,
      type,
      startClientX: e.clientX,
      initialXStart: win.xStart,
      initialXEnd: win.xEnd,
    });
  };

  // Pointer move handler
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const pxToNm = waferWidth / rect.width;
    const deltaNm = (e.clientX - dragState.startClientX) * pxToNm;
    // Snap to 50 nm precision
    const snap = 50;

    let updatedWindows = windows;

    if (dragState.type === 'resize-start') {
      const rawStart = dragState.initialXStart + deltaNm;
      const snappedStart = Math.round(rawStart / snap) * snap;
      // Minimum aperture width 100 nm
      const clampedStart = Math.max(0, Math.min(dragState.initialXEnd - 100, snappedStart));

      updatedWindows = windows.map((w) =>
        w.id === dragState.winId ? { ...w, xStart: clampedStart } : w
      );
    } else if (dragState.type === 'resize-end') {
      const rawEnd = dragState.initialXEnd + deltaNm;
      const snappedEnd = Math.round(rawEnd / snap) * snap;
      const clampedEnd = Math.max(dragState.initialXStart + 100, Math.min(waferWidth, snappedEnd));

      updatedWindows = windows.map((w) =>
        w.id === dragState.winId ? { ...w, xEnd: clampedEnd } : w
      );
    } else if (dragState.type === 'move') {
      const width = dragState.initialXEnd - dragState.initialXStart;
      const rawStart = dragState.initialXStart + deltaNm;
      const snappedStart = Math.round(rawStart / snap) * snap;
      const clampedStart = Math.max(0, Math.min(waferWidth - width, snappedStart));
      const clampedEnd = clampedStart + width;

      updatedWindows = windows.map((w) =>
        w.id === dragState.winId
          ? { ...w, xStart: clampedStart, xEnd: clampedEnd }
          : w
      );
    }

    onUpdateStep({
      ...step,
      lithography: {
        ...litho,
        windows: updatedWindows,
      },
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
      setDragState(null);
    }
  };

  if (isMinimized) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 shrink-0">
            Photomask Track
          </span>
          {step.side === 'back' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-semibold shrink-0">
              Backside
            </span>
          )}
          {step.side === 'both' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-semibold shrink-0">
              Both Sides
            </span>
          )}
          <span className="text-xs text-slate-600 shrink-0">·</span>
          <span className="text-xs text-slate-300 font-mono truncate">
            {litho.maskName || 'Photomask Layer'}
          </span>
          <span className="text-xs text-slate-600 shrink-0 hidden sm:inline">·</span>
          <span className="text-[11px] font-mono text-slate-400 shrink-0 hidden sm:inline">
            <span className={isLightField ? 'text-sky-300' : 'text-slate-200'}>
              {isLightField ? 'Light-Field' : 'Dark-Field'}
            </span>
            {' · '}
            <span className="capitalize text-slate-200">{litho.polarity} resist</span>
            {' · '}
            {windows.length} {windows.length === 1 ? featureNoun : `${featureNoun}s`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenMaskLevels && (
            <button
              type="button"
              onClick={onOpenMaskLevels}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 transition-colors"
              title="Open Photolithography Mask Levels Panel"
            >
              <Scan className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mask Levels</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleMinimize}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Expand Photomask Track"
          >
            <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Expand</span>
          </button>
        </div>
      </div>
    );
  }

  const outcomeSummary = isLightField
    ? litho.polarity === 'positive'
      ? 'Quartz bg passes UV (dissolves resist) · Chrome blocks protect resist underneath'
      : 'Quartz bg passes UV (crosslinks resist) · Chrome blocks dissolve resist underneath'
    : litho.polarity === 'positive'
    ? 'Chrome bg blocks UV · Clear apertures expose & dissolve resist'
    : 'Chrome bg blocks UV · Clear apertures expose & crosslink resist';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-xs font-semibold tracking-wider uppercase text-sky-400">
            Photomask Track
          </span>
          {step.side === 'back' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-semibold">
              Backside
            </span>
          )}
          {step.side === 'both' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-semibold">
              Both Sides
            </span>
          )}
          <span className="text-xs text-slate-500">·</span>
          {isEditingMaskName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                value={editingMaskName}
                onChange={(e) => setEditingMaskName(e.target.value)}
                onBlur={handleSaveMaskName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveMaskName();
                  if (e.key === 'Escape') {
                    setEditingMaskName(litho.maskName || '');
                    setIsEditingMaskName(false);
                  }
                }}
                placeholder="Mask name..."
                className="px-2 py-0.5 rounded bg-slate-950 border border-sky-500 text-xs text-white font-mono focus:outline-none w-36 sm:w-44"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSaveMaskName();
                }}
                className="p-0.5 text-emerald-400 hover:text-emerald-300"
                title="Save Mask Name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingMaskName(litho.maskName || 'Photomask Layer');
                setIsEditingMaskName(true);
              }}
              className="group/maskname flex items-center gap-1.5 text-xs text-slate-300 hover:text-white font-mono px-1.5 py-0.5 rounded hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-colors"
              title="Click to rename assigned mask"
            >
              <span className="truncate max-w-[140px] sm:max-w-none">{litho.maskName || 'Photomask Layer'}</span>
              <Edit2 className="w-3 h-3 text-slate-500 group-hover/maskname:text-sky-400 transition-colors shrink-0" />
            </button>
          )}
          <span className="hidden md:inline text-xs text-slate-500">·</span>
          <span className="hidden md:inline text-[11px] text-slate-400">
            Drag center to move · Drag left/right borders to resize
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleMaskField}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              isLightField
                ? 'bg-sky-950/60 hover:bg-sky-900/60 text-sky-200 border-sky-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={
              isLightField
                ? 'Light-Field Mask: clear quartz background; movable blocks are opaque chrome blockers. Click to switch to Dark-Field.'
                : 'Dark-Field Mask: opaque chrome background; movable blocks are clear UV apertures. Click to switch to Light-Field.'
            }
          >
            <span
              className={`w-3 h-3 rounded-xs border shrink-0 flex items-center justify-center ${
                isLightField
                  ? 'bg-sky-200/85 border-sky-300'
                  : 'bg-slate-950 border-slate-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-[1px] ${
                  isLightField ? 'bg-slate-900' : 'bg-amber-300'
                }`}
              />
            </span>
            <span>
              Mask: <strong className="text-white">{isLightField ? 'Light-Field' : 'Dark-Field'}</strong>
            </span>
          </button>

          <button
            type="button"
            onClick={togglePolarity}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Switch Photoresist Tone: Positive (UV-exposed dissolves) vs Negative (UV-exposed crosslinks & stays)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Resist: <strong className="capitalize text-white">{litho.polarity}</strong>
            </span>
          </button>

          <button
            type="button"
            onClick={handleAddWindow}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm"
            title={
              isLightField
                ? 'Add an opaque chrome blocker island on the clear quartz mask'
                : 'Add a clear quartz aperture window in the opaque chrome mask'
            }
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add {featureNounCap}</span>
          </button>

          {onOpenMaskLevels && (
            <button
              type="button"
              onClick={onOpenMaskLevels}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 transition-colors"
              title="Open Photolithography Mask Levels Panel"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Mask Levels</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleMinimize}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Minimize Photomask Track to maximize cross-section view"
          >
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden xl:inline">Minimize</span>
          </button>
        </div>
      </div>

      {/* Visual Photomask Bar */}
      <div className="relative my-2 select-none">
        <div className="text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono mb-1">
          <span>0 µm</span>
          <span className="text-slate-400 truncate max-w-[75%]">
            {dragState ? (
              <span className="text-amber-300 font-semibold animate-pulse">
                {dragState.type === 'move'
                  ? `Sliding ${featureNounCap}...`
                  : `Resizing ${featureNounCap} Boundary...`}
              </span>
            ) : (
              <span className={isLightField ? 'text-sky-300/90' : 'text-slate-400'}>
                {outcomeSummary}
              </span>
            )}
          </span>
          <span>{(waferWidth / 1000).toFixed(1)} µm</span>
        </div>

        {/* Chrome base (Dark-Field) OR Clear Quartz Glass (Light-Field) */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative h-11 w-full rounded-lg overflow-hidden shadow-inner select-none touch-none border ${
            isLightField
              ? 'bg-gradient-to-b from-sky-200/35 via-cyan-100/25 to-amber-100/30 border-sky-400/50'
              : 'bg-slate-950 border-slate-700'
          }`}
        >
          {/* Mask Background Texture */}
          {isLightField ? (
            <div
              className="absolute inset-0 pointer-events-none flex items-center justify-center"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, rgba(125,211,252,0.12) 1px, transparent 1px)',
                backgroundSize: '24px 100%',
              }}
            >
              {windows.length === 0 && (
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-sky-100/80">
                  Clear Quartz Field (100% UV Transmitting)
                </span>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 bg-slate-800/80 opacity-40 pattern-crosshatch flex items-center justify-center">
              {windows.length === 0 && (
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
                  Opaque Chrome Field (0% UV Transmitting)
                </span>
              )}
            </div>
          )}

          {/* Movable Mask Blocks: Chrome Blockers (Light-Field) OR Clear Apertures (Dark-Field) */}
          {windows.map((win) => {
            const leftPct = (win.xStart / waferWidth) * 100;
            const widthPct = Math.max(1.5, ((win.xEnd - win.xStart) / waferWidth) * 100);
            const isActive = activeWindowId === win.id;
            const isDraggingThis = dragState?.winId === win.id;

            const blockClasses = isLightField
              ? isActive || isDraggingThis
                ? 'bg-slate-900 border-y-2 border-amber-400 shadow-xl'
                : 'bg-slate-900/95 border-y border-slate-300/80 hover:bg-slate-800 shadow-md'
              : isActive || isDraggingThis
              ? 'bg-amber-400/40 border-y border-amber-400 shadow-xl'
              : 'bg-emerald-400/25 border-y border-emerald-400/80 hover:bg-emerald-400/35';

            const handleClasses = isLightField
              ? isActive || isDraggingThis
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                : 'bg-slate-300/90 hover:bg-white text-slate-950'
              : 'bg-amber-500/80 hover:bg-amber-400 text-slate-950';

            return (
              <div
                key={win.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveWindowId(win.id);
                }}
                className={`absolute top-0 bottom-0 transition-shadow select-none group/box ${blockClasses}`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  ...(isLightField
                    ? {
                        backgroundImage:
                          'repeating-linear-gradient(135deg, rgba(148,163,184,0.16) 0, rgba(148,163,184,0.16) 5px, transparent 5px, transparent 10px)',
                      }
                    : {}),
                }}
              >
                {/* Left Resize Handle (disabled when width is fixed) */}
                {!win.fixedWidth && (
                  <div
                    onPointerDown={(e) => handlePointerDown(e, win, 'resize-start')}
                    className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center z-20 transition-all select-none group/left ${handleClasses}`}
                    title={`Drag to resize ${featureNoun} left boundary`}
                  >
                    <div className="w-1 h-5 rounded-full bg-slate-950/70" />
                  </div>
                )}

                {/* Central Drag & Slide Area */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, win, 'move')}
                  className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing px-3 overflow-hidden select-none"
                  title={
                    win.fixedWidth
                      ? `Width locked — drag to slide ${featureNoun}`
                      : `Click and drag to slide ${featureNoun}`
                  }
                >
                  <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-white drop-shadow truncate select-none pointer-events-none">
                    {win.fixedWidth ? (
                      <Lock className="w-3 h-3 text-amber-300 flex-shrink-0" />
                    ) : (
                      <MoveHorizontal
                        className={`w-3 h-3 flex-shrink-0 ${
                          isLightField ? 'text-slate-300' : 'text-amber-300'
                        }`}
                      />
                    )}
                    <span>{((win.xEnd - win.xStart) / 1000).toFixed(2)} µm</span>
                  </div>
                </div>

                {/* Right Resize Handle (disabled when width is fixed) */}
                {!win.fixedWidth && (
                  <div
                    onPointerDown={(e) => handlePointerDown(e, win, 'resize-end')}
                    className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center z-20 transition-all select-none group/right ${handleClasses}`}
                    title={`Drag to resize ${featureNoun} right boundary`}
                  >
                    <div className="w-1 h-5 rounded-full bg-slate-950/70" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Numerical Apertures List & Controls */}
      {windows.length > 0 && (
        <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {windows.map((win, idx) => {
            const isSelected = activeWindowId === win.id;
            const winWidth = Math.max(10, win.xEnd - win.xStart);
            const isFixed = Boolean(win.fixedWidth);

            return (
              <div
                key={win.id}
                onClick={() => setActiveWindowId(win.id)}
                className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? 'bg-slate-800/90 border border-sky-500/50'
                    : 'bg-slate-950/60 border border-slate-800/80 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center font-mono text-[11px] text-slate-300">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-300">
                    {featureNounCap} #{idx + 1}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border ${
                      isLightField
                        ? 'bg-slate-900 border-slate-600 text-slate-300'
                        : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    {isLightField ? 'Chrome Blocker' : 'Clear Aperture'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div
                    className="flex items-center gap-1 font-mono text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-sky-400">W:</span>
                    <UmNumberInput
                      valueNm={winWidth}
                      minNm={10}
                      maxNm={waferWidth}
                      disabled={isFixed}
                      onCommitNm={(valNm) => handleUpdateWindowWidth(win.id, valNm)}
                      title={
                        isFixed
                          ? 'Width is fixed (click Fix Width toggle to unlock)'
                          : `Edit ${featureNoun} width (keeps block centered)`
                      }
                    />
                    <span className="text-slate-500">µm</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFixedWidth(win.id)}
                      className={`ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-sans font-medium transition-colors ${
                        isFixed
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                      }`}
                      title={
                        isFixed
                          ? `Width Fixed: editing X start or X end slides the ${featureNoun} without changing width`
                          : `Fix Width: lock width so editing X start or X end moves the ${featureNoun} cleanly`
                      }
                    >
                      {isFixed ? (
                        <Lock className="w-3 h-3 shrink-0" />
                      ) : (
                        <Unlock className="w-3 h-3 shrink-0" />
                      )}
                      <span>{isFixed ? 'Width Fixed' : 'Fix Width'}</span>
                    </button>
                  </div>

                  <div
                    className="flex items-center gap-1 font-mono text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-slate-400">X:</span>
                    <UmNumberInput
                      valueNm={win.xStart}
                      minNm={0}
                      maxNm={isFixed ? Math.max(0, waferWidth - winWidth) : waferWidth}
                      onCommitNm={(valNm) => handleUpdateWindowCoord(win.id, 'xStart', valNm)}
                      title={
                        isFixed
                          ? `Edit start X (slides ${featureNoun} with fixed width)`
                          : `Edit ${featureNoun} start X`
                      }
                      className="w-14 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-right focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-slate-500">→</span>
                    <UmNumberInput
                      valueNm={win.xEnd}
                      minNm={isFixed ? winWidth : 0}
                      maxNm={waferWidth}
                      onCommitNm={(valNm) => handleUpdateWindowCoord(win.id, 'xEnd', valNm)}
                      title={
                        isFixed
                          ? `Edit end X (slides ${featureNoun} with fixed width)`
                          : `Edit ${featureNoun} end X`
                      }
                      className="w-14 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-right focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-slate-500">µm</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveWindow(win.id);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title={`Delete ${featureNoun}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
