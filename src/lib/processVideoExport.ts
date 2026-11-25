/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import encoderScriptUrl from 'h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js?url';
import encoderWorkerSource from '../workers/mp4Encoder.worker.js?raw';
import type { ProcessFlow } from '../types/microfab';
import type { ThicknessUnit } from './units';
import {
  buildProcessVideoFrames, getProcessVideoTiming,
  PROCESS_VIDEO_WIDTH, PROCESS_VIDEO_HEIGHT,
} from './processVideoFrames';
import type { ProcessVideoFrame } from './processVideoFrames';

export interface ProcessVideoProgress {
  phase: 'preparing' | 'encoding' | 'finalizing';
  completed: number;
  total: number;
}

function abortError() {
  return new DOMException('Video export cancelled.', 'AbortError');
}

function drawVideoFrame(
  context: CanvasRenderingContext2D,
  frame: ProcessVideoFrame,
  maxHeight: number,
  flowTitle: string,
  totalSteps: number,
  signal: AbortSignal
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const url = URL.createObjectURL(new Blob([frame.svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const onAbort = () => { cleanup(); image.src = ''; reject(abortError()); };
    signal.addEventListener('abort', onAbort, { once: true });
    image.onerror = () => { cleanup(); reject(new Error('Could not render a process cross-section for the video.')); };
    image.onload = () => {
      try {
        context.fillStyle = '#060a12';
        context.fillRect(0, 0, PROCESS_VIDEO_WIDTH, PROCESS_VIDEO_HEIGHT);
        context.fillStyle = '#f8fafc';
        context.font = '600 20px system-ui, sans-serif';
        context.fillText(flowTitle, 24, 32, PROCESS_VIDEO_WIDTH - 48);
        const scale = Math.min((PROCESS_VIDEO_WIDTH - 32) / frame.width, (PROCESS_VIDEO_HEIGHT - 100) / maxHeight);
        context.drawImage(image, (PROCESS_VIDEO_WIDTH - frame.width * scale) / 2, 50, frame.width * scale, frame.height * scale);
        context.fillStyle = '#94a3b8';
        context.font = '14px system-ui, sans-serif';
        context.fillText(`MicroFlow · Step ${frame.stepNumber} of ${totalSteps}`, 24, PROCESS_VIDEO_HEIGHT - 18);
        const rgba = context.getImageData(0, 0, PROCESS_VIDEO_WIDTH, PROCESS_VIDEO_HEIGHT).data;
        cleanup();
        resolve(rgba.buffer as ArrayBuffer);
      } catch (error) { cleanup(); reject(error); }
    };
    image.src = url;
  });
}

export async function exportProcessSequenceVideo(
  flow: ProcessFlow,
  playSpeed: number,
  thicknessUnit: ThicknessUnit,
  signal: AbortSignal,
  onProgress: (progress: ProcessVideoProgress) => void
): Promise<{ blob: Blob; filename: string }> {
  if (signal.aborted) throw abortError();
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('MP4 export needs a current browser with video export support.');
  }
  const timing = getProcessVideoTiming(playSpeed);
  onProgress({ phase: 'preparing', completed: 0, total: 0 });
  // Let the progress indicator paint before preparing the cross-sections.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (signal.aborted) throw abortError();
  const { frames, maxHeight, filename } = buildProcessVideoFrames(flow, thicknessUnit);
  if (signal.aborted) throw abortError();
  const canvas = document.createElement('canvas');
  canvas.width = PROCESS_VIDEO_WIDTH;
  canvas.height = PROCESS_VIDEO_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create a canvas for the video.');

  // Use the package's browser build, bundled as a same-origin static asset.
  // This also works in Firefox without relying on native H.264 recording support.
  const encoderUrl = new URL(encoderScriptUrl, window.location.href).href;
  const source = `importScripts(${JSON.stringify(encoderUrl)});\n${encoderWorkerSource}`;
  const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let worker: Worker;
  try { worker = new Worker(workerUrl); }
  catch (error) { URL.revokeObjectURL(workerUrl); throw error; }

  return new Promise((resolve, reject) => {
    let settled = false;
    let completed = 0;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      canvas.width = 0;
      canvas.height = 0;
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(abortError());
    const sendNextFrame = async () => {
      if (settled) return;
      if (completed === frames.length) {
        onProgress({ phase: 'finalizing', completed, total: frames.length });
        worker.postMessage({ type: 'finish' });
        return;
      }
      onProgress({ phase: 'encoding', completed, total: frames.length });
      const rgba = await drawVideoFrame(context, frames[completed], maxHeight, flow.title, frames.length - 1, signal);
      if (!settled) worker.postMessage({ type: 'frame', rgba }, [rgba]);
    };
    worker.onerror = (event) => { event.preventDefault(); fail(new Error(event.message || 'Could not start the MP4 encoder. Please reload and try again.')); };
    worker.onmessageerror = () => fail(new Error('Could not receive the encoded video. Please try again.'));
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === 'ready') void sendNextFrame().catch(fail);
      else if (data.type === 'frame-complete') { completed++; void sendNextFrame().catch(fail); }
      else if (data.type === 'error') fail(new Error(data.message));
      else if (data.type === 'complete') {
        settled = true;
        cleanup();
        resolve({ blob: new Blob([data.bytes], { type: 'video/mp4' }), filename });
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    try { worker.postMessage({ type: 'init', width: PROCESS_VIDEO_WIDTH, height: PROCESS_VIDEO_HEIGHT, ...timing }); }
    catch (error) { fail(error); }
  });
}

export function downloadProcessVideo(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the URL alive long enough for Safari and the download manager to consume it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
