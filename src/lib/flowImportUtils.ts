/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DesignVariable,
  EtchRecipe,
  MaskWindow,
  Material,
  PhotomaskLevel,
  ProcessBlock,
  ProcessFlow,
  ProcessStep,
  ProcessStepType,
  ProcessStepVariant,
} from '../types/microfab';
import { DEFAULT_MATERIALS, getMaterialById } from './materials';
import { BLOCK_PALETTE, normalizeFlowBlocksOrder, ensureFlowBlocks } from './blockUtils';
import { ensureFlowMasks, getNextMaskLevelNumber, formatMaskLevelTag } from './maskUtils';
import { resolveFlowParameters } from './variableUtils';
import { getActiveStepVariant } from './variantUtils';
import { simulateCrossSection } from './simulationEngine';

export type FlowImportMode = 'replace-flow' | 'steps-and-masks' | 'steps-only' | 'masks-only';
export type MaskAssignmentMode = 'link-to-steps' | 'keep-unassigned';
export type ImportInsertMode = 'end' | 'after-active';
export type WidthScaleMode = 'scale' | 'clamp';
export type ImportBlockMode = 'preserve-blocks' | 'single-block' | 'no-blocks';

export interface ImportFromFlowOptions {
  importMode: FlowImportMode;
  selectedStepIds: string[];
  selectedMaskIds: string[];
  maskAssignmentMode: MaskAssignmentMode;
  insertMode: ImportInsertMode;
  activeStepIndex: number;
  widthScaleMode: WidthScaleMode;
  blockMode: ImportBlockMode;
  blockName?: string;
}

export interface FlowPreviewSummary {
  title: string;
  description: string;
  waferWidthNm: number;
  substrateThicknessNm: number;
  substrateSummary: string;
  stepCount: number;
  enabledStepCount: number;
  maskCount: number;
  darkFieldCount: number;
  lightFieldCount: number;
  typeCounts: Partial<Record<ProcessStepType, number>>;
  materialsUsed: Material[];
  finalMaterials: Material[];
  finalMinY: number;
  finalMaxY: number;
  finalHeightNm: number;
  variableCount: number;
  blockCount: number;
}

/**
 * Validates and normalizes an arbitrary parsed JSON object into a complete ProcessFlow
 * safe for preview simulation and selective step/mask import.
 */
export function normalizeIncomingFlow(raw: unknown): ProcessFlow | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<ProcessFlow>;
  if (!Array.isArray(candidate.steps) && !Array.isArray(candidate.masks)) {
    return null;
  }

  const cloned: ProcessFlow = JSON.parse(JSON.stringify(candidate));
  if (!cloned.id) cloned.id = `flow_imp_${Date.now()}`;
  if (!cloned.title || !cloned.title.trim()) cloned.title = 'Imported Process Flow';
  if (!cloned.description) cloned.description = '';
  if (!cloned.substrateWidth || !Number.isFinite(cloned.substrateWidth) || cloned.substrateWidth <= 0) {
    cloned.substrateWidth = 10000;
  }
  if (!Array.isArray(cloned.steps)) cloned.steps = [];
  cloned.steps = cloned.steps.map((s) => ({
    ...s,
    enabled: s.enabled !== false,
  }));
  if (!Array.isArray(cloned.materials)) cloned.materials = [];

  const existingMatIds = new Set(cloned.materials.map((m) => m.id));
  const missingDefaults = DEFAULT_MATERIALS.filter((d) => !existingMatIds.has(d.id));
  if (missingDefaults.length > 0) {
    cloned.materials = [...cloned.materials, ...missingDefaults];
  }

  if (!cloned.substrateLayers || cloned.substrateLayers.length === 0) {
    cloned.substrateLayers = [
      {
        id: 'sub_default',
        name: 'Silicon <100> Substrate',
        materialId: cloned.substrateMaterialId || 'mat_si_sub',
        thickness: cloned.substrateThickness || 3000,
      },
    ];
  }

  return resolveFlowParameters(ensureFlowBlocks(ensureFlowMasks(cloned)));
}

/**
 * Produces a concise one-line human-readable description of what a step does.
 */
export function describeProcessStep(
  step: ProcessStep,
  materials: Material[],
  masks?: PhotomaskLevel[]
): string {
  const getMatLabel = (matId?: string) => {
    if (!matId) return '';
    const m = getMaterialById(materials, matId);
    return m.formula ? `${m.name} (${m.formula})` : m.name;
  };

  switch (step.type) {
    case 'deposition': {
      const cfg = step.deposition;
      const thk = cfg?.thickness ?? step.thickness ?? 0;
      const mat = getMatLabel(step.materialId);
      const method = cfg?.method || 'Deposition';
      return [method, thk ? `${Math.round(thk)} nm` : '', mat].filter(Boolean).join(' · ');
    }
    case 'lithography': {
      const cfg = step.lithography;
      const linkedMask = cfg?.maskId
        ? masks?.find((m) => m.id === cfg.maskId)
        : undefined;
      const field = (linkedMask?.maskField || cfg?.maskField) === 'light-field' ? 'Light-Field' : 'Dark-Field';
      const polarity = (linkedMask?.polarity || cfg?.polarity || 'positive') === 'negative' ? 'Neg resist' : 'Pos resist';
      const featCount = (linkedMask?.windows ?? cfg?.windows ?? []).length;
      const featWord = field === 'Light-Field' ? 'blocker' : 'aperture';
      const maskLabel = linkedMask
        ? `${linkedMask.layerCode ? `${linkedMask.layerCode} ` : ''}${linkedMask.name}`
        : cfg?.maskName || 'Unlinked track';
      return `${polarity} · ${field} · ${featCount} ${featWord}${featCount === 1 ? '' : 's'} · ${maskLabel}`;
    }
    case 'etch': {
      const cfg = step.etch;
      const depth = cfg?.depth ?? step.thickness ?? 0;
      const target =
        !cfg?.targetMaterialId || cfg.targetMaterialId === 'all'
          ? 'All exposed'
          : getMatLabel(cfg.targetMaterialId);
      const stop = cfg?.stopLayerMaterialId ? `Stop: ${getMatLabel(cfg.stopLayerMaterialId)}` : '';
      return [cfg?.etchType?.toUpperCase() || 'Etch', depth ? `${Math.round(depth)} nm` : '', target, stop]
        .filter(Boolean)
        .join(' · ');
    }
    case 'strip': {
      const cfg = step.strip;
      if (cfg?.stripType === 'sacrificial-release') {
        return `Sacrificial Release · ${getMatLabel(cfg.targetMaterialId) || cfg.solvent}`;
      }
      return `Strip · ${cfg?.solvent || 'O₂ Plasma'}`;
    }
    case 'liftoff': {
      return `Metal Lift-off · ${step.strip?.solvent || 'Solvent'}`;
    }
    case 'cmp': {
      const cfg = step.cmp;
      const op = cfg?.operation === 'grind' ? 'Grind' : cfg?.operation === 'polish' ? 'Polish' : 'CMP';
      if (cfg?.mode === 'stop-on-layer') {
        return `${op} · Stop on ${getMatLabel(cfg.stopMaterialId) || 'layer'}`;
      }
      if (cfg?.mode === 'target-height') {
        return `${op} · Target Z = ${Math.round(cfg.targetHeight ?? 0)} nm`;
      }
      return `${op} · Remove ${Math.round(cfg?.depth ?? 0)} nm`;
    }
    case 'anneal':
      return step.toolRecipe?.temperature
        ? `Thermal Anneal · ${step.toolRecipe.temperature}`
        : 'Thermal Anneal / Reflow';
    case 'bonding': {
      const cfg = step.bonding;
      const src =
        cfg?.sourceType === 'imported-flow'
          ? cfg.importedFlowTitle || cfg.importedFlow?.title || 'Imported Wafer'
          : `${cfg?.customLayers?.length || 1} layer wafer`;
      return `${cfg?.bondingMethod || 'Fusion'} Bond · ${src}`;
    }
    case 'dicing': {
      const cfg = step.dicing;
      const count = cfg?.streets?.length || 0;
      return `${cfg?.method || 'Blade'} Dice · ${count} street${count === 1 ? '' : 's'} · ${Math.round(cfg?.kerfWidth ?? 0)} nm kerf`;
    }
    case 'tape-frame': {
      const cfg = step.tapeFrame;
      return `${cfg?.action === 'demount' ? 'UV Demount' : 'Mount'} ${getMatLabel(cfg?.tapeMaterialId) || 'Tape'}`;
    }
    default:
      return step.type;
  }
}

function collectMaterialIdsFromStep(step: ProcessStep, out: Set<string>) {
  const push = (id?: string) => {
    if (id && id !== 'all') out.add(id);
  };
  push(step.materialId);
  push(step.lithography?.resistMaterialId);
  push(step.lithography?.lorMaterialId);
  push(step.etch?.targetMaterialId);
  push(step.etch?.stopLayerMaterialId);
  push(step.etch?.referenceMaterialId);
  push(step.strip?.targetMaterialId);
  push(step.cmp?.stopMaterialId);
  push(step.tapeFrame?.tapeMaterialId);
  push(step.bonding?.interfaceLayer?.materialId);
  step.bonding?.customLayers?.forEach((l) => push(l.materialId));
  step.variants?.forEach((v) => {
    push(v.materialId);
    push(v.lithography?.resistMaterialId);
    push(v.lithography?.lorMaterialId);
    push(v.etch?.targetMaterialId);
    push(v.etch?.stopLayerMaterialId);
    push(v.etch?.referenceMaterialId);
    push(v.strip?.targetMaterialId);
    push(v.cmp?.stopMaterialId);
    push(v.tapeFrame?.tapeMaterialId);
    push(v.bonding?.interfaceLayer?.materialId);
    v.bonding?.customLayers?.forEach((l) => push(l.materialId));
  });
}

/**
 * Generates an analytical summary + simulated final-state metrics for previewing an incoming flow.
 */
export function summarizeFlowForPreview(sourceFlow: ProcessFlow): FlowPreviewSummary {
  const typeCounts: Partial<Record<ProcessStepType, number>> = {};
  const touchedMatIds = new Set<string>();

  for (const layer of sourceFlow.substrateLayers || []) {
    if (layer.materialId) touchedMatIds.add(layer.materialId);
  }
  for (const step of sourceFlow.steps) {
    typeCounts[step.type] = (typeCounts[step.type] || 0) + 1;
    collectMaterialIdsFromStep(step, touchedMatIds);
  }

  const materialsUsed = Array.from(touchedMatIds)
    .map((id) => getMaterialById(sourceFlow.materials, id))
    .filter((mat, idx, arr) => arr.findIndex((x) => x.id === mat.id) === idx);

  const subLayers = sourceFlow.substrateLayers || [];
  const substrateThicknessNm = subLayers.reduce((sum, l) => sum + (l.thickness || 0), 0);
  const substrateSummary =
    subLayers.length > 0
      ? subLayers
          .map((l) => {
            const mat = getMaterialById(sourceFlow.materials, l.materialId);
            return `${l.name || mat.name} (${Math.round(l.thickness)} nm)`;
          })
          .join(' + ')
      : `${Math.round(sourceFlow.substrateThickness || 3000)} nm Substrate`;

  const masks = sourceFlow.masks || [];
  const darkFieldCount = masks.filter((m) => (m.maskField || 'dark-field') === 'dark-field').length;
  const lightFieldCount = masks.filter((m) => m.maskField === 'light-field').length;

  let enabledCount = 0;
  for (const s of sourceFlow.steps) {
    if (s.enabled !== false) enabledCount++;
  }
  const finalMesh = simulateCrossSection(
    sourceFlow,
    enabledCount > 0 ? enabledCount - 1 : -1
  );

  const finalMatIds = new Set<string>();
  for (const col of finalMesh.columns) {
    for (const seg of col.segments) {
      if (seg.yTop - seg.yBottom > 0.5) {
        finalMatIds.add(seg.materialId);
      }
    }
  }
  const finalMaterials = Array.from(finalMatIds).map((id) =>
    getMaterialById(sourceFlow.materials, id)
  );

  const finalMinY = finalMesh.minY ?? 0;
  const finalMaxY = finalMesh.maxY ?? substrateThicknessNm;

  return {
    title: sourceFlow.title,
    description: sourceFlow.description,
    waferWidthNm: sourceFlow.substrateWidth,
    substrateThicknessNm,
    substrateSummary,
    stepCount: sourceFlow.steps.length,
    enabledStepCount: enabledCount,
    maskCount: masks.length,
    darkFieldCount,
    lightFieldCount,
    typeCounts,
    materialsUsed,
    finalMaterials,
    finalMinY,
    finalMaxY,
    finalHeightNm: Math.max(0, Math.round(finalMaxY - finalMinY)),
    variableCount: sourceFlow.variables?.length || 0,
    blockCount: sourceFlow.blocks?.length || 0,
  };
}

/**
 * Returns the list of mask IDs referenced by the selected steps (including active/inactive variants).
 */
export function getMaskIdsUsedBySteps(
  sourceFlow: ProcessFlow,
  selectedStepIds: Set<string>
): string[] {
  const used = new Set<string>();
  const masks = sourceFlow.masks || [];
  for (const step of sourceFlow.steps) {
    if (!selectedStepIds.has(step.id) || step.type !== 'lithography') continue;
    if (step.lithography?.maskId) used.add(step.lithography.maskId);
    for (const v of step.variants || []) {
      if (v.type === 'lithography' && v.lithography?.maskId) {
        used.add(v.lithography.maskId);
      }
    }
    for (const m of masks) {
      if (m.assignedStepId === step.id) used.add(m.id);
    }
  }
  return Array.from(used);
}

/**
 * Replaces the complete recipe, or merges selected steps and/or masks with clean ID remapping,
 * optional width scaling, material/recipe/variable merging, and optional mask linkage or unassignment.
 */
export function mergeImportedFlowItems(
  currentFlow: ProcessFlow,
  sourceFlow: ProcessFlow,
  options: ImportFromFlowOptions
): {
  updatedFlow: ProcessFlow;
  firstImportedStepIndex: number;
  importedStepCount: number;
  importedMaskCount: number;
} {
  if (options.importMode === 'replace-flow') {
    // Normalize a fresh copy of the source without carrying over any current recipe data.
    const updatedFlow = normalizeIncomingFlow(sourceFlow);
    if (!updatedFlow) throw new Error('Invalid process flow.');
    return {
      updatedFlow,
      firstImportedStepIndex: -1,
      importedStepCount: updatedFlow.steps.length,
      importedMaskCount: (updatedFlow.masks || []).length,
    };
  }

  const stamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 6);
  const targetWidth = currentFlow.substrateWidth || 10000;
  const sourceWidth = sourceFlow.substrateWidth || targetWidth;
  const shouldScale =
    options.widthScaleMode === 'scale' && sourceWidth > 0 && sourceWidth !== targetWidth;

  const scaleCoord = (nm: number): number => {
    const raw = shouldScale ? (nm * targetWidth) / sourceWidth : nm;
    return Math.max(0, Math.min(targetWidth, Math.round(raw)));
  };

  const scaleWindows = (
    windows: MaskWindow[] | undefined,
    idPrefix: string
  ): MaskWindow[] => {
    if (!windows || windows.length === 0) return [];
    const out: MaskWindow[] = [];
    windows.forEach((w, idx) => {
      let xStart = scaleCoord(w.xStart);
      let xEnd = scaleCoord(w.xEnd);
      if (xEnd < xStart) [xStart, xEnd] = [xEnd, xStart];
      if (xEnd - xStart < 10) {
        if (xStart + 10 <= targetWidth) {
          xEnd = xStart + 10;
        } else {
          xStart = Math.max(0, targetWidth - 10);
          xEnd = targetWidth;
        }
      }
      const nextBindings = w.paramBindings ? { ...w.paramBindings } : undefined;
      if (shouldScale && nextBindings) {
        delete nextBindings.xStart;
        delete nextBindings.xEnd;
        delete nextBindings.width;
      }
      out.push({
        ...w,
        id: `${idPrefix}_w_${idx}_${stamp}_${nonce}`,
        xStart,
        xEnd,
        ...(nextBindings && Object.keys(nextBindings).length > 0
          ? { paramBindings: nextBindings }
          : { paramBindings: undefined }),
      });
    });
    return out;
  };

  const selectedStepSet = new Set(options.selectedStepIds);
  const selectedMaskSet = new Set(options.selectedMaskIds);

  const selectedSourceSteps =
    options.importMode === 'masks-only'
      ? []
      : sourceFlow.steps.filter((s) => selectedStepSet.has(s.id));

  const selectedSourceMasks =
    options.importMode === 'steps-only'
      ? []
      : (sourceFlow.masks || []).filter((m) => selectedMaskSet.has(m.id));

  // 1. Merge missing materials referenced by imported steps (plus bonding subflows)
  const neededMatIds = new Set<string>();
  selectedSourceSteps.forEach((s) => collectMaterialIdsFromStep(s, neededMatIds));
  const existingMatIds = new Set(currentFlow.materials.map((m) => m.id));
  const mergedMaterials: Material[] = [...currentFlow.materials];
  for (const mat of sourceFlow.materials || []) {
    if ((neededMatIds.has(mat.id) || mat.isCustom) && !existingMatIds.has(mat.id)) {
      mergedMaterials.push(JSON.parse(JSON.stringify(mat)));
      existingMatIds.add(mat.id);
    }
  }

  // 2. Merge missing custom etch recipes referenced by imported steps
  const neededRecipeIds = new Set<string>();
  for (const s of selectedSourceSteps) {
    if (s.etch?.etchRecipeId) neededRecipeIds.add(s.etch.etchRecipeId);
    s.variants?.forEach((v) => {
      if (v.etch?.etchRecipeId) neededRecipeIds.add(v.etch.etchRecipeId);
    });
  }
  const existingEtchLib = currentFlow.etchLibrary ? [...currentFlow.etchLibrary] : [];
  const existingRecipeIds = new Set(existingEtchLib.map((r) => r.id));
  for (const recipe of sourceFlow.etchLibrary || []) {
    if (neededRecipeIds.has(recipe.id) && !existingRecipeIds.has(recipe.id)) {
      existingEtchLib.push(JSON.parse(JSON.stringify(recipe)));
      existingRecipeIds.add(recipe.id);
    }
  }

  // 3. Merge missing parametric variables referenced by imported items
  const existingVars = currentFlow.variables ? [...currentFlow.variables] : [];
  const existingVarNames = new Set(existingVars.map((v) => v.name.trim()));
  const mergedVariables: DesignVariable[] = [...existingVars];
  if (sourceFlow.variables && sourceFlow.variables.length > 0) {
    for (const v of sourceFlow.variables) {
      const trimmedName = v.name.trim();
      if (!trimmedName || existingVarNames.has(trimmedName)) continue;
      mergedVariables.push({
        ...JSON.parse(JSON.stringify(v)),
        id: `var_${stamp}_${mergedVariables.length}_${nonce}`,
      });
      existingVarNames.add(trimmedName);
    }
  }

  // 4. Clone selected masks into flow.masks (initially unassigned; linked below if requested)
  const nextMasks: PhotomaskLevel[] = (currentFlow.masks || []).map((m) => ({ ...m }));
  const sourceMaskToCloned = new Map<string, PhotomaskLevel>();

  selectedSourceMasks.forEach((srcMask, mIdx) => {
    const levelNum = getNextMaskLevelNumber(nextMasks);
    const tag = formatMaskLevelTag(levelNum);
    const newMaskId = `mask_imp_${stamp}_${mIdx}_${nonce}`;
    const clonedMask: PhotomaskLevel = {
      ...JSON.parse(JSON.stringify(srcMask)),
      id: newMaskId,
      levelNumber: levelNum,
      layerCode: srcMask.layerCode || `LVL-${tag}`,
      windows: scaleWindows(srcMask.windows, newMaskId),
      assignedStepId: undefined,
      assignedVariantId: undefined,
    };
    nextMasks.push(clonedMask);
    sourceMaskToCloned.set(srcMask.id, clonedMask);
  });

  // 5. Block / Module handling for imported steps
  const nextBlocks: ProcessBlock[] = currentFlow.blocks ? [...currentFlow.blocks] : [];
  let singleImportBlockId: string | undefined;
  const sourceBlockToNewBlockId = new Map<string, string>();

  if (selectedSourceSteps.length > 0) {
    if (options.blockMode === 'single-block') {
      singleImportBlockId = `block_imp_${stamp}_${nonce}`;
      const nextBlockNum = nextBlocks.length + 1;
      nextBlocks.push({
        id: singleImportBlockId,
        name: options.blockName?.trim() || `Imported: ${sourceFlow.title}`,
        description: `Imported ${selectedSourceSteps.length} step${selectedSourceSteps.length === 1 ? '' : 's'} from ${sourceFlow.title}`,
        color: BLOCK_PALETTE[(nextBlockNum - 1) % BLOCK_PALETTE.length],
        collapsed: false,
      });
    } else if (options.blockMode === 'preserve-blocks') {
      const sourceBlocksById = new Map(
        (sourceFlow.blocks || []).map((b) => [b.id, b])
      );
      selectedSourceSteps.forEach((srcStep) => {
        if (!srcStep.blockId || sourceBlockToNewBlockId.has(srcStep.blockId)) return;
        const srcBlock = sourceBlocksById.get(srcStep.blockId);
        if (!srcBlock) return;
        const clonedBlockId = `block_imp_${stamp}_${sourceBlockToNewBlockId.size}_${nonce}`;
        const nextBlockNum = nextBlocks.length + 1;
        nextBlocks.push({
          ...JSON.parse(JSON.stringify(srcBlock)),
          id: clonedBlockId,
          color: srcBlock.color || BLOCK_PALETTE[(nextBlockNum - 1) % BLOCK_PALETTE.length],
          collapsed: false,
          placeholderStepIndex: undefined,
        });
        sourceBlockToNewBlockId.set(srcStep.blockId, clonedBlockId);
      });
    }
  }

  // 6. Clone selected steps with fresh IDs and proper mask / coordinate handling
  const clonedSteps: ProcessStep[] = selectedSourceSteps.map((srcStep, sIdx) => {
    const stepCopy: ProcessStep = JSON.parse(JSON.stringify(srcStep));
    const newStepId = `step_imp_${stamp}_${sIdx}_${nonce}`;
    stepCopy.id = newStepId;
    if (options.blockMode === 'single-block') {
      stepCopy.blockId = singleImportBlockId;
    } else if (options.blockMode === 'preserve-blocks') {
      stepCopy.blockId = srcStep.blockId
        ? sourceBlockToNewBlockId.get(srcStep.blockId)
        : undefined;
    } else {
      stepCopy.blockId = undefined;
    }

    // Remap release regions & dicing streets widths/IDs
    if (stepCopy.strip?.releaseRegions) {
      stepCopy.strip.releaseRegions = stepCopy.strip.releaseRegions.map((reg, rIdx) => {
        let xStart = scaleCoord(reg.xStart);
        let xEnd = scaleCoord(reg.xEnd);
        if (xEnd < xStart) [xStart, xEnd] = [xEnd, xStart];
        const nextBindings = reg.paramBindings ? { ...reg.paramBindings } : undefined;
        if (shouldScale && nextBindings) {
          delete nextBindings.xStart;
          delete nextBindings.xEnd;
        }
        return {
          ...reg,
          id: `rel_imp_${stamp}_${sIdx}_${rIdx}_${nonce}`,
          xStart,
          xEnd,
          ...(nextBindings && Object.keys(nextBindings).length > 0
            ? { paramBindings: nextBindings }
            : { paramBindings: undefined }),
        };
      });
    }

    if (stepCopy.dicing?.streets) {
      stepCopy.dicing.streets = stepCopy.dicing.streets.map((st, stIdx) => {
        const nextBindings = st.paramBindings ? { ...st.paramBindings } : undefined;
        if (shouldScale && nextBindings) {
          delete nextBindings.xCenter;
        }
        return {
          ...st,
          id: `street_imp_${stamp}_${sIdx}_${stIdx}_${nonce}`,
          xCenter: scaleCoord(st.xCenter),
          ...(nextBindings && Object.keys(nextBindings).length > 0
            ? { paramBindings: nextBindings }
            : { paramBindings: undefined }),
        };
      });
    }

    // Remap variants if present
    const variantIdMap = new Map<string, string>();
    if (stepCopy.variants && stepCopy.variants.length > 0) {
      stepCopy.variants = stepCopy.variants.map((v, vIdx) => {
        const nextVarId = `var_imp_${stamp}_${sIdx}_${vIdx}_${nonce}`;
        variantIdMap.set(v.id, nextVarId);
        const updatedVar: ProcessStepVariant = { ...v, id: nextVarId };
        if (updatedVar.type === 'lithography' && updatedVar.lithography) {
          if (options.importMode === 'steps-only') {
            updatedVar.lithography = {
              ...updatedVar.lithography,
              maskId: undefined,
              maskName: undefined,
              windows: [],
            };
          } else if (options.maskAssignmentMode === 'keep-unassigned') {
            updatedVar.lithography = {
              ...updatedVar.lithography,
              maskId: undefined,
              maskName: undefined,
              windows: scaleWindows(updatedVar.lithography.windows, `${newStepId}_v${vIdx}`),
            };
          } else {
            const linkedClone = updatedVar.lithography.maskId
              ? sourceMaskToCloned.get(updatedVar.lithography.maskId)
              : undefined;
            if (linkedClone) {
              updatedVar.lithography = {
                ...updatedVar.lithography,
                maskId: linkedClone.id,
                maskName: linkedClone.name,
                maskColor: linkedClone.color,
                maskField: linkedClone.maskField || updatedVar.lithography.maskField,
                polarity: linkedClone.polarity,
                windows: linkedClone.windows.map((w) => ({ ...w })),
              };
              if (!linkedClone.assignedStepId) {
                linkedClone.assignedStepId = newStepId;
                linkedClone.assignedVariantId =
                  stepCopy.variants!.length > 1 ? nextVarId : undefined;
              } else if (linkedClone.assignedStepId === newStepId) {
                // Shared across multiple variants of this step
                linkedClone.assignedVariantId = undefined;
              }
            } else {
              updatedVar.lithography = {
                ...updatedVar.lithography,
                maskId: undefined,
                maskName: undefined,
                windows: [],
              };
            }
          }
        }
        return updatedVar;
      });
      if (stepCopy.activeVariantId && variantIdMap.has(stepCopy.activeVariantId)) {
        stepCopy.activeVariantId = variantIdMap.get(stepCopy.activeVariantId);
      } else {
        stepCopy.activeVariantId = stepCopy.variants[0]?.id;
      }
    }

    // Handle top-level lithography config
    if (stepCopy.type === 'lithography' && stepCopy.lithography) {
      if (options.importMode === 'steps-only') {
        stepCopy.lithography = {
          ...stepCopy.lithography,
          maskId: undefined,
          maskName: undefined,
          windows: [],
        };
      } else if (options.maskAssignmentMode === 'keep-unassigned') {
        stepCopy.lithography = {
          ...stepCopy.lithography,
          maskId: undefined,
          maskName: undefined,
          windows: scaleWindows(stepCopy.lithography.windows, newStepId),
        };
      } else {
        // link-to-steps
        const activeVar =
          stepCopy.variants && stepCopy.variants.length > 1
            ? getActiveStepVariant(stepCopy)
            : null;
        const srcMaskId =
          activeVar?.type === 'lithography' && activeVar.lithography?.maskId
            ? activeVar.lithography.maskId
            : stepCopy.lithography.maskId;
        const linkedClone = srcMaskId ? sourceMaskToCloned.get(srcMaskId) : undefined;
        if (linkedClone) {
          stepCopy.lithography = {
            ...stepCopy.lithography,
            maskId: linkedClone.id,
            maskName: linkedClone.name,
            maskColor: linkedClone.color,
            maskField: linkedClone.maskField || stepCopy.lithography.maskField,
            polarity: linkedClone.polarity,
            windows: linkedClone.windows.map((w) => ({ ...w })),
          };
          if (!linkedClone.assignedStepId) {
            linkedClone.assignedStepId = newStepId;
            if (activeVar) {
              linkedClone.assignedVariantId = activeVar.id;
            }
          }
        } else {
          stepCopy.lithography = {
            ...stepCopy.lithography,
            maskId: undefined,
            maskName: undefined,
            windows: [],
          };
        }
      }
    }

    return stepCopy;
  });

  // 7. Insert steps at target index
  const targetSteps = [...currentFlow.steps];
  let insertIdx = targetSteps.length;
  if (options.insertMode === 'after-active') {
    if (options.activeStepIndex >= 0 && options.activeStepIndex < targetSteps.length) {
      insertIdx = options.activeStepIndex + 1;
    } else if (options.activeStepIndex < 0) {
      insertIdx = 0;
    }
  }
  targetSteps.splice(insertIdx, 0, ...clonedSteps);

  const combinedFlow: ProcessFlow = {
    ...currentFlow,
    steps: targetSteps,
    masks: nextMasks,
    blocks: nextBlocks,
    materials: mergedMaterials,
    etchLibrary: existingEtchLib.length > 0 ? existingEtchLib : currentFlow.etchLibrary,
    variables: mergedVariables.length > 0 ? mergedVariables : currentFlow.variables,
  };

  const normalized = resolveFlowParameters(normalizeFlowBlocksOrder(combinedFlow));
  const firstImportedId = clonedSteps[0]?.id;
  const firstImportedStepIndex = firstImportedId
    ? normalized.steps.findIndex((s) => s.id === firstImportedId)
    : -1;

  return {
    updatedFlow: normalized,
    firstImportedStepIndex,
    importedStepCount: clonedSteps.length,
    importedMaskCount: selectedSourceMasks.length,
  };
}
