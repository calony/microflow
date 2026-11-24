/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ProcessFlow } from '../types/microfab';
import { ThicknessUnit } from '../lib/units';
import {
  BatchExportOptions,
  BatchExportProgress,
  buildBatchStepItems,
  computeGlobalVerticalBounds,
  renderBatchStepSvg,
  runBatchCrossSectionExport,
} from '../lib/batchExportUtils';
import {
  X,
  Download,
  FileArchive,
  Files,
  Check,
  Image as ImageIcon,
  FileCode2,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Layers,
  Eye,
} from 'lucide-react';

interface BatchExportModalProps {
  flow: ProcessFlow;
  thicknessUnit?: ThicknessUnit;
  initialTheme?: 'paper' | 'dark';
  onClose: () => void;
}

export const BatchExportModal: React.FC<BatchExportModalProps> = ({
  flow,
  thicknessUnit = 'nm',
  initialTheme = 'paper',
  onClose,
}) => {
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [delivery, setDelivery] = useState<'zip' | 'individual'>('zip');
  const [theme, setTheme] = useState<'paper' | 'dark'>(initialTheme);
  const [renderMode, setRenderMode] = useState<'hatch' | 'solid'>('hatch');
  const [showOutlines, setShowOutlines] = useState<boolean>(true);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showAxes, setShowAxes] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [sharedScale, setSharedScale] = useState<boolean>(true);
  const [zScaleMode, setZScaleMode] = useState<'linear' | 'auto-piecewise'>('linear');
  const [includeSubstrate, setIncludeSubstrate] = useState<boolean>(true);
  const [bookmarkedOnly, setBookmarkedOnly] = useState<boolean>(false);

  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const hasBookmarkedSteps = useMemo(
    () => flow.steps.some((s) => s.enabled && Boolean(s.bookmarked)),
    [flow.steps]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isExporting]);

  const allItems = useMemo(
    () =>
      buildBatchStepItems(
        flow,
        includeSubstrate,
        bookmarkedOnly && hasBookmarkedSteps,
        thicknessUnit
      ),
    [flow, includeSubstrate, bookmarkedOnly, hasBookmarkedSteps, thicknessUnit]
  );

  const selectedItems = useMemo(
    () => allItems.filter((item) => !excludedKeys.has(item.key)),
    [allItems, excludedKeys]
  );

  const activePreviewItem = useMemo(() => {
    if (allItems.length === 0) return null;
    if (previewKey) {
      const found = allItems.find((i) => i.key === previewKey);
      if (found) return found;
    }
    return selectedItems[0] || allItems[0];
  }, [allItems, selectedItems, previewKey]);

  const activePreviewIndex = activePreviewItem
    ? allItems.findIndex((i) => i.key === activePreviewItem.key)
    : -1;

  const exportOptions: BatchExportOptions = useMemo(
    () => ({
      format,
      theme,
      delivery,
      pngScale,
      renderMode,
      showOutlines,
      showHeader,
      showAxes,
      showLegend,
      sharedScale,
      zScaleMode,
      thicknessUnit,
    }),
    [
      format,
      theme,
      delivery,
      pngScale,
      renderMode,
      showOutlines,
      showHeader,
      showAxes,
      showLegend,
      sharedScale,
      zScaleMode,
      thicknessUnit,
    ]
  );

  const globalBounds = useMemo(() => {
    if (!sharedScale) return undefined;
    const base = selectedItems.length > 0 ? selectedItems : allItems;
    return computeGlobalVerticalBounds(base);
  }, [sharedScale, selectedItems, allItems]);

  const previewRender = useMemo(() => {
    if (!activePreviewItem) return null;
    const { svg, width, height } = renderBatchStepSvg(
      activePreviewItem,
      flow,
      exportOptions,
      globalBounds
    );
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return { dataUrl, width, height };
  }, [activePreviewItem, flow, exportOptions, globalBounds]);

  const toggleItemKey = (key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setExcludedKeys(new Set());
  };

  const handleSelectNone = () => {
    setExcludedKeys(new Set(allItems.map((i) => i.key)));
  };

  const handleExport = async () => {
    if (selectedItems.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    setProgress({ completed: 0, total: selectedItems.length, currentFile: '' });

    try {
      await runBatchCrossSectionExport(
        selectedItems,
        flow,
        exportOptions,
        (prog) => setProgress(prog)
      );
      setIsExporting(false);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Batch export failed. Please try again.'
      );
      setIsExporting(false);
    }
  };

  const outWidthPx = previewRender
    ? format === 'png'
      ? previewRender.width * pngScale
      : previewRender.width
    : 960;
  const outHeightPx = previewRender
    ? format === 'png'
      ? previewRender.height * pngScale
      : previewRender.height
    : 520;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4"
      onClick={() => {
        if (!isExporting) onClose();
      }}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Layers className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">
                Batch Export Step Cross-Sections
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Export all fabrication steps as individual publication-ready SVG or PNG figures
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
            aria-label="Close batch export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Settings & Step Selection (5 cols) */}
            <div className="lg:col-span-5 space-y-3.5">
              {/* Format & Delivery */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <span className="block text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                  Output Format &amp; Package
                </span>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormat('svg')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                      format === 'svg'
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>SVG (Vector)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('png')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                      format === 'png'
                        ? 'bg-sky-600 border-sky-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>PNG (Raster)</span>
                  </button>
                </div>

                {format === 'png' && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] text-slate-400">PNG Resolution</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[11px] font-mono">
                      {([1, 2, 3] as const).map((sc) => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => setPngScale(sc)}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            pngScale === sc
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {sc}x ({960 * sc}px)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setDelivery('zip')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      delivery === 'zip'
                        ? 'bg-indigo-600/80 border-indigo-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Bundle all individual step files into a single ZIP download"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>ZIP Archive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDelivery('individual')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      delivery === 'individual'
                        ? 'bg-indigo-600/80 border-indigo-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Trigger separate browser downloads for each step file"
                  >
                    <Files className="w-3.5 h-3.5" />
                    <span>Separate Files</span>
                  </button>
                </div>
              </div>

              {/* Publication Appearance */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <span className="block text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                  Publication Styling
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block text-[10px] text-slate-400 mb-1">Background</span>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setTheme('paper')}
                        className={`py-1 rounded font-medium transition-colors ${
                          theme === 'paper'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Paper
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={`py-1 rounded font-medium transition-colors ${
                          theme === 'dark'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[10px] text-slate-400 mb-1">Material Fill</span>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setRenderMode('hatch')}
                        className={`py-1 rounded font-medium transition-colors ${
                          renderMode === 'hatch'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Hatch
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenderMode('solid')}
                        className={`py-1 rounded font-medium transition-colors ${
                          renderMode === 'solid'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Solid
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] text-slate-400 mb-1">Z-Axis Mapping</span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setZScaleMode('linear')}
                      className={`py-1 rounded font-medium transition-colors ${
                        zScaleMode === 'linear'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Linear Scale
                    </button>
                    <button
                      type="button"
                      onClick={() => setZScaleMode('auto-piecewise')}
                      className={`py-1 rounded font-medium transition-colors ${
                        zScaleMode === 'auto-piecewise'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Piecewise Z (Auto)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-1 text-[11px] text-slate-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sharedScale}
                      onChange={(e) => setSharedScale(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Shared Y-Scale</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOutlines}
                      onChange={(e) => setShowOutlines(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Layer Outlines</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHeader}
                      onChange={(e) => setShowHeader(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Step Title Banner</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAxes}
                      onChange={(e) => setShowAxes(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>X-Axis &amp; Scale</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer col-span-2">
                    <input
                      type="checkbox"
                      checked={showLegend}
                      onChange={(e) => setShowLegend(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Include Materials Legend</span>
                  </label>
                </div>
              </div>

              {/* Step Selection Checklist */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                    Steps to Export ({selectedItems.length}/{allItems.length})
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      All
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={handleSelectNone}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSubstrate}
                      onChange={(e) => setIncludeSubstrate(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Include Substrate (00)</span>
                  </label>
                  {hasBookmarkedSteps && (
                    <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bookmarkedOnly}
                        onChange={(e) => setBookmarkedOnly(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <Bookmark className="w-3 h-3 fill-amber-400" />
                      <span>Milestones Only</span>
                    </label>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                  {allItems.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500 italic">
                      No enabled steps available to export.
                    </div>
                  ) : (
                    allItems.map((item) => {
                      const isChecked = !excludedKeys.has(item.key);
                      const isPreviewing = activePreviewItem?.key === item.key;
                      return (
                        <div
                          key={item.key}
                          onClick={() => setPreviewKey(item.key)}
                          className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                            isPreviewing
                              ? 'bg-sky-950/50 border-sky-500/60'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleItemKey(item.key);
                              }}
                              aria-label={`Toggle ${item.title}`}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? 'bg-sky-600 border-sky-500 text-white'
                                  : 'bg-slate-950 border-slate-700 text-transparent'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
                              {item.indexLabel}
                            </span>
                            <span className="text-[11px] font-medium text-slate-200 truncate">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 shrink-0 hidden sm:inline">
                            .{format}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Live Output Preview (7 cols) */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      Live Output Preview
                    </span>
                    {activePreviewItem && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 truncate max-w-[220px]">
                        {activePreviewItem.filenameBase}.{format}
                      </span>
                    )}
                  </div>

                  {allItems.length > 1 && activePreviewIndex >= 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={activePreviewIndex <= 0}
                        onClick={() =>
                          setPreviewKey(allItems[activePreviewIndex - 1].key)
                        }
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
                        title="Previous Step Preview"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono text-slate-400 px-1">
                        {activePreviewIndex + 1} / {allItems.length}
                      </span>
                      <button
                        type="button"
                        disabled={activePreviewIndex >= allItems.length - 1}
                        onClick={() =>
                          setPreviewKey(allItems[activePreviewIndex + 1].key)
                        }
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
                        title="Next Step Preview"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className={`p-3 flex items-center justify-center min-h-[280px] sm:min-h-[340px] ${
                    theme === 'paper' ? 'bg-slate-200' : 'bg-[#04070d]'
                  }`}
                >
                  {previewRender ? (
                    <img
                      src={previewRender.dataUrl}
                      alt={activePreviewItem?.title || 'Cross-section export preview'}
                      className="max-w-full max-h-[380px] w-auto h-auto rounded shadow-lg border border-slate-700/40"
                    />
                  ) : (
                    <span className="text-xs text-slate-500 italic">
                      No cross-section step to preview.
                    </span>
                  )}
                </div>

                <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                  <span>
                    Output Size: {outWidthPx} × {outHeightPx} px
                    {format === 'svg' ? ' (scalable vector)' : ` (${pngScale}x PNG)`}
                  </span>
                  <span>
                    {sharedScale ? 'Consistent Y-scale across all steps' : 'Per-step auto-fit scale'}
                  </span>
                </div>
              </div>

              {exportError && (
                <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300">
                  {exportError}
                </div>
              )}

              {progress && isExporting && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-sky-300 truncate">{progress.currentFile}</span>
                    <span className="text-slate-400 shrink-0">
                      {progress.completed} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="w-full h-full block">
                      <rect
                        x={0}
                        y={0}
                        width={Math.round((progress.completed / Math.max(1, progress.total)) * 100)}
                        height={4}
                        fill="#0ea5e9"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-slate-800 bg-slate-950/70 shrink-0">
          <div className="text-[11px] text-slate-400 font-mono">
            {selectedItems.length} {selectedItems.length === 1 ? 'file' : 'files'} ·{' '}
            {format.toUpperCase()} ·{' '}
            {delivery === 'zip' ? 'Single ZIP archive' : 'Individual downloads'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 disabled:opacity-40 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={selectedItems.length === 0 || isExporting}
              onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-md transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isExporting
                  ? 'Exporting…'
                  : `Export ${selectedItems.length} ${format.toUpperCase()} ${
                      selectedItems.length === 1 ? 'File' : 'Files'
                    }`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
