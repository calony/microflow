/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ProcessFlow,
  ProcessStep,
  ProcessStepType,
  PhotomaskLevel,
} from '../types/microfab';
import { PRESET_PROCESS_FLOWS } from '../lib/presets';
import { simulateCrossSection, buildRenderPolygons } from '../lib/simulationEngine';
import { getMaterialById } from '../lib/materials';
import { calculateMaskMetrics, RETICLE_PALETTE } from '../lib/maskUtils';
import {
  FlowImportMode,
  MaskAssignmentMode,
  ImportInsertMode,
  WidthScaleMode,
  ImportBlockMode,
  normalizeIncomingFlow,
  describeProcessStep,
  summarizeFlowForPreview,
  getMaskIdsUsedBySteps,
  mergeImportedFlowItems,
} from '../lib/flowImportUtils';
import { ThicknessUnit, formatThickness } from '../lib/units';
import { SvgPatterns } from './SvgPatterns';
import {
  X,
  Upload,
  FolderOpen,
  FileJson,
  Check,
  Eye,
  Layers,
  Scan,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  CheckSquare,
  Square,
  RotateCcw,
  HelpCircle,
} from 'lucide-react';

interface ImportFromFlowModalProps {
  currentFlow: ProcessFlow;
  activeStepIndex: number;
  thicknessUnit?: ThicknessUnit;
  initialMode?: FlowImportMode;
  onApplyImport: (nextFlow: ProcessFlow, nextActiveStepIndex?: number) => void;
  onClose: () => void;
  onOpenHelp?: () => void;
}

const STEP_TYPE_LABEL: Record<ProcessStepType, string> = {
  substrate: 'Sub',
  deposition: 'Dep',
  lithography: 'Litho',
  etch: 'Etch',
  strip: 'Strip',
  liftoff: 'Lift-off',
  cmp: 'CMP',
  anneal: 'Anneal',
  bonding: 'Bond',
  dicing: 'Dice',
  'tape-frame': 'Tape',
};

const STEP_TYPE_DOT: Record<ProcessStepType, string> = {
  substrate: 'bg-slate-400',
  deposition: 'bg-emerald-400',
  lithography: 'bg-sky-400',
  etch: 'bg-rose-400',
  strip: 'bg-amber-400',
  liftoff: 'bg-fuchsia-400',
  cmp: 'bg-teal-400',
  anneal: 'bg-orange-400',
  bonding: 'bg-indigo-400',
  dicing: 'bg-slate-300',
  'tape-frame': 'bg-cyan-400',
};

export const ImportFromFlowModal: React.FC<ImportFromFlowModalProps> = ({
  currentFlow,
  activeStepIndex,
  thicknessUnit = 'nm',
  initialMode = 'replace-flow',
  onApplyImport,
  onClose,
  onOpenHelp,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceFlow, setSourceFlow] = useState<ProcessFlow | null>(null);
  const [sourceOriginLabel, setSourceOriginLabel] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Import configuration state
  const [importMode, setImportMode] = useState<FlowImportMode>(initialMode);
  const [maskAssignmentMode, setMaskAssignmentMode] =
    useState<MaskAssignmentMode>('link-to-steps');
  const [insertMode, setInsertMode] = useState<ImportInsertMode>('end');
  const [widthScaleMode, setWidthScaleMode] = useState<WidthScaleMode>('scale');
  const [blockMode, setBlockMode] = useState<ImportBlockMode>('preserve-blocks');
  const [blockName, setBlockName] = useState<string>('');

  // Checklist selections
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
  const [selectedMaskIds, setSelectedMaskIds] = useState<Set<string>>(new Set());

  // Preview state
  const [previewTab, setPreviewTab] = useState<'source' | 'projected'>('source');
  const [inspectedStepIndex, setInspectedStepIndex] = useState<number>(-1);

  // Initialize selections whenever a new sourceFlow is loaded
  const loadNormalizedSource = (normalized: ProcessFlow, originLabel: string) => {
    setSourceFlow(normalized);
    setSourceOriginLabel(originLabel);
    setLoadError(null);

    const allStepIds = new Set(normalized.steps.map((s) => s.id));
    const allMaskIds = new Set((normalized.masks || []).map((m) => m.id));
    setSelectedStepIds(allStepIds);
    setSelectedMaskIds(allMaskIds);
    setBlockName(`Imported: ${normalized.title}`);

    // Default inspection step: last enabled step (or substrate -1 if no steps)
    let lastEnabled = -1;
    normalized.steps.forEach((s, idx) => {
      if (s.enabled !== false) lastEnabled = idx;
    });
    setInspectedStepIndex(lastEnabled >= 0 ? lastEnabled : normalized.steps.length - 1);
    setPreviewTab(initialMode === 'masks-only' ? 'source' : 'source');

    if (importMode !== 'replace-flow' && normalized.steps.length === 0 && (normalized.masks || []).length > 0) {
      setImportMode('masks-only');
    }
  };

  const handleLoadJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const normalized = normalizeIncomingFlow(parsed);
        if (!normalized) {
          setLoadError(
            'This file does not appear to be a valid MicroFlow recipe JSON (missing steps or masks array).'
          );
          return;
        }
        loadNormalizedSource(normalized, file.name);
      } catch {
        setLoadError(`Could not parse "${file.name}" as JSON.`);
      }
    };
    reader.onerror = () => {
      setLoadError(`Failed to read "${file.name}".`);
    };
    reader.readAsText(file);
  };

  const handleLoadPreset = (preset: ProcessFlow) => {
    const normalized = normalizeIncomingFlow(preset);
    if (normalized) {
      loadNormalizedSource(normalized, 'Built-in Template');
    }
  };

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Analytical summary of what the source flow is doing
  const sourceSummary = useMemo(
    () => (sourceFlow ? summarizeFlowForPreview(sourceFlow) : null),
    [sourceFlow]
  );

  // Source cross-section simulation at inspectedStepIndex
  const sourcePreviewRender = useMemo(() => {
    if (!sourceFlow) return null;
    const clampedRawIdx = Math.max(
      -1,
      Math.min(sourceFlow.steps.length - 1, inspectedStepIndex)
    );
    let enabledUpToRaw = 0;
    for (let i = 0; i <= clampedRawIdx; i++) {
      if (sourceFlow.steps[i]?.enabled !== false) {
        enabledUpToRaw++;
      }
    }
    const simIdx = clampedRawIdx < 0 ? -1 : enabledUpToRaw - 1;
    const mesh = simulateCrossSection(sourceFlow, simIdx);
    const polygons = buildRenderPolygons(mesh, sourceFlow.materials);
    return { mesh, polygons, stepIndex: clampedRawIdx };
  }, [sourceFlow, inspectedStepIndex]);

  // Projected merge result in currentFlow (for "Projected Result" preview tab & live counts)
  const mergeOptions = useMemo(
    () => ({
      importMode,
      selectedStepIds: Array.from(selectedStepIds),
      selectedMaskIds: Array.from(selectedMaskIds),
      maskAssignmentMode,
      insertMode,
      activeStepIndex,
      widthScaleMode,
      blockMode,
      blockName,
    }),
    [
      importMode,
      selectedStepIds,
      selectedMaskIds,
      maskAssignmentMode,
      insertMode,
      activeStepIndex,
      widthScaleMode,
      blockMode,
      blockName,
    ]
  );

  const projectedMergeResult = useMemo(() => {
    if (!sourceFlow) return null;
    return mergeImportedFlowItems(currentFlow, sourceFlow, mergeOptions);
  }, [currentFlow, sourceFlow, mergeOptions]);

  const projectedPreviewRender = useMemo(() => {
    if (previewTab !== 'projected' || !projectedMergeResult) return null;
    const nextFlow = projectedMergeResult.updatedFlow;
    let enabledCount = 0;
    nextFlow.steps.forEach((s) => {
      if (s.enabled !== false) enabledCount++;
    });
    const finalSimIdx = enabledCount - 1;
    const mesh = simulateCrossSection(nextFlow, finalSimIdx);
    const polygons = buildRenderPolygons(mesh, nextFlow.materials);
    return {
      flow: nextFlow,
      mesh,
      polygons,
      stepIndex: finalSimIdx,
    };
  }, [previewTab, projectedMergeResult]);

  // Helper: map step ID -> block
  const blockMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    (sourceFlow?.blocks || []).forEach((b) => {
      map.set(b.id, { name: b.name, color: b.color || '#38bdf8' });
    });
    return map;
  }, [sourceFlow]);

  // Helper: map mask ID -> step index/title in sourceFlow
  const sourceMaskUsageMap = useMemo(() => {
    const map = new Map<string, { stepIdx: number; stepTitle: string }>();
    if (!sourceFlow) return map;
    sourceFlow.steps.forEach((step, idx) => {
      if (step.type !== 'lithography') return;
      if (step.lithography?.maskId && !map.has(step.lithography.maskId)) {
        map.set(step.lithography.maskId, { stepIdx: idx, stepTitle: step.title });
      }
      step.variants?.forEach((v) => {
        if (v.type === 'lithography' && v.lithography?.maskId && !map.has(v.lithography.maskId)) {
          map.set(v.lithography.maskId, { stepIdx: idx, stepTitle: step.title });
        }
      });
    });
    (sourceFlow.masks || []).forEach((m) => {
      if (m.assignedStepId && !map.has(m.id)) {
        const idx = sourceFlow.steps.findIndex((s) => s.id === m.assignedStepId);
        if (idx >= 0) {
          map.set(m.id, { stepIdx: idx, stepTitle: sourceFlow.steps[idx].title });
        }
      }
    });
    return map;
  }, [sourceFlow]);

  const toggleStepSelection = (step: ProcessStep) => {
    setSelectedStepIds((prev) => {
      const next = new Set(prev);
      const willSelect = !next.has(step.id);
      if (willSelect) {
        next.add(step.id);
      } else {
        next.delete(step.id);
      }
      // In steps+masks mode, auto-select masks linked to a newly checked lithography step
      if (willSelect && importMode === 'steps-and-masks' && sourceFlow && step.type === 'lithography') {
        const linked = getMaskIdsUsedBySteps(sourceFlow, new Set([step.id]));
        if (linked.length > 0) {
          setSelectedMaskIds((prevMasks) => {
            const nextMasks = new Set(prevMasks);
            linked.forEach((id) => nextMasks.add(id));
            return nextMasks;
          });
        }
      }
      return next;
    });
  };

  const toggleBlockSelection = (blockId: string) => {
    if (!sourceFlow) return;
    const blockStepIds = sourceFlow.steps
      .filter((s) => s.blockId === blockId)
      .map((s) => s.id);
    if (blockStepIds.length === 0) return;
    const allSelected = blockStepIds.every((id) => selectedStepIds.has(id));
    setSelectedStepIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        blockStepIds.forEach((id) => next.delete(id));
      } else {
        blockStepIds.forEach((id) => next.add(id));
        if (importMode === 'steps-and-masks') {
          const linked = getMaskIdsUsedBySteps(sourceFlow, new Set(blockStepIds));
          if (linked.length > 0) {
            setSelectedMaskIds((pm) => {
              const nm = new Set(pm);
              linked.forEach((id) => nm.add(id));
              return nm;
            });
          }
        }
      }
      return next;
    });
  };

  const toggleMaskSelection = (maskId: string) => {
    setSelectedMaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(maskId)) next.delete(maskId);
      else next.add(maskId);
      return next;
    });
  };

  const handleSelectMasksUsedBySteps = () => {
    if (!sourceFlow) return;
    const used = getMaskIdsUsedBySteps(sourceFlow, selectedStepIds);
    setSelectedMaskIds(new Set(used));
  };

  const effectiveStepCount =
    importMode === 'replace-flow'
      ? sourceFlow?.steps.length || 0
      : importMode === 'masks-only' ? 0 : selectedStepIds.size;
  const effectiveMaskCount =
    importMode === 'replace-flow'
      ? (sourceFlow?.masks || []).length
      : importMode === 'steps-only' ? 0 : selectedMaskIds.size;
  const canApplyImport =
    Boolean(sourceFlow && projectedMergeResult) &&
    (importMode === 'replace-flow' || effectiveStepCount > 0 || effectiveMaskCount > 0);

  const handleConfirmImport = () => {
    if (!projectedMergeResult || !canApplyImport) return;
    onApplyImport(
      projectedMergeResult.updatedFlow,
      importMode === 'replace-flow'
        ? -1
        : projectedMergeResult.firstImportedStepIndex >= 0
        ? projectedMergeResult.firstImportedStepIndex
        : undefined
    );
    onClose();
  };

  // Render SVG Cross-Section Helper
  const renderCrossSectionSvg = (
    renderData: {
      mesh: ReturnType<typeof simulateCrossSection>;
      polygons: ReturnType<typeof buildRenderPolygons>;
      stepIndex: number;
    },
    targetFlow: ProcessFlow,
    patternPrefix: string
  ) => {
    const vbW = 460;
    const vbH = 220;
    const padX = 18;
    const padY = 16;
    const availW = vbW - padX * 2;
    const availH = vbH - padY * 2;
    const waferWidth = targetFlow.substrateWidth || 10000;

    let fMinX = 0;
    let fMaxX = waferWidth;
    let fMinY = renderData.mesh.minY ?? 0;
    let fMaxY = Math.max(renderData.mesh.maxY ?? 3000, 2200);
    for (const poly of renderData.polygons) {
      if (poly.xMin < fMinX) fMinX = poly.xMin;
      if (poly.xMax > fMaxX) fMaxX = poly.xMax;
      if (poly.yMin < fMinY) fMinY = poly.yMin;
      if (poly.yMax > fMaxY) fMaxY = poly.yMax;
      for (const p of poly.points) {
        if (p.x < fMinX) fMinX = p.x;
        if (p.x > fMaxX) fMaxX = p.x;
        if (p.y < fMinY) fMinY = p.y;
        if (p.y > fMaxY) fMaxY = p.y;
      }
    }

    const spanX = Math.max(100, fMaxX - fMinX);
    const spanY = Math.max(300, fMaxY - fMinY);
    const rawSx = availW / spanX;
    const rawSy = (availH * 0.68) / spanY;
    const rawWaferH = spanY * rawSy;
    const fitFactor = rawWaferH > availH ? availH / rawWaferH : 1;
    const sx = rawSx * fitFactor;
    const sy = rawSy * fitFactor;
    const offsetX = (vbW - spanX * sx) / 2 - fMinX * sx;
    const baseY = vbH / 2 + (spanY * sy) / 2;

    const toSvg = (x: number, y: number) => ({
      x: offsetX + x * sx,
      y: baseY - (y - fMinY) * sy,
    });

    const buildPath = (pts: { x: number; y: number }[]) => {
      if (pts.length < 3) return '';
      const first = toSvg(pts[0].x, pts[0].y);
      let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const pt = toSvg(pts[i].x, pts[i].y);
        d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
      return `${d} Z`;
    };

    const datumLeft = toSvg(fMinX, fMinY);
    const datumRight = toSvg(fMaxX, fMinY);

    return (
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full h-full block select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <SvgPatterns materials={targetFlow.materials} idPrefix={patternPrefix} />
        <g>
          {renderData.polygons.map((poly) => {
            const mat = getMaterialById(targetFlow.materials, poly.materialId);
            const d = buildPath(poly.points);
            if (!d) return null;
            return (
              <path
                key={poly.id}
                d={d}
                fill={`url(#${patternPrefix}mat-fill-${mat.id})`}
                stroke="#0f172a"
                strokeWidth="0.85"
                strokeLinejoin="round"
              />
            );
          })}
          <line
            x1={datumLeft.x}
            y1={datumLeft.y}
            x2={datumRight.x}
            y2={datumRight.y}
            stroke="#38bdf8"
            strokeOpacity={0.35}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </g>
      </svg>
    );
  };

  // Source step metadata for currently inspected preview step
  const inspectedStep =
    sourceFlow && inspectedStepIndex >= 0 ? sourceFlow.steps[inspectedStepIndex] : null;

  const widthMismatch =
    Boolean(sourceFlow) &&
    (sourceFlow?.substrateWidth || 10000) !== (currentFlow.substrateWidth || 10000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative flex flex-col w-full max-w-6xl h-[100dvh] sm:h-[92vh] sm:max-h-[860px] bg-slate-950 border-0 sm:border sm:border-slate-800 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLoadJsonFile(file);
            e.target.value = '';
          }}
        />

        {/* Modal Top Header */}
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <FileJson className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
                Import Process Flow
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Target: <span className="text-slate-200 font-medium">{currentFlow.title}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {' '}
                  · {formatThickness(currentFlow.substrateWidth, thicknessUnit)} wafer ·{' '}
                  {currentFlow.steps.length} steps · {(currentFlow.masks || []).length} masks
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sourceFlow && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Load JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceFlow(null);
                    setLoadError(null);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-300 transition-colors"
                  title="Choose a different template or JSON file"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Change Source</span>
                </button>
              </>
            )}
            {onOpenHelp && (
              <button
                type="button"
                onClick={onOpenHelp}
                className="p-1 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
                title="Help: Importing Steps, Masks & Blocks"
                aria-label="Help for Import Flow"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Validation Error Banner */}
        {loadError && (
          <div className="px-4 py-2 bg-rose-950/60 border-b border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setLoadError(null)}
              className="text-rose-300 hover:text-white text-[11px] font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Body: Source Picker OR Main Preview + Selection Workspace */}
        {!sourceFlow ? (
          <div
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleLoadJsonFile(file);
            }}
          >
            {/* JSON Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-colors ${
                isDraggingFile
                  ? 'border-sky-400 bg-sky-950/30'
                  : 'border-slate-700 hover:border-sky-500/60 bg-slate-900/50 hover:bg-slate-900/80'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto mb-2.5">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-white">
                Drop a MicroFlow <span className="font-mono text-sky-300">.json</span> file here, or click to browse
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
                Preview the incoming recipe before replacing your current flow or adding selected steps and masks.
              </p>
            </div>

            {/* Built-in Template Flows */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                  <span>Or Inspect &amp; Import From Built-In Process Flows</span>
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {PRESET_PROCESS_FLOWS.length} templates
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {PRESET_PROCESS_FLOWS.map((preset) => {
                  const lithoCount = preset.steps.filter((s) => s.type === 'lithography').length;
                  const maskCount = preset.masks?.length ?? lithoCount;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="text-left p-3 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/50 transition-colors group flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-100 group-hover:text-sky-300 transition-colors truncate">
                            {preset.title}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 shrink-0 transition-colors" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>
                      <div className="text-[10.5px] font-mono tabular-nums text-slate-500 pt-1.5 border-t border-slate-800/80">
                        {preset.steps.length} steps · {maskCount} mask{maskCount === 1 ? '' : 's'} ·{' '}
                        {formatThickness(preset.substrateWidth, thicknessUnit)} wafer
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            {/* LEFT COLUMN: Import Scope, Step & Mask Checklists, Merge Options */}
            <div className="flex-1 lg:max-w-[54%] flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-800 overflow-hidden">
              {/* Source Banner + Import Scope Control */}
              <div className="px-3.5 py-2.5 bg-slate-900/60 border-b border-slate-800 space-y-2.5 shrink-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
                      Source: {sourceOriginLabel}
                    </div>
                    <div className="text-xs font-bold text-white truncate">
                      {sourceFlow.title}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0 text-right">
                    <div>{formatThickness(sourceFlow.substrateWidth, thicknessUnit)} wafer</div>
                    <div className="text-slate-500">
                      {sourceFlow.steps.length} steps · {(sourceFlow.masks || []).length} masks
                    </div>
                  </div>
                </div>

                {/* Primary Mode Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex flex-wrap items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setImportMode('replace-flow')}
                      aria-pressed={importMode === 'replace-flow'}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        importMode === 'replace-flow'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Replace Flow
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('steps-and-masks')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        importMode === 'steps-and-masks'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Add Steps + Masks
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('steps-only')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        importMode === 'steps-only'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Add Steps Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('masks-only')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        importMode === 'masks-only'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Add Masks Only
                    </button>
                  </div>

                  {/* Mask Assignment Option (when Steps + Masks is active) */}
                  {importMode === 'steps-and-masks' && (
                    <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setMaskAssignmentMode('link-to-steps')}
                        className={`px-2 py-1 rounded-md font-medium transition-colors ${
                          maskAssignmentMode === 'link-to-steps'
                            ? 'bg-emerald-600/85 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Assign imported masks directly to the imported lithography steps"
                      >
                        Link Masks
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaskAssignmentMode('keep-unassigned')}
                        className={`px-2 py-1 rounded-md font-medium transition-colors ${
                          maskAssignmentMode === 'keep-unassigned'
                            ? 'bg-amber-600/85 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Import masks into the reticle library as Unassigned without binding them to steps"
                      >
                        Keep Unassigned
                      </button>
                    </div>
                  )}
                </div>

                {importMode === 'replace-flow' && (
                  <p className="text-[11px] text-sky-300">
                    Replaces the entire current recipe, including its substrate, steps, masks, and libraries.
                    The Process Traveller restarts at the starting wafer (step 0).
                  </p>
                )}
                {importMode === 'steps-only' && (
                  <p className="text-[11px] text-slate-400">
                    Photolithography steps will be imported with blank, unlinked aperture tracks. No masks will be added.
                  </p>
                )}
                {importMode === 'masks-only' && (
                  <p className="text-[11px] text-indigo-300">
                    Selected photomasks will be added to your reticle library as <span className="font-semibold">Unassigned</span> without modifying process steps.
                  </p>
                )}
                {importMode === 'steps-and-masks' && maskAssignmentMode === 'keep-unassigned' && (
                  <p className="text-[11px] text-amber-300/90">
                    Selected masks will be added as <span className="font-semibold">Unassigned</span> reticles; imported lithography steps will keep local track patterns without linking.
                  </p>
                )}
              </div>

              {/* Scrollable Checklists Area */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {importMode === 'replace-flow' && (
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      Complete Recipe · {sourceFlow.steps.length} Steps
                    </h3>
                    <p className="text-xs text-slate-400">
                      All steps and masks from this file will be loaded. Export your current recipe first if you want to keep a copy.
                    </p>
                    {sourceFlow.steps.map((step, index) => (
                      <div key={step.id} className="flex items-center gap-2 text-xs text-slate-200">
                        <span className="text-slate-500 font-mono">{index + 1}.</span>
                        <span>{step.title}</span>
                      </div>
                    ))}
                  </section>
                )}
                {/* STEPS CHECKLIST */}
                {importMode !== 'replace-flow' && importMode !== 'masks-only' && (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-sky-400" />
                          <span>Process Steps</span>
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {selectedStepIds.size} / {sourceFlow.steps.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStepIds(new Set(sourceFlow.steps.map((s) => s.id)))
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStepIds(new Set())}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {/* Quick Module / Block Toggles if source flow has blocks */}
                    {(sourceFlow.blocks || []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="text-slate-500 font-medium">Modules:</span>
                        {(sourceFlow.blocks || []).map((blk) => {
                          const blkSteps = sourceFlow.steps.filter((s) => s.blockId === blk.id);
                          const allChecked =
                            blkSteps.length > 0 &&
                            blkSteps.every((s) => selectedStepIds.has(s.id));
                          return (
                            <button
                              key={blk.id}
                              type="button"
                              onClick={() => toggleBlockSelection(blk.id)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                                allChecked
                                  ? 'bg-sky-950/50 border-sky-500/50 text-sky-200'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                              title={`Toggle all ${blkSteps.length} steps in module "${blk.name}"`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: blk.color }}
                              />
                              <span className="truncate max-w-[140px]">{blk.name}</span>
                              <span className="font-mono text-[10px] text-slate-500">
                                ({blkSteps.length})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {sourceFlow.steps.length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-800 text-xs text-slate-500 text-center">
                        This flow contains no process steps. Switch to Masks Only to inspect reticles.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {sourceFlow.steps.map((step, idx) => {
                          const checked = selectedStepIds.has(step.id);
                          const isInspected =
                            previewTab === 'source' && inspectedStepIndex === idx;
                          const blk = step.blockId ? blockMap.get(step.blockId) : undefined;
                          const summaryLine = describeProcessStep(
                            step,
                            sourceFlow.materials,
                            sourceFlow.masks
                          );
                          const isDisabled = step.enabled === false;

                          return (
                            <div
                              key={step.id}
                              onClick={() => {
                                setPreviewTab('source');
                                setInspectedStepIndex(idx);
                              }}
                              className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                isInspected
                                  ? 'bg-sky-950/35 border-sky-500/70'
                                  : checked
                                  ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                                  : 'bg-slate-950/60 border-slate-800/70 opacity-70 hover:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStepSelection(step);
                                }}
                                className="mt-0.5 text-slate-300 hover:text-sky-300 shrink-0"
                                aria-label={checked ? 'Unselect step' : 'Select step'}
                              >
                                {checked ? (
                                  <CheckSquare className="w-4 h-4 text-sky-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-600" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-mono text-[10.5px] tabular-nums text-slate-500 shrink-0">
                                      #{idx + 1}
                                    </span>
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        STEP_TYPE_DOT[step.type] || 'bg-slate-400'
                                      }`}
                                    />
                                    <span className="font-mono text-[10px] uppercase text-slate-400 shrink-0">
                                      {STEP_TYPE_LABEL[step.type] || step.type}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-100 truncate">
                                      {step.title}
                                    </span>
                                    {isDisabled && (
                                      <span className="text-[10px] font-mono text-amber-400/90 shrink-0">
                                        (disabled)
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono text-slate-500">
                                    {step.side === 'back' && <span>Back</span>}
                                    {blk && (
                                      <span
                                        className="truncate max-w-[90px]"
                                        style={{ color: blk.color }}
                                      >
                                        {blk.name}
                                      </span>
                                    )}
                                    <Eye
                                      className={`w-3 h-3 ${
                                        isInspected ? 'text-sky-400' : 'text-slate-600'
                                      }`}
                                    />
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {summaryLine}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {/* MASKS CHECKLIST */}
                {importMode !== 'replace-flow' && importMode !== 'steps-only' && (
                  <section className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Scan className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Photomask Levels</span>
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {selectedMaskIds.size} / {(sourceFlow.masks || []).length}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px]">
                        {importMode === 'steps-and-masks' && (
                          <button
                            type="button"
                            onClick={handleSelectMasksUsedBySteps}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700"
                            title="Select only masks linked to currently checked lithography steps"
                          >
                            Match Selected Steps
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMaskIds(
                              new Set((sourceFlow.masks || []).map((m) => m.id))
                            )
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedMaskIds(new Set())}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {(sourceFlow.masks || []).length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-800 text-xs text-slate-500 text-center">
                        This flow does not define any photomask levels.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {(sourceFlow.masks || []).map((mask: PhotomaskLevel, idx: number) => {
                          const checked = selectedMaskIds.has(mask.id);
                          const metrics = calculateMaskMetrics(
                            mask,
                            sourceFlow.substrateWidth || 10000
                          );
                          const isLF = mask.maskField === 'light-field';
                          const usage = sourceMaskUsageMap.get(mask.id);
                          const maskColor =
                            mask.color || RETICLE_PALETTE[idx % RETICLE_PALETTE.length];
                          const waferW = sourceFlow.substrateWidth || 10000;

                          return (
                            <div
                              key={mask.id}
                              onClick={() => toggleMaskSelection(mask.id)}
                              className={`px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-slate-900/75 border-slate-700 hover:border-slate-600'
                                  : 'bg-slate-950/60 border-slate-800/70 opacity-65 hover:opacity-100'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {checked ? (
                                    <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-600 shrink-0" />
                                  )}
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: maskColor }}
                                  />
                                  <span className="font-mono text-[10.5px] font-semibold text-slate-400 shrink-0">
                                    {mask.layerCode || `L${idx + 1}`}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-100 truncate">
                                    {mask.name}
                                  </span>
                                </div>

                                <span className="text-[10.5px] font-mono tabular-nums text-slate-400 shrink-0">
                                  {usage ? `Step #${usage.stepIdx + 1}` : 'Unassigned'}
                                </span>
                              </div>

                              {/* Miniature Track Bar */}
                              <div
                                className={`relative h-2 w-full rounded overflow-hidden mt-1.5 border border-slate-800 ${
                                  isLF ? 'bg-amber-400/20' : 'bg-slate-950'
                                }`}
                              >
                                {mask.windows.map((w) => {
                                  const leftPct = Math.max(
                                    0,
                                    Math.min(100, (w.xStart / waferW) * 100)
                                  );
                                  const widthPct = Math.max(
                                    0.8,
                                    Math.min(100 - leftPct, ((w.xEnd - w.xStart) / waferW) * 100)
                                  );
                                  return (
                                    <div
                                      key={w.id}
                                      className="absolute top-0 bottom-0"
                                      style={{
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        backgroundColor: isLF ? '#0f172a' : maskColor,
                                        opacity: isLF ? 0.92 : 0.85,
                                      }}
                                    />
                                  );
                                })}
                              </div>

                              <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-slate-400 mt-1">
                                <span>
                                  {isLF ? 'Light-Field' : 'Dark-Field'} ·{' '}
                                  {mask.polarity === 'negative' ? 'Neg' : 'Pos'} ·{' '}
                                  {metrics.apertureCount}{' '}
                                  {isLF
                                    ? metrics.apertureCount === 1
                                      ? 'blocker'
                                      : 'blockers'
                                    : metrics.apertureCount === 1
                                    ? 'aperture'
                                    : 'apertures'}
                                </span>
                                <span>{metrics.clearPercentage}% open</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>

              {/* Merge Options Strip */}
              {importMode !== 'replace-flow' && (
              <div className="px-3.5 py-2.5 bg-slate-900/70 border-t border-slate-800 space-y-2 shrink-0 text-[11px]">
                {importMode !== 'masks-only' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Insert:</span>
                      <div className="inline-flex bg-slate-950 border border-slate-800 rounded-md p-0.5">
                        <button
                          type="button"
                          onClick={() => setInsertMode('end')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            insertMode === 'end'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          At End
                        </button>
                        <button
                          type="button"
                          onClick={() => setInsertMode('after-active')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            insertMode === 'after-active'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {activeStepIndex >= 0
                            ? `After Step #${activeStepIndex + 1}`
                            : 'At Start'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="text-slate-400 font-medium">Blocks:</span>
                      <div className="inline-flex bg-slate-950 border border-slate-800 rounded-md p-0.5">
                        <button
                          type="button"
                          onClick={() => setBlockMode('preserve-blocks')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            blockMode === 'preserve-blocks'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Keep each imported step in its assigned block from the source flow"
                        >
                          Keep Assigned
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlockMode('single-block')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            blockMode === 'single-block'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Group all imported steps together inside one new import block"
                        >
                          Single Block
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlockMode('no-blocks')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                            blockMode === 'no-blocks'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Import all selected steps ungrouped with no blocks"
                        >
                          No Blocks
                        </button>
                      </div>
                      {blockMode === 'single-block' && (
                        <input
                          type="text"
                          value={blockName}
                          onChange={(e) => setBlockName(e.target.value)}
                          placeholder="Import block name"
                          className="w-36 sm:w-44 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 text-[11px] focus:outline-none focus:border-sky-500"
                        />
                      )}
                    </div>
                  </div>
                )}

                {widthMismatch && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
                    <span className="text-amber-300/90 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Wafer width differs ({formatThickness(sourceFlow.substrateWidth, thicknessUnit)} vs{' '}
                        {formatThickness(currentFlow.substrateWidth, thicknessUnit)}):
                      </span>
                    </span>
                    <div className="inline-flex bg-slate-950 border border-slate-800 rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={() => setWidthScaleMode('scale')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          widthScaleMode === 'scale'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Scale Proportionally
                      </button>
                      <button
                        type="button"
                        onClick={() => setWidthScaleMode('clamp')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          widthScaleMode === 'clamp'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Keep Dimensions
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* RIGHT COLUMN: Flow Preview & Analytical Breakdown */}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-950 overflow-y-auto">
              {/* Preview Header + Mode Switch */}
              <div className="px-3.5 py-2 bg-slate-900/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('source')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      previewTab === 'source'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Source Flow Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('projected')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      previewTab === 'projected'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Projected Result
                  </button>
                </div>

                {previewTab === 'source' && sourceFlow.steps.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums">
                    <button
                      type="button"
                      disabled={inspectedStepIndex <= -1}
                      onClick={() =>
                        setInspectedStepIndex((i) => Math.max(-1, i - 1))
                      }
                      className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-35"
                      title="Previous step"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectedStepIndex(-1)}
                      className={`px-2 py-0.5 rounded border ${
                        inspectedStepIndex === -1
                          ? 'bg-sky-950/60 border-sky-500/60 text-sky-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Sub
                    </button>
                    <span className="px-1.5 text-slate-300">
                      {inspectedStepIndex < 0
                        ? `0 / ${sourceFlow.steps.length}`
                        : `${inspectedStepIndex + 1} / ${sourceFlow.steps.length}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setInspectedStepIndex(sourceFlow.steps.length - 1)
                      }
                      className={`px-2 py-0.5 rounded border ${
                        inspectedStepIndex === sourceFlow.steps.length - 1
                          ? 'bg-sky-950/60 border-sky-500/60 text-sky-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Final
                    </button>
                    <button
                      type="button"
                      disabled={inspectedStepIndex >= sourceFlow.steps.length - 1}
                      onClick={() =>
                        setInspectedStepIndex((i) =>
                          Math.min(sourceFlow.steps.length - 1, i + 1)
                        )
                      }
                      className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-35"
                      title="Next step"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Cross-Section SVG Stage */}
              <div className="p-3.5 space-y-3">
                <div className="rounded-xl border border-slate-800 bg-[#060a12] overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-900/75 border-b border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                    {previewTab === 'source' ? (
                      <>
                        <span className="font-semibold text-slate-200 truncate">
                          {inspectedStep
                            ? `Step #${inspectedStepIndex + 1}: ${inspectedStep.title}`
                            : 'Starting Substrate Stack'}
                        </span>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {formatThickness(sourceFlow.substrateWidth, thicknessUnit)} wide
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-emerald-300 truncate">
                          Projected Final Structure ({projectedMergeResult?.updatedFlow.steps.length || 0} steps)
                        </span>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {formatThickness(currentFlow.substrateWidth, thicknessUnit)} wide
                        </span>
                      </>
                    )}
                  </div>

                  <div className="h-[205px] w-full">
                    {previewTab === 'source' && sourcePreviewRender
                      ? renderCrossSectionSvg(sourcePreviewRender, sourceFlow, 'imp-src-')
                      : previewTab === 'projected' && projectedPreviewRender
                      ? renderCrossSectionSvg(
                          projectedPreviewRender,
                          projectedPreviewRender.flow,
                          'imp-proj-'
                        )
                      : null}
                  </div>

                  <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                    <span className="truncate">
                      {previewTab === 'source'
                        ? inspectedStep
                          ? describeProcessStep(
                              inspectedStep,
                              sourceFlow.materials,
                              sourceFlow.masks
                            )
                          : sourceSummary?.substrateSummary
                        : importMode === 'replace-flow'
                        ? `Replaces "${currentFlow.title}" with "${sourceFlow.title}".`
                        : projectedMergeResult
                        ? `Adds ${projectedMergeResult.importedStepCount} step${
                            projectedMergeResult.importedStepCount === 1 ? '' : 's'
                          } and ${projectedMergeResult.importedMaskCount} mask${
                            projectedMergeResult.importedMaskCount === 1 ? '' : 's'
                          } to "${currentFlow.title}".`
                        : ''}
                    </span>
                  </div>
                </div>

                {/* Analytical "What This Flow Is Doing" Breakdown */}
                {sourceSummary && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                        <span>What This Flow Is Doing</span>
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {sourceSummary.enabledStepCount}/{sourceSummary.stepCount} active steps
                      </span>
                    </div>

                    {sourceSummary.description && (
                      <p className="text-[11.5px] text-slate-200 leading-relaxed whitespace-pre-line">
                        {sourceSummary.description}
                      </p>
                    )}

                    {/* Clean Typographic Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px] pt-0.5">
                      <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                          Starting Substrate
                        </div>
                        <div className="text-slate-200 font-medium mt-0.5">
                          {sourceSummary.substrateSummary}
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                          Final Stack Span
                        </div>
                        <div className="text-slate-200 font-mono tabular-nums mt-0.5">
                          {formatThickness(sourceSummary.finalHeightNm, thicknessUnit)} total height ·{' '}
                          {formatThickness(sourceSummary.waferWidthNm, thicknessUnit)} width
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                          Operation Sequence Mix
                        </div>
                        <div className="text-slate-200 font-mono tabular-nums mt-0.5">
                          {Object.entries(sourceSummary.typeCounts)
                            .filter(([, count]) => (count ?? 0) > 0)
                            .map(
                              ([type, count]) =>
                                `${count} ${STEP_TYPE_LABEL[type as ProcessStepType] || type}`
                            )
                            .join(' · ') || 'No process steps'}
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                          Masks &amp; Parameterization
                        </div>
                        <div className="text-slate-200 font-mono tabular-nums mt-0.5">
                          {sourceSummary.maskCount} mask{sourceSummary.maskCount === 1 ? '' : 's'} (
                          {sourceSummary.darkFieldCount} DF, {sourceSummary.lightFieldCount} LF)
                          {sourceSummary.blockCount > 0
                            ? ` · ${sourceSummary.blockCount} mod`
                            : ''}
                          {sourceSummary.variableCount > 0
                            ? ` · ${sourceSummary.variableCount} var`
                            : ''}
                        </div>
                      </div>
                    </div>

                    {/* Final Cross-Section Materials */}
                    {sourceSummary.finalMaterials.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                          Materials Remaining in Final Structure
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                          {sourceSummary.finalMaterials.map((mat) => (
                            <span
                              key={mat.id}
                              className="inline-flex items-center gap-1.5"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                                style={{ backgroundColor: mat.color }}
                              />
                              <span>
                                {mat.name}
                                {mat.formula ? (
                                  <span className="text-slate-500 font-mono ml-1">
                                    ({mat.formula})
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            {!sourceFlow ? (
              <span>Select a JSON recipe or built-in template to preview its steps and masks.</span>
            ) : importMode === 'replace-flow' ? (
              <span>
                Replace current flow with <strong className="text-white">{effectiveStepCount}</strong> steps
                {' '}and <strong className="text-white">{effectiveMaskCount}</strong> masks · restart at step 0
              </span>
            ) : !canApplyImport ? (
              <span className="text-amber-300">Select at least one step or mask to import.</span>
            ) : importMode === 'masks-only' ? (
              <span>
                Importing <strong className="text-white">{effectiveMaskCount}</strong> unassigned mask
                {effectiveMaskCount === 1 ? '' : 's'} only (no steps added)
              </span>
            ) : importMode === 'steps-only' ? (
              <span>
                Importing <strong className="text-white">{effectiveStepCount}</strong> step
                {effectiveStepCount === 1 ? '' : 's'} only (no masks imported)
              </span>
            ) : (
              <span>
                Importing <strong className="text-white">{effectiveStepCount}</strong> step
                {effectiveStepCount === 1 ? '' : 's'} &amp;{' '}
                <strong className="text-white">{effectiveMaskCount}</strong>{' '}
                {maskAssignmentMode === 'keep-unassigned' ? 'unassigned ' : 'linked '}mask
                {effectiveMaskCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canApplyImport}
              onClick={handleConfirmImport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {importMode === 'replace-flow'
                  ? 'Replace Current Flow'
                  : importMode === 'masks-only'
                  ? `Import ${effectiveMaskCount} Mask${effectiveMaskCount === 1 ? '' : 's'}`
                  : importMode === 'steps-only'
                  ? `Import ${effectiveStepCount} Step${effectiveStepCount === 1 ? '' : 's'}`
                  : `Import ${effectiveStepCount} Step${effectiveStepCount === 1 ? '' : 's'} & ${effectiveMaskCount} Mask${effectiveMaskCount === 1 ? '' : 's'}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
