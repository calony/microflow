/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CrossSectionMesh, Material } from '../types/microfab';
import { getMaterialById } from './materials';

export interface StackLayerEntry {
  kind: 'material' | 'gap';
  materialId?: string;
  materialName: string;
  materialColor: string;
  stepId?: string;
  isSubstrate: boolean;
  yBottom: number;
  yTop: number;
  thicknessNm: number;
}

export interface StackProbeSample {
  xNm: number;
  sampledColX: number;
  layersTopToBottom: StackLayerEntry[];
  totalMaterialThicknessNm: number;
  overlayerThicknessNm: number;
  hasSubstrateLayers: boolean;
  hasOverlayers: boolean;
  surfaceTopY: number;
  stackBottomY: number;
  overallSpanNm: number;
  gapThicknessNm: number;
}

export const STACK_PROBE_COLORS = [
  '#38bdf8', // Sky
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#f43f5e', // Rose
  '#22d3ee', // Cyan
];

/**
 * Samples the vertical material stack at a given lateral wafer coordinate `xNm`.
 */
export function sampleStackAtX(
  mesh: CrossSectionMesh,
  materials: Material[],
  xNm: number
): StackProbeSample {
  const clampedX = Math.max(0, Math.min(mesh.width, xNm));
  if (!mesh.columns || mesh.columns.length === 0) {
    return {
      xNm: clampedX,
      sampledColX: clampedX,
      layersTopToBottom: [],
      totalMaterialThicknessNm: 0,
      overlayerThicknessNm: 0,
      hasSubstrateLayers: false,
      hasOverlayers: false,
      surfaceTopY: 0,
      stackBottomY: 0,
      overallSpanNm: 0,
      gapThicknessNm: 0,
    };
  }

  let bestIdx = Math.max(
    0,
    Math.min(
      mesh.columns.length - 1,
      Math.floor((clampedX / Math.max(1, mesh.width)) * mesh.columns.length)
    )
  );
  let bestDist = Math.abs(mesh.columns[bestIdx].x - clampedX);
  for (const offset of [-1, 1]) {
    const candidate = bestIdx + offset;
    if (candidate >= 0 && candidate < mesh.columns.length) {
      const d = Math.abs(mesh.columns[candidate].x - clampedX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = candidate;
      }
    }
  }

  const col = mesh.columns[bestIdx];
  const validSegments = col.segments
    .filter((seg) => seg.yTop - seg.yBottom > 0.1)
    .slice()
    .sort((a, b) => a.yBottom - b.yBottom);

  const bottomToTop: StackLayerEntry[] = [];
  let totalMaterialThicknessNm = 0;
  let overlayerThicknessNm = 0;
  let gapThicknessNm = 0;
  let hasSubstrateLayers = false;
  let hasOverlayers = false;

  for (let i = 0; i < validSegments.length; i++) {
    const seg = validSegments[i];
    if (i > 0) {
      const prevTop = validSegments[i - 1].yTop;
      const gap = seg.yBottom - prevTop;
      if (gap > 1) {
        bottomToTop.push({
          kind: 'gap',
          materialName: 'Cavity / Air Gap',
          materialColor: '#334155',
          isSubstrate: false,
          yBottom: prevTop,
          yTop: seg.yBottom,
          thicknessNm: gap,
        });
        gapThicknessNm += gap;
      }
    }

    const mat = getMaterialById(materials, seg.materialId);
    const thick = seg.yTop - seg.yBottom;
    const isSub = Boolean(seg.stepId && seg.stepId.startsWith('substrate_'));
    if (isSub) {
      hasSubstrateLayers = true;
    } else {
      hasOverlayers = true;
      overlayerThicknessNm += thick;
    }
    totalMaterialThicknessNm += thick;

    // Merge consecutive segments of identical material & step role if touching
    const prevEntry = bottomToTop[bottomToTop.length - 1];
    if (
      prevEntry &&
      prevEntry.kind === 'material' &&
      prevEntry.materialId === seg.materialId &&
      prevEntry.stepId === seg.stepId &&
      Math.abs(seg.yBottom - prevEntry.yTop) <= 1
    ) {
      prevEntry.yTop = seg.yTop;
      prevEntry.thicknessNm = prevEntry.yTop - prevEntry.yBottom;
    } else {
      bottomToTop.push({
        kind: 'material',
        materialId: seg.materialId,
        materialName: mat.name,
        materialColor: mat.color,
        stepId: seg.stepId,
        isSubstrate: isSub,
        yBottom: seg.yBottom,
        yTop: seg.yTop,
        thicknessNm: thick,
      });
    }
  }

  const stackBottomY = validSegments.length > 0 ? validSegments[0].yBottom : 0;
  const surfaceTopY =
    validSegments.length > 0 ? validSegments[validSegments.length - 1].yTop : 0;

  return {
    xNm: clampedX,
    sampledColX: col.x,
    layersTopToBottom: bottomToTop.reverse(),
    totalMaterialThicknessNm,
    overlayerThicknessNm,
    hasSubstrateLayers,
    hasOverlayers,
    surfaceTopY,
    stackBottomY,
    overallSpanNm: Math.max(0, surfaceTopY - stackBottomY),
    gapThicknessNm,
  };
}
