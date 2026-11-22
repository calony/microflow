/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProcessStep, ProcessStepVariant } from '../types/microfab';

function cloneDeep<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val)) as T;
}

function generateVariantId(suffix?: string): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `var_${Date.now()}_${rand}${suffix ? `_${suffix}` : ''}`;
}

export function extractVariantPayloadFromStep(
  step: ProcessStep
): Omit<ProcessStepVariant, 'id' | 'name'> {
  return {
    title: step.title,
    type: step.type,
    ...(step.side !== undefined ? { side: step.side } : {}),
    ...(step.notes !== undefined ? { notes: step.notes } : {}),
    ...(step.materialId !== undefined ? { materialId: step.materialId } : {}),
    ...(step.thickness !== undefined ? { thickness: step.thickness } : {}),
    ...(step.deposition !== undefined ? { deposition: cloneDeep(step.deposition) } : {}),
    ...(step.lithography !== undefined ? { lithography: cloneDeep(step.lithography) } : {}),
    ...(step.etch !== undefined ? { etch: cloneDeep(step.etch) } : {}),
    ...(step.strip !== undefined ? { strip: cloneDeep(step.strip) } : {}),
    ...(step.cmp !== undefined ? { cmp: cloneDeep(step.cmp) } : {}),
    ...(step.bonding !== undefined ? { bonding: cloneDeep(step.bonding) } : {}),
    ...(step.dicing !== undefined ? { dicing: cloneDeep(step.dicing) } : {}),
    ...(step.tapeFrame !== undefined ? { tapeFrame: cloneDeep(step.tapeFrame) } : {}),
    ...(step.toolRecipe !== undefined ? { toolRecipe: cloneDeep(step.toolRecipe) } : {}),
    ...(step.paramBindings !== undefined ? { paramBindings: cloneDeep(step.paramBindings) } : {}),
  };
}

function applyVariantPayloadToStep(
  step: ProcessStep,
  variant: ProcessStepVariant
): ProcessStep {
  return {
    ...step,
    title: variant.title,
    type: variant.type,
    side: variant.side,
    notes: variant.notes,
    materialId: variant.materialId,
    thickness: variant.thickness,
    deposition: variant.deposition !== undefined ? cloneDeep(variant.deposition) : undefined,
    lithography: variant.lithography !== undefined ? cloneDeep(variant.lithography) : undefined,
    etch: variant.etch !== undefined ? cloneDeep(variant.etch) : undefined,
    strip: variant.strip !== undefined ? cloneDeep(variant.strip) : undefined,
    cmp: variant.cmp !== undefined ? cloneDeep(variant.cmp) : undefined,
    bonding: variant.bonding !== undefined ? cloneDeep(variant.bonding) : undefined,
    dicing: variant.dicing !== undefined ? cloneDeep(variant.dicing) : undefined,
    tapeFrame: variant.tapeFrame !== undefined ? cloneDeep(variant.tapeFrame) : undefined,
    toolRecipe: variant.toolRecipe !== undefined ? cloneDeep(variant.toolRecipe) : undefined,
    paramBindings:
      variant.paramBindings !== undefined ? cloneDeep(variant.paramBindings) : undefined,
    activeVariantId: variant.id,
  };
}

export function getActiveStepVariant(step: ProcessStep): ProcessStepVariant | null {
  if (!step.variants || step.variants.length === 0) return null;
  if (step.activeVariantId) {
    const found = step.variants.find((v) => v.id === step.activeVariantId);
    if (found) return found;
  }
  return step.variants[0];
}

/**
 * Ensures step.variants[activeVariantId] reflects the current top-level ProcessStep parameters.
 * No-op if the step does not define variants.
 */
export function syncActiveVariantSnapshot(step: ProcessStep): ProcessStep {
  if (!step.variants || step.variants.length === 0) return step;
  const active = getActiveStepVariant(step);
  if (!active) return step;

  const payload = extractVariantPayloadFromStep(step);
  const nextVariants = step.variants.map((v) =>
    v.id === active.id
      ? {
          id: v.id,
          name: v.name,
          ...payload,
        }
      : v
  );

  return {
    ...step,
    activeVariantId: active.id,
    variants: nextVariants,
  };
}

function getNextDefaultVariantName(existing: ProcessStepVariant[]): string {
  const existingLower = new Set(existing.map((v) => v.name.trim().toLowerCase()));
  const letters = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const candidate = `Variant ${letters[i]}`;
    if (!existingLower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  let n = existing.length + 1;
  while (existingLower.has(`variant ${n}`)) {
    n++;
  }
  return `Variant ${n}`;
}

/**
 * Branches the step with a new parameter variant cloned from the currently active configuration
 * and activates it immediately.
 */
export function createStepVariant(step: ProcessStep, variantName?: string): ProcessStep {
  const synced = syncActiveVariantSnapshot(step);
  const basePayload = extractVariantPayloadFromStep(synced);

  if (!synced.variants || synced.variants.length === 0) {
    const baseline: ProcessStepVariant = {
      id: generateVariantId('base'),
      name: 'Baseline',
      ...cloneDeep(basePayload),
    };
    const nextName = variantName?.trim() || 'Variant B';
    const branched: ProcessStepVariant = {
      id: generateVariantId('b'),
      name: nextName,
      ...cloneDeep(basePayload),
    };
    return {
      ...synced,
      variants: [baseline, branched],
      activeVariantId: branched.id,
    };
  }

  const nextName = variantName?.trim() || getNextDefaultVariantName(synced.variants);
  const branched: ProcessStepVariant = {
    id: generateVariantId('v'),
    name: nextName,
    ...cloneDeep(basePayload),
  };

  return {
    ...synced,
    variants: [...synced.variants, branched],
    activeVariantId: branched.id,
  };
}

export function duplicateStepVariant(step: ProcessStep, sourceVariantId?: string): ProcessStep {
  const synced = syncActiveVariantSnapshot(step);
  if (!synced.variants || synced.variants.length === 0) {
    return createStepVariant(synced);
  }
  const source =
    (sourceVariantId && synced.variants.find((v) => v.id === sourceVariantId)) ||
    getActiveStepVariant(synced) ||
    synced.variants[0];

  const existingLower = new Set(synced.variants.map((v) => v.name.trim().toLowerCase()));
  let candidate = `${source.name} (Copy)`;
  let counter = 2;
  while (existingLower.has(candidate.toLowerCase())) {
    candidate = `${source.name} (Copy ${counter})`;
    counter++;
  }

  const cloned: ProcessStepVariant = {
    ...cloneDeep(source),
    id: generateVariantId('dup'),
    name: candidate,
  };

  const nextStep = applyVariantPayloadToStep(synced, cloned);
  return {
    ...nextStep,
    variants: [...synced.variants, cloned],
    activeVariantId: cloned.id,
  };
}

/**
 * Saves current active fields into the current variant and loads targetVariantId onto the step.
 */
export function switchStepVariant(step: ProcessStep, targetVariantId: string): ProcessStep {
  if (!step.variants || step.variants.length === 0) return step;
  const synced = syncActiveVariantSnapshot(step);
  const target = synced.variants?.find((v) => v.id === targetVariantId);
  if (!target || target.id === synced.activeVariantId) return synced;
  return applyVariantPayloadToStep(synced, target);
}

export function renameStepVariant(
  step: ProcessStep,
  variantId: string,
  name: string
): ProcessStep {
  if (!step.variants || step.variants.length === 0) return step;
  const trimmed = name.trim();
  if (!trimmed) return step;
  return {
    ...step,
    variants: step.variants.map((v) => (v.id === variantId ? { ...v, name: trimmed } : v)),
  };
}

/**
 * Deletes a variant. If only 1 variant remains afterward, applies that remaining variant
 * onto the step and collapses variants back into a standard single-configuration step.
 */
export function deleteStepVariant(step: ProcessStep, variantId: string): ProcessStep {
  const synced = syncActiveVariantSnapshot(step);
  if (!synced.variants || synced.variants.length === 0) return synced;

  const idx = synced.variants.findIndex((v) => v.id === variantId);
  if (idx < 0) return synced;

  const remaining = synced.variants.filter((v) => v.id !== variantId);
  if (remaining.length === 0) {
    return {
      ...synced,
      variants: undefined,
      activeVariantId: undefined,
      variantMaskEditMode: undefined,
    };
  }

  if (remaining.length === 1) {
    const solo = remaining[0];
    const applied = applyVariantPayloadToStep(synced, solo);
    return {
      ...applied,
      variants: undefined,
      activeVariantId: undefined,
      variantMaskEditMode: undefined,
    };
  }

  const wasActive = synced.activeVariantId === variantId;
  if (!wasActive) {
    return {
      ...synced,
      variants: remaining,
    };
  }

  const nextActive = remaining[Math.min(idx, remaining.length - 1)];
  const applied = applyVariantPayloadToStep(synced, nextActive);
  return {
    ...applied,
    variants: remaining,
    activeVariantId: nextActive.id,
  };
}

/**
 * When duplicating an entire ProcessStep, regenerate variant IDs and detach lithography maskIds
 * so the cloned step's variants never mutate the original step's reticles or variant IDs.
 */
export function detachVariantsForDuplicatedStep(
  step: ProcessStep,
  idSeed: number
): ProcessStep {
  const synced = syncActiveVariantSnapshot(step);
  if (!synced.variants || synced.variants.length === 0) return synced;

  let nextActiveId: string | undefined;
  const nextVariants: ProcessStepVariant[] = synced.variants.map((v, vIdx) => {
    const newId = `var_${idSeed}_${vIdx}_${Math.random().toString(36).slice(2, 5)}`;
    if (v.id === synced.activeVariantId) {
      nextActiveId = newId;
    }
    return {
      ...cloneDeep(v),
      id: newId,
      ...(v.lithography
        ? {
            lithography: {
              ...cloneDeep(v.lithography),
              maskId: undefined,
              maskName: undefined,
              windows: (v.lithography.windows || []).map((w, wIdx) => ({
                ...w,
                id: `w_${idSeed}_${vIdx}_${wIdx}`,
              })),
            },
          }
        : {}),
    };
  });

  return {
    ...synced,
    variants: nextVariants,
    activeVariantId: nextActiveId || nextVariants[0].id,
  };
}
