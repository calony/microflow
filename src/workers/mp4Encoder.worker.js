/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Loaded as a classic worker after the locally bundled H264 encoder script.
 * Keeping the encoder in its own worker also allows immediate cancellation.
 */

let encoder;
let framesPerStep;

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      if (encoder) throw new Error('Video encoder is already running.');
      encoder = await self.HME.createH264MP4Encoder();
      encoder.width = data.width;
      encoder.height = data.height;
      encoder.frameRate = data.frameRate;
      encoder.quantizationParameter = 22;
      encoder.speed = 5;
      encoder.groupOfPictures = data.frameRate * 2;
      framesPerStep = data.framesPerStep;
      encoder.initialize();
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      if (!encoder) throw new Error('Video encoder has not started.');
      const rgba = new Uint8Array(data.rgba);
      if (rgba.length !== encoder.width * encoder.height * 4) {
        throw new Error('The video frame has an unexpected size.');
      }
      for (let i = 0; i < framesPerStep; i++) encoder.addFrameRgba(rgba);
      self.postMessage({ type: 'frame-complete' });
    } else if (data.type === 'finish') {
      if (!encoder) throw new Error('Video encoder has not started.');
      encoder.finalize();
      const bytes = encoder.FS.readFile(encoder.outputFilename).slice();
      encoder.delete();
      encoder = undefined;
      self.postMessage({ type: 'complete', bytes: bytes.buffer }, [bytes.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'MP4 encoding failed.' });
    // An unfinished encoder cannot be deleted safely. Closing this dedicated worker
    // releases its entire WASM heap, including any partially initialized encoder.
    self.close();
  }
};
