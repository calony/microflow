/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  GdsLayoutData,
  PhotomaskLevel,
} from '../types/microfab';
import {
  ParsedGdsStream,
  buildGdsLayoutFromCell,
  computeGdsBounds,
  gdsLayerKey,
  shapeMatchesLayer,
  shapeToPolygons,
  sortShapesByLayerOrder,
} from '../lib/gdsUtils';
import {
  X,
  Search,
  Layers,
  Check,
  AlertTriangle,
  Box,
  GitBranch,
  Maximize2,
} from 'lucide-react';

interface GdsTopCellModalProps {
  parsedStream: ParsedGdsStream;
  existingMasks: PhotomaskLevel[];
  onConfirm: (layout: GdsLayoutData, selectedCellName: string, truncated: boolean) => void;
  onCancel: () => void;
}

export const GdsTopCellModal: React.FC<GdsTopCellModalProps> = ({
  parsedStream,
  existingMasks,
  onConfirm,
  onCancel,
}) => {
  const [selectedCell, setSelectedCell] = useState<string>(parsedStream.defaultTopCell);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hiddenPreviewLayers, setHiddenPreviewLayers] = useState<Set<string>>(() => new Set());

  const filteredCells = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parsedStream.cells;
    return parsedStream.cells.filter((c) => c.name.toLowerCase().includes(q));
  }, [parsedStream.cells, searchQuery]);

  const topCells = useMemo(
    () => filteredCells.filter((c) => c.isTopCell),
    [filteredCells]
  );
  const subCells = useMemo(
    () => filteredCells.filter((c) => !c.isTopCell),
    [filteredCells]
  );

  // Build flattened preview for currently selected cell
  const previewResult = useMemo(() => {
    return buildGdsLayoutFromCell(parsedStream, selectedCell, existingMasks);
  }, [parsedStream, selectedCell, existingMasks]);

  const previewLayout = previewResult.layout;
  const previewTruncated = previewResult.truncated;

  const previewOrderedShapes = useMemo(
    () => sortShapesByLayerOrder(previewLayout.shapes, previewLayout.layers),
    [previewLayout.shapes, previewLayout.layers]
  );

  const previewLayerMap = useMemo(() => {
    const map = new Map<string, (typeof previewLayout.layers)[number]>();
    for (const l of previewLayout.layers) {
      map.set(gdsLayerKey(l.layer, l.datatype ?? 0), l);
    }
    return map;
  }, [previewLayout.layers]);

  const bounds = useMemo(
    () => computeGdsBounds(previewLayout.shapes, 10000),
    [previewLayout.shapes]
  );

  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);

  // SVG viewBox fitted cleanly around the cell geometry (GDS Y+ flipped to SVG Y-)
  const svgView = useMemo(() => {
    const padX = Math.max(boundsWidth * 0.08, 100);
    const padY = Math.max(boundsHeight * 0.08, 100);
    const vx = bounds.minX - padX;
    const vy = -(bounds.maxY + padY);
    const vw = boundsWidth + padX * 2;
    const vh = boundsHeight + padY * 2;
    return {
      viewBox: `${vx} ${vy} ${vw} ${vh}`,
      strokeWidth: Math.max(vw, vh) * 0.0035,
    };
  }, [bounds.minX, bounds.maxY, boundsWidth, boundsHeight]);

  const selectedSummary = useMemo(
    () => parsedStream.cells.find((c) => c.name === selectedCell),
    [parsedStream.cells, selectedCell]
  );

  const handleSelectCell = (cellName: string) => {
    setSelectedCell(cellName);
    setHiddenPreviewLayers(new Set());
  };

  const togglePreviewLayer = (key: string) => {
    setHiddenPreviewLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderCellRow = (cell: (typeof parsedStream.cells)[number]) => {
    const isSel = cell.name === selectedCell;
    return (
      <button
        key={cell.name}
        type="button"
        onClick={() => handleSelectCell(cell.name)}
        className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors space-y-1 ${
          isSel
            ? 'bg-sky-950/50 border-sky-500 text-white shadow-sm'
            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono text-xs font-semibold truncate">{cell.name}</span>
          {cell.isTopCell ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[9px] font-mono font-bold text-emerald-300 shrink-0">
              TOP
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono text-slate-400 shrink-0">
              ×{cell.referencedByCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>{cell.directElements} prim</span>
          <span>·</span>
          <span>{cell.childRefs} ref</span>
        </div>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-5xl h-[92dvh] sm:h-[86vh] max-h-[780px] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-indigo-600/25 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
              <GitBranch className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                Select Top Cell &amp; Preview GDSII Import
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                {parsedStream.fileName || parsedStream.libName} · Lib: {parsedStream.libName} ·{' '}
                {parsedStream.cells.length} cell(s)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Cancel GDS import"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Split Body: Left Cell Picker + Right Live SVG Preview */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Column: Cell List */}
          <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/70 flex flex-col max-h-[38%] md:max-h-none shrink-0">
            <div className="p-2.5 border-b border-slate-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter cell names..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
              {topCells.length > 0 && (
                <div className="space-y-1.5">
                  <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Top Cell Candidates ({topCells.length})
                  </div>
                  <div className="space-y-1.5">{topCells.map(renderCellRow)}</div>
                </div>
              )}

              {subCells.length > 0 && (
                <div className="space-y-1.5">
                  <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Sub-Cells / Blocks ({subCells.length})
                  </div>
                  <div className="space-y-1.5">{subCells.map(renderCellRow)}</div>
                </div>
              )}

              {filteredCells.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                  No cells match &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Flattened Preview */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#050811]">
            {/* Preview Status Strip */}
            <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Box className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-mono font-bold text-white truncate">
                  {selectedCell}
                </span>
                {selectedSummary?.isTopCell && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-[9.5px] font-mono font-semibold text-emerald-300">
                    Auto Top Cell
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate-300 flex-wrap">
                <span>
                  {previewLayout.shapes.length.toLocaleString()} shape
                  {previewLayout.shapes.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-600">·</span>
                <span>
                  {previewLayout.layers.length} layer
                  {previewLayout.layers.length === 1 ? '' : 's'}
                </span>
                {previewLayout.shapes.length > 0 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-300 flex items-center gap-1">
                      <Maximize2 className="w-3 h-3" />
                      {(boundsWidth / 1000).toFixed(2)} × {(boundsHeight / 1000).toFixed(2)} µm
                    </span>
                  </>
                )}
              </div>
            </div>

            {previewTruncated && (
              <div className="px-3 py-1.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Display cap reached at 8,000 flattened shapes. Remaining hierarchy shapes are truncated for browser responsiveness.
                </span>
              </div>
            )}

            {/* SVG Geometry Preview */}
            <div className="relative flex-1 min-h-[180px] p-3 flex items-center justify-center overflow-hidden">
              {previewLayout.shapes.length === 0 ? (
                <div className="text-center space-y-1 text-slate-400 text-xs">
                  <p className="font-semibold text-slate-300">
                    Cell &ldquo;{selectedCell}&rdquo; contains no drawable shapes.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Select another top cell or sub-cell from the list to preview its geometry.
                  </p>
                </div>
              ) : (
                <svg
                  viewBox={svgView.viewBox}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full block"
                >
                  {/* Bounding extent frame */}
                  <rect
                    x={bounds.minX}
                    y={-bounds.maxY}
                    width={boundsWidth}
                    height={boundsHeight}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth={svgView.strokeWidth}
                    strokeDasharray={`${svgView.strokeWidth * 4} ${svgView.strokeWidth * 3}`}
                  />

                  {/* Shapes (GDS Y+ mapped to SVG -Y) */}
                  <g>
                    {previewOrderedShapes.map((shape) => {
                      const layerKey = gdsLayerKey(shape.layer, shape.datatype ?? 0);
                      if (hiddenPreviewLayers.has(layerKey)) return null;
                      const lInfo =
                        previewLayerMap.get(layerKey) ||
                        previewLayout.layers.find((l) => l.layer === shape.layer);
                      const color = lInfo?.color || '#38bdf8';

                      if (shape.type === 'rect') {
                        const x = shape.x ?? 0;
                        const y = shape.y ?? 0;
                        const w = Math.max(0, shape.width ?? 0);
                        const h = Math.max(0, shape.height ?? 0);
                        return (
                          <rect
                            key={shape.id}
                            x={x}
                            y={-(y + h)}
                            width={w}
                            height={h}
                            fill={color}
                            fillOpacity={0.28}
                            stroke={color}
                            strokeWidth={svgView.strokeWidth}
                          />
                        );
                      }

                      const polys = shapeToPolygons(shape);
                      return (
                        <g key={shape.id}>
                          {polys.map((poly, pIdx) => (
                            <polygon
                              key={`${shape.id}_pv_${pIdx}`}
                              points={poly.map((p) => `${p.x},${-p.y}`).join(' ')}
                              fill={color}
                              fillOpacity={0.28}
                              stroke={color}
                              strokeWidth={svgView.strokeWidth}
                            />
                          ))}
                        </g>
                      );
                    })}
                  </g>
                </svg>
              )}
            </div>

            {/* Discovered Layers Strip (clickable to toggle visibility in preview) */}
            {previewLayout.layers.length > 0 && (
              <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/70 shrink-0 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
                    <Layers className="w-3 h-3 text-sky-400" />
                    <span>Layers in {selectedCell} (click to solo/hide in preview)</span>
                  </span>
                  <span className="font-mono text-slate-500">
                    Origin: ({(bounds.minX / 1000).toFixed(2)}, {(bounds.minY / 1000).toFixed(2)}) µm
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto">
                  {previewLayout.layers.map((l) => {
                    const lKey = gdsLayerKey(l.layer, l.datatype ?? 0);
                    const count = previewLayout.shapes.filter((s) =>
                      shapeMatchesLayer(s, l.layer, l.datatype ?? 0)
                    ).length;
                    const isHidden = hiddenPreviewLayers.has(lKey);
                    return (
                      <button
                        key={lKey}
                        type="button"
                        onClick={() => togglePreviewLayer(lKey)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono transition-opacity ${
                          isHidden
                            ? 'bg-slate-950 border-slate-800 text-slate-500 opacity-50'
                            : 'bg-slate-950 border-slate-700 text-slate-200 hover:border-slate-500'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="font-bold">
                          L{l.layer}/{l.datatype}
                        </span>
                        <span className="text-slate-400">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Processed 100% locally in browser memory · No server upload
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(previewLayout, selectedCell, previewTruncated)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Load &ldquo;{selectedCell}&rdquo;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
