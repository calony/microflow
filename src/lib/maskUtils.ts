/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProcessFlow,
  ProcessStep,
  PhotomaskLevel,
  MaskWindow,
  MaskFieldPolarity,
} from '../types/microfab';
import { resolveResistMaterialId } from './materials';

export const RETICLE_PALETTE = [
  '#38bdf8', // Sky
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

export function getNextMaskLevelNumber(masks: PhotomaskLevel[]): number {
  const maxExisting = masks.reduce((max, m) => Math.max(max, m.levelNumber || 0), 0);
  return Math.max(masks.length, maxExisting) + 1;
}

export function formatMaskLevelTag(levelNum: number): string {
  return String(levelNum).padStart(2, '0');
}

function buildDefaultMaskName(
  stepTitle: string,
  levelNum: number,
  explicitName?: string
): string {
  if (explicitName && explicitName.trim()) {
    return explicitName.trim();
  }
  const tag = formatMaskLevelTag(levelNum);
  const cleaned = stepTitle
    .replace(/photolithography/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return `MASK ${tag}: ${cleaned || 'LAYER'}`;
}

/**
 * Ensures that flow.masks exists and is synchronized with all lithography steps.
 */
export function ensureFlowMasks(flow: ProcessFlow): ProcessFlow {
  let existingMasks = flow.masks ? [...flow.masks] : [];
  let stepsUpdated = false;
  const updatedSteps = flow.steps.map((step) => {
    if (step.type !== 'lithography') return step;

    const litho = step.lithography || {
      resistMaterialId: 'mat_pr_pos',
      resistThickness: 1000,
      polarity: 'positive',
      windows: [],
      sidewallAngle: 90,
      exposureMethod: 'UV Contact (365nm)',
    };

    const maskId = litho.maskId;
    let matchingMask = maskId ? existingMasks.find((m) => m.id === maskId) : null;

    if (!matchingMask && litho.maskName) {
      matchingMask =
        existingMasks.find(
          (m) =>
            m.name.toLowerCase() === litho.maskName?.toLowerCase() &&
            (!m.assignedStepId || m.assignedStepId === step.id)
        ) || null;
    }

    if (!matchingMask) {
      // Create a new mask level for this step
      const levelNum = getNextMaskLevelNumber(existingMasks);
      const tag = formatMaskLevelTag(levelNum);
      const newMaskId = `mask_lvl_${Date.now()}_${levelNum}`;
      matchingMask = {
        id: newMaskId,
        levelNumber: levelNum,
        name: buildDefaultMaskName(step.title, levelNum, litho.maskName),
        layerCode: `LVL-${tag}`,
        description: `Patterning reticle for ${step.title}`,
        polarity: litho.polarity || 'positive',
        maskField: litho.maskField || 'dark-field',
        color: RETICLE_PALETTE[(levelNum - 1) % RETICLE_PALETTE.length],
        windows: litho.windows ? litho.windows.map((w) => ({ ...w })) : [],
        assignedStepId: step.id,
      };
      existingMasks.push(matchingMask);
      stepsUpdated = true;
      return {
        ...step,
        lithography: {
          ...litho,
          maskId: newMaskId,
          maskName: matchingMask.name,
          maskColor: matchingMask.color,
          maskField: matchingMask.maskField || 'dark-field',
        },
      };
    } else {
      // Ensure matching mask points to this step if not already assigned
      if (!matchingMask.assignedStepId) {
        matchingMask.assignedStepId = step.id;
      }
      if (!matchingMask.maskField) {
        matchingMask.maskField = litho.maskField || 'dark-field';
      }
      if (
        litho.maskId !== matchingMask.id ||
        litho.maskColor !== matchingMask.color ||
        litho.maskField !== matchingMask.maskField
      ) {
        stepsUpdated = true;
        return {
          ...step,
          lithography: {
            ...litho,
            maskId: matchingMask.id,
            maskName: matchingMask.name,
            maskColor: matchingMask.color,
            maskField: matchingMask.maskField,
          },
        };
      }
    }

    return step;
  });

  return {
    ...flow,
    masks: existingMasks,
    steps: stepsUpdated ? updatedSteps : flow.steps,
  };
}

/**
 * Creates a brand-new PhotomaskLevel in the Reticle Manager for a newly added,
 * duplicated, or converted photolithography step and links them 1-to-1.
 */
export function attachNewMaskToLithoStep(
  flow: ProcessFlow,
  stepId: string,
  partial?: Partial<PhotomaskLevel>
): ProcessFlow {
  const targetStep = flow.steps.find((s) => s.id === stepId && s.type === 'lithography');
  if (!targetStep) return flow;

  const existingMasks = flow.masks ? flow.masks.map((m) => ({ ...m })) : [];
  const levelNum = getNextMaskLevelNumber(existingMasks);
  const tag = formatMaskLevelTag(levelNum);
  const newMaskId = `mask_lvl_${Date.now()}_${levelNum}`;

  const litho = targetStep.lithography || {
    resistMaterialId: 'mat_pr_pos',
    resistThickness: 1000,
    polarity: 'positive',
    windows: [],
    sidewallAngle: 90,
    exposureMethod: 'UV Contact (365nm)',
  };

  const newMask: PhotomaskLevel = {
    id: newMaskId,
    levelNumber: levelNum,
    name: buildDefaultMaskName(targetStep.title, levelNum, partial?.name ?? litho.maskName),
    layerCode: partial?.layerCode || `LVL-${tag}`,
    description: partial?.description || `Patterning reticle for ${targetStep.title}`,
    polarity: partial?.polarity || litho.polarity || 'positive',
    maskField: partial?.maskField || litho.maskField || 'dark-field',
    color: partial?.color || RETICLE_PALETTE[(levelNum - 1) % RETICLE_PALETTE.length],
    windows:
      partial?.windows && partial.windows.length > 0
        ? partial.windows.map((w) => ({ ...w }))
        : (litho.windows || []).map((w) => ({ ...w })),
    assignedStepId: targetStep.id,
  };

  // Enforce 1-to-1 step assignment
  const cleanedMasks = existingMasks.map((m) =>
    m.assignedStepId === targetStep.id ? { ...m, assignedStepId: undefined } : m
  );
  cleanedMasks.push(newMask);

  const updatedSteps = flow.steps.map((s) => {
    if (s.id !== targetStep.id) return s;
    return {
      ...s,
      lithography: {
        ...litho,
        maskId: newMask.id,
        maskName: newMask.name,
        maskColor: newMask.color,
        polarity: newMask.polarity,
        maskField: newMask.maskField || 'dark-field',
        resistMaterialId: resolveResistMaterialId(newMask.polarity, litho.resistMaterialId),
        windows: newMask.windows.map((w) => ({ ...w })),
      },
    };
  });

  return {
    ...flow,
    masks: cleanedMasks,
    steps: updatedSteps,
  };
}

/**
 * Updates a mask level and propagates changes to any assigned photolithography step.
 */
export function updateMaskAndSyncSteps(
  flow: ProcessFlow,
  updatedMask: PhotomaskLevel
): ProcessFlow {
  const currentMasks = flow.masks ? [...flow.masks] : [];
  const maskIdx = currentMasks.findIndex((m) => m.id === updatedMask.id);
  if (maskIdx >= 0) {
    currentMasks[maskIdx] = updatedMask;
  } else {
    currentMasks.push(updatedMask);
  }

  // Synchronize to assigned step if linked
  let updatedSteps = flow.steps;
  if (updatedMask.assignedStepId) {
    updatedSteps = flow.steps.map((step) => {
      if (step.id === updatedMask.assignedStepId && step.type === 'lithography' && step.lithography) {
        return {
          ...step,
          lithography: {
            ...step.lithography,
            windows: updatedMask.windows.map((w) => ({ ...w })),
            polarity: updatedMask.polarity,
            maskField: updatedMask.maskField || step.lithography.maskField || 'dark-field',
            resistMaterialId: resolveResistMaterialId(updatedMask.polarity, step.lithography.resistMaterialId),
            maskName: updatedMask.name,
            maskId: updatedMask.id,
            maskColor: updatedMask.color,
          },
        };
      }
      return step;
    });
  }

  return {
    ...flow,
    masks: currentMasks,
    steps: updatedSteps,
  };
}

/**
 * Assigns or unassigns a mask level to/from a photolithography step.
 */
export function assignMaskToStep(
  flow: ProcessFlow,
  maskId: string,
  targetStepId: string | null
): ProcessFlow {
  const currentMasks = flow.masks ? flow.masks.map((m) => ({ ...m })) : [];
  const mask = currentMasks.find((m) => m.id === maskId);
  if (!mask) return flow;

  const prevAssignedStepId = mask.assignedStepId;
  mask.assignedStepId = targetStepId || undefined;

  // Enforce strict 1-to-1 rule: If targetStepId is assigned, remove it from any other reticle
  if (targetStepId) {
    currentMasks.forEach((other) => {
      if (other.id !== maskId && other.assignedStepId === targetStepId) {
        other.assignedStepId = undefined;
      }
    });
  }

  let updatedSteps = flow.steps.map((step) => {
    // If this step previously had this mask but is now unassigned
    if (prevAssignedStepId && step.id === prevAssignedStepId && step.id !== targetStepId) {
      if (step.type === 'lithography' && step.lithography?.maskId === maskId) {
        return {
          ...step,
          lithography: {
            ...step.lithography,
            maskId: undefined,
          },
        };
      }
    }

    // If this is the newly assigned step
    if (targetStepId && step.id === targetStepId && step.type === 'lithography') {
      const litho = step.lithography || {
        resistMaterialId: 'mat_pr_pos',
        resistThickness: 1000,
        polarity: 'positive',
        windows: [],
        sidewallAngle: 90,
        exposureMethod: 'UV Contact (365nm)',
      };
      return {
        ...step,
        lithography: {
          ...litho,
          maskId: mask.id,
          maskName: mask.name,
          polarity: mask.polarity,
          maskField: mask.maskField || litho.maskField || 'dark-field',
          resistMaterialId: resolveResistMaterialId(mask.polarity, litho.resistMaterialId),
          maskColor: mask.color,
          windows: mask.windows.map((w) => ({ ...w })),
        },
      };
    }

    return step;
  });

  return {
    ...flow,
    masks: currentMasks,
    steps: updatedSteps,
  };
}

/**
 * Swaps photomask assignments when a mask is assigned to a step that already has a mask.
 * - maskA is assigned to targetStepId (where maskB was assigned).
 * - If maskA previously had an assigned step (prevStepAId), maskB takes that step.
 * - If maskA was unassigned, maskB becomes unassigned.
 * - All affected steps have their lithography properties (maskId, maskName, polarity, windows) synchronized.
 */
export function swapMaskAssignments(
  flow: ProcessFlow,
  maskAId: string,
  targetStepId: string
): ProcessFlow {
  const currentMasks = flow.masks ? flow.masks.map((m) => ({ ...m })) : [];
  const maskA = currentMasks.find((m) => m.id === maskAId);
  const maskB = currentMasks.find((m) => m.assignedStepId === targetStepId && m.id !== maskAId);

  if (!maskA) return flow;
  if (!maskB) {
    return assignMaskToStep(flow, maskAId, targetStepId);
  }

  const prevStepAId = maskA.assignedStepId;
  const targetStepBId = targetStepId;

  // Swap assignedStepId references
  maskA.assignedStepId = targetStepBId;
  maskB.assignedStepId = prevStepAId || undefined;

  // Update steps
  const updatedSteps = flow.steps.map((step) => {
    // Step B receives Mask A
    if (step.id === targetStepBId && step.type === 'lithography') {
      const litho = step.lithography || {
        resistMaterialId: 'mat_pr_pos',
        resistThickness: 1000,
        polarity: 'positive',
        windows: [],
        sidewallAngle: 90,
        exposureMethod: 'UV Contact (365nm)',
      };
      return {
        ...step,
        lithography: {
          ...litho,
          maskId: maskA.id,
          maskName: maskA.name,
          polarity: maskA.polarity,
          maskField: maskA.maskField || litho.maskField || 'dark-field',
          resistMaterialId: resolveResistMaterialId(maskA.polarity, litho.resistMaterialId),
          maskColor: maskA.color,
          windows: maskA.windows.map((w) => ({ ...w })),
        },
      };
    }

    // If Mask A had a prior step, that step now receives Mask B
    if (prevStepAId && step.id === prevStepAId && step.type === 'lithography') {
      const litho = step.lithography || {
        resistMaterialId: 'mat_pr_pos',
        resistThickness: 1000,
        polarity: 'positive',
        windows: [],
        sidewallAngle: 90,
        exposureMethod: 'UV Contact (365nm)',
      };
      return {
        ...step,
        lithography: {
          ...litho,
          maskId: maskB.id,
          maskName: maskB.name,
          polarity: maskB.polarity,
          maskField: maskB.maskField || litho.maskField || 'dark-field',
          resistMaterialId: resolveResistMaterialId(maskB.polarity, litho.resistMaterialId),
          maskColor: maskB.color,
          windows: maskB.windows.map((w) => ({ ...w })),
        },
      };
    }

    return step;
  });

  return {
    ...flow,
    masks: currentMasks,
    steps: updatedSteps,
  };
}

/**
 * When a lithography step's apertures or properties are edited directly in the step editor
 * or MaskEditor track, sync back to the linked PhotomaskLevel.
 */
export function syncStepWindowsToMask(
  flow: ProcessFlow,
  step: ProcessStep
): ProcessFlow {
  if (step.type !== 'lithography' || !step.lithography) return flow;

  const litho = step.lithography;
  const currentMasks = flow.masks ? flow.masks.map((m) => ({ ...m })) : [];

  if (litho.maskId) {
    const mask = currentMasks.find((m) => m.id === litho.maskId);
    if (mask) {
      mask.windows = litho.windows.map((w) => ({ ...w }));
      mask.polarity = litho.polarity;
      mask.maskField = litho.maskField || mask.maskField || 'dark-field';
      if (litho.maskName) mask.name = litho.maskName;
      mask.assignedStepId = step.id;

      // Remove assignment from any other mask currently claiming this step
      currentMasks.forEach((other) => {
        if (other.id !== mask.id && other.assignedStepId === step.id) {
          other.assignedStepId = undefined;
        }
      });

      return {
        ...flow,
        masks: currentMasks,
      };
    }
  }

  return flow;
}

/**
 * Creates a brand new mask in the flow's mask library.
 */
export function createNewMaskInFlow(
  flow: ProcessFlow,
  partial?: Partial<PhotomaskLevel>
): { flow: ProcessFlow; newMask: PhotomaskLevel } {
  const currentMasks = flow.masks ? [...flow.masks] : [];
  const levelNum = getNextMaskLevelNumber(currentMasks);
  const tag = formatMaskLevelTag(levelNum);
  const id = `mask_${Date.now()}`;

  // Default aperture in center
  const wStart = Math.round((flow.substrateWidth || 10000) * 0.35);
  const wEnd = Math.round((flow.substrateWidth || 10000) * 0.65);

  const newMask: PhotomaskLevel = {
    id,
    levelNumber: levelNum,
    name: partial?.name || `MASK ${tag}: CUSTOM LEVEL`,
    layerCode: partial?.layerCode || `LVL-${tag}`,
    description: partial?.description || 'Photolithographic pattern level',
    polarity: partial?.polarity || 'positive',
    maskField: partial?.maskField || 'dark-field',
    color: partial?.color || RETICLE_PALETTE[(levelNum - 1) % RETICLE_PALETTE.length],
    windows: partial?.windows && partial.windows.length > 0
      ? partial.windows.map((w) => ({ ...w }))
      : [{ id: `w_${Date.now()}`, xStart: wStart, xEnd: wEnd }],
    assignedStepId: partial?.assignedStepId,
  };

  const updatedFlow = {
    ...flow,
    masks: [...currentMasks, newMask],
  };

  return {
    flow: newMask.assignedStepId ? assignMaskToStep(updatedFlow, newMask.id, newMask.assignedStepId) : updatedFlow,
    newMask,
  };
}

/**
 * Deletes an unassigned mask level. Assigned mask levels are preserved.
 */
export function deleteMaskFromFlow(
  flow: ProcessFlow,
  maskId: string
): ProcessFlow {
  const targetMask = (flow.masks || []).find((m) => m.id === maskId);
  const isAssigned =
    Boolean(
      targetMask?.assignedStepId &&
        flow.steps.some((s) => s.id === targetMask.assignedStepId && s.type === 'lithography')
    ) || flow.steps.some((s) => s.type === 'lithography' && s.lithography?.maskId === maskId);

  if (isAssigned) {
    return flow;
  }

  const currentMasks = (flow.masks || []).filter((m) => m.id !== maskId);
  const updatedGdsLayout = flow.gdsLayout
    ? {
        ...flow.gdsLayout,
        layers: flow.gdsLayout.layers.map((l) =>
          l.assignedMaskId === maskId ? { ...l, assignedMaskId: undefined } : l
        ),
      }
    : flow.gdsLayout;

  return {
    ...flow,
    masks: currentMasks,
    gdsLayout: updatedGdsLayout,
  };
}

/**
 * Calculates authentic cleanroom lithography metrics for a mask level,
 * accounting for both Dark-Field (blocks = apertures) and Light-Field (blocks = chrome blockers).
 */
export function calculateMaskMetrics(
  mask: PhotomaskLevel,
  waferWidth: number
) {
  const windows = mask.windows || [];
  const apertureCount = windows.length;
  const maskField: MaskFieldPolarity = mask.maskField || 'dark-field';
  const isLightField = maskField === 'light-field';

  let minFeatureSizeNm = Infinity;

  // Sort windows by xStart and clamp to [0, waferWidth]
  const sorted = [...windows]
    .map((w) => ({
      xStart: Math.max(0, Math.min(waferWidth, w.xStart)),
      xEnd: Math.max(0, Math.min(waferWidth, w.xEnd)),
    }))
    .filter((w) => w.xEnd > w.xStart)
    .sort((a, b) => a.xStart - b.xStart);

  for (const w of sorted) {
    const width = w.xEnd - w.xStart;
    if (width < minFeatureSizeNm && width > 0) {
      minFeatureSizeNm = width;
    }
  }

  // Merge overlapping blocks so clear/blocked coverage never exceeds 100%
  const merged: Array<{ xStart: number; xEnd: number }> = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && w.xStart <= last.xEnd) {
      last.xEnd = Math.max(last.xEnd, w.xEnd);
    } else {
      merged.push({ ...w });
    }
  }

  const coveredWidthNm = merged.reduce((sum, w) => sum + (w.xEnd - w.xStart), 0);

  let minSpaceNm = Infinity;
  for (let i = 0; i < merged.length - 1; i++) {
    const space = merged[i + 1].xStart - merged[i].xEnd;
    if (space >= 0 && space < minSpaceNm) {
      minSpaceNm = space;
    }
  }

  const totalClearWidthNm = isLightField
    ? Math.max(0, waferWidth - coveredWidthNm)
    : coveredWidthNm;
  const totalBlockedWidthNm = isLightField
    ? coveredWidthNm
    : Math.max(0, waferWidth - coveredWidthNm);
  const clearPercentage = waferWidth > 0 ? (totalClearWidthNm / waferWidth) * 100 : 0;

  return {
    apertureCount,
    isLightField,
    maskField,
    totalClearWidthNm,
    totalClearWidthUm: (totalClearWidthNm / 1000).toFixed(2),
    totalBlockedWidthNm,
    totalBlockedWidthUm: (totalBlockedWidthNm / 1000).toFixed(2),
    clearPercentage: Math.min(100, Math.max(0, clearPercentage)).toFixed(1),
    minFeatureSizeNm: minFeatureSizeNm === Infinity ? 0 : Math.round(minFeatureSizeNm),
    minFeatureSizeUm: minFeatureSizeNm === Infinity ? '0.00' : (minFeatureSizeNm / 1000).toFixed(2),
    minSpaceNm: minSpaceNm === Infinity ? 0 : Math.round(minSpaceNm),
  };
}

export type MaskWindowArrayDirection = 'right' | 'left' | 'center';

export interface MaskWindowArrayOptions {
  count: number;
  pitchNm: number;
  direction: MaskWindowArrayDirection;
}

/**
 * Duplicates a mask window shifted adjacent to the source so it remains visible and editable.
 */
export function duplicateMaskWindow(
  source: MaskWindow,
  waferWidth: number
): MaskWindow {
  const width = Math.max(10, Math.min(waferWidth, Math.round(source.xEnd - source.xStart)));
  const defaultPitch = Math.max(width + 100, Math.round(width * 2));

  let nextStart: number;
  if (source.xStart + defaultPitch + width <= waferWidth) {
    nextStart = source.xStart + defaultPitch;
  } else if (source.xStart - defaultPitch >= 0) {
    nextStart = source.xStart - defaultPitch;
  } else if (source.xEnd + 50 <= waferWidth) {
    nextStart = Math.min(waferWidth - width, source.xStart + Math.max(50, Math.round((waferWidth - source.xEnd) / 2)));
  } else if (source.xStart - 50 >= 0) {
    nextStart = Math.max(0, source.xStart - Math.max(50, Math.round(source.xStart / 2)));
  } else {
    nextStart = Math.max(0, Math.min(waferWidth - width, source.xStart + (source.xStart + width + 50 <= waferWidth ? 50 : -50)));
  }

  const nextEnd = Math.min(waferWidth, Math.round(nextStart) + width);
  const clampedStart = Math.max(0, nextEnd - width);

  const inheritedBindings = source.paramBindings?.width
    ? { width: source.paramBindings.width }
    : undefined;

  return {
    id: `w_dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    xStart: clampedStart,
    xEnd: nextEnd,
    ...(source.fixedWidth ? { fixedWidth: true } : {}),
    ...(inheritedBindings ? { paramBindings: inheritedBindings } : {}),
  };
}

/**
 * Builds a 1D periodic array of apertures/blockers starting from or centered around `sourceId`.
 */
export function createMaskWindowArray(
  windows: MaskWindow[],
  sourceId: string,
  options: MaskWindowArrayOptions,
  waferWidth: number
): {
  windows: MaskWindow[];
  addedIds: string[];
  totalPlaced: number;
  skippedOutOfBounds: number;
} {
  const sourceIdx = windows.findIndex((w) => w.id === sourceId);
  if (sourceIdx < 0) {
    return { windows, addedIds: [], totalPlaced: 0, skippedOutOfBounds: 0 };
  }

  const source = windows[sourceIdx];
  const count = Math.max(2, Math.min(100, Math.round(options.count)));
  const pitchNm = Math.max(10, Math.round(options.pitchNm));
  const width = Math.max(10, Math.min(waferWidth, Math.round(source.xEnd - source.xStart)));
  const inheritedBindings = source.paramBindings?.width
    ? { width: source.paramBindings.width }
    : undefined;
  const stamp = Date.now();

  if (options.direction === 'center') {
    const sourceCenter = (source.xStart + source.xEnd) / 2;
    const halfSpan = ((count - 1) * pitchNm) / 2;
    const generated: MaskWindow[] = [];
    let skipped = 0;

    for (let i = 0; i < count; i++) {
      const cx = sourceCenter - halfSpan + i * pitchNm;
      const rawStart = Math.round(cx - width / 2);
      const rawEnd = rawStart + width;
      if (rawEnd <= 0 || rawStart >= waferWidth) {
        skipped++;
        continue;
      }
      const cStart = Math.max(0, rawStart);
      const cEnd = Math.min(waferWidth, rawEnd);
      if (cEnd - cStart < 10) {
        skipped++;
        continue;
      }
      generated.push({
        id:
          generated.length === 0
            ? source.id
            : `w_arr_${stamp}_${i}_${Math.random().toString(36).slice(2, 5)}`,
        xStart: cStart,
        xEnd: cEnd,
        ...(source.fixedWidth ? { fixedWidth: true } : {}),
        ...(inheritedBindings ? { paramBindings: inheritedBindings } : {}),
      });
    }

    if (generated.length === 0) {
      return { windows, addedIds: [], totalPlaced: 1, skippedOutOfBounds: skipped };
    }

    const nextWindows = [
      ...windows.slice(0, sourceIdx),
      ...generated,
      ...windows.slice(sourceIdx + 1),
    ];
    return {
      windows: nextWindows,
      addedIds: generated.slice(1).map((g) => g.id),
      totalPlaced: generated.length,
      skippedOutOfBounds: skipped,
    };
  }

  // 'right' or 'left': preserve source window untouched, append valid shifted copies
  const copies: MaskWindow[] = [];
  let skipped = 0;

  for (let i = 1; i < count; i++) {
    const delta = options.direction === 'right' ? i * pitchNm : -i * pitchNm;
    const rawStart = Math.round(source.xStart + delta);
    const rawEnd = rawStart + width;
    if (rawEnd <= 0 || rawStart >= waferWidth) {
      skipped++;
      continue;
    }
    const cStart = Math.max(0, rawStart);
    const cEnd = Math.min(waferWidth, rawEnd);
    if (cEnd - cStart < 10) {
      skipped++;
      continue;
    }
    copies.push({
      id: `w_arr_${stamp}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      xStart: cStart,
      xEnd: cEnd,
      ...(source.fixedWidth ? { fixedWidth: true } : {}),
      ...(inheritedBindings ? { paramBindings: inheritedBindings } : {}),
    });
  }

  const nextWindows = [
    ...windows.slice(0, sourceIdx + 1),
    ...copies,
    ...windows.slice(sourceIdx + 1),
  ];

  return {
    windows: nextWindows,
    addedIds: copies.map((c) => c.id),
    totalPlaced: 1 + copies.length,
    skippedOutOfBounds: skipped,
  };
}

