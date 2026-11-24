/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RenderedPolygon } from '../types/microfab';

export type PiecewiseZMode = 'linear' | 'auto' | 'custom';

export interface PiecewiseZBand {
  id: string;
  index: number;
  yMin: number; // world nm
  yMax: number; // world nm
  worldSpan: number; // yMax - yMin (nm)
  visMin: number; // mapped visual nm
  visMax: number; // mapped visual nm
  visSpan: number; // visMax - visMin
  localGain: number; // visSpan / worldSpan (relative to linear)
  visualPct: number; // 0..100
  userGain?: number; // multiplier in custom mode
}

export interface CustomZZonesConfig {
  /** Interior breakpoints in nm (breakpoints strictly inside (rawMinY, rawMaxY) create zones) */
  breakpointsNm: number[];
  /** Relative Z multiplier per zone (length = breakpointsNm.length + 1) */
  zoneGains: number[];
}

export interface PiecewiseZTransform {
  mode: PiecewiseZMode;
  isActive: boolean;
  rawMinY: number;
  rawMaxY: number;
  worldSpan: number;
  visMinY: number;
  visMaxY: number;
  visSpan: number;
  bands: PiecewiseZBand[];
  /** Sorted interior breakpoints strictly inside (rawMinY, rawMaxY) */
  breakpoints: number[];
  mapY: (worldY: number) => number;
  unmapY: (visY: number) => number;
}

const EPS = 1e-6;

/**
 * Collect physically meaningful vertical Z-landmarks from simulated polygons:
 * - Every polygon's yMin & yMax
 * - Horizontal plateau edges (trench floors, step tops, cavity roofs)
 */
export function collectZLandmarks(
  polygons: RenderedPolygon[],
  rawMinY: number,
  rawMaxY: number,
  waferWidth: number
): number[] {
  const raw: number[] = [rawMinY, rawMaxY];
  const minHorizRun = Math.max(8, waferWidth * 0.005);

  for (const poly of polygons) {
    if (Number.isFinite(poly.yMin)) raw.push(poly.yMin);
    if (Number.isFinite(poly.yMax)) raw.push(poly.yMax);

    const pts = poly.points;
    const n = pts.length;
    if (n < 2) continue;

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (Math.abs(a.y - b.y) <= 2 && Math.abs(a.x - b.x) >= minHorizRun) {
        raw.push((a.y + b.y) * 0.5);
      }
    }
  }

  raw.sort((a, b) => a - b);

  // Deduplicate landmarks within 2 nm (while pinning exact endpoints)
  const deduped: number[] = [];
  for (const y of raw) {
    if (y < rawMinY - EPS || y > rawMaxY + EPS) continue;
    const clamped = Math.max(rawMinY, Math.min(rawMaxY, y));
    if (deduped.length === 0) {
      deduped.push(clamped);
    } else if (clamped - deduped[deduped.length - 1] > 2) {
      deduped.push(clamped);
    }
  }

  if (deduped.length === 0) {
    return [rawMinY, rawMaxY];
  }
  if (deduped[0] > rawMinY + 2) {
    deduped.unshift(rawMinY);
  } else {
    deduped[0] = rawMinY;
  }
  if (rawMaxY - deduped[deduped.length - 1] > 2) {
    deduped.push(rawMaxY);
  } else {
    deduped[deduped.length - 1] = rawMaxY;
  }

  return deduped;
}

/**
 * Effective log10 decade metric with a 250 nm floor so sub-micron films
 * (e.g. 20 nm gate oxide + 300 nm poly-Si) stay in true proportion within
 * the same nanoscale band, while separating from >= 1-2 um and 100-500 um regimes.
 */
function effectiveDecade(spanNm: number): number {
  return Math.log10(Math.max(250, spanNm));
}

/**
 * Automatically detect order-of-magnitude Z-bands by agglomeratively merging
 * adjacent elementary Z-intervals whose effective decade scales are within ~3.5x.
 */
export function detectAutoZBreakpoints(
  polygons: RenderedPolygon[],
  rawMinY: number,
  rawMaxY: number,
  waferWidth: number,
  maxBands = 5
): number[] {
  const span = rawMaxY - rawMinY;
  if (!(span > 10) || polygons.length === 0) return [];

  const landmarks = collectZLandmarks(polygons, rawMinY, rawMaxY, waferWidth);
  if (landmarks.length <= 2) return [];

  interface RawBand {
    yMin: number;
    yMax: number;
  }

  const bands: RawBand[] = [];
  for (let i = 0; i < landmarks.length - 1; i++) {
    const h = landmarks[i + 1] - landmarks[i];
    if (h > 1) {
      bands.push({ yMin: landmarks[i], yMax: landmarks[i + 1] });
    }
  }
  if (bands.length <= 1) return [];

  // Pass 1: Merge adjacent bands within the same order-of-magnitude regime (< 0.55 decade ~= 3.55x)
  const MERGE_DECADE_THRESHOLD = 0.55;
  while (bands.length > 1) {
    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < bands.length - 1; i++) {
      const hA = bands[i].yMax - bands[i].yMin;
      const hB = bands[i + 1].yMax - bands[i + 1].yMin;
      const diff = Math.abs(effectiveDecade(hA) - effectiveDecade(hB));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && (bestDiff < MERGE_DECADE_THRESHOLD || bands.length > maxBands)) {
      bands[bestIdx] = {
        yMin: bands[bestIdx].yMin,
        yMax: bands[bestIdx + 1].yMax,
      };
      bands.splice(bestIdx + 1, 1);
    } else {
      break;
    }
  }

  if (bands.length <= 1) return [];

  const breakpoints: number[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const bp = bands[i].yMax;
    if (bp > rawMinY + 2 && bp < rawMaxY - 2) {
      breakpoints.push(bp);
    }
  }
  return breakpoints;
}

/**
 * Construct a strictly monotonic, invertible piecewise-linear Z-transform
 * whose total visual span equals `rawMaxY - rawMinY`.
 */
export function buildBandsFromWeights(
  mode: PiecewiseZMode,
  rawMinY: number,
  rawMaxY: number,
  breakpoints: number[],
  rawWeights: number[],
  userGains?: number[]
): PiecewiseZTransform {
  const worldSpan = Math.max(1, rawMaxY - rawMinY);
  const cleanBps = breakpoints
    .filter((y) => Number.isFinite(y) && y > rawMinY + 1 && y < rawMaxY - 1)
    .sort((a, b) => a - b)
    .filter((y, idx, arr) => idx === 0 || y - arr[idx - 1] > 1);

  const boundaries = [rawMinY, ...cleanBps, rawMaxY];
  const zoneCount = boundaries.length - 1;

  if (zoneCount <= 1 || mode === 'linear') {
    const linearBand: PiecewiseZBand = {
      id: 'band_0',
      index: 0,
      yMin: rawMinY,
      yMax: rawMaxY,
      worldSpan,
      visMin: rawMinY,
      visMax: rawMaxY,
      visSpan: worldSpan,
      localGain: 1,
      visualPct: 100,
      userGain: userGains?.[0] ?? 1,
    };
    return {
      mode,
      isActive: false,
      rawMinY,
      rawMaxY,
      worldSpan,
      visMinY: rawMinY,
      visMaxY: rawMaxY,
      visSpan: worldSpan,
      bands: [linearBand],
      breakpoints: [],
      mapY: (y: number) => y,
      unmapY: (vy: number) => vy,
    };
  }

  const safeWeights = new Array<number>(zoneCount);
  let weightSum = 0;
  for (let i = 0; i < zoneCount; i++) {
    const w = Number.isFinite(rawWeights[i]) && rawWeights[i] > 0 ? rawWeights[i] : 1;
    safeWeights[i] = w;
    weightSum += w;
  }

  const bands: PiecewiseZBand[] = [];
  let visCursor = rawMinY;
  for (let i = 0; i < zoneCount; i++) {
    const yMin = boundaries[i];
    const yMax = boundaries[i + 1];
    const span = Math.max(EPS, yMax - yMin);
    const share = weightSum > 0 ? safeWeights[i] / weightSum : span / worldSpan;
    const visSpan = i === zoneCount - 1 ? Math.max(EPS, rawMaxY - visCursor) : worldSpan * share;
    const visMin = visCursor;
    const visMax = i === zoneCount - 1 ? rawMaxY : visCursor + visSpan;
    visCursor = visMax;

    bands.push({
      id: `band_${i}`,
      index: i,
      yMin,
      yMax,
      worldSpan: span,
      visMin,
      visMax,
      visSpan,
      localGain: visSpan / span,
      visualPct: share * 100,
      userGain: userGains?.[i],
    });
  }

  // Check if all gains are effectively ~1.0 (user set equal gains across custom zones)
  const maxGainRatio =
    Math.max(...bands.map((b) => b.localGain)) /
    Math.max(EPS, Math.min(...bands.map((b) => b.localGain)));
  const effectivelyLinear = maxGainRatio < 1.02;

  const mapY = (worldY: number): number => {
    if (!Number.isFinite(worldY)) return worldY;
    if (worldY <= bands[0].yMin) {
      return bands[0].visMin + (worldY - bands[0].yMin) * bands[0].localGain;
    }
    const last = bands[bands.length - 1];
    if (worldY >= last.yMax) {
      return last.visMax + (worldY - last.yMax) * last.localGain;
    }
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (worldY <= b.yMax || i === bands.length - 1) {
        const t = (worldY - b.yMin) / b.worldSpan;
        return b.visMin + t * b.visSpan;
      }
    }
    return worldY;
  };

  const unmapY = (visY: number): number => {
    if (!Number.isFinite(visY)) return visY;
    if (visY <= bands[0].visMin) {
      return bands[0].yMin + (visY - bands[0].visMin) / Math.max(EPS, bands[0].localGain);
    }
    const last = bands[bands.length - 1];
    if (visY >= last.visMax) {
      return last.yMax + (visY - last.visMax) / Math.max(EPS, last.localGain);
    }
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      if (visY <= b.visMax || i === bands.length - 1) {
        const t = (visY - b.visMin) / Math.max(EPS, b.visSpan);
        return b.yMin + t * b.worldSpan;
      }
    }
    return visY;
  };

  return {
    mode,
    isActive: !effectivelyLinear && cleanBps.length > 0,
    rawMinY,
    rawMaxY,
    worldSpan,
    visMinY: rawMinY,
    visMaxY: rawMaxY,
    visSpan: worldSpan,
    bands,
    breakpoints: cleanBps,
    mapY,
    unmapY,
  };
}

/**
 * Compute full PiecewiseZTransform for the given mode ('linear' | 'auto' | 'custom').
 * compressionStrength in [0, 1] controls how aggressively auto mode balances decade differences:
 *   0 -> linear (power p = 1.0)
 *   0.75 (default) -> balanced multi-decade view (power p ~ 0.114)
 *   1.0 -> maximum log-compressed balance (power p = 0.07)
 */
export function computePiecewiseZTransform(params: {
  mode: PiecewiseZMode;
  polygons: RenderedPolygon[];
  rawMinY: number;
  rawMaxY: number;
  waferWidth: number;
  autoCompression?: number; // 0..1, default 0.75
  customConfig?: CustomZZonesConfig;
}): PiecewiseZTransform {
  const {
    mode,
    polygons,
    rawMinY,
    rawMaxY,
    waferWidth,
    autoCompression = 0.75,
    customConfig,
  } = params;

  if (mode === 'linear' || rawMaxY - rawMinY <= 10) {
    return buildBandsFromWeights(mode, rawMinY, rawMaxY, [], [1]);
  }

  if (mode === 'auto') {
    const bps = detectAutoZBreakpoints(polygons, rawMinY, rawMaxY, waferWidth);
    if (bps.length === 0) {
      return buildBandsFromWeights('auto', rawMinY, rawMaxY, [], [1]);
    }
    const boundaries = [rawMinY, ...bps, rawMaxY];
    const s = Math.max(0, Math.min(1, autoCompression));
    // Smooth monotonic exponent mapping: 1.0 at s=0 down to 0.07 at s=1
    const power = 0.07 + 0.93 * Math.pow(1 - s, 2.2);
    const weights: number[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const span = Math.max(10, boundaries[i + 1] - boundaries[i]);
      weights.push(Math.pow(span, power));
    }
    return buildBandsFromWeights('auto', rawMinY, rawMaxY, bps, weights);
  }

  // mode === 'custom'
  const bps = (customConfig?.breakpointsNm ?? [])
    .filter((y) => Number.isFinite(y) && y > rawMinY + 1 && y < rawMaxY - 1)
    .sort((a, b) => a - b)
    .filter((y, idx, arr) => idx === 0 || y - arr[idx - 1] > 1);

  if (bps.length === 0) {
    return buildBandsFromWeights('custom', rawMinY, rawMaxY, [], [1], [1]);
  }

  const boundaries = [rawMinY, ...bps, rawMaxY];
  const zoneCount = boundaries.length - 1;
  const gains: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < zoneCount; i++) {
    const rawGain = customConfig?.zoneGains?.[i];
    const gain = Number.isFinite(rawGain) && (rawGain as number) > 0 ? (rawGain as number) : 1;
    gains.push(gain);
    const span = Math.max(1, boundaries[i + 1] - boundaries[i]);
    weights.push(span * gain);
  }

  return buildBandsFromWeights('custom', rawMinY, rawMaxY, bps, weights, gains);
}

/**
 * Subdivide closed polygon edges wherever an edge crosses an interior Z-breakpoint.
 * Preserves exact C^0 continuity on diagonal trench sidewalls, V-grooves, and
 * conformal depositions spanning across Z-scale band boundaries.
 */
export function subdividePolygonAtBreakpoints(
  points: { x: number; y: number }[],
  breakpoints: number[]
): { x: number; y: number }[] {
  if (points.length < 3 || breakpoints.length === 0) return points;

  const out: { x: number; y: number }[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    out.push(a);

    const dy = b.y - a.y;
    if (Math.abs(dy) <= 1e-6) continue;

    if (dy > 0) {
      // Ascending edge: collect breakpoints in ascending order strictly between a.y and b.y
      for (let k = 0; k < breakpoints.length; k++) {
        const bp = breakpoints[k];
        if (bp > a.y + 1e-4 && bp < b.y - 1e-4) {
          const t = (bp - a.y) / dy;
          out.push({ x: a.x + t * (b.x - a.x), y: bp });
        }
      }
    } else {
      // Descending edge: collect breakpoints in descending order strictly between b.y and a.y
      for (let k = breakpoints.length - 1; k >= 0; k--) {
        const bp = breakpoints[k];
        if (bp > b.y + 1e-4 && bp < a.y - 1e-4) {
          const t = (bp - a.y) / dy;
          out.push({ x: a.x + t * (b.x - a.x), y: bp });
        }
      }
    }
  }

  return out;
}

export function formatLocalGain(gain: number): string {
  if (!Number.isFinite(gain)) return '1×';
  if (gain >= 100) return `${Math.round(gain)}×`;
  if (gain >= 10) return `${gain.toFixed(1).replace(/\.0$/, '')}×`;
  if (gain >= 1) return `${gain.toFixed(2).replace(/\.?0+$/, '')}×`;
  if (gain >= 0.01) return `${gain.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
  return `${gain.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}×`;
}
