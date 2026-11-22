/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ProcessFlow,
  ProcessStep,
  ProcessStepVariant,
  CrossSectionMesh,
  RenderedPolygon,
  Material,
} from '../types/microfab';
import {
  createStepVariant,
  duplicateStepVariant,
  switchStepVariant,
  renameStepVariant,
  deleteStepVariant,
  getActiveStepVariant,
} from '../lib/variantUtils';
import { syncStepWindowsToMask, attachNewMaskToLithoStep } from '../lib/maskUtils';
import { getEtchRecipeById, formatDurationCompact } from '../lib/etchRates';
import { ThicknessUnit, formatThickness } from '../lib/units';
import { simulateCrossSection, buildRenderPolygons } from '../lib/simulationEngine';
import { getMaterialById } from '../lib/materials';
import { SvgPatterns } from './SvgPatterns';
import {
  X,
  GitBranch,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Check,
  Search,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';

interface PreviewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SimSnapshot {
  mesh: CrossSectionMesh;
  polygons: RenderedPolygon[];
  bounds: PreviewBounds;
  stepDisabledInFlow: boolean;
  isFinalDisabledNoOp: boolean;
}

function computeSnapshotBounds(
  mesh: CrossSectionMesh,
  polygons: RenderedPolygon[],
  waferWidth: number
): PreviewBounds {
  let minX = 0;
  let maxX = waferWidth;
  let minY = mesh.minY ?? 0;
  let maxY = Math.max(mesh.maxY ?? 3000, 2500);
  for (const poly of polygons) {
    if (poly.xMin < minX) minX = poly.xMin;
    if (poly.xMax > maxX) maxX = poly.xMax;
    if (poly.yMin < minY) minY = poly.yMin;
    if (poly.yMax > maxY) maxY = poly.yMax;
    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

function mergePreviewBounds(list: (PreviewBounds | null | undefined)[]): PreviewBounds | null {
  const valid = list.filter((b): b is PreviewBounds => Boolean(b));
  if (valid.length === 0) return null;
  return {
    minX: Math.min(...valid.map((b) => b.minX)),
    maxX: Math.max(...valid.map((b) => b.maxX)),
    minY: Math.min(...valid.map((b) => b.minY)),
    maxY: Math.max(...valid.map((b) => b.maxY)),
  };
}

interface CrossSectionPreviewCardProps {
  title: string;
  badgeText: string;
  badgeClass: string;
  accentBorderClass: string;
  snapshot: SimSnapshot;
  sharedBounds?: PreviewBounds | null;
  materials: Material[];
  waferWidth: number;
  thicknessUnit: ThicknessUnit;
  patternPrefix: string;
  heightClass?: string;
  actionSlot?: React.ReactNode;
}

const CrossSectionPreviewCard: React.FC<CrossSectionPreviewCardProps> = ({
  title,
  badgeText,
  badgeClass,
  accentBorderClass,
  snapshot,
  sharedBounds,
  materials,
  waferWidth,
  thicknessUnit,
  patternPrefix,
  heightClass = 'h-40 sm:h-44',
  actionSlot,
}) => {
  const { mesh, polygons, bounds } = snapshot;
  const activeBounds = sharedBounds || bounds;
  const vbW = 360;
  const vbH = 190;
  const padX = 16;
  const padY = 14;
  const availW = vbW - padX * 2;
  const availH = vbH - padY * 2;

  const fMinX = activeBounds.minX;
  const fMaxX = activeBounds.maxX;
  const fMinY = activeBounds.minY;
  const fMaxY = activeBounds.maxY;

  const fSpanX = Math.max(100, fMaxX - fMinX);
  const fSpanY = Math.max(300, fMaxY - fMinY);
  const rawSx = availW / fSpanX;
  const rawSy = (availH * 0.68) / fSpanY;
  const rawWaferH = fSpanY * rawSy;
  const fitFactor = rawWaferH > availH ? availH / rawWaferH : 1;
  const sx = rawSx * fitFactor;
  const sy = rawSy * fitFactor;
  const offsetX = (vbW - fSpanX * sx) / 2 - fMinX * sx;
  const baseBottomY = vbH / 2 + (fSpanY * sy) / 2;

  const toScreen = (x: number, y: number) => ({
    x: offsetX + x * sx,
    y: baseBottomY - (y - fMinY) * sy,
  });

  const buildPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return '';
    const first = toScreen(pts[0].x, pts[0].y);
    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const pt = toScreen(pts[i].x, pts[i].y);
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }
    return d + ' Z';
  };

  const datumLeft = toScreen(fMinX, fMinY);
  const datumRight = toScreen(fMaxX, fMinY);
  const spanYLabel =
    thicknessUnit === 'um'
      ? `${((bounds.maxY - bounds.minY) / 1000).toFixed(2)} µm`
      : `${Math.round(bounds.maxY - bounds.minY)} nm`;
  const spanXLabel = `${((bounds.maxX - bounds.minX) / 1000).toFixed(1)} µm`;

  return (
    <div className={`rounded-xl border ${accentBorderClass} bg-slate-900/90 overflow-hidden shadow-md`}>
      <div className="px-2.5 py-1.5 bg-slate-950/90 border-b border-slate-800/90 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase border shrink-0 ${badgeClass}`}
          >
            {badgeText}
          </span>
          <span className="text-[11px] font-semibold text-slate-200 truncate" title={title}>
            {title}
          </span>
        </div>
        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>

      <div className={`relative w-full bg-[#060a12] ${heightClass}`}>
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="w-full h-full block pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <SvgPatterns materials={materials} idPrefix={patternPrefix} />

          <g>
            {polygons.map((poly) => {
              const mat = getMaterialById(materials, poly.materialId);
              const d = buildPath(poly.points);
              if (!d) return null;
              return (
                <path
                  key={poly.id}
                  d={d}
                  fill={`url(#${patternPrefix}mat-fill-${mat.id})`}
                  stroke={mat.strokeColor || '#1e293b'}
                  strokeWidth="0.9"
                />
              );
            })}
          </g>

          {mesh.mountedFrames &&
            mesh.mountedFrames.map((frame, fIdx) => {
              const leftX = toScreen(0, 0).x;
              const rightX = toScreen(waferWidth, 0).x;
              const yTopPx = toScreen(0, frame.yTop).y;
              const yBotPx = toScreen(0, frame.yBottom).y;
              const yMinPx = Math.min(yTopPx, yBotPx);
              const clampH = Math.max(3, Math.abs(yBotPx - yTopPx));
              return (
                <g key={`vm_frame_${fIdx}_${frame.side}`}>
                  <rect
                    x={leftX - 8}
                    y={yMinPx}
                    width={8}
                    height={clampH}
                    fill="#0284c7"
                    stroke="#38bdf8"
                    strokeWidth="0.7"
                  />
                  <rect
                    x={rightX}
                    y={yMinPx}
                    width={8}
                    height={clampH}
                    fill="#0284c7"
                    stroke="#38bdf8"
                    strokeWidth="0.7"
                  />
                </g>
              );
            })}

          <line
            x1={datumLeft.x}
            y1={datumLeft.y}
            x2={datumRight.x}
            y2={datumRight.y}
            stroke="#334155"
            strokeWidth="0.7"
            strokeDasharray="3 2"
          />
        </svg>

        <div className="pointer-events-none absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-slate-950/75 border border-slate-800/80 text-[9px] font-mono text-slate-400">
          {spanXLabel} × {spanYLabel}
        </div>
      </div>
    </div>
  );
};

interface VariantManagerModalProps {
  flow: ProcessFlow;
  isOpen: boolean;
  thicknessUnit?: ThicknessUnit;
  onClose: () => void;
  onUpdateFlow: (updatedFlow: ProcessFlow) => void;
  onSelectStepIndex: (index: number) => void;
}

export const VariantManagerModal: React.FC<VariantManagerModalProps> = ({
  flow,
  isOpen,
  thicknessUnit = 'nm',
  onClose,
  onUpdateFlow,
  onSelectStepIndex,
}) => {
  const branchedStepsCount = useMemo(
    () => flow.steps.filter((s) => s.variants && s.variants.length > 1).length,
    [flow.steps]
  );

  const totalVariantsCount = useMemo(
    () =>
      flow.steps.reduce(
        (acc, s) => acc + (s.variants && s.variants.length > 1 ? s.variants.length : 0),
        0
      ),
    [flow.steps]
  );

  const [filterMode, setFilterMode] = useState<'branched' | 'all'>(() =>
    branchedStepsCount > 0 ? 'branched' : 'all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingVar, setEditingVar] = useState<{
    stepId: string;
    variantId: string;
    draft: string;
  } | null>(null);
  const [showPreviewPane, setShowPreviewPane] = useState<boolean>(true);
  const [selectedPreviewStepId, setSelectedPreviewStepId] = useState<string | null>(null);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<'step' | 'final'>('step');
  const [showBeforeStep, setShowBeforeStep] = useState<boolean>(false);

  // Common variant names appearing in 2+ branched steps for 1-click flow-wide switching
  const sharedVariantNames = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    flow.steps.forEach((step) => {
      if (!step.variants || step.variants.length <= 1) return;
      const seenInStep = new Set<string>();
      step.variants.forEach((v) => {
        const key = v.name.trim().toLowerCase();
        if (!key || seenInStep.has(key)) return;
        seenInStep.add(key);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { label: v.name.trim(), count: 1 });
        }
      });
    });
    return Array.from(counts.values()).filter((entry) => entry.count >= 2);
  }, [flow.steps]);

  const blocksById = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    (flow.blocks || []).forEach((b) => map.set(b.id, { name: b.name, color: b.color }));
    return map;
  }, [flow.blocks]);

  const formatVariantSummary = (v: Pick<
    ProcessStepVariant,
    | 'type'
    | 'side'
    | 'materialId'
    | 'thickness'
    | 'deposition'
    | 'lithography'
    | 'etch'
    | 'strip'
    | 'cmp'
    | 'bonding'
    | 'dicing'
    | 'tapeFrame'
    | 'toolRecipe'
  >): string => {
    const sideTag =
      v.side === 'back' ? 'Backside · ' : v.side === 'both' ? 'Both Sides · ' : '';

    if (v.type === 'deposition') {
      const mat = v.materialId
        ? flow.materials.find((m) => m.id === v.materialId)?.name
        : undefined;
      return `${sideTag}${v.deposition?.method || 'CVD'}${mat ? ` (${mat})` : ''} · ${formatThickness(
        v.deposition?.thickness || v.thickness || 200,
        thicknessUnit
      )}`;
    }
    if (v.type === 'lithography') {
      const reticle = v.lithography?.maskId
        ? flow.masks?.find((m) => m.id === v.lithography?.maskId)?.name
        : v.lithography?.maskName;
      const coatTag =
        v.lithography?.coatMethod === 'lor-bilayer'
          ? `LOR bilayer (${formatThickness(v.lithography?.lorUndercut ?? 350, thicknessUnit)} UC) · `
          : v.lithography?.coatMethod === 'dry-film'
          ? 'Dry film · '
          : '';
      return `${sideTag}${coatTag}${v.lithography?.polarity || 'positive'} resist · ${
        v.lithography?.maskField === 'light-field' ? 'LF' : 'DF'
      } · ${v.lithography?.windows?.length || 0} win${
        reticle ? ` · ${reticle}` : ''
      }`;
    }
    if (v.type === 'etch') {
      const rec = v.etch?.etchRecipeId
        ? getEtchRecipeById(flow.etchLibrary, v.etch.etchRecipeId)
        : undefined;
      const targetMat =
        v.etch?.targetMaterialId && v.etch.targetMaterialId !== 'all'
          ? flow.materials.find((m) => m.id === v.etch?.targetMaterialId)?.name
          : 'All exposed';
      if (rec && v.etch?.rateMode === 'time-rate') {
        return `${sideTag}${v.etch?.etchType?.toUpperCase() || 'RIE'} · ${formatDurationCompact(
          v.etch?.etchTimeSec ?? 60
        )} · ${rec.chemistry}`;
      }
      return `${sideTag}${v.etch?.etchType?.toUpperCase() || 'RIE'} · ${formatThickness(
        v.etch?.depth || v.thickness || 200,
        thicknessUnit
      )} · ${targetMat}${rec ? ` (${rec.chemistry})` : ''}`;
    }
    if (v.type === 'strip') {
      return `${sideTag}${v.strip?.stripType || 'resist-strip'} · ${
        v.strip?.solvent || 'Standard solvent'
      }`;
    }
    if (v.type === 'liftoff') return `${sideTag}Metal Lift-off`;
    if (v.type === 'cmp') {
      const dishTag = v.cmp?.dishing ? ` · Dish ${v.cmp.dishing}%` : '';
      const erodeTag = v.cmp?.erosion ? ` · Erode ${v.cmp.erosion}%` : '';
      return `${sideTag}CMP (${v.cmp?.mode || 'planarize'}) · ${formatThickness(
        v.cmp?.depth || 200,
        thicknessUnit
      )}${dishTag}${erodeTag}`;
    }
    if (v.type === 'bonding') {
      return `${sideTag}Bond (${v.bonding?.bondingMethod || 'fusion'})`;
    }
    if (v.type === 'dicing') {
      return `${sideTag}Dice (${v.dicing?.method || 'blade'}) · ${
        v.dicing?.streets?.length || 1
      } cut(s)`;
    }
    if (v.type === 'tape-frame') {
      return `${sideTag}${v.tapeFrame?.action === 'demount' ? 'UV Demount' : 'Mount Tape'}`;
    }
    if (v.type === 'anneal') {
      return `${sideTag}Thermal Anneal${
        v.toolRecipe?.temperature ? ` · ${v.toolRecipe.temperature}` : ''
      }`;
    }
    return `${sideTag}${v.type}`;
  };

  const applyStepUpdateWithMaskSync = (
    baseFlow: ProcessFlow,
    stepIdx: number,
    nextStep: ProcessStep
  ): ProcessFlow => {
    const prevStep = baseFlow.steps[stepIdx];
    let updatedFlow: ProcessFlow = {
      ...baseFlow,
      steps: baseFlow.steps.map((s, idx) => (idx === stepIdx ? nextStep : s)),
    };

    if (nextStep.type === 'lithography') {
      if (prevStep && prevStep.type !== 'lithography') {
        const validUnclaimedMask = nextStep.lithography?.maskId
          ? (updatedFlow.masks || []).find(
              (m) =>
                m.id === nextStep.lithography?.maskId &&
                (!m.assignedStepId || m.assignedStepId === nextStep.id)
            )
          : undefined;
        updatedFlow = validUnclaimedMask
          ? syncStepWindowsToMask(updatedFlow, nextStep)
          : attachNewMaskToLithoStep(updatedFlow, nextStep.id);
      } else {
        updatedFlow = syncStepWindowsToMask(updatedFlow, nextStep);
      }
    } else if (prevStep && prevStep.type === 'lithography' && updatedFlow.masks) {
      updatedFlow = {
        ...updatedFlow,
        masks: updatedFlow.masks.map((m) =>
          m.assignedStepId === nextStep.id
            ? { ...m, assignedStepId: undefined, assignedVariantId: undefined }
            : m
        ),
      };
    }

    return updatedFlow;
  };

  const handleSelectVariant = (stepIdx: number, variantId: string) => {
    const step = flow.steps[stepIdx];
    if (!step) return;
    setSelectedPreviewStepId(step.id);
    setPreviewVariantId(null);
    const switched = switchStepVariant(step, variantId);
    onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, switched));
  };

  const handleAddVariant = (stepIdx: number) => {
    const step = flow.steps[stepIdx];
    if (!step) return;
    setSelectedPreviewStepId(step.id);
    setPreviewVariantId(null);
    const updated = createStepVariant(step);
    onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, updated));
  };

  const handleCloneVariant = (stepIdx: number, variantId: string) => {
    const step = flow.steps[stepIdx];
    if (!step) return;
    setSelectedPreviewStepId(step.id);
    setPreviewVariantId(null);
    const updated = duplicateStepVariant(step, variantId);
    onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, updated));
  };

  const handleDeleteVariant = (stepIdx: number, variantId: string) => {
    const step = flow.steps[stepIdx];
    if (!step) return;
    setSelectedPreviewStepId(step.id);
    if (previewVariantId === variantId) {
      setPreviewVariantId(null);
    }
    const updated = deleteStepVariant(step, variantId);
    onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, updated));
  };

  const handleKeepOnlyActiveVariant = (stepIdx: number) => {
    const step = flow.steps[stepIdx];
    if (!step || !step.variants || step.variants.length <= 1) return;
    setSelectedPreviewStepId(step.id);
    setPreviewVariantId(null);
    const cleaned: ProcessStep = {
      ...step,
      variants: undefined,
      activeVariantId: undefined,
    };
    onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, cleaned));
  };

  const handleCommitRename = () => {
    if (!editingVar) return;
    const stepIdx = flow.steps.findIndex((s) => s.id === editingVar.stepId);
    if (stepIdx >= 0 && editingVar.draft.trim()) {
      const updated = renameStepVariant(
        flow.steps[stepIdx],
        editingVar.variantId,
        editingVar.draft
      );
      onUpdateFlow(applyStepUpdateWithMaskSync(flow, stepIdx, updated));
    }
    setEditingVar(null);
  };

  const handleBulkActivateByName = (targetName: string) => {
    const key = targetName.trim().toLowerCase();
    let nextFlow = flow;
    for (let i = 0; i < nextFlow.steps.length; i++) {
      const s = nextFlow.steps[i];
      if (!s.variants || s.variants.length <= 1) continue;
      const match = s.variants.find((v) => v.name.trim().toLowerCase() === key);
      if (match && match.id !== s.activeVariantId) {
        const switched = switchStepVariant(s, match.id);
        nextFlow = applyStepUpdateWithMaskSync(nextFlow, i, switched);
      }
    }
    onUpdateFlow(nextFlow);
  };

  const filteredSteps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return flow.steps
      .map((step, idx) => ({ step, idx }))
      .filter(({ step, idx }) => {
        const hasBranches = Boolean(step.variants && step.variants.length > 1);
        if (filterMode === 'branched' && !hasBranches) return false;
        if (!q) return true;
        const blockName = step.blockId ? blocksById.get(step.blockId)?.name || '' : '';
        const variantNames = (step.variants || [])
          .map((v) => `${v.name} ${v.title} ${v.type}`)
          .join(' ');
        const haystack = `step ${idx + 1} ${step.title} ${step.type} ${blockName} ${variantNames}`.toLowerCase();
        return haystack.includes(q);
      });
  }, [flow.steps, filterMode, searchQuery, blocksById]);

  const resolvedPreviewEntry = useMemo(() => {
    if (filteredSteps.length === 0) return null;
    if (selectedPreviewStepId) {
      const match = filteredSteps.find((entry) => entry.step.id === selectedPreviewStepId);
      if (match) return match;
    }
    const firstBranched = filteredSteps.find(
      (entry) => entry.step.variants && entry.step.variants.length > 1
    );
    return firstBranched || filteredSteps[0];
  }, [filteredSteps, selectedPreviewStepId]);

  const previewStepVariants = useMemo(() => {
    const s = resolvedPreviewEntry?.step;
    if (!s || !s.variants || s.variants.length <= 1) return null;
    return s.variants;
  }, [resolvedPreviewEntry]);

  const resolvedActiveVariant = useMemo(() => {
    if (!resolvedPreviewEntry || !previewStepVariants) return null;
    return getActiveStepVariant(resolvedPreviewEntry.step);
  }, [resolvedPreviewEntry, previewStepVariants]);

  const resolvedCandidateVariant = useMemo(() => {
    if (!previewStepVariants || !previewVariantId) return null;
    return previewStepVariants.find((v) => v.id === previewVariantId) || null;
  }, [previewStepVariants, previewVariantId]);

  const previewSimulations = useMemo(() => {
    if (!isOpen || !showPreviewPane || !resolvedPreviewEntry) return null;
    const { step, idx } = resolvedPreviewEntry;
    const waferWidth = flow.substrateWidth || 10000;

    const runForVariant = (variantId?: string): SimSnapshot => {
      const baseCandidate = variantId ? switchStepVariant(step, variantId) : step;
      const forceEnableForStepScope = previewScope === 'step';
      const candidateStep: ProcessStep = forceEnableForStepScope
        ? { ...baseCandidate, enabled: true }
        : baseCandidate;
      const tempFlow: ProcessFlow = {
        ...flow,
        steps: flow.steps.map((s, sIdx) => (sIdx === idx ? candidateStep : s)),
      };

      let mesh: CrossSectionMesh;
      if (previewScope === 'step') {
        let enabledCountUpToStep = 0;
        for (let i = 0; i <= idx; i++) {
          if (tempFlow.steps[i].enabled) enabledCountUpToStep++;
        }
        mesh = simulateCrossSection(tempFlow, enabledCountUpToStep - 1);
      } else {
        mesh = simulateCrossSection(tempFlow);
      }
      const polygons = buildRenderPolygons(mesh, flow.materials);
      return {
        mesh,
        polygons,
        bounds: computeSnapshotBounds(mesh, polygons, waferWidth),
        stepDisabledInFlow: !step.enabled,
        isFinalDisabledNoOp: previewScope === 'final' && !step.enabled,
      };
    };

    const activeSnap = runForVariant(undefined);
    const candidateSnap =
      resolvedCandidateVariant &&
      resolvedActiveVariant &&
      resolvedCandidateVariant.id !== resolvedActiveVariant.id
        ? runForVariant(resolvedCandidateVariant.id)
        : null;

    let beforeSnap: SimSnapshot | null = null;
    if (previewScope === 'step' && showBeforeStep) {
      let enabledBeforeCount = 0;
      for (let i = 0; i < idx; i++) {
        if (flow.steps[i].enabled) enabledBeforeCount++;
      }
      const beforeMesh = simulateCrossSection(flow, enabledBeforeCount - 1);
      const beforePolygons = buildRenderPolygons(beforeMesh, flow.materials);
      beforeSnap = {
        mesh: beforeMesh,
        polygons: beforePolygons,
        bounds: computeSnapshotBounds(beforeMesh, beforePolygons, waferWidth),
        stepDisabledInFlow: false,
        isFinalDisabledNoOp: false,
      };
    }

    const sharedBounds = mergePreviewBounds([
      activeSnap.bounds,
      candidateSnap?.bounds,
      beforeSnap?.bounds,
    ]);

    const seenMatIds = new Set<string>();
    const activeMaterials: Material[] = [];
    const targetPolygons = (candidateSnap || activeSnap).polygons;
    for (const poly of targetPolygons) {
      if (!seenMatIds.has(poly.materialId)) {
        seenMatIds.add(poly.materialId);
        activeMaterials.push(getMaterialById(flow.materials, poly.materialId));
      }
    }

    return {
      activeSnap,
      candidateSnap,
      beforeSnap,
      sharedBounds,
      activeMaterials,
    };
  }, [
    isOpen,
    showPreviewPane,
    resolvedPreviewEntry,
    resolvedActiveVariant,
    resolvedCandidateVariant,
    previewScope,
    showBeforeStep,
    flow,
  ]);

  if (!isOpen) return null;

  const waferWidth = flow.substrateWidth || 10000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className={`w-full ${
          showPreviewPane ? 'max-w-6xl' : 'max-w-4xl'
        } max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150 transition-[max-width] duration-200`}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-violet-950/50 shrink-0">
              <GitBranch className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Process Variant Manager
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/35 text-violet-300 font-mono text-[10px] font-semibold">
                  {branchedStepsCount} {branchedStepsCount === 1 ? 'Branched Step' : 'Branched Steps'}
                  {totalVariantsCount > 0 ? ` · ${totalVariantsCount} Variants` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Centralized menu to switch, compare, preview cross-sections, rename, clone, or delete process step variants.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreviewPane((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                showPreviewPane
                  ? 'bg-sky-500/15 border-sky-500/45 text-sky-300 hover:bg-sky-500/25'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title={
                showPreviewPane
                  ? 'Hide impacted step cross-section preview'
                  : 'Show impacted step cross-section preview'
              }
            >
              {showPreviewPane ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Cross-Section</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close Variant Manager"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Batch Quick-Select Toolbar */}
        <div className="px-4 py-2.5 sm:px-6 bg-slate-950/60 border-b border-slate-800/90 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search steps or variant names..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Scope Toggle: Branched Only vs All Steps */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterMode('branched')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterMode === 'branched'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Branched ({branchedStepsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Steps ({flow.steps.length})
              </button>
            </div>
          </div>

          {/* Flow-wide Batch Switcher (when multiple steps share variant names) */}
          {sharedVariantNames.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-400 font-medium mr-1">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span>Quick Switch All:</span>
              </span>
              {sharedVariantNames.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => handleBulkActivateByName(entry.label)}
                  className="px-2 py-0.5 rounded-md bg-violet-500/15 hover:bg-violet-500/30 border border-violet-500/35 text-violet-200 font-medium transition-colors"
                  title={`Activate "${entry.label}" on all ${entry.count} steps containing it`}
                >
                  {entry.label} ({entry.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Split Body: Left Step/Variant List + Right Cross-Section Preview */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Scrollable Step & Variant List */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-950/40">
            {filteredSteps.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40">
                <GitBranch className="w-8 h-8 text-violet-400/70 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-200">
                    {filterMode === 'branched' && branchedStepsCount === 0
                      ? 'No process step variants defined yet'
                      : 'No matching steps or variants found'}
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {filterMode === 'branched' && branchedStepsCount === 0
                      ? 'Switch to "All Steps" below to branch any process step into multiple selectable variants (e.g. Baseline vs Wet KOH).'
                      : 'Try clearing your search filter or switching to "All Steps".'}
                  </p>
                </div>
                {filterMode === 'branched' && flow.steps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setSearchQuery('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Browse All {flow.steps.length} Steps</span>
                  </button>
                )}
              </div>
            ) : (
              filteredSteps.map(({ step, idx }) => {
                const variants = step.variants && step.variants.length > 1 ? step.variants : null;
                const activeVar = variants ? getActiveStepVariant(step) : null;
                const blockInfo = step.blockId ? blocksById.get(step.blockId) : undefined;
                const isPreviewSelected = resolvedPreviewEntry?.step.id === step.id;

                return (
                  <div
                    key={step.id}
                    onClick={() => {
                      if (!isPreviewSelected) {
                        setSelectedPreviewStepId(step.id);
                        setPreviewVariantId(null);
                      }
                    }}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isPreviewSelected && showPreviewPane
                        ? 'ring-1 ring-sky-400/60 border-sky-500/60 bg-slate-900/95'
                        : variants
                        ? 'bg-slate-900/90 border-violet-500/35 hover:border-violet-400/60'
                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Step Header Bar */}
                    <div className="px-3.5 py-2.5 bg-slate-900/95 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-sky-400 shrink-0">
                          Step {idx + 1}
                        </span>
                        <span className="font-semibold text-xs sm:text-sm text-white truncate">
                          {step.title}
                        </span>
                        {isPreviewSelected && showPreviewPane && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/35 text-[9px] font-mono font-bold uppercase text-sky-300 shrink-0">
                            <Eye className="w-2.5 h-2.5" />
                            Preview
                          </span>
                        )}
                        {!step.enabled && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/15 border border-rose-500/30 text-[9px] font-mono font-bold text-rose-300 shrink-0">
                            OFF
                          </span>
                        )}
                        {blockInfo && (
                          <span
                            className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px] text-slate-300 truncate max-w-[160px]"
                            style={{ borderColor: blockInfo.color ? `${blockInfo.color}66` : undefined }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: blockInfo.color || '#6366f1' }}
                            />
                            <span className="truncate">{blockInfo.name}</span>
                          </span>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPreviewStepId(step.id);
                            setPreviewVariantId(null);
                            setShowPreviewPane(true);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors ${
                            isPreviewSelected && showPreviewPane
                              ? 'bg-sky-500/20 border-sky-500/50 text-sky-200'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                          }`}
                          title={`Preview Step ${idx + 1} cross-section`}
                        >
                          <Eye className="w-3 h-3" />
                          <span className="hidden sm:inline">Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectStepIndex(idx);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 hover:text-white transition-colors"
                          title={`Inspect Step ${idx + 1} in editor`}
                        >
                          <span>Open</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>

                        {variants && (
                          <button
                            type="button"
                            onClick={() => handleKeepOnlyActiveVariant(idx)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-[11px] text-slate-300 hover:text-rose-300 transition-colors"
                            title="Delete all inactive variants and keep only the active recipe"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Keep Active Only</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleAddVariant(idx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/85 hover:bg-violet-500 text-white text-[11px] font-semibold transition-colors"
                          title={
                            variants
                              ? 'Add another variant branched from the active configuration'
                              : 'Branch this step into Baseline + Variant B'
                          }
                        >
                          <Plus className="w-3 h-3" />
                          <span>{variants ? 'Add Variant' : 'Branch Step'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Variant Cards List OR Unbranched Single Summary */}
                    {variants ? (
                      <div className="p-3 space-y-2">
                        {variants.map((variant) => {
                          const isActive = activeVar?.id === variant.id;
                          const isEditingThis =
                            editingVar?.stepId === step.id &&
                            editingVar?.variantId === variant.id;
                          const isPreviewingCandidate =
                            isPreviewSelected &&
                            showPreviewPane &&
                            resolvedCandidateVariant?.id === variant.id;

                          return (
                            <div
                              key={variant.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isActive && !isEditingThis) {
                                  handleSelectVariant(idx, variant.id);
                                } else {
                                  setSelectedPreviewStepId(step.id);
                                  setPreviewVariantId(null);
                                }
                              }}
                              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                                isActive
                                  ? 'bg-violet-600/15 border-violet-400/70 shadow-sm'
                                  : isPreviewingCandidate
                                  ? 'bg-sky-500/10 border-sky-400/60 cursor-pointer'
                                  : 'bg-slate-950/75 border-slate-800 hover:border-slate-600 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isActive) {
                                      handleSelectVariant(idx, variant.id);
                                    } else {
                                      setSelectedPreviewStepId(step.id);
                                      setPreviewVariantId(null);
                                    }
                                  }}
                                  className={`mt-0.5 shrink-0 transition-colors ${
                                    isActive
                                      ? 'text-violet-400'
                                      : 'text-slate-600 hover:text-violet-300'
                                  }`}
                                  title={isActive ? 'Currently Active' : `Activate "${variant.name}"`}
                                >
                                  {isActive ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : (
                                    <Circle className="w-4 h-4" />
                                  )}
                                </button>

                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isEditingThis ? (
                                      <div
                                        className="flex items-center gap-1"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingVar.draft}
                                          onChange={(e) =>
                                            setEditingVar({ ...editingVar, draft: e.target.value })
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCommitRename();
                                            if (e.key === 'Escape') setEditingVar(null);
                                          }}
                                          onBlur={handleCommitRename}
                                          className="px-2 py-0.5 rounded bg-slate-900 border border-violet-400 text-xs font-semibold text-white focus:outline-none w-40"
                                        />
                                        <button
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleCommitRename();
                                          }}
                                          className="p-1 rounded text-emerald-400 hover:bg-slate-800"
                                          title="Save name"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <span
                                          className={`text-xs font-bold ${
                                            isActive ? 'text-white' : 'text-slate-200'
                                          }`}
                                        >
                                          {variant.name}
                                        </span>
                                        {isActive && (
                                          <span className="px-1.5 py-0.2 rounded bg-violet-500/25 border border-violet-400/50 text-[9px] font-mono font-bold uppercase text-violet-200">
                                            Active
                                          </span>
                                        )}
                                        {isPreviewingCandidate && !isActive && (
                                          <span className="px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-400/50 text-[9px] font-mono font-bold uppercase text-sky-200">
                                            Comparing
                                          </span>
                                        )}
                                        <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono uppercase text-slate-400">
                                          {variant.type}
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <div className="text-[11px] font-mono text-slate-400 truncate">
                                    {variant.title !== step.title ? `${variant.title} · ` : ''}
                                    {formatVariantSummary(variant)}
                                  </div>
                                </div>
                              </div>

                              {/* Per-variant actions */}
                              <div
                                className="flex items-center gap-1 shrink-0 self-end sm:self-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!isActive && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPreviewStepId(step.id);
                                        setPreviewVariantId(
                                          isPreviewingCandidate ? null : variant.id
                                        );
                                        setShowPreviewPane(true);
                                      }}
                                      className={`p-1.5 rounded-lg border transition-colors ${
                                        isPreviewingCandidate
                                          ? 'bg-sky-500/25 border-sky-400/60 text-sky-200'
                                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-400 hover:text-sky-300'
                                      }`}
                                      title={
                                        isPreviewingCandidate
                                          ? 'Stop comparing this variant'
                                          : `Compare "${variant.name}" cross-section against active`
                                      }
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectVariant(idx, variant.id)}
                                      className="px-2 py-1 rounded-lg bg-violet-600/25 hover:bg-violet-600 border border-violet-500/40 text-[11px] font-medium text-violet-200 hover:text-white transition-colors"
                                    >
                                      Activate
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingVar({
                                      stepId: step.id,
                                      variantId: variant.id,
                                      draft: variant.name,
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition-colors"
                                  title="Rename variant"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCloneVariant(idx, variant.id)}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-sky-300 transition-colors"
                                  title="Duplicate variant"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteVariant(idx, variant.id)}
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700/80 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition-colors"
                                  title={
                                    variants.length === 2
                                      ? `Delete "${variant.name}" (returns step to single recipe)`
                                      : `Delete "${variant.name}"`
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3.5 py-2 text-[11px] font-mono text-slate-400 flex items-center justify-between gap-2">
                        <span className="truncate">
                          Single recipe · {formatVariantSummary(step)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right Docked Panel: Cross-Section Preview of the Impacted Step */}
          {showPreviewPane && (
            <div className="w-full lg:w-[390px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-950/75 flex flex-col max-h-[42vh] lg:max-h-none overflow-y-auto">
              {resolvedPreviewEntry && previewSimulations ? (
                <div className="p-3.5 sm:p-4 space-y-3">
                  {/* Preview Header & Scope Toggle */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/35 font-mono text-[10px] font-bold text-sky-300 shrink-0">
                          Step {resolvedPreviewEntry.idx + 1}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                          {resolvedPreviewEntry.step.title}
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Cross-section preview{' '}
                        {previewScope === 'step'
                          ? `immediately after Step ${resolvedPreviewEntry.idx + 1}`
                          : `at final wafer (with Step ${resolvedPreviewEntry.idx + 1})`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectStepIndex(resolvedPreviewEntry.idx);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors shrink-0"
                      title="Open this step in the main cross-section canvas"
                    >
                      <span>Open</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Scope & Before-Step Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPreviewScope('step')}
                        className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                          previewScope === 'step'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        At Step {resolvedPreviewEntry.idx + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewScope('final')}
                        className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                          previewScope === 'final'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Final Wafer
                      </button>
                    </div>

                    {previewScope === 'step' && (
                      <button
                        type="button"
                        onClick={() => setShowBeforeStep((v) => !v)}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-medium transition-colors ${
                          showBeforeStep
                            ? 'bg-amber-500/15 border-amber-500/45 text-amber-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Toggle incoming wafer geometry before this step"
                      >
                        {showBeforeStep ? 'Hide Before Step' : 'Compare Before'}
                      </button>
                    )}
                  </div>

                  {/* Quick Variant Selector Chips inside Preview */}
                  {previewStepVariants && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                        Compare or switch variants
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {previewStepVariants.map((v) => {
                          const isActive = resolvedActiveVariant?.id === v.id;
                          const isComparing = resolvedCandidateVariant?.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                if (isActive) {
                                  setPreviewVariantId(null);
                                } else {
                                  setPreviewVariantId(isComparing ? null : v.id);
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                                isComparing && !isActive
                                  ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                                  : isActive
                                  ? 'bg-violet-600/25 border-violet-400/65 text-violet-100'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                              }`}
                              title={
                                isActive
                                  ? 'Active variant'
                                  : isComparing
                                  ? 'Click to clear comparison'
                                  : `Compare "${v.name}" against active variant`
                              }
                            >
                              {isActive && <CheckCircle2 className="w-3 h-3 text-violet-300 shrink-0" />}
                              <span>{v.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Disabled Step Notice */}
                  {previewSimulations.activeSnap.stepDisabledInFlow && (
                    <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200">
                      {previewSimulations.activeSnap.isFinalDisabledNoOp
                        ? 'This step is currently OFF in the flow — Final Wafer reflects the flow with this step skipped.'
                        : 'This step is currently OFF in the flow — previewing its geometry as if enabled.'}
                    </div>
                  )}

                  {/* Optional Before-Step Reference */}
                  {previewSimulations.beforeSnap && (
                    <CrossSectionPreviewCard
                      title={
                        resolvedPreviewEntry.idx === 0
                          ? 'Initial Substrate'
                          : `Before Step ${resolvedPreviewEntry.idx + 1}`
                      }
                      badgeText="BEFORE"
                      badgeClass="bg-amber-500/15 text-amber-300 border-amber-500/35"
                      accentBorderClass="border-amber-500/35"
                      snapshot={previewSimulations.beforeSnap}
                      sharedBounds={previewSimulations.sharedBounds}
                      materials={flow.materials}
                      waferWidth={waferWidth}
                      thicknessUnit={thicknessUnit}
                      patternPrefix="vm-prev-before-"
                      heightClass="h-32 sm:h-36"
                    />
                  )}

                  {/* Active Recipe / Impacted Step Cross-Section */}
                  <CrossSectionPreviewCard
                    title={
                      resolvedActiveVariant
                        ? `${resolvedActiveVariant.name} · ${formatVariantSummary(resolvedActiveVariant)}`
                        : formatVariantSummary(resolvedPreviewEntry.step)
                    }
                    badgeText={resolvedActiveVariant ? 'ACTIVE' : `STEP ${resolvedPreviewEntry.idx + 1}`}
                    badgeClass={
                      resolvedActiveVariant
                        ? 'bg-violet-500/20 text-violet-200 border-violet-400/50'
                        : 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                    }
                    accentBorderClass={
                      resolvedActiveVariant ? 'border-violet-500/45' : 'border-sky-500/45'
                    }
                    snapshot={previewSimulations.activeSnap}
                    sharedBounds={previewSimulations.sharedBounds}
                    materials={flow.materials}
                    waferWidth={waferWidth}
                    thicknessUnit={thicknessUnit}
                    patternPrefix="vm-prev-active-"
                    heightClass={previewSimulations.candidateSnap ? 'h-36 sm:h-40' : 'h-44 sm:h-52'}
                  />

                  {/* Side-by-Side Comparison Candidate Variant Cross-Section */}
                  {previewSimulations.candidateSnap && resolvedCandidateVariant && (
                    <CrossSectionPreviewCard
                      title={`${resolvedCandidateVariant.name} · ${formatVariantSummary(
                        resolvedCandidateVariant
                      )}`}
                      badgeText="PREVIEW"
                      badgeClass="bg-sky-500/20 text-sky-200 border-sky-400/50"
                      accentBorderClass="border-sky-500/60"
                      snapshot={previewSimulations.candidateSnap}
                      sharedBounds={previewSimulations.sharedBounds}
                      materials={flow.materials}
                      waferWidth={waferWidth}
                      thicknessUnit={thicknessUnit}
                      patternPrefix="vm-prev-candidate-"
                      heightClass="h-36 sm:h-40"
                      actionSlot={
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectVariant(
                              resolvedPreviewEntry.idx,
                              resolvedCandidateVariant.id
                            )
                          }
                          className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-semibold transition-colors"
                        >
                          Activate
                        </button>
                      }
                    />
                  )}

                  {/* Visible Materials Strip */}
                  {previewSimulations.activeMaterials.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      {previewSimulations.activeMaterials.map((mat) => (
                        <span
                          key={mat.id}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm border border-slate-700 shrink-0"
                            style={{ backgroundColor: mat.color }}
                          />
                          <span className="truncate max-w-[120px]">{mat.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-2">
                  <Eye className="w-7 h-7 text-slate-600" />
                  <p className="text-xs font-medium text-slate-400">
                    Select or branch a step to preview its wafer cross-section.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 sm:px-6 sm:py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-400 min-w-0">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
            <span className="truncate">
              Variant selections synchronize live with wafer simulation, flowchart figures, and SOP run sheets.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
