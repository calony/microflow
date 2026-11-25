/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProcessFlow } from '../types/microfab';
import type { ThicknessUnit } from './units';
import {
  buildBatchStepItems,
  computeGlobalVerticalBounds,
  renderBatchStepSvg,
  slugifyFilename,
} from './batchExportUtils';

export const PROCESS_VIDEO_WIDTH = 1280;
export const PROCESS_VIDEO_HEIGHT = 720;
export const PROCESS_VIDEO_FPS = 30;

export function getProcessVideoTiming(playSpeed: number) {
  if (!Number.isFinite(playSpeed) || playSpeed <= 0) {
    throw new Error('Choose a valid playback speed before exporting.');
  }
  // Match the Play Process Sequence interval, rounded to the nearest video frame.
  const intervalMs = Math.max(150, Math.round(1800 / playSpeed));
  const framesPerStep = Math.max(1, Math.round(intervalMs * PROCESS_VIDEO_FPS / 1000));
  return { frameRate: PROCESS_VIDEO_FPS, framesPerStep };
}

export function buildProcessVideoFrames(flow: ProcessFlow, thicknessUnit: ThicknessUnit) {
  const items = buildBatchStepItems(flow, true, false, thicknessUnit);
  const bounds = computeGlobalVerticalBounds(items);
  const frames = items.map((item) => ({
    ...renderBatchStepSvg(item, flow, {
      format: 'svg', theme: 'dark', delivery: 'individual', pngScale: 1,
      renderMode: 'hatch', showOutlines: true, showHeader: true,
      showAxes: true, showLegend: true, sharedScale: true,
      zScaleMode: 'linear', thicknessUnit,
    }, bounds),
    title: item.title,
    stepNumber: item.stepNumber,
  }));
  return {
    frames,
    // One scale and top alignment keep the wafer stationary as the legend changes.
    maxHeight: Math.max(...frames.map((frame) => frame.height)),
    filename: `${slugifyFilename(flow.title, 'microflow')}-process-sequence.mp4`,
  };
}

export type ProcessVideoFrame = ReturnType<typeof buildProcessVideoFrames>['frames'][number];
