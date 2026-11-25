import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { PRESET_PROCESS_FLOWS } from './presets';
import {
  buildProcessVideoFrames, getProcessVideoTiming,
  PROCESS_VIDEO_WIDTH, PROCESS_VIDEO_HEIGHT, PROCESS_VIDEO_FPS,
} from './processVideoFrames';

test('video includes the starting wafer and every enabled step in sequence', () => {
  const flow = structuredClone(PRESET_PROCESS_FLOWS[0]);
  flow.title = 'My process / export';
  flow.steps[1].enabled = false;
  const { frames, filename, maxHeight } = buildProcessVideoFrames(flow, 'nm');
  const enabled = flow.steps.filter((step) => step.enabled);

  assert.equal(frames.length, enabled.length + 1);
  assert.equal(frames[0].stepNumber, 0);
  assert.deepEqual(frames.slice(1).map((frame) => frame.title), enabled.map((step) => step.title));
  assert.ok(frames.every((frame) => frame.svg.includes('<svg') && frame.height <= maxHeight));
  assert.equal(filename, 'my-process-export-process-sequence.mp4');
  assert.equal(PROCESS_VIDEO_WIDTH % 2, 0);
  assert.equal(PROCESS_VIDEO_HEIGHT % 2, 0);
});

test('video speed matches playback within one frame for every supported speed', () => {
  for (const speed of [0.5, 1, 1.5, 2, 3, 5]) {
    const { frameRate, framesPerStep } = getProcessVideoTiming(speed);
    assert.equal(frameRate, PROCESS_VIDEO_FPS);
    assert.ok(Math.abs(framesPerStep / frameRate - Math.max(0.15, 1.8 / speed)) <= 1 / frameRate);
  }
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => getProcessVideoTiming(invalid));
});

test('empty recipe still produces a starting-wafer frame and safe filename', () => {
  const flow = { ...structuredClone(PRESET_PROCESS_FLOWS[0]), title: '研究', steps: [] };
  const result = buildProcessVideoFrames(flow, 'um');
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].stepNumber, 0);
  assert.equal(result.filename, 'microflow-process-sequence.mp4');
});

// Run the exact browser encoder and worker script in an isolated worker-like scope.
// No native H.264 encoder or browser-specific MediaRecorder support is used.
async function createWorkerHarness() {
  const require = createRequire(import.meta.url);
  const messages: any[] = [];
  const scope: any = {
    console, WebAssembly, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray,
    ArrayBuffer, atob, btoa, setTimeout, clearTimeout, crypto: webcrypto,
    location: { href: 'https://microflow.test/assets/mp4-encoder.js' },
    importScripts() { throw new Error('Encoder must be self-contained.'); },
    postMessage(message: any) { messages.push(message); },
    close() { scope.closed = true; },
  };
  scope.self = scope;
  const encoder = readFileSync(require.resolve('h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js'), 'utf8');
  const worker = readFileSync(new URL('../workers/mp4Encoder.worker.js', import.meta.url), 'utf8');
  runInNewContext(`${encoder}\n${worker}`, scope);
  await scope.onmessage({ data: { type: 'init', width: 64, height: 48, frameRate: 30, framesPerStep: 2 } });
  assert.equal(messages.at(-1).type, 'ready');
  return { scope, messages };
}

test('browser worker creates a real H.264 MP4 file from RGBA frames', async () => {
  const { scope, messages } = await createWorkerHarness();
  const rgba = new Uint8Array(64 * 48 * 4).fill(255);
  await scope.onmessage({ data: { type: 'frame', rgba: rgba.buffer } });
  assert.equal(messages.at(-1).type, 'frame-complete');
  await scope.onmessage({ data: { type: 'finish' } });
  const result = messages.at(-1);
  assert.equal(result.type, 'complete');
  const bytes = Buffer.from(result.bytes);
  assert.ok(bytes.length > 100);
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  assert.ok(bytes.includes(Buffer.from('moov')));
  assert.ok(bytes.includes(Buffer.from('avc1')));
});

test('worker reports an invalid frame instead of producing a corrupt video', async () => {
  const { scope, messages } = await createWorkerHarness();
  await scope.onmessage({ data: { type: 'frame', rgba: new ArrayBuffer(4) } });
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /unexpected size/);
  assert.equal(scope.closed, true);
});
