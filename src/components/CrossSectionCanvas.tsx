/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  ProcessFlow,
  ProcessSide,
  Material,
  CrossSectionMesh,
  RenderedPolygon,
} from '../types/microfab';
import { SvgPatterns } from './SvgPatterns';
import { getMaterialById } from '../lib/materials';
import { ThicknessUnit, formatThickness } from '../lib/units';
import {
  sampleStackAtX,
  STACK_PROBE_COLORS,
  StackProbeSample,
} from '../lib/stackProbeUtils';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Ruler,
  Download,
  Maximize,
  Minimize,
  Search,
  Layers,
  EyeOff,
  PictureInPicture2,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  X,
  Square,
  Axis3d,
  Magnet,
  GripVertical,
  RotateCcw,
  Crosshair,
  Plus,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';

interface StackProbePoint {
  id: string;
  xNm: number;
}

interface InsetStepOption {
  stepIndex: number;
  stepNumber: number;
  title: string;
}

interface CrossSectionCanvasProps {
  mesh: CrossSectionMesh;
  polygons: RenderedPolygon[];
  materials: Material[];
  waferWidth: number; // nm
  flowId?: string;
  thicknessUnit?: ThicknessUnit;
  title?: string;
  stepNumber?: number;
  totalSteps?: number;
  activeStepTitle?: string;
  activeStepSide?: ProcessSide;
  finalMesh?: CrossSectionMesh | null;
  finalPolygons?: RenderedPolygon[];
  finalStepNumber?: number;
  finalStepTitle?: string;
  canShowInsetButton?: boolean;
  insetStepOptions?: InsetStepOption[];
  selectedInsetStepIndex?: number;
  isInsetFinalStep?: boolean;
  onChangeInsetStep?: (stepIndex: number) => void;
  showFinalInset?: boolean;
  onToggleFinalInset?: () => void;
  onSelectFinalStep?: () => void;
}

export const CrossSectionCanvas: React.FC<CrossSectionCanvasProps> = ({
  mesh,
  polygons,
  materials,
  waferWidth,
  flowId,
  thicknessUnit = 'nm',
  title,
  stepNumber,
  totalSteps,
  activeStepTitle,
  activeStepSide,
  finalMesh,
  finalPolygons,
  finalStepNumber,
  finalStepTitle,
  canShowInsetButton,
  insetStepOptions,
  selectedInsetStepIndex,
  isInsetFinalStep = true,
  onChangeInsetStep,
  showFinalInset = false,
  onToggleFinalInset,
  onSelectFinalStep,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Dynamic container sizing via ResizeObserver for perfect full-screen and small-window scaling
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 1000,
    height: 520,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setContainerSize({ width: w, height: h });
      }
    };
    measure();

    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  // Pan and Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Multi-touch pinch-to-zoom state
  const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    anchorWorldSvgX: number;
    anchorWorldSvgY: number;
  } | null>(null);

  // Region zoom (Magnifying glass) state
  const [regionZoomMode, setRegionZoomMode] = useState<boolean>(false);
  const [zoomSelection, setZoomSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Vertical Z-exaggeration factor (essential in semiconductor CAD)
  const [zScale, setZScale] = useState<number>(2.0);

  // Measurement caliper tool
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [caliperSnap, setCaliperSnap] = useState<boolean>(true);
  const [caliperAngleSnap, setCaliperAngleSnap] = useState<boolean>(true);
  const [shiftKeyDown, setShiftKeyDown] = useState<boolean>(false);
  const [ctrlKeyDown, setCtrlKeyDown] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number }[]>([]);

  // Hovered layer inspector & cursor SVG coordinate
  const [hoveredPolygon, setHoveredPolygon] = useState<RenderedPolygon | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverWorldPos, setHoverWorldPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverSvgPos, setHoverSvgPos] = useState<{ x: number; y: number } | null>(null);

  // Display toggles
  const [showOutlines, setShowOutlines] = useState<boolean>(true);
  const [showAxesAndLabels, setShowAxesAndLabels] = useState<boolean>(true);
  const [renderMode, setRenderMode] = useState<'hatch' | 'solid'>('hatch');
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [insetExpanded, setInsetExpanded] = useState<boolean>(false);
  const [stackProbeMode, setStackProbeMode] = useState<boolean>(false);
  const [stackProbes, setStackProbes] = useState<StackProbePoint[]>([]);
  const [draggingProbeId, setDraggingProbeId] = useState<string | null>(null);
  const [manualProbeXUm, setManualProbeXUm] = useState<string>('');
  const [stackCopied, setStackCopied] = useState<boolean>(false);
  const stackCopyTimerRef = useRef<number | null>(null);
  const insetRef = useRef<HTMLDivElement>(null);
  const [insetPos, setInsetPos] = useState<{ x: number; y: number } | null>(null);
  const [insetDrag, setInsetDrag] = useState<{
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
    width: number;
    height: number;
  } | null>(null);

  const legendMaterials = useMemo(() => {
    const seen = new Set<string>();
    const list: Material[] = [];
    for (const poly of polygons) {
      if (!seen.has(poly.materialId)) {
        seen.add(poly.materialId);
        list.push(getMaterialById(materials, poly.materialId));
      }
    }
    return list;
  }, [polygons, materials]);

  // Locked projection baseline when user manually zooms or pans so step changes,
  // MaskEditor mounting/unmounting, and sidebar toggles never rescale or shift features.
  const [lockedMetrics, setLockedMetrics] = useState<{
    heightSpan: number;
    rawMinY: number;
    paddingX: number;
    datumScreenY: number;
    contentWidth: number;
    contentHeight: number;
  } | null>(null);
  const isLockedRef = useRef<boolean>(false);
  isLockedRef.current = lockedMetrics !== null;

  // SVG coordinate dimensions derived dynamically from container
  const svgWidth = Math.max(280, containerSize.width);
  const svgHeight = Math.max(220, containerSize.height);

  // Responsive margins
  const paddingX =
    svgWidth < 480
      ? Math.max(20, svgWidth * 0.06)
      : Math.max(40, Math.min(80, svgWidth * 0.08));
  const bottomPadding = Math.max(46, Math.min(75, svgHeight * 0.14));
  const topPadding = Math.max(42, Math.min(75, svgHeight * 0.14));

  const contentWidth = svgWidth - paddingX * 2;
  const contentHeight = svgHeight - bottomPadding - topPadding;
  const datumScreenY = svgHeight - bottomPadding;

  // True mathematical bounding box of the wafer geometry across all layers
  const { boundMinX, boundMaxX, boundMinY, boundMaxY } = useMemo(() => {
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

    return {
      boundMinX: minX,
      boundMaxX: maxX,
      boundMinY: minY,
      boundMaxY: maxY,
    };
  }, [polygons, waferWidth, mesh.minY, mesh.maxY]);

  const rawMinY = boundMinY;
  const rawMaxY = boundMaxY;
  const actualSpan = Math.max(300, rawMaxY - rawMinY);

  const effectiveMinY = lockedMetrics ? lockedMetrics.rawMinY : rawMinY;
  const effectiveSpan = lockedMetrics ? lockedMetrics.heightSpan : actualSpan;
  const effectivePaddingX = lockedMetrics ? lockedMetrics.paddingX : paddingX;
  const effectiveDatumScreenY = lockedMetrics ? lockedMetrics.datumScreenY : datumScreenY;
  const effectiveContentWidth = lockedMetrics ? lockedMetrics.contentWidth : contentWidth;
  const effectiveContentHeight = lockedMetrics ? lockedMetrics.contentHeight : contentHeight;

  // Coordinate transforms: world nm -> SVG canvas coordinates
  const scaleX = effectiveContentWidth / waferWidth;
  // baseScaleY is normalized so that at 2.0x zScale, the wafer occupies ~62% of vertical contentHeight
  const baseScaleY = (effectiveContentHeight * 0.62) / (effectiveSpan * 2.0);
  const scaleY = baseScaleY * zScale;

  const lockViewport = useCallback(() => {
    setLockedMetrics((prev) =>
      prev ?? {
        heightSpan: actualSpan,
        rawMinY,
        paddingX,
        datumScreenY,
        contentWidth,
        contentHeight,
      }
    );
  }, [actualSpan, rawMinY, paddingX, datumScreenY, contentWidth, contentHeight]);

  // World point to Screen point
  const toScreen = useCallback(
    (x: number, y: number) => {
      const sx = effectivePaddingX + x * scaleX;
      // Cleanroom physics: bottom of wafer is anchored to bottom datum line
      const sy = effectiveDatumScreenY - (y - effectiveMinY) * scaleY;
      return { x: sx, y: sy };
    },
    [scaleX, scaleY, effectiveMinY, effectiveDatumScreenY, effectivePaddingX]
  );

  // Screen point to World nm
  const toWorld = useCallback(
    (sx: number, sy: number) => {
      const wx = (sx - effectivePaddingX) / scaleX;
      const wy = effectiveMinY + (effectiveDatumScreenY - sy) / scaleY;
      return { x: Math.max(0, Math.min(waferWidth, wx)), y: wy };
    },
    [scaleX, scaleY, effectiveMinY, effectiveDatumScreenY, effectivePaddingX, waferWidth]
  );

  // Screen-space snap lookup for Caliper (vertices > edge midpoints > edge projections)
  const findGeometrySnap = useCallback(
    (
      unscaledSx: number,
      unscaledSy: number
    ): { point: { x: number; y: number }; kind: 'vertex' | 'midpoint' | 'edge' } | null => {
      if (polygons.length === 0) return null;

      const safeZoom = Math.max(0.12, zoom);
      const vertexThreshold = 12 / safeZoom;
      const midpointThreshold = 9 / safeZoom;
      const edgeThreshold = 10 / safeZoom;
      const minEdgeLenForMidpoint = 16 / safeZoom;

      let bestVertex: { x: number; y: number } | null = null;
      let bestVertexDist = vertexThreshold;

      let bestMidpoint: { x: number; y: number } | null = null;
      let bestMidpointDist = midpointThreshold;

      let bestEdge: { x: number; y: number } | null = null;
      let bestEdgeDist = edgeThreshold;

      for (const poly of polygons) {
        const pts = poly.points;
        const n = pts.length;
        if (n < 2) continue;

        for (let i = 0; i < n; i++) {
          const a = pts[i];
          const sA = toScreen(a.x, a.y);

          const vDist = Math.hypot(unscaledSx - sA.x, unscaledSy - sA.y);
          if (vDist < bestVertexDist) {
            bestVertexDist = vDist;
            bestVertex = { x: a.x, y: a.y };
          }

          const b = pts[(i + 1) % n];
          const sB = toScreen(b.x, b.y);
          const dx = sB.x - sA.x;
          const dy = sB.y - sA.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-6) continue;

          if (Math.sqrt(lenSq) >= minEdgeLenForMidpoint) {
            const midSx = (sA.x + sB.x) * 0.5;
            const midSy = (sA.y + sB.y) * 0.5;
            const mDist = Math.hypot(unscaledSx - midSx, unscaledSy - midSy);
            if (mDist < bestMidpointDist) {
              bestMidpointDist = mDist;
              bestMidpoint = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
            }
          }

          const t = Math.max(
            0,
            Math.min(1, ((unscaledSx - sA.x) * dx + (unscaledSy - sA.y) * dy) / lenSq)
          );
          const projSx = sA.x + t * dx;
          const projSy = sA.y + t * dy;
          const eDist = Math.hypot(unscaledSx - projSx, unscaledSy - projSy);
          if (eDist < bestEdgeDist) {
            bestEdgeDist = eDist;
            bestEdge = {
              x: a.x + t * (b.x - a.x),
              y: a.y + t * (b.y - a.y),
            };
          }
        }
      }

      if (bestVertex) return { point: bestVertex, kind: 'vertex' };
      if (bestMidpoint) return { point: bestMidpoint, kind: 'midpoint' };
      if (bestEdge) return { point: bestEdge, kind: 'edge' };
      return null;
    },
    [polygons, zoom, toScreen]
  );

  const activeSnapTarget = useMemo(() => {
    if (!measureMode || !caliperSnap || !hoverSvgPos) return null;
    return findGeometrySnap(hoverSvgPos.x, hoverSvgPos.y);
  }, [measureMode, caliperSnap, hoverSvgPos, findGeometrySnap]);

  const constrainCaliperPoint = useCallback(
    (
      startWorld: { x: number; y: number },
      rawTargetWorld: { x: number; y: number }
    ): { point: { x: number; y: number }; modeLabel: 'H' | 'V' | '45°' } => {
      const s1 = toScreen(startWorld.x, startWorld.y);
      const s2 = toScreen(rawTargetWorld.x, rawTargetWorld.y);
      const sdx = s2.x - s1.x;
      const sdy = s2.y - s1.y;
      if (Math.hypot(sdx, sdy) < 1e-3) {
        return { point: { ...rawTargetWorld }, modeLabel: 'H' };
      }
      const angle = Math.atan2(sdy, sdx);
      const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;

      if (sector === 0 || sector === 4) {
        return {
          point: { x: rawTargetWorld.x, y: startWorld.y },
          modeLabel: 'H',
        };
      }
      if (sector === 2 || sector === 6) {
        return {
          point: { x: startWorld.x, y: rawTargetWorld.y },
          modeLabel: 'V',
        };
      }
      const theta = sector * (Math.PI / 4);
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      const proj = sdx * ux + sdy * uy;
      return {
        point: toWorld(s1.x + proj * ux, s1.y + proj * uy),
        modeLabel: '45°',
      };
    },
    [toScreen, toWorld]
  );

  // Track Shift key state dynamically while Caliper mode is active
  useEffect(() => {
    if (!measureMode) {
      setShiftKeyDown(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKeyDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKeyDown(false);
    };
    const handleBlur = () => setShiftKeyDown(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [measureMode]);

  // Compute local vertical thickness of a hovered polygon at cursor world (x, y)
  const computeLocalThicknessAtPoint = useCallback(
    (poly: RenderedPolygon, worldX: number, worldY: number): number | null => {
      const pts = poly.points;
      if (pts.length >= 3) {
        const eps = 1e-3;
        const xProbe =
          poly.xMax - poly.xMin > eps * 4
            ? Math.max(poly.xMin + eps, Math.min(poly.xMax - eps, worldX))
            : (poly.xMin + poly.xMax) * 0.5;

        const ys: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          if ((a.x <= xProbe && b.x > xProbe) || (b.x <= xProbe && a.x > xProbe)) {
            const t = (xProbe - a.x) / (b.x - a.x);
            ys.push(a.y + t * (b.y - a.y));
          }
        }
        if (ys.length >= 2) {
          ys.sort((u, v) => u - v);
          let bestHeight: number | null = null;
          let bestDist = Infinity;
          for (let k = 0; k + 1 < ys.length; k += 2) {
            const yBot = ys[k];
            const yTop = ys[k + 1];
            const h = yTop - yBot;
            if (worldY >= yBot && worldY <= yTop) {
              return Math.round(h);
            }
            const dist = worldY < yBot ? yBot - worldY : worldY - yTop;
            if (dist < bestDist) {
              bestDist = dist;
              bestHeight = h;
            }
          }
          if (bestHeight !== null) return Math.round(bestHeight);
        }
      }

      if (mesh.columns.length > 0 && mesh.width > 0) {
        const colIdx = Math.max(
          0,
          Math.min(
            mesh.columns.length - 1,
            Math.floor((worldX / mesh.width) * mesh.columns.length)
          )
        );
        const matching = mesh.columns[colIdx].segments.filter(
          (s) =>
            s.materialId === poly.materialId &&
            (!poly.stepId || !s.stepId || s.stepId === poly.stepId)
        );
        if (matching.length > 0) {
          const seg =
            matching.find((s) => worldY >= s.yBottom && worldY <= s.yTop) ||
            matching.reduce((best, cur) => {
              const curDist =
                worldY < cur.yBottom
                  ? cur.yBottom - worldY
                  : worldY > cur.yTop
                  ? worldY - cur.yTop
                  : 0;
              const bestDist =
                worldY < best.yBottom
                  ? best.yBottom - worldY
                  : worldY > best.yTop
                  ? worldY - best.yTop
                  : 0;
              return curDist < bestDist ? cur : best;
            });
          return Math.round(seg.yTop - seg.yBottom);
        }
      }

      return null;
    },
    [mesh.columns, mesh.width]
  );

  // Convert polygon points to SVG path with Z-scale
  const getTransformedPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return '';
    const first = toScreen(pts[0].x, pts[0].y);
    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = toScreen(pts[i].x, pts[i].y);
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    d += ' Z';
    return d;
  };

  // Intelligent Fit to Screen: centers the entire wafer bounding box into the viewport with 100% visibility
  const fitToScreen = useCallback(() => {
    setLockedMetrics(null);

    const actualBaseScaleY = (contentHeight * 0.62) / (actualSpan * 2.0);
    const actualScaleX = contentWidth / waferWidth;
    const actualScaleY = actualBaseScaleY * zScale;
    const project = (x: number, y: number) => ({
      x: paddingX + x * actualScaleX,
      y: (svgHeight - bottomPadding) - (y - rawMinY) * actualScaleY,
    });

    const pBL = project(boundMinX, boundMinY);
    const pTR = project(boundMaxX, boundMaxY);

    const waferScreenW = Math.max(20, Math.abs(pTR.x - pBL.x));
    const waferScreenH = Math.max(20, Math.abs(pBL.y - pTR.y));

    // Target viewport area leaving comfortable clearance on all sides
    const targetAvailW = Math.max(150, svgWidth - paddingX * 2 - 30);
    const targetAvailH = Math.max(120, svgHeight - bottomPadding - topPadding - 30);

    const zoomW = targetAvailW / waferScreenW;
    const zoomH = targetAvailH / waferScreenH;
    // Apply 92% factor so nothing touches the screen border
    const optimalZoom = Math.min(zoomW, zoomH) * 0.92;
    const safeZoom = Math.max(0.12, Math.min(4.0, optimalZoom));

    // Center of wafer in unscaled screen coordinates
    const waferCenterX = (pBL.x + pTR.x) / 2;
    // Shift up slightly (by 10px) to provide ample room for the bottom coordinate axis labels
    const waferCenterY = (pBL.y + pTR.y) / 2 - 10;

    const panX = svgWidth / 2 - waferCenterX * safeZoom;
    const panY = svgHeight / 2 - waferCenterY * safeZoom;

    setZoom(safeZoom);
    setPan({ x: panX, y: panY });
    setMeasurePoints([]);
  }, [
    boundMinX,
    boundMinY,
    boundMaxX,
    boundMaxY,
    rawMinY,
    actualSpan,
    waferWidth,
    zScale,
    contentWidth,
    contentHeight,
    svgWidth,
    svgHeight,
    paddingX,
    bottomPadding,
    topPadding,
  ]);

  // Reset viewport lock and probes when switching to a different flow preset or changing wafer width
  useEffect(() => {
    setLockedMetrics(null);
    setStackProbes([]);
  }, [flowId]);

  useEffect(() => {
    setLockedMetrics(null);
    setStackProbes((prev) =>
      prev.map((p) => ({
        ...p,
        xNm: Math.max(0, Math.min(waferWidth, p.xNm)),
      }))
    );
  }, [waferWidth]);

  // Keep the inspected center feature anchored when container resizes (e.g. MaskEditor mounting on litho steps)
  const prevSvgSizeRef = useRef<{ width: number; height: number }>({
    width: svgWidth,
    height: svgHeight,
  });

  useLayoutEffect(() => {
    const prev = prevSvgSizeRef.current;
    const dw = svgWidth - prev.width;
    const dh = svgHeight - prev.height;
    prevSvgSizeRef.current = { width: svgWidth, height: svgHeight };

    if (lockedMetrics !== null && (dw !== 0 || dh !== 0)) {
      setPan((p) => ({
        x: p.x + dw / 2,
        y: p.y + dh / 2,
      }));
    }
  }, [svgWidth, svgHeight, lockedMetrics]);

  // Auto-fit ONLY when user has not manually zoomed/panned
  useEffect(() => {
    if (lockedMetrics !== null) return;
    fitToScreen();
  }, [
    lockedMetrics,
    stepNumber,
    waferWidth,
    zScale,
    containerSize.width,
    containerSize.height,
    fitToScreen,
  ]);

  // Convert client pointer position to SVG viewBox coordinates
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  }, []);

  // Uniform zoom around a pivot in SVG coordinates (never distorts geometry aspect ratio)
  const zoomAroundPoint = useCallback(
    (targetZoom: number, pivotSvgX: number, pivotSvgY: number) => {
      lockViewport();
      const clampedZoom = Math.max(0.12, Math.min(25.0, targetZoom));
      const ux = (pivotSvgX - pan.x) / zoom;
      const uy = (pivotSvgY - pan.y) / zoom;
      setZoom(clampedZoom);
      setPan({
        x: pivotSvgX - ux * clampedZoom,
        y: pivotSvgY - uy * clampedZoom,
      });
    },
    [pan.x, pan.y, zoom, lockViewport]
  );

  // Commit selected region zoom uniformly so selection aspect ratio never stretches geometry
  const commitRegionZoom = useCallback(
    (
      sel: { startX: number; startY: number; endX: number; endY: number },
      isZoomOut = false
    ) => {
      const selLeft = Math.min(sel.startX, sel.endX);
      const selRight = Math.max(sel.startX, sel.endX);
      const selTop = Math.min(sel.startY, sel.endY);
      const selBottom = Math.max(sel.startY, sel.endY);
      const selW = selRight - selLeft;
      const selH = selBottom - selTop;

      if (selW < 8 && selH < 8) {
        // Single click in magnifying glass mode zooms 2x in (or 2x out when holding Ctrl)
        zoomAroundPoint(isZoomOut ? zoom * 0.5 : zoom * 2.0, sel.startX, sel.startY);
        return;
      }

      lockViewport();
      const safeSelW = Math.max(8, selW);
      const safeSelH = Math.max(8, selH);

      // Selection center in unscaled SVG coordinates
      const selCenterSvgX = (selLeft + selRight) / 2;
      const selCenterSvgY = (selTop + selBottom) / 2;
      const uCenterX = (selCenterSvgX - pan.x) / zoom;
      const uCenterY = (selCenterSvgY - pan.y) / zoom;

      // Apply uniform scalar zoom based on tightest axis so entire region fits without distortion
      const regionScale = Math.min(
        (svgWidth * 0.92) / safeSelW,
        (svgHeight * 0.92) / safeSelH
      );
      const newZoom = isZoomOut
        ? Math.max(0.12, Math.min(25.0, zoom / Math.max(1.25, Math.min(8.0, regionScale))))
        : Math.max(0.12, Math.min(25.0, zoom * regionScale));

      setZoom(newZoom);
      setPan({
        x: svgWidth / 2 - uCenterX * newZoom,
        y: svgHeight / 2 - uCenterY * newZoom,
      });
    },
    [pan.x, pan.y, zoom, svgWidth, svgHeight, zoomAroundPoint, lockViewport]
  );

  // Keyboard shortcuts: 'F' to fit to screen, 'Escape' to cancel region zoom / caliper
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitToScreen();
      } else if (e.key === 'Escape') {
        if (zoomSelection) {
          setZoomSelection(null);
        } else if (regionZoomMode) {
          setRegionZoomMode(false);
        } else if (measureMode) {
          setMeasureMode(false);
          setMeasurePoints([]);
        } else if (stackProbeMode) {
          setStackProbeMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitToScreen, zoomSelection, regionZoomMode, measureMode, stackProbeMode]);

  useEffect(() => {
    const syncModifiers = (e: KeyboardEvent) => {
      setCtrlKeyDown(e.ctrlKey);
      setShiftKeyDown(e.shiftKey);
    };
    const resetModifiers = () => {
      setCtrlKeyDown(false);
      setShiftKeyDown(false);
    };
    window.addEventListener('keydown', syncModifiers);
    window.addEventListener('keyup', syncModifiers);
    window.addEventListener('blur', resetModifiers);
    return () => {
      window.removeEventListener('keydown', syncModifiers);
      window.removeEventListener('keyup', syncModifiers);
      window.removeEventListener('blur', resetModifiers);
    };
  }, []);

  // Listen to fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      // Only auto-fit on fullscreen toggle if user hasn't locked a custom zoom/pan
      if (!isLockedRef.current) {
        setTimeout(fitToScreen, 120);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fitToScreen]);

  // Complete marquee drag even if pointer leaves SVG bounds
  useEffect(() => {
    if (!zoomSelection) return;
    const handleWindowPointerMove = (e: PointerEvent) => {
      setCtrlKeyDown(e.ctrlKey);
      const svgP = clientToSvg(e.clientX, e.clientY);
      if (!svgP) return;
      setZoomSelection((prev) =>
        prev
          ? {
              ...prev,
              endX: Math.max(0, Math.min(svgWidth, svgP.x)),
              endY: Math.max(0, Math.min(svgHeight, svgP.y)),
            }
          : null
      );
    };
    const handleWindowPointerUp = (e: PointerEvent) => {
      const isCancel = e.type === 'pointercancel';
      const isZoomOut = e.ctrlKey || ctrlKeyDown;
      setZoomSelection((prev) => {
        if (prev && !isCancel) {
          commitRegionZoom(prev, isZoomOut);
        }
        return null;
      });
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [zoomSelection !== null, clientToSvg, commitRegionZoom, svgWidth, svgHeight, ctrlKeyDown]);

  // Drag floating step inset smoothly inside the cross-section viewport
  useEffect(() => {
    if (!insetDrag) return;
    const handleWindowPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - insetDrag.startClientX;
      const dy = e.clientY - insetDrag.startClientY;
      const maxX = Math.max(8, containerSize.width - insetDrag.width - 8);
      const maxY = Math.max(8, containerSize.height - insetDrag.height - 8);
      setInsetPos({
        x: Math.max(8, Math.min(maxX, insetDrag.initialX + dx)),
        y: Math.max(8, Math.min(maxY, insetDrag.initialY + dy)),
      });
    };
    const handleWindowPointerUp = () => {
      setInsetDrag(null);
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [insetDrag, containerSize.width, containerSize.height]);

  // Keep moved inset inside canvas bounds when container resizes or inset expands/compacts
  useEffect(() => {
    if (!insetPos || !insetRef.current) return;
    const w = insetRef.current.offsetWidth || (insetExpanded ? 320 : 240);
    const h = insetRef.current.offsetHeight || 180;
    const maxX = Math.max(8, containerSize.width - w - 8);
    const maxY = Math.max(8, containerSize.height - h - 8);
    const clampedX = Math.max(8, Math.min(maxX, insetPos.x));
    const clampedY = Math.max(8, Math.min(maxY, insetPos.y));
    if (clampedX !== insetPos.x || clampedY !== insetPos.y) {
      setInsetPos({ x: clampedX, y: clampedY });
    }
  }, [insetPos, insetExpanded, containerSize.width, containerSize.height]);

  const startInsetDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const containerEl = containerRef.current;
    const insetEl = insetRef.current;
    if (!containerEl || !insetEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    const insetRect = insetEl.getBoundingClientRect();
    const initialX = insetRect.left - containerRect.left;
    const initialY = insetRect.top - containerRect.top;
    setInsetPos({ x: initialX, y: initialY });
    setInsetDrag({
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX,
      initialY,
      width: insetRect.width,
      height: insetRect.height,
    });
  }, []);

  // Drag vertical stack probe pins smoothly horizontally along the wafer
  useEffect(() => {
    if (!draggingProbeId) return;
    const handleWindowPointerMove = (e: PointerEvent) => {
      const svgP = clientToSvg(e.clientX, e.clientY);
      if (!svgP) return;
      const unscaledX = (svgP.x - pan.x) / zoom;
      const unscaledY = (svgP.y - pan.y) / zoom;
      const worldPt = toWorld(unscaledX, unscaledY);
      const nextX = Math.max(0, Math.min(waferWidth, Math.round(worldPt.x)));
      setStackProbes((prev) =>
        prev.map((p) => (p.id === draggingProbeId ? { ...p, xNm: nextX } : p))
      );
    };
    const handleWindowPointerUp = () => {
      setDraggingProbeId(null);
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [draggingProbeId, clientToSvg, pan.x, pan.y, zoom, toWorld, waferWidth]);

  const probedStacks = useMemo(
    () =>
      stackProbes.map((probe, idx) => ({
        probe,
        label: `P${idx + 1}`,
        color: STACK_PROBE_COLORS[idx % STACK_PROBE_COLORS.length],
        sample: sampleStackAtX(mesh, materials, probe.xNm),
      })),
    [stackProbes, mesh, materials]
  );

  const liveHoverStack: StackProbeSample | null = useMemo(() => {
    if (!stackProbeMode || !hoverWorldPos || draggingProbeId) return null;
    return sampleStackAtX(mesh, materials, hoverWorldPos.x);
  }, [stackProbeMode, hoverWorldPos, draggingProbeId, mesh, materials]);

  const handleSampleThreeLocations = useCallback(() => {
    const stamp = Date.now();
    const fracs = [0.15, 0.5, 0.85];
    setStackProbes(
      fracs.map((f, i) => ({
        id: `probe_${stamp}_${i}`,
        xNm: Math.round(waferWidth * f),
      }))
    );
  }, [waferWidth]);

  const handleAddManualProbe = useCallback(() => {
    const parsedUm = parseFloat(manualProbeXUm);
    if (!Number.isFinite(parsedUm)) return;
    const xNm = Math.max(0, Math.min(waferWidth, Math.round(parsedUm * 1000)));
    setStackProbes((prev) => [
      ...prev,
      { id: `probe_${Date.now()}_${prev.length}`, xNm },
    ]);
    setManualProbeXUm('');
  }, [manualProbeXUm, waferWidth]);

  const handleCopyStackSummary = useCallback(() => {
    if (probedStacks.length === 0) return;
    const lines: string[] = [
      `Wafer Cross-Section Stack Thickness (${stepNumber === 0 ? 'Substrate' : `Step ${stepNumber}/${totalSteps}`}${activeStepTitle ? ` - ${activeStepTitle}` : ''})`,
      'Probe,X_um,Total_Stack,Overlayer_Stack,Surface_Top_Z,Layers_Top_to_Bottom',
    ];
    probedStacks.forEach(({ label, probe, sample }) => {
      const layersStr = sample.layersTopToBottom
        .map((l) => `${l.materialName}: ${formatThickness(l.thicknessNm, thicknessUnit)}`)
        .join(' | ');
      lines.push(
        `${label},${(probe.xNm / 1000).toFixed(3)},${formatThickness(
          sample.totalMaterialThicknessNm,
          thicknessUnit
        )},${
          sample.hasSubstrateLayers && sample.hasOverlayers
            ? formatThickness(sample.overlayerThicknessNm, thicknessUnit)
            : '-'
        },${formatThickness(sample.surfaceTopY - sample.stackBottomY, thicknessUnit)},"${layersStr}"`
      );
    });
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    setStackCopied(true);
    if (stackCopyTimerRef.current) {
      window.clearTimeout(stackCopyTimerRef.current);
    }
    stackCopyTimerRef.current = window.setTimeout(() => {
      setStackCopied(false);
    }, 1800);
  }, [probedStacks, stepNumber, totalSteps, activeStepTitle, thicknessUnit]);

  // Prevent mobile browser page pinch-zoom inside the SVG viewport so custom canvas pinch-zoom works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventMultiTouchZoom = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchstart', preventMultiTouchZoom, { passive: false });
    el.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });
    return () => {
      el.removeEventListener('touchstart', preventMultiTouchZoom);
      el.removeEventListener('touchmove', preventMultiTouchZoom);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!cardRef.current) return;
    if (!document.fullscreenElement) {
      cardRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Unified pointer pan / pinch-zoom / caliper / region zoom handlers (mouse + touch)
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    activePointersRef.current.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    // Two-finger pinch-to-zoom activation
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const midClientX = (pts[0].clientX + pts[1].clientX) * 0.5;
      const midClientY = (pts[0].clientY + pts[1].clientY) * 0.5;
      const midSvg = clientToSvg(midClientX, midClientY);

      setIsPanning(false);
      setZoomSelection(null);

      if (midSvg) {
        lockViewport();
        pinchStateRef.current = {
          initialDistance: Math.max(10, dist),
          initialZoom: zoom,
          anchorWorldSvgX: (midSvg.x - pan.x) / zoom,
          anchorWorldSvgY: (midSvg.y - pan.y) / zoom,
        };
      }
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (activePointersRef.current.size > 2) {
      return;
    }

    const svgP = clientToSvg(e.clientX, e.clientY);

    if (regionZoomMode && svgP) {
      setCtrlKeyDown(e.ctrlKey);
      setZoomSelection({
        startX: svgP.x,
        startY: svgP.y,
        endX: svgP.x,
        endY: svgP.y,
      });
      return;
    }

    if (measureMode && svgP) {
      setShiftKeyDown(e.shiftKey);
      const clickX = (svgP.x - pan.x) / zoom;
      const clickY = (svgP.y - pan.y) / zoom;
      const snapped = caliperSnap ? findGeometrySnap(clickX, clickY) : null;
      const basePt = snapped ? snapped.point : toWorld(clickX, clickY);

      if (measurePoints.length === 1) {
        const useAngleLock = caliperAngleSnap && (e.shiftKey || shiftKeyDown);
        const finalPt = useAngleLock
          ? constrainCaliperPoint(measurePoints[0], basePt).point
          : basePt;
        setMeasurePoints([measurePoints[0], finalPt]);
      } else {
        setMeasurePoints([basePt]);
      }
      return;
    }

    if (stackProbeMode && svgP) {
      const clickX = (svgP.x - pan.x) / zoom;
      const clickY = (svgP.y - pan.y) / zoom;
      const hitThreshold = 10 / Math.max(0.12, zoom);
      const hitProbe = stackProbes.find(
        (p) => Math.abs(toScreen(p.xNm, 0).x - clickX) <= hitThreshold
      );
      if (hitProbe) {
        setDraggingProbeId(hitProbe.id);
        return;
      }
      const worldPt = toWorld(clickX, clickY);
      const xNm = Math.max(0, Math.min(waferWidth, Math.round(worldPt.x)));
      const newId = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setStackProbes((prev) => [...prev, { id: newId, xNm }]);
      setDraggingProbeId(newId);
      return;
    }

    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }

    if (pinchStateRef.current && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const midClientX = (pts[0].clientX + pts[1].clientX) * 0.5;
      const midClientY = (pts[0].clientY + pts[1].clientY) * 0.5;
      const midSvg = clientToSvg(midClientX, midClientY);

      if (midSvg) {
        const scale = dist / pinchStateRef.current.initialDistance;
        const nextZoom = Math.max(
          0.12,
          Math.min(25.0, pinchStateRef.current.initialZoom * scale)
        );
        lockViewport();
        setZoom(nextZoom);
        setPan({
          x: midSvg.x - pinchStateRef.current.anchorWorldSvgX * nextZoom,
          y: midSvg.y - pinchStateRef.current.anchorWorldSvgY * nextZoom,
        });
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (e.shiftKey !== shiftKeyDown) {
      setShiftKeyDown(e.shiftKey);
    }
    if (e.ctrlKey !== ctrlKeyDown) {
      setCtrlKeyDown(e.ctrlKey);
    }
    const svgP = clientToSvg(e.clientX, e.clientY);
    if (svgP) {
      const unscaledX = (svgP.x - pan.x) / zoom;
      const unscaledY = (svgP.y - pan.y) / zoom;
      setHoverSvgPos({ x: unscaledX, y: unscaledY });
      setHoverWorldPos(toWorld(unscaledX, unscaledY));
    }

    if (isPanning) {
      const nextPanX = e.clientX - panStart.x;
      const nextPanY = e.clientY - panStart.y;
      if (Math.abs(nextPanX - pan.x) > 2 || Math.abs(nextPanY - pan.y) > 2) {
        lockViewport();
      }
      setPan({
        x: nextPanX,
        y: nextPanY,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.88;
    const svgP = clientToSvg(e.clientX, e.clientY);
    if (svgP) {
      zoomAroundPoint(zoom * factor, svgP.x, svgP.y);
    } else {
      zoomAroundPoint(zoom * factor, svgWidth / 2, svgHeight / 2);
    }
  };

  // Download high-res SVG of active canvas
  const handleExportSingleSvg = () => {
    const svgEl = svgRef.current || containerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wafer-cross-section-step-${stepNumber ?? 1}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={cardRef}
      className="relative flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl select-none"
    >
      {/* Top CAD Control Bar - Responsive layout */}
      <div className="flex flex-wrap items-center justify-between px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-900 border-b border-slate-800 text-xs gap-1.5 sm:gap-2 min-w-0">
        {/* Left: Status & Active Step Title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 truncate">
          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
          <span className="font-semibold text-slate-200 truncate text-xs hidden sm:inline">
            {title || 'Wafer Cross-Section'}
          </span>
          {stepNumber !== undefined && (
            <span className="text-slate-300 font-mono text-[11px] shrink-0 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/80">
              {stepNumber === 0 ? 'Substrate' : `Step ${stepNumber}/${totalSteps}`}
            </span>
          )}
          {activeStepTitle && (
            <span className="text-sky-400 font-medium truncate text-[11px] sm:hidden xl:inline">
              · {activeStepTitle}
            </span>
          )}
          {activeStepSide === 'back' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-semibold shrink-0">
              Back (-Z)
            </span>
          )}
          {activeStepSide === 'both' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-semibold shrink-0">
              ±Z
            </span>
          )}
        </div>

        {/* Right: Viewport Controls */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
          {/* Zoom Controls (hidden on <sm because Floating Bottom-Right HUD covers it cleanly) */}
          <div className="hidden sm:flex items-center gap-0.5 bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5 shrink-0 shadow-sm">
            <button
              onClick={() => zoomAroundPoint(zoom * 0.85, svgWidth / 2, svgHeight / 2)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1 text-[11px] font-mono text-slate-200 min-w-9 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => zoomAroundPoint(zoom * 1.18, svgWidth / 2, svgHeight / 2)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {/* Magnifying Glass Region Zoom */}
            <button
              onClick={() => {
                const next = !regionZoomMode;
                setRegionZoomMode(next);
                setZoomSelection(null);
                if (next) {
                  setMeasureMode(false);
                  setStackProbeMode(false);
                }
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all font-medium text-[11px] ${
                regionZoomMode
                  ? 'bg-sky-500 text-white shadow-sm ring-1 ring-sky-300/60'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title="Magnifying Glass: Drag a region or click to zoom in (hold Ctrl to zoom out)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Zoom Area</span>
            </button>
            {/* The Resize to Screen Button */}
            <button
              onClick={fitToScreen}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/50 hover:border-sky-400 transition-all font-semibold text-[11px] shadow-sm active:scale-95"
              title="Resize to Screen / Fit Wafer (F)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span className="inline font-medium">Fit</span>
            </button>
          </div>

          {/* Vertical Z-Scale Selector */}
          <div
            className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 shrink-0"
            title="Vertical Exaggeration Factor"
          >
            <span className="text-[10px] text-slate-400 font-mono">Z:</span>
            <select
              value={zScale.toFixed(1)}
              onChange={(e) => {
                const nextZ = parseFloat(e.target.value);
                if (lockedMetrics !== null && zScale > 0) {
                  const uyOld = (svgHeight / 2 - pan.y) / zoom;
                  const uyNew =
                    effectiveDatumScreenY -
                    (effectiveDatumScreenY - uyOld) * (nextZ / zScale);
                  setPan((p) => ({
                    ...p,
                    y: svgHeight / 2 - uyNew * zoom,
                  }));
                }
                setZScale(nextZ);
              }}
              className="bg-transparent text-white font-mono text-[11px] focus:outline-none cursor-pointer"
            >
              <option value="1.0" className="bg-slate-900">1.0x</option>
              <option value="1.5" className="bg-slate-900">1.5x</option>
              <option value="2.0" className="bg-slate-900">2.0x</option>
              <option value="3.5" className="bg-slate-900">3.5x</option>
              <option value="5.0" className="bg-slate-900">5.0x</option>
            </select>
          </div>

          {/* Hatch vs Solid toggle */}
          <button
            onClick={() => setRenderMode(renderMode === 'hatch' ? 'solid' : 'hatch')}
            className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors hidden sm:inline-flex ${
              renderMode === 'hatch'
                ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Cleanroom Hatching Patterns"
          >
            Hatch
          </button>

          {/* Shape Outline Toggle */}
          <button
            type="button"
            onClick={() => setShowOutlines((v) => !v)}
            aria-pressed={showOutlines}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              showOutlines
                ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={showOutlines ? 'Hide Shape Outlines' : 'Show Shape Outlines'}
          >
            <Square className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Outline</span>
          </button>

          {/* Graph Axes, Grid & Labels Toggle */}
          <button
            type="button"
            onClick={() => setShowAxesAndLabels((v) => !v)}
            aria-pressed={showAxesAndLabels}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              showAxesAndLabels
                ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={
              showAxesAndLabels
                ? 'Hide Graph Axes, Grid & Labels'
                : 'Show Graph Axes, Grid & Labels'
            }
          >
            <Axis3d className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Axes</span>
          </button>

          {/* Material Legend Toggle */}
          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              showLegend
                ? 'bg-sky-600/20 border-sky-500/50 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={showLegend ? 'Hide Material Legend' : 'Show Material Legend'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Legend</span>
          </button>

          {/* Step Inset Preview Toggle */}
          {onToggleFinalInset && (canShowInsetButton ?? finalStepNumber !== undefined) && (
            <button
              type="button"
              onClick={onToggleFinalInset}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                showFinalInset
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={
                insetStepOptions && insetStepOptions.length === 0
                  ? 'Inset preview (active when viewing an earlier step)'
                  : showFinalInset
                  ? 'Hide step inset preview'
                  : 'Show inset preview of a later process step'
              }
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Inset</span>
            </button>
          )}

          {/* Caliper Measurement tool & Geometry Snap */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const next = !measureMode;
                setMeasureMode(next);
                setMeasurePoints([]);
                if (next) {
                  setRegionZoomMode(false);
                  setZoomSelection(null);
                  setStackProbeMode(false);
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                measureMode
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
              title="Measure distances (Caliper)"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Caliper</span>
            </button>
            <button
              type="button"
              onClick={() => setCaliperSnap((v) => !v)}
              aria-pressed={caliperSnap}
              className={`flex items-center gap-1 px-1.5 py-1 border-l border-slate-700 text-[11px] font-medium transition-colors ${
                caliperSnap
                  ? measureMode
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-sky-600/20 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
              }`}
              title={
                caliperSnap
                  ? 'Snap to Geometry: On (vertices, midpoints, edges)'
                  : 'Snap to Geometry: Off'
              }
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Snap</span>
            </button>
          </div>

          {/* Stack Thickness Multi-Location Probe */}
          <button
            type="button"
            onClick={() => {
              const next = !stackProbeMode;
              setStackProbeMode(next);
              if (next) {
                setRegionZoomMode(false);
                setZoomSelection(null);
                setMeasureMode(false);
              }
            }}
            aria-pressed={stackProbeMode}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
              stackProbeMode
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 shadow-sm'
                : stackProbes.length > 0
                ? 'bg-slate-800 border-cyan-500/40 text-cyan-300 hover:bg-slate-700'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Stack Thickness Probe: Click across the cross-section to inspect layer-by-layer stack thickness at multiple locations"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Stack</span>
            {stackProbes.length > 0 && (
              <span className="px-1 rounded bg-cyan-500/25 text-cyan-200 font-mono text-[10px]">
                {stackProbes.length}
              </span>
            )}
          </button>

          {/* Export SVG */}
          <button
            onClick={handleExportSingleSvg}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] transition-colors"
            title="Download SVG Vector"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">SVG</span>
          </button>

          {/* Canvas Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Canvas'}
          >
            {isFullscreen ? (
              <Minimize className="w-3.5 h-3.5" />
            ) : (
              <Maximize className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Main SVG Cross-Section Viewport + Optional Stack Thickness Drawer */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className={`relative flex-1 min-h-0 min-w-0 overflow-hidden bg-[#060a12] touch-none ${
          regionZoomMode
            ? ctrlKeyDown
              ? 'cursor-zoom-out'
              : 'cursor-zoom-in'
            : draggingProbeId
            ? 'cursor-ew-resize'
            : measureMode || stackProbeMode
            ? 'cursor-crosshair'
            : isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full block touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            setHoverSvgPos(null);
            setHoverWorldPos(null);
          }}
        >
          <SvgPatterns materials={materials} />

          {/* Master Transform Group (Pan & Zoom) */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Grid background */}
            {showAxesAndLabels && (
              <g opacity="0.15">
                {/* Vertical grid lines (every 1 µm) */}
                {Array.from({ length: 11 }).map((_, i) => {
                  const xNm = (waferWidth / 10) * i;
                  const pt = toScreen(xNm, 0);
                  const datumY = toScreen(0, rawMinY).y;
                  return (
                    <line
                      key={`vgrid_${i}`}
                      x1={pt.x}
                      y1={toScreen(0, rawMaxY).y - 40}
                      x2={pt.x}
                      y2={datumY + 25}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  );
                })}
              </g>
            )}

            {/* Simulated Material Polygons */}
            <g id="wafer-layers">
              {polygons.map((poly) => {
                const mat = getMaterialById(materials, poly.materialId);
                const isHovered = hoveredPolygon?.id === poly.id;
                const pathStr = getTransformedPath(poly.points);
                const fillRef =
                  renderMode === 'hatch'
                    ? `url(#mat-fill-${mat.id})`
                    : mat.color;

                return (
                  <path
                    key={poly.id}
                    d={pathStr}
                    fill={fillRef}
                    stroke={
                      isHovered
                        ? '#38bdf8'
                        : showOutlines
                        ? mat.strokeColor || '#1e293b'
                        : 'none'
                    }
                    strokeWidth={isHovered ? 2.5 : showOutlines ? 1.2 : 0}
                    className="transition-colors cursor-pointer"
                    onMouseEnter={() => setHoveredPolygon(poly)}
                    onMouseLeave={() => setHoveredPolygon(null)}
                  />
                );
              })}
            </g>

            {/* Mounted Dicing Tape Ring Frame Brackets */}
            {mesh.mountedFrames && mesh.mountedFrames.length > 0 && (
              <g id="mounted-tape-frames" pointerEvents="none">
                {mesh.mountedFrames.map((frame, fIdx) => {
                  const leftX = toScreen(0, 0).x;
                  const rightX = toScreen(waferWidth, 0).x;
                  const yTopPx = toScreen(0, frame.yTop).y;
                  const yBotPx = toScreen(0, frame.yBottom).y;
                  const yMinPx = Math.min(yTopPx, yBotPx);
                  const yMaxPx = Math.max(yTopPx, yBotPx);
                  const clampH = Math.max(8, yMaxPx - yMinPx);
                  const extW = 24;
                  const jawW = 10;
                  const lip = 4;

                  return (
                    <g key={`tape_frame_${fIdx}_${frame.side}`}>
                      {/* Tape film extensions into ring frame */}
                      <rect
                        x={leftX - extW}
                        y={yMinPx}
                        width={extW}
                        height={clampH}
                        fill="#0284c7"
                        fillOpacity="0.65"
                        stroke="#38bdf8"
                        strokeWidth="1"
                      />
                      <rect
                        x={rightX}
                        y={yMinPx}
                        width={extW}
                        height={clampH}
                        fill="#0284c7"
                        fillOpacity="0.65"
                        stroke="#38bdf8"
                        strokeWidth="1"
                      />

                      {/* Left stainless steel ring frame clamp */}
                      <rect
                        x={leftX - extW - jawW}
                        y={yMinPx - lip}
                        width={jawW + 6}
                        height={clampH + lip * 2}
                        rx="2"
                        fill="#475569"
                        stroke="#94a3b8"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={leftX - extW - jawW + 3}
                        y1={yMinPx - lip + 3}
                        x2={leftX - extW - jawW + 3}
                        y2={yMaxPx + lip - 3}
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />

                      {/* Right stainless steel ring frame clamp */}
                      <rect
                        x={rightX + extW - 6}
                        y={yMinPx - lip}
                        width={jawW + 6}
                        height={clampH + lip * 2}
                        rx="2"
                        fill="#475569"
                        stroke="#94a3b8"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={rightX + extW + jawW - 3}
                        y1={yMinPx - lip + 3}
                        x2={rightX + extW + jawW - 3}
                        y2={yMaxPx + lip - 3}
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />

                      {showAxesAndLabels && (
                        <text
                          x={rightX + extW + jawW + 5}
                          y={(yMinPx + yMaxPx) / 2 + 3}
                          fill="#38bdf8"
                          fontSize="8.5"
                          fontWeight="600"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          FRAME
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Wafer X Axis & Coordinates */}
            {showAxesAndLabels && (
              <g id="wafer-axes">
                {/* Bottom datum line */}
                {(() => {
                  const datumY = toScreen(0, rawMinY).y;
                  return (
                    <>
                      <line
                        x1={effectivePaddingX}
                        y1={datumY}
                        x2={effectivePaddingX + effectiveContentWidth}
                        y2={datumY}
                        stroke="#64748b"
                        strokeWidth="1.5"
                      />

                      {/* Ticks along X */}
                      {Array.from({ length: 11 }).map((_, i) => {
                        const xNm = (waferWidth / 10) * i;
                        const xUm = (xNm / 1000).toFixed(1);
                        const pt = toScreen(xNm, 0);
                        return (
                          <g key={`xtick_${i}`} transform={`translate(${pt.x}, ${datumY})`}>
                            <line y1="0" y2="6" stroke="#64748b" strokeWidth="1" />
                            <text
                              y="18"
                              textAnchor="middle"
                              fill="#94a3b8"
                              fontSize="9.5"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {xUm} µm
                            </text>
                          </g>
                        );
                      })}

                      {/* Wafer Orientation Markers (Frontside +Z / Backside -Z) */}
                      <text
                        x={effectivePaddingX}
                        y={toScreen(0, rawMaxY).y - 10}
                        fill={
                          activeStepSide === 'front' || !activeStepSide
                            ? '#38bdf8'
                            : activeStepSide === 'both'
                            ? '#34d399'
                            : '#64748b'
                        }
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        ▲ FRONTSIDE (+Z)
                      </text>
                      <text
                        x={effectivePaddingX}
                        y={datumY + 34}
                        fill={
                          activeStepSide === 'back'
                            ? '#fbbf24'
                            : activeStepSide === 'both'
                            ? '#34d399'
                            : '#64748b'
                        }
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        ▼ BACKSIDE (-Z)
                      </text>
                    </>
                  );
                })()}
              </g>
            )}

            {/* Caliper measurement lines & geometry snap reticle */}
            {(measurePoints.length > 0 || (measureMode && activeSnapTarget)) && (() => {
              const invZ = 1 / Math.max(0.12, zoom);
              const rawPreviewEnd =
                measureMode && measurePoints.length === 1
                  ? activeSnapTarget?.point ?? hoverWorldPos
                  : null;
              const isShiftConstrained =
                measureMode &&
                measurePoints.length === 1 &&
                caliperAngleSnap &&
                shiftKeyDown &&
                rawPreviewEnd !== null;
              const constrainedPreview =
                isShiftConstrained && rawPreviewEnd
                  ? constrainCaliperPoint(measurePoints[0], rawPreviewEnd)
                  : null;
              const previewEnd = constrainedPreview
                ? constrainedPreview.point
                : rawPreviewEnd;

              const renderMeasurementSpan = (
                ptA: { x: number; y: number },
                ptB: { x: number; y: number },
                isPreview: boolean,
                angleBadge?: 'H' | 'V' | '45°'
              ) => {
                const p1 = toScreen(ptA.x, ptA.y);
                const p2 = toScreen(ptB.x, ptB.y);
                const dxNm = Math.abs(ptB.x - ptA.x);
                const dyNm = Math.abs(ptB.y - ptA.y);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const labelText = angleBadge
                  ? `ΔX: ${formatThickness(dxNm, thicknessUnit)} | ΔY: ${formatThickness(dyNm, thicknessUnit)} · ${angleBadge}`
                  : `ΔX: ${formatThickness(dxNm, thicknessUnit)} | ΔY: ${formatThickness(dyNm, thicknessUnit)}`;
                const boxW = Math.max(152, labelText.length * 6.2 + 16) * invZ;
                const boxH = 22 * invZ;

                return (
                  <g opacity={isPreview ? 0.88 : 1} pointerEvents="none">
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={angleBadge ? '#a78bfa' : isPreview ? '#38bdf8' : '#f59e0b'}
                      strokeWidth={1.8 * invZ}
                      strokeDasharray={`${4 * invZ} ${3 * invZ}`}
                    />
                    <rect
                      x={midX - boxW / 2}
                      y={midY - 26 * invZ}
                      width={boxW}
                      height={boxH}
                      rx={5 * invZ}
                      fill="#0f172a"
                      fillOpacity="0.94"
                      stroke={angleBadge ? '#a78bfa' : isPreview ? '#38bdf8' : '#f59e0b'}
                      strokeWidth={1.2 * invZ}
                    />
                    <text
                      x={midX}
                      y={midY - 12 * invZ}
                      fill={angleBadge ? '#ddd6fe' : isPreview ? '#7dd3fc' : '#fbbf24'}
                      fontSize={10 * invZ}
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor="middle"
                    >
                      {labelText}
                    </text>
                  </g>
                );
              };

              return (
                <g id="caliper-measurement" pointerEvents="none">
                  {measurePoints.map((pt, i) => {
                    const s = toScreen(pt.x, pt.y);
                    return (
                      <circle
                        key={`meas_pt_${i}`}
                        cx={s.x}
                        cy={s.y}
                        r={4 * invZ}
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth={1.5 * invZ}
                      />
                    );
                  })}

                  {measurePoints.length === 1 &&
                    previewEnd &&
                    renderMeasurementSpan(
                      measurePoints[0],
                      previewEnd,
                      true,
                      constrainedPreview?.modeLabel
                    )}

                  {measurePoints.length === 2 &&
                    renderMeasurementSpan(measurePoints[0], measurePoints[1], false)}

                  {measureMode && activeSnapTarget && (() => {
                    const s = toScreen(activeSnapTarget.point.x, activeSnapTarget.point.y);
                    const sz = 5.5 * invZ;
                    const color =
                      activeSnapTarget.kind === 'vertex'
                        ? '#34d399'
                        : activeSnapTarget.kind === 'midpoint'
                        ? '#38bdf8'
                        : '#fbbf24';
                    const tag =
                      activeSnapTarget.kind === 'vertex'
                        ? 'VERTEX'
                        : activeSnapTarget.kind === 'midpoint'
                        ? 'MID'
                        : 'EDGE';

                    return (
                      <g>
                        {activeSnapTarget.kind === 'vertex' && (
                          <rect
                            x={s.x - sz}
                            y={s.y - sz}
                            width={sz * 2}
                            height={sz * 2}
                            fill="rgba(52, 211, 153, 0.18)"
                            stroke={color}
                            strokeWidth={1.8 * invZ}
                          />
                        )}
                        {activeSnapTarget.kind === 'midpoint' && (
                          <polygon
                            points={`${s.x},${s.y - sz * 1.25} ${s.x + sz * 1.25},${s.y} ${s.x},${s.y + sz * 1.25} ${s.x - sz * 1.25},${s.y}`}
                            fill="rgba(56, 189, 248, 0.18)"
                            stroke={color}
                            strokeWidth={1.8 * invZ}
                          />
                        )}
                        {activeSnapTarget.kind === 'edge' && (
                          <circle
                            cx={s.x}
                            cy={s.y}
                            r={sz}
                            fill="rgba(251, 191, 36, 0.16)"
                            stroke={color}
                            strokeWidth={1.8 * invZ}
                          />
                        )}
                        <circle cx={s.x} cy={s.y} r={2 * invZ} fill={color} />
                        <rect
                          x={s.x + 8 * invZ}
                          y={s.y - 17 * invZ}
                          width={42 * invZ}
                          height={14 * invZ}
                          rx={3 * invZ}
                          fill="#0f172a"
                          fillOpacity="0.92"
                          stroke={color}
                          strokeWidth={0.9 * invZ}
                        />
                        <text
                          x={s.x + 29 * invZ}
                          y={s.y - 7 * invZ}
                          fill={color}
                          fontSize={8.5 * invZ}
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                          textAnchor="middle"
                        >
                          {tag}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}

            {/* Vertical Stack Thickness Probes & Live Laser Cursor */}
            {(probedStacks.length > 0 || (stackProbeMode && liveHoverStack)) && (() => {
              const invZ = 1 / Math.max(0.12, zoom);
              const lineTopY = toScreen(0, rawMaxY).y - 26 * invZ;
              const lineBotY = toScreen(0, rawMinY).y + 12 * invZ;

              return (
                <g>
                  {/* Live hover guide when Stack Probe Mode is active */}
                  {stackProbeMode && liveHoverStack && (() => {
                    const sx = toScreen(liveHoverStack.xNm, 0).x;
                    const labelTxt = `${(liveHoverStack.xNm / 1000).toFixed(2)} µm · ${formatThickness(
                      liveHoverStack.totalMaterialThicknessNm,
                      thicknessUnit
                    )}`;
                    const boxW = Math.max(122, labelTxt.length * 6 + 14) * invZ;
                    return (
                      <g pointerEvents="none" opacity={0.85}>
                        <line
                          x1={sx}
                          y1={lineTopY}
                          x2={sx}
                          y2={lineBotY}
                          stroke="#22d3ee"
                          strokeWidth={1.3 * invZ}
                          strokeDasharray={`${4 * invZ} ${3 * invZ}`}
                        />
                        {liveHoverStack.layersTopToBottom.map((layer, lIdx) => {
                          if (layer.kind !== 'material') return null;
                          const ptTop = toScreen(liveHoverStack.xNm, layer.yTop);
                          const ptBot = toScreen(liveHoverStack.xNm, layer.yBottom);
                          return (
                            <g key={`live_tick_${lIdx}`}>
                              <circle cx={sx} cy={ptTop.y} r={2.2 * invZ} fill="#22d3ee" />
                              <circle cx={sx} cy={ptBot.y} r={2.2 * invZ} fill="#22d3ee" />
                            </g>
                          );
                        })}
                        <rect
                          x={sx - boxW / 2}
                          y={lineTopY - 20 * invZ}
                          width={boxW}
                          height={17 * invZ}
                          rx={4 * invZ}
                          fill="#082f49"
                          fillOpacity="0.92"
                          stroke="#22d3ee"
                          strokeWidth={1 * invZ}
                        />
                        <text
                          x={sx}
                          y={lineTopY - 8.5 * invZ}
                          fill="#cffafe"
                          fontSize={9 * invZ}
                          fontWeight="600"
                          fontFamily="JetBrains Mono, monospace"
                          textAnchor="middle"
                        >
                          {labelTxt}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Pinned multi-location probes */}
                  {probedStacks.map(({ probe, label, color, sample }) => {
                    const sx = toScreen(probe.xNm, 0).x;
                    const badgeTxt = `${label} · ${formatThickness(
                      sample.totalMaterialThicknessNm,
                      thicknessUnit
                    )}`;
                    const pillW = Math.max(76, badgeTxt.length * 6 + 16) * invZ;
                    const pillH = 18 * invZ;
                    return (
                      <g key={probe.id}>
                        <line
                          x1={sx}
                          y1={lineTopY}
                          x2={sx}
                          y2={lineBotY}
                          stroke={color}
                          strokeWidth={1.8 * invZ}
                          strokeDasharray={`${5 * invZ} ${3 * invZ}`}
                          pointerEvents="none"
                        />
                        {sample.layersTopToBottom.map((layer, lIdx) => {
                          if (layer.kind !== 'material') return null;
                          const yTopPx = toScreen(probe.xNm, layer.yTop).y;
                          const yBotPx = toScreen(probe.xNm, layer.yBottom).y;
                          return (
                            <g key={`${probe.id}_tick_${lIdx}`} pointerEvents="none">
                              <line
                                x1={sx - 5 * invZ}
                                y1={yTopPx}
                                x2={sx + 5 * invZ}
                                y2={yTopPx}
                                stroke={color}
                                strokeWidth={1.5 * invZ}
                              />
                              <line
                                x1={sx - 5 * invZ}
                                y1={yBotPx}
                                x2={sx + 5 * invZ}
                                y2={yBotPx}
                                stroke={color}
                                strokeWidth={1.5 * invZ}
                              />
                            </g>
                          );
                        })}
                        {/* Draggable top pin handle */}
                        <g
                          style={{ cursor: 'ew-resize' }}
                          onPointerDown={(e) => {
                            if (e.pointerType === 'mouse' && e.button !== 0) return;
                            e.stopPropagation();
                            setDraggingProbeId(probe.id);
                          }}
                        >
                          <rect
                            x={sx - pillW / 2}
                            y={lineTopY - pillH - 2 * invZ}
                            width={pillW}
                            height={pillH}
                            rx={4.5 * invZ}
                            fill="#0f172a"
                            fillOpacity="0.95"
                            stroke={color}
                            strokeWidth={1.3 * invZ}
                          />
                          <text
                            x={sx}
                            y={lineTopY - 7.5 * invZ}
                            fill={color}
                            fontSize={9.5 * invZ}
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                            textAnchor="middle"
                          >
                            {badgeTxt}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </g>

          {/* Magnifying Glass Region Selection Marquee (Screen / Viewport coordinates) */}
          {zoomSelection && (() => {
            const x = Math.min(zoomSelection.startX, zoomSelection.endX);
            const y = Math.min(zoomSelection.startY, zoomSelection.endY);
            const w = Math.abs(zoomSelection.endX - zoomSelection.startX);
            const h = Math.abs(zoomSelection.endY - zoomSelection.startY);
            const w1 = toWorld((x - pan.x) / zoom, (y - pan.y) / zoom);
            const w2 = toWorld((x + w - pan.x) / zoom, (y + h - pan.y) / zoom);
            const dxNm = Math.abs(w2.x - w1.x);
            const dyNm = Math.abs(w2.y - w1.y);
            const strokeCol = ctrlKeyDown ? '#f59e0b' : '#38bdf8';
            const fillCol = ctrlKeyDown ? 'rgba(245, 158, 11, 0.14)' : 'rgba(56, 189, 248, 0.14)';
            const textCol = ctrlKeyDown ? '#fde68a' : '#7dd3fc';
            return (
              <g pointerEvents="none">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fillCol}
                  stroke={strokeCol}
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  rx="2"
                />
                {(w > 24 || h > 24) && (
                  <g transform={`translate(${Math.min(svgWidth - 165, x)}, ${Math.max(20, y - 6)})`}>
                    <rect
                      x="0"
                      y="-14"
                      width="160"
                      height="16"
                      rx="3"
                      fill="#0f172a"
                      fillOpacity="0.92"
                      stroke={strokeCol}
                      strokeWidth="0.8"
                    />
                    <text
                      x="6"
                      y="-3"
                      fill={textCol}
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {ctrlKeyDown ? 'Out' : 'In'} {formatThickness(dxNm, thicknessUnit)} × {formatThickness(dyNm, thicknessUnit)}
                    </text>
                  </g>
                )}
              </g>
            );
          })()}

          {/* Cleanroom Scale Bar HUD in bottom-left */}
          {showAxesAndLabels && (
            <g transform={`translate(${Math.min(paddingX, 40)}, ${svgHeight - 20})`}>
              {(() => {
                const pxPerNm = scaleX * zoom;
                if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return null;

                const leftOriginX = Math.min(paddingX, 40);
                const maxBarPx = Math.max(64, Math.min(180, svgWidth - leftOriginX - 210));
                const minBarPx = Math.min(44, maxBarPx * 0.45);
                const targetBarPx = Math.max(minBarPx, Math.min(115, maxBarPx * 0.72));

                // Pick the cleanest 1-2-5 * 10^k nm length within [minBarPx, maxBarPx]
                let bestNm = 1000;
                let bestScore = Infinity;
                for (let exp = -1; exp <= 7; exp++) {
                  const pow = Math.pow(10, exp);
                  for (const mult of [1, 2, 5]) {
                    const candidateNm = mult * pow;
                    const px = candidateNm * pxPerNm;
                    if (px > maxBarPx) continue;
                    const penalty = px < minBarPx ? (minBarPx - px) * 5 : 0;
                    const score = Math.abs(px - targetBarPx) + penalty;
                    if (score < bestScore) {
                      bestScore = score;
                      bestNm = candidateNm;
                    }
                  }
                }

                // Fallback if even smallest candidate exceeded maxBarPx
                let barPixels = bestNm * pxPerNm;
                if (barPixels > maxBarPx) {
                  barPixels = maxBarPx;
                  bestNm = maxBarPx / pxPerNm;
                }

                const formatScaleLabel = (nm: number): string => {
                  if (nm >= 1_000_000) {
                    const mm = Math.round((nm / 1_000_000) * 1000) / 1000;
                    return `${mm} mm`;
                  }
                  if (nm >= 1000) {
                    const um = Math.round((nm / 1000) * 1000) / 1000;
                    return `${um} µm`;
                  }
                  const cleanNm = Math.round(nm * 100) / 100;
                  return `${cleanNm} nm`;
                };

                const label = formatScaleLabel(bestNm);
                const labelX = Math.max(22, barPixels / 2);

                return (
                  <g>
                    <line
                      x1="0"
                      y1="0"
                      x2={barPixels}
                      y2="0"
                      stroke="#020617"
                      strokeWidth="5"
                      strokeLinecap="round"
                      opacity="0.7"
                    />
                    <line
                      x1="0"
                      y1="0"
                      x2={barPixels}
                      y2="0"
                      stroke="#e2e8f0"
                      strokeWidth="2.5"
                    />
                    <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#e2e8f0" strokeWidth="2" />
                    <line
                      x1={barPixels}
                      y1="-4.5"
                      x2={barPixels}
                      y2="4.5"
                      stroke="#e2e8f0"
                      strokeWidth="2"
                    />
                    <text
                      x={labelX}
                      y="-7"
                      fill="#f1f5f9"
                      stroke="#020617"
                      strokeWidth="3"
                      paintOrder="stroke"
                      fontSize="10.5"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>

        {/* Active Magnifying Glass Mode Banner */}
        {regionZoomMode && (
          <div
            className={`absolute top-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border text-[11px] font-medium shadow-lg backdrop-blur-md transition-colors ${
              ctrlKeyDown
                ? 'border-amber-500/60 text-amber-300'
                : 'border-sky-500/60 text-sky-300'
            }`}
          >
            <Search
              className={`w-3.5 h-3.5 shrink-0 ${
                ctrlKeyDown ? 'text-amber-400' : 'text-sky-400'
              }`}
            />
            <span>
              {ctrlKeyDown
                ? 'Ctrl held: Drag or click to zoom out · Preserves aspect ratio'
                : 'Drag region to zoom · Click to zoom 2× · Hold Ctrl to zoom out'}
            </span>
            <button
              type="button"
              onClick={() => {
                setRegionZoomMode(false);
                setZoomSelection(null);
              }}
              className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
            >
              Done
            </button>
          </div>
        )}

        {/* Active Caliper Mode Banner */}
        {measureMode && !regionZoomMode && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/92 border border-amber-500/60 text-amber-200 text-[11px] font-medium shadow-lg backdrop-blur-md"
          >
            <Ruler className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {measurePoints.length === 2 ? (() => {
              const dxNm = Math.abs(measurePoints[1].x - measurePoints[0].x);
              const dyNm = Math.abs(measurePoints[1].y - measurePoints[0].y);
              const distNm = Math.hypot(dxNm, dyNm);
              return (
                <span className="font-mono text-[11px] text-amber-200">
                  ΔX {formatThickness(dxNm, thicknessUnit)} · ΔY {formatThickness(dyNm, thicknessUnit)} · L {formatThickness(distNm, thicknessUnit)}
                </span>
              );
            })() : (
              <span>
                {measurePoints.length === 0
                  ? 'Click start point to measure'
                  : 'Click end point to measure'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setCaliperSnap((v) => !v)}
              aria-pressed={caliperSnap}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                caliperSnap
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle snapping to polygon vertices, midpoints, and edges"
            >
              <Magnet className="w-3 h-3" />
              <span>Snap: {caliperSnap ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCaliperAngleSnap((v) => !v)}
              aria-pressed={caliperAngleSnap}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                caliperAngleSnap
                  ? shiftKeyDown && measurePoints.length === 1
                    ? 'bg-violet-500/30 border-violet-400 text-violet-200'
                    : 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="When On, holding Shift forces horizontal, vertical, or 45° measurement"
            >
              <span>Shift H/V/45°: {caliperAngleSnap ? 'On' : 'Off'}</span>
            </button>
            {caliperAngleSnap && shiftKeyDown && measurePoints.length === 1 && (
              <span className="px-1.5 py-0.5 rounded bg-violet-500/25 border border-violet-400/60 text-violet-200 text-[10px] font-mono font-semibold">
                {(() => {
                  const target = activeSnapTarget?.point ?? hoverWorldPos;
                  if (!target) return '0/45/90°';
                  const { modeLabel } = constrainCaliperPoint(measurePoints[0], target);
                  return modeLabel === 'H' ? '0° (H)' : modeLabel === 'V' ? '90° (V)' : '45°';
                })()}
              </span>
            )}
            {measurePoints.length > 0 && (
              <button
                type="button"
                onClick={() => setMeasurePoints([])}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMeasureMode(false);
                setMeasurePoints([]);
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px]"
            >
              Done
            </button>
          </div>
        )}

        {/* Floating Later Process Step Inset (Top-Right when earlier step is selected) */}
        {showFinalInset &&
          finalMesh &&
          finalPolygons &&
          finalPolygons.length > 0 &&
          finalStepNumber !== undefined &&
          stepNumber !== undefined &&
          stepNumber < finalStepNumber && (() => {
            const insetVbW = 320;
            const insetVbH = 176;
            const padX = 14;
            const padY = 14;
            const availW = insetVbW - padX * 2;
            const availH = insetVbH - padY * 2;

            let fMinX = 0;
            let fMaxX = waferWidth;
            let fMinY = finalMesh.minY ?? 0;
            let fMaxY = Math.max(finalMesh.maxY ?? 3000, 2500);
            for (const poly of finalPolygons) {
              if (poly.xMin < fMinX) fMinX = poly.xMin;
              if (poly.xMax > fMaxX) fMaxX = poly.xMax;
              if (poly.yMin < fMinY) fMinY = poly.yMin;
              if (poly.yMax > fMaxY) fMaxY = poly.yMax;
              for (const p of poly.points) {
                if (p.x < fMinX) fMinX = p.x;
                if (p.x > fMaxX) fMaxX = p.x;
                if (p.y < fMinY) fMinY = p.y;
                if (p.y > fMaxY) fMaxY = p.y;
              }
            }

            const fSpanX = Math.max(100, fMaxX - fMinX);
            const fSpanY = Math.max(300, fMaxY - fMinY);
            const rawSx = availW / fSpanX;
            const rawSy = (availH * 0.65 * (zScale / 2.0)) / fSpanY;
            const rawWaferH = fSpanY * rawSy;
            const fitFactor = rawWaferH > availH ? availH / rawWaferH : 1;
            const insetSx = rawSx * fitFactor;
            const insetSy = rawSy * fitFactor;
            const insetOffsetX = (insetVbW - fSpanX * insetSx) / 2 - fMinX * insetSx;
            const insetCenterY = insetVbH / 2 + (fSpanY * insetSy) / 2;

            const toInset = (x: number, y: number) => ({
              x: insetOffsetX + x * insetSx,
              y: insetCenterY - (y - fMinY) * insetSy,
            });

            const buildInsetPath = (pts: { x: number; y: number }[]) => {
              if (pts.length < 3) return '';
              const first = toInset(pts[0].x, pts[0].y);
              let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
              for (let i = 1; i < pts.length; i++) {
                const pt = toInset(pts[i].x, pts[i].y);
                d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
              }
              return d + ' Z';
            };

            // Main canvas visible world bounds for zoomed-in ROI indicator
            const visLeftWx = ((0 - pan.x) / zoom - effectivePaddingX) / scaleX;
            const visRightWx = ((svgWidth - pan.x) / zoom - effectivePaddingX) / scaleX;
            const visTopWy =
              effectiveMinY + (effectiveDatumScreenY - (0 - pan.y) / zoom) / scaleY;
            const visBotWy =
              effectiveMinY + (effectiveDatumScreenY - (svgHeight - pan.y) / zoom) / scaleY;
            const showRoiBox =
              lockedMetrics !== null &&
              (visRightWx - visLeftWx < fSpanX * 0.88 || visTopWy - visBotWy < fSpanY * 0.88);
            const roiX1 = Math.max(fMinX, Math.min(fMaxX, visLeftWx));
            const roiX2 = Math.max(fMinX, Math.min(fMaxX, visRightWx));
            const roiY1 = Math.max(fMinY, Math.min(fMaxY, visBotWy));
            const roiY2 = Math.max(fMinY, Math.min(fMaxY, visTopWy));
            const roiP1 = toInset(roiX1, roiY2);
            const roiP2 = toInset(roiX2, roiY1);
            const datumLeft = toInset(fMinX, fMinY);
            const datumRight = toInset(fMaxX, fMinY);

            const options = insetStepOptions ?? [];
            const currentOptionIdx =
              selectedInsetStepIndex !== undefined
                ? options.findIndex((o) => o.stepIndex === selectedInsetStepIndex)
                : options.length - 1;

            return (
              <div
                ref={insetRef}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                style={
                  insetPos
                    ? { left: `${insetPos.x}px`, top: `${insetPos.y}px` }
                    : undefined
                }
                className={`absolute z-20 flex flex-col bg-slate-900/92 backdrop-blur-md border border-emerald-500/40 rounded-xl shadow-2xl overflow-hidden ${
                  insetPos ? '' : 'top-3 right-3'
                } ${
                  insetDrag
                    ? 'ring-2 ring-emerald-400/50 select-none'
                    : insetPos
                    ? ''
                    : 'transition-[width] duration-150'
                } ${
                  insetExpanded
                    ? 'w-72 sm:w-96'
                    : 'w-52 sm:w-64'
                }`}
              >
                {/* Inset Header (Drag Handle) */}
                <div
                  onPointerDown={startInsetDrag}
                  onDoubleClick={() => setInsetPos(null)}
                  title="Drag to move inset (double-click to reset position)"
                  className={`flex items-center justify-between gap-1.5 px-2 py-1.5 bg-slate-950/85 border-b border-slate-800 text-[11px] select-none touch-none ${
                    insetDrag ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <GripVertical className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span
                      className={`px-1 py-0.5 rounded font-mono text-[9px] font-semibold shrink-0 border ${
                        isInsetFinalStep
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                      }`}
                    >
                      {isInsetFinalStep ? 'FINAL' : 'STEP'}
                    </span>
                    <span className="text-slate-300 font-mono text-[10px] shrink-0">
                      {finalStepNumber}/{totalSteps}
                    </span>
                    {options.length <= 1 && finalStepTitle && (
                      <span className="text-slate-400 truncate text-[10px]" title={finalStepTitle}>
                        {finalStepTitle}
                      </span>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {insetPos && (
                      <button
                        type="button"
                        onClick={() => setInsetPos(null)}
                        className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                        title="Reset inset to top-right corner"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                    {onSelectFinalStep && (
                      <button
                        type="button"
                        onClick={onSelectFinalStep}
                        className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                        title={`Jump to step (${finalStepNumber}/${totalSteps})`}
                      >
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setInsetExpanded((v) => !v)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title={insetExpanded ? 'Compact inset' : 'Expand inset'}
                    >
                      {insetExpanded ? (
                        <Minimize2 className="w-3 h-3" />
                      ) : (
                        <Maximize2 className="w-3 h-3" />
                      )}
                    </button>
                    {onToggleFinalInset && (
                      <button
                        type="button"
                        onClick={onToggleFinalInset}
                        className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
                        title="Hide inset"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inset Step Selector (when multiple later steps are available) */}
                {options.length > 1 && onChangeInsetStep && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-slate-900/95 border-b border-slate-800/90 text-[10px]">
                    <button
                      type="button"
                      disabled={currentOptionIdx <= 0}
                      onClick={() => {
                        if (currentOptionIdx > 0) {
                          onChangeInsetStep(options[currentOptionIdx - 1].stepIndex);
                        }
                      }}
                      className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
                      title="Previous later step"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <select
                      value={selectedInsetStepIndex ?? options[options.length - 1].stepIndex}
                      onChange={(e) => onChangeInsetStep(Number(e.target.value))}
                      aria-label="Select step to preview in inset"
                      className="flex-1 min-w-0 bg-slate-950/90 hover:bg-slate-800/90 text-slate-200 border border-slate-700/70 focus:border-emerald-500/60 rounded px-1.5 py-0.5 text-[10px] font-mono truncate focus:outline-none cursor-pointer"
                      title={finalStepTitle ? `Step ${finalStepNumber}/${totalSteps}: ${finalStepTitle}` : undefined}
                    >
                      {options.map((opt, idx) => {
                        const isLast = idx === options.length - 1;
                        return (
                          <option
                            key={opt.stepIndex}
                            value={opt.stepIndex}
                            className="bg-slate-900 text-slate-100"
                          >
                            {opt.stepNumber}/{totalSteps} · {opt.title}
                            {isLast ? ' (Final)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      disabled={currentOptionIdx < 0 || currentOptionIdx >= options.length - 1}
                      onClick={() => {
                        if (currentOptionIdx >= 0 && currentOptionIdx < options.length - 1) {
                          onChangeInsetStep(options[currentOptionIdx + 1].stepIndex);
                        }
                      }}
                      className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
                      title="Next later step"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Inset Mini Cross-Section SVG (also draggable) */}
                <div
                  onPointerDown={startInsetDrag}
                  onDoubleClick={() => setInsetPos(null)}
                  title="Drag to move inset (double-click to reset position)"
                  className={`relative w-full bg-[#060a12] select-none touch-none ${
                    insetDrag ? 'cursor-grabbing' : 'cursor-grab'
                  } ${
                    insetExpanded ? 'h-44 sm:h-52' : 'h-28 sm:h-36'
                  }`}
                >
                  <svg
                    viewBox={`0 0 ${insetVbW} ${insetVbH}`}
                    className="w-full h-full block pointer-events-none"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <SvgPatterns materials={materials} idPrefix="final-inset-" />

                    {/* Final step layer polygons */}
                    <g>
                      {finalPolygons.map((poly) => {
                        const mat = getMaterialById(materials, poly.materialId);
                        const d = buildInsetPath(poly.points);
                        if (!d) return null;
                        return (
                          <path
                            key={poly.id}
                            d={d}
                            fill={
                              renderMode === 'hatch'
                                ? `url(#final-inset-mat-fill-${mat.id})`
                                : mat.color
                            }
                            stroke={showOutlines ? mat.strokeColor || '#1e293b' : 'none'}
                            strokeWidth={showOutlines ? '0.9' : '0'}
                          />
                        );
                      })}
                    </g>

                    {/* Mounted tape frames if present on final step */}
                    {finalMesh.mountedFrames &&
                      finalMesh.mountedFrames.map((frame, fIdx) => {
                        const leftX = toInset(0, 0).x;
                        const rightX = toInset(waferWidth, 0).x;
                        const yTopPx = toInset(0, frame.yTop).y;
                        const yBotPx = toInset(0, frame.yBottom).y;
                        const yMinPx = Math.min(yTopPx, yBotPx);
                        const clampH = Math.max(3, Math.abs(yBotPx - yTopPx));
                        return (
                          <g key={`inset_frame_${fIdx}_${frame.side}`}>
                            <rect
                              x={leftX - 8}
                              y={yMinPx}
                              width={8}
                              height={clampH}
                              fill="#0284c7"
                              fillOpacity="0.65"
                            />
                            <rect
                              x={rightX}
                              y={yMinPx}
                              width={8}
                              height={clampH}
                              fill="#0284c7"
                              fillOpacity="0.65"
                            />
                          </g>
                        );
                      })}

                    {/* Datum reference line */}
                    {showAxesAndLabels && (
                      <line
                        x1={datumLeft.x}
                        y1={datumLeft.y}
                        x2={datumRight.x}
                        y2={datumRight.y}
                        stroke="#475569"
                        strokeWidth="0.9"
                      />
                    )}

                    {/* Zoomed-in region indicator matching current main viewport */}
                    {showRoiBox && roiX2 > roiX1 && roiY2 > roiY1 && (
                      <rect
                        x={roiP1.x}
                        y={roiP1.y}
                        width={Math.max(4, roiP2.x - roiP1.x)}
                        height={Math.max(4, roiP2.y - roiP1.y)}
                        fill="rgba(56, 189, 248, 0.14)"
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                        strokeDasharray="3 2"
                        rx="1.5"
                      />
                    )}
                  </svg>
                </div>
              </div>
            );
          })()}

        {/* FLOATING QUICK-ACTION HUD (Bottom-Right) - Always accessible on canvas */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl p-1 text-xs">
          <button
            onClick={() => zoomAroundPoint(zoom * 0.85, svgWidth / 2, svgHeight / 2)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const next = !regionZoomMode;
              setRegionZoomMode(next);
              setZoomSelection(null);
              if (next) {
                setMeasureMode(false);
                setStackProbeMode(false);
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              regionZoomMode
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Magnifying Glass: Drag or click to zoom in (hold Ctrl to zoom out)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToScreen}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-[11px] shadow-sm transition-all active:scale-95"
            title="Resize / Fit Wafer to Screen (F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>
          <button
            onClick={() => zoomAroundPoint(zoom * 1.18, svgWidth / 2, svgHeight / 2)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hover Layer Inspector Tooltip */}
        {hoveredPolygon && !zoomSelection && !measureMode && !stackProbeMode && !draggingProbeId && (
          <div
            className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl bg-slate-900/95 border border-sky-500/50 text-white shadow-2xl backdrop-blur-md"
            style={{
              left: `${Math.min(svgWidth - 230, Math.max(10, mousePos.x + 15))}px`,
              top: `${Math.max(10, Math.min(svgHeight - 108, mousePos.y - 78))}px`,
            }}
          >
            {(() => {
              const mat = getMaterialById(materials, hoveredPolygon.materialId);
              const zSpanNm = Math.round(hoveredPolygon.yMax - hoveredPolygon.yMin);
              const localNm = hoverWorldPos
                ? computeLocalThicknessAtPoint(hoveredPolygon, hoverWorldPos.x, hoverWorldPos.y)
                : null;
              return (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                        style={{ backgroundColor: mat.color }}
                      />
                      <span className="font-semibold text-sky-300 truncate">{mat.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 capitalize shrink-0">
                      {mat.category}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono space-y-0.5 pt-0.5">
                    <div className="flex items-center justify-between gap-3 text-slate-100">
                      <span className="text-slate-400">Local Thickness:</span>
                      <span className="font-semibold text-emerald-300">
                        {formatThickness(localNm ?? zSpanNm, thicknessUnit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-slate-300">
                      <span className="text-slate-400">Total Z-Span:</span>
                      <span>{formatThickness(zSpanNm, thicknessUnit)}</span>
                    </div>
                  </div>
                  {hoveredPolygon.stepId && (
                    <div className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/80">
                      Step: {hoveredPolygon.stepId}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Stack Thickness Multi-Location Inspector Drawer */}
      {stackProbeMode && (
        <aside
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full md:w-80 lg:w-96 max-h-[46%] md:max-h-none flex flex-col border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/95 shrink-0 min-h-0"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-950/75 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100 truncate">
                Stack Thickness
              </span>
              {probedStacks.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] shrink-0">
                  {probedStacks.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleSampleThreeLocations}
                className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-medium text-slate-200 transition-colors"
                title="Drop 3 probes across the wafer (15%, 50%, 85%)"
              >
                L / C / R
              </button>
              {probedStacks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyStackSummary}
                    className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-medium text-slate-200 transition-colors"
                    title="Copy multi-location stack table (CSV)"
                  >
                    {stackCopied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{stackCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStackProbes([])}
                    className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
                    title="Clear all probe locations"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setStackProbeMode(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Stack Thickness Panel (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Live Cursor Readout */}
          <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/50 shrink-0">
            {liveHoverStack ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-semibold text-cyan-300">
                    Cursor X = {(liveHoverStack.xNm / 1000).toFixed(2)} µm
                  </span>
                  <span className="font-mono font-bold text-white">
                    Total: {formatThickness(liveHoverStack.totalMaterialThicknessNm, thicknessUnit)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-slate-400">
                  {liveHoverStack.hasSubstrateLayers && liveHoverStack.hasOverlayers && (
                    <span>
                      Films (excl. Sub):{' '}
                      <strong className="text-sky-300">
                        {formatThickness(liveHoverStack.overlayerThicknessNm, thicknessUnit)}
                      </strong>
                    </span>
                  )}
                  <span>
                    Top Z:{' '}
                    <strong className="text-slate-200">
                      {formatThickness(
                        liveHoverStack.surfaceTopY - liveHoverStack.stackBottomY,
                        thicknessUnit
                      )}
                    </strong>
                  </span>
                  <span>Layers: {liveHoverStack.layersTopToBottom.filter((l) => l.kind === 'material').length}</span>
                </div>
                {probedStacks.length === 0 && liveHoverStack.layersTopToBottom.length > 0 && (
                  <div className="pt-1 space-y-0.5 max-h-28 overflow-y-auto pr-1">
                    {liveHoverStack.layersTopToBottom.map((layer, lIdx) => (
                      <div
                        key={`live_layer_${lIdx}`}
                        className="flex items-center justify-between gap-2 text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-xs shrink-0 ${
                              layer.kind === 'gap'
                                ? 'border border-dashed border-slate-400 bg-transparent'
                                : 'border border-white/15'
                            }`}
                            style={
                              layer.kind === 'material'
                                ? { backgroundColor: layer.materialColor }
                                : undefined
                            }
                          />
                          <span className="truncate text-slate-300">{layer.materialName}</span>
                        </div>
                        <span className="font-mono text-slate-200 shrink-0">
                          {formatThickness(layer.thicknessNm, thicknessUnit)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Click anywhere on the cross-section to pin a location, or hover to inspect live stack thickness. Drag pins horizontally to compare sites.
              </p>
            )}
          </div>

          {/* Pinned Locations List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
            {probedStacks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-4 text-center space-y-2">
                <p className="text-xs font-medium text-slate-300">No pinned locations yet</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Click different regions on the wafer (e.g. trench, mesa, field oxide) or use{' '}
                  <span className="text-slate-300 font-medium">L / C / R</span> above to compare layer thicknesses side-by-side.
                </p>
              </div>
            ) : (
              probedStacks.map(({ probe, label, color, sample }, idx) => {
                const baseline = idx > 0 ? probedStacks[0].sample : null;
                const deltaTopNm = baseline
                  ? Math.round(
                      (sample.surfaceTopY - sample.stackBottomY) -
                        (baseline.surfaceTopY - baseline.stackBottomY)
                    )
                  : null;
                const deltaStackNm = baseline
                  ? Math.round(sample.totalMaterialThicknessNm - baseline.totalMaterialThicknessNm)
                  : null;

                return (
                  <div
                    key={probe.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/85 overflow-hidden shadow-sm"
                  >
                    {/* Location Header */}
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 border"
                          style={{
                            color,
                            borderColor: `${color}55`,
                            backgroundColor: `${color}1a`,
                          }}
                        >
                          {label}
                        </span>
                        <label className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          <span>X:</span>
                          <input
                            type="number"
                            step="0.05"
                            min={0}
                            max={Number((waferWidth / 1000).toFixed(3))}
                            value={Number((probe.xNm / 1000).toFixed(2))}
                            onChange={(e) => {
                              const vUm = parseFloat(e.target.value);
                              if (!Number.isFinite(vUm)) return;
                              const clamped = Math.max(
                                0,
                                Math.min(waferWidth, Math.round(vUm * 1000))
                              );
                              setStackProbes((prev) =>
                                prev.map((p) => (p.id === probe.id ? { ...p, xNm: clamped } : p))
                              );
                            }}
                            className="w-16 bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-100 focus:outline-none"
                          />
                          <span>µm</span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setStackProbes((prev) => prev.filter((p) => p.id !== probe.id))
                        }
                        className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-slate-800 transition-colors shrink-0"
                        title={`Remove ${label}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Stack Totals & Delta vs P1 */}
                    <div className="px-2.5 py-1.5 bg-slate-950/60 border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] font-mono">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-400">
                          Total:{' '}
                          <strong className="text-white text-[11px]">
                            {formatThickness(sample.totalMaterialThicknessNm, thicknessUnit)}
                          </strong>
                        </span>
                        {sample.hasSubstrateLayers && sample.hasOverlayers && (
                          <span className="text-slate-400">
                            Films:{' '}
                            <strong className="text-sky-300">
                              {formatThickness(sample.overlayerThicknessNm, thicknessUnit)}
                            </strong>
                          </span>
                        )}
                      </div>
                      {deltaTopNm !== null && deltaStackNm !== null && (
                        <span
                          className="text-amber-300/90"
                          title={`Difference vs P1: Surface ΔZ ${deltaTopNm >= 0 ? '+' : ''}${formatThickness(deltaTopNm, thicknessUnit)}, Total Stack ${deltaStackNm >= 0 ? '+' : ''}${formatThickness(deltaStackNm, thicknessUnit)}`}
                        >
                          ΔP1: {deltaTopNm >= 0 ? '+' : '-'}
                          {formatThickness(Math.abs(deltaTopNm), thicknessUnit)}
                        </span>
                      )}
                    </div>

                    {/* Layer-by-Layer Stack Breakdown (Top -> Bottom) */}
                    <div className="divide-y divide-slate-800/50">
                      {sample.layersTopToBottom.length === 0 ? (
                        <div className="px-2.5 py-2 text-[10px] text-slate-500 italic">
                          No material at this X coordinate (etched/diced trench)
                        </div>
                      ) : (
                        sample.layersTopToBottom.map((layer, lIdx) => (
                          <div
                            key={`${probe.id}_layer_${lIdx}`}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1 text-[11px] ${
                              layer.kind === 'gap' ? 'bg-slate-900/40 text-slate-400' : ''
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-xs shrink-0 ${
                                  layer.kind === 'gap'
                                    ? 'border border-dashed border-slate-500 bg-transparent'
                                    : 'border border-white/20'
                                }`}
                                style={
                                  layer.kind === 'material'
                                    ? { backgroundColor: layer.materialColor }
                                    : undefined
                                }
                              />
                              <span className="truncate text-slate-200">
                                {layer.materialName}
                              </span>
                              {layer.isSubstrate && (
                                <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                  Sub
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono">
                              <span className="text-[9px] text-slate-500 hidden xl:inline">
                                {formatThickness(layer.yBottom, thicknessUnit)}–
                                {formatThickness(layer.yTop, thicknessUnit)}
                              </span>
                              <span
                                className={`font-semibold ${
                                  layer.kind === 'gap' ? 'text-amber-300/80' : 'text-emerald-300'
                                }`}
                              >
                                {formatThickness(layer.thicknessNm, thicknessUnit)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Manual Coordinate Entry */}
          <div className="px-2.5 py-2 border-t border-slate-800 bg-slate-950/80 flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              step="0.1"
              min={0}
              max={Number((waferWidth / 1000).toFixed(3))}
              value={manualProbeXUm}
              onChange={(e) => setManualProbeXUm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddManualProbe();
                }
              }}
              placeholder={`X (0–${(waferWidth / 1000).toFixed(1)} µm)`}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddManualProbe}
              disabled={!manualProbeXUm.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:pointer-events-none text-white text-[11px] font-semibold transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </aside>
      )}
      </div>

      {/* Bottom Material Legend Bar */}
      {showLegend && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-900/90 px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Materials:</span>
            </span>
            {legendMaterials.length === 0 ? (
              <span className="text-slate-500 italic">No layers visible</span>
            ) : (
              legendMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="inline-flex items-center gap-1.5 text-slate-200"
                  title={`${mat.name}${mat.formula ? ` (${mat.formula})` : ''} · ${mat.category}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 12 12"
                    className="rounded-[3px] shrink-0 border"
                    style={{ borderColor: mat.strokeColor || '#475569' }}
                  >
                    <rect width="12" height="12" fill={mat.color} />
                    {renderMode === 'hatch' && mat.pattern === 'diagonal-right' && (
                      <line x1="0" y1="0" x2="12" y2="12" stroke="#000" strokeWidth="1.3" strokeOpacity="0.28" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'diagonal-left' && (
                      <line x1="12" y1="0" x2="0" y2="12" stroke="#000" strokeWidth="1.3" strokeOpacity="0.28" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'crosshatch' && (
                      <path d="M 0 0 L 12 12 M 12 0 L 0 12" stroke="#000" strokeWidth="1.1" strokeOpacity="0.28" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'dots' && (
                      <circle cx="6" cy="6" r="1.6" fill="#000" fillOpacity="0.32" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'horizontal' && (
                      <line x1="0" y1="6" x2="12" y2="6" stroke="#000" strokeWidth="1.2" strokeOpacity="0.28" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'vertical' && (
                      <line x1="6" y1="0" x2="6" y2="12" stroke="#000" strokeWidth="1.2" strokeOpacity="0.28" />
                    )}
                    {renderMode === 'hatch' && mat.pattern === 'stipple' && (
                      <>
                        <circle cx="3" cy="3" r="1.1" fill="#000" fillOpacity="0.32" />
                        <circle cx="9" cy="9" r="1.1" fill="#000" fillOpacity="0.32" />
                      </>
                    )}
                  </svg>
                  <span className="font-medium text-slate-200 whitespace-nowrap">
                    {mat.name}
                  </span>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowLegend(false)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Hide Material Legend"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
