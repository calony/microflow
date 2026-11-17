/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ProcessFlow, ProcessStep, PhotomaskLevel, MaskWindow } from '../types/microfab';
import {
  calculateMaskMetrics,
  updateMaskAndSyncSteps,
  assignMaskToStep,
  swapMaskAssignments,
  createNewMaskInFlow,
  deleteMaskFromFlow,
  RETICLE_PALETTE,
} from '../lib/maskUtils';
import {
  X,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  MoveHorizontal,
  ArrowLeftRight,
  Layers,
  Sparkles,
  Check,
  Search,
  Scan,
  Maximize2,
  Sliders,
  Split,
  FlipHorizontal,
  Eye,
  AlertTriangle,
  ArrowRight,
  LayoutGrid,
  ChevronDown,
  PanelLeft,
  Eraser,
} from 'lucide-react';
import { GdsLayoutEditor } from './GdsLayoutEditor';

interface MaskLevelsModalProps {
  flow: ProcessFlow;
  isOpen: boolean;
  onClose: () => void;
  onUpdateFlow: (updatedFlow: ProcessFlow) => void;
  onSelectStepIndex?: (index: number) => void;
  initialMaskId?: string;
}

interface DragState {
  winId: string;
  type: 'resize-start' | 'resize-end' | 'move';
  startClientX: number;
  initialXStart: number;
  initialXEnd: number;
}

export const MaskLevelsModal: React.FC<MaskLevelsModalProps> = ({
  flow,
  isOpen,
  onClose,
  onUpdateFlow,
  onSelectStepIndex,
  initialMaskId,
}) => {
  const masks = useMemo(() => flow.masks || [], [flow.masks]);
  const waferWidth = flow.substrateWidth || 10000;

  // Selected mask in the panel
  const [selectedMaskId, setSelectedMaskId] = useState<string>(() => {
    if (initialMaskId && masks.some((m) => m.id === initialMaskId)) {
      return initialMaskId;
    }
    return masks[0]?.id || '';
  });

  // Track if selectedMaskId is still valid when masks change
  useEffect(() => {
    if (masks.length > 0 && (!selectedMaskId || !masks.some((m) => m.id === selectedMaskId))) {
      setSelectedMaskId(masks[0].id);
    }
  }, [masks, selectedMaskId]);

  const selectedMask = useMemo(() => {
    return masks.find((m) => m.id === selectedMaskId) || masks[0] || null;
  }, [masks, selectedMaskId]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Reassignment conflict prompt modal state
  interface ConflictPromptData {
    targetStepId: string;
    targetStepTitle: string;
    targetStepIndex: number;
    conflictingMask: PhotomaskLevel;
    currentMask: PhotomaskLevel;
    currentMaskPriorStep?: {
      id: string;
      title: string;
      index: number;
    };
  }
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPromptData | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ message: string; type: 'success' | 'warn' } | null>(null);
  const [editorTab, setEditorTab] = useState<'apertures' | 'gds'>('apertures');
  const [mobileReticleDrawerOpen, setMobileReticleDrawerOpen] = useState<boolean>(false);
  const [desktopMasksSidebarOpen, setDesktopMasksSidebarOpen] = useState<boolean>(true);
  const notifyTimerRef = useRef<number | null>(null);

  const handleEditorNotify = (message: string, type: 'success' | 'warn') => {
    setFeedbackNotice({ message, type });
    if (notifyTimerRef.current) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setFeedbackNotice(null);
    }, 4000);
  };

  // Drag state for interactive aperture track
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // List of all lithography steps in the process flow
  const lithoSteps = useMemo(() => {
    return flow.steps
      .map((step, idx) => ({ step, index: idx }))
      .filter(({ step }) => step.type === 'lithography');
  }, [flow.steps]);

  // Filtered masks
  const filteredMasks = useMemo(() => {
    if (!searchQuery.trim()) return masks;
    const q = searchQuery.toLowerCase();
    return masks.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.layerCode && m.layerCode.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [masks, searchQuery]);

  if (!isOpen) return null;

  // Active mask metrics
  const metrics = selectedMask ? calculateMaskMetrics(selectedMask, waferWidth) : null;

  // Assigned step for current mask
  const assignedStepInfo = selectedMask?.assignedStepId
    ? lithoSteps.find(({ step }) => step.id === selectedMask.assignedStepId)
    : null;

  // Handler: Update current mask
  const handleUpdateMask = (updated: PhotomaskLevel) => {
    const newFlow = updateMaskAndSyncSteps(flow, updated);
    onUpdateFlow(newFlow);
  };

  // Handler: Add new mask level beforehand
  const handleCreateNewMask = () => {
    const { flow: newFlow, newMask } = createNewMaskInFlow(flow);
    onUpdateFlow(newFlow);
    setSelectedMaskId(newMask.id);
  };

  // Handler: Duplicate mask level
  const handleDuplicateMask = (maskToDup: PhotomaskLevel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newMask: PhotomaskLevel = {
      ...maskToDup,
      id: `mask_${Date.now()}`,
      name: `${maskToDup.name} (Copy)`,
      layerCode: `${maskToDup.layerCode || 'LVL'}-CPY`,
      maskField: maskToDup.maskField || 'dark-field',
      assignedStepId: undefined, // Fresh copy is unassigned
      windows: maskToDup.windows.map((w) => ({ ...w, id: `w_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` })),
    };
    const { flow: newFlow } = createNewMaskInFlow(flow, newMask);
    onUpdateFlow(newFlow);
    setSelectedMaskId(newMask.id);
  };

  const isMaskAssigned = (mask: PhotomaskLevel): boolean =>
    Boolean(
      (mask.assignedStepId && lithoSteps.some(({ step }) => step.id === mask.assignedStepId)) ||
        lithoSteps.some(({ step }) => step.lithography?.maskId === mask.id)
    );

  // Handler: Delete unassigned mask level
  const handleDeleteMask = (maskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetMask = masks.find((m) => m.id === maskId);
    if (!targetMask) return;

    if (isMaskAssigned(targetMask)) {
      handleEditorNotify(
        'Assigned mask levels cannot be deleted. Clear its aperture track or unassign it from the step first.',
        'warn'
      );
      return;
    }

    const newFlow = deleteMaskFromFlow(flow, maskId);
    onUpdateFlow(newFlow);
    const remaining = newFlow.masks || [];
    if (selectedMaskId === maskId) {
      setSelectedMaskId(remaining[0]?.id || '');
    }
    handleEditorNotify(`Deleted unassigned mask "${targetMask.name}".`, 'success');
  };

  // Handler: Clear all apertures on a mask level track
  const handleClearApertureTrack = (targetMask: PhotomaskLevel | null = selectedMask, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!targetMask) return;
    handleUpdateMask({
      ...targetMask,
      windows: [],
    });
    if (targetMask.id === selectedMask?.id) {
      setActiveWindowId(null);
    }
    handleEditorNotify(`Cleared aperture track on "${targetMask.name}".`, 'success');
  };

  // Handler: Assign to Step with Conflict Detection & Confirmation
  const handleAssignStep = (targetStepId: string) => {
    if (!selectedMask) return;
    if (targetStepId === 'none') {
      const newFlow = assignMaskToStep(flow, selectedMask.id, null);
      onUpdateFlow(newFlow);
      setFeedbackNotice({
        message: `Unassigned ${selectedMask.name} from process steps.`,
        type: 'success',
      });
      setTimeout(() => setFeedbackNotice(null), 3000);
      return;
    }

    if (selectedMask.assignedStepId === targetStepId) {
      return;
    }

    // Check if another reticle in the library is already assigned to this step
    const conflictingMask = masks.find(
      (m) => m.id !== selectedMask.id && m.assignedStepId === targetStepId
    );

    if (conflictingMask) {
      const stepItem = lithoSteps.find(({ step }) => step.id === targetStepId);
      const priorStepItem = selectedMask.assignedStepId
        ? lithoSteps.find(({ step }) => step.id === selectedMask.assignedStepId)
        : undefined;

      setConflictPrompt({
        targetStepId,
        targetStepTitle: stepItem?.step.title || 'Photolithography Step',
        targetStepIndex: stepItem ? stepItem.index + 1 : 1,
        conflictingMask,
        currentMask: selectedMask,
        currentMaskPriorStep: priorStepItem
          ? {
              id: priorStepItem.step.id,
              title: priorStepItem.step.title,
              index: priorStepItem.index + 1,
            }
          : undefined,
      });
      return;
    }

    // No conflict: perform direct assignment
    const newFlow = assignMaskToStep(flow, selectedMask.id, targetStepId);
    onUpdateFlow(newFlow);
    const stepItem = lithoSteps.find(({ step }) => step.id === targetStepId);
    setFeedbackNotice({
      message: `Assigned ${selectedMask.name} to Step ${stepItem ? stepItem.index + 1 : ''}: ${stepItem?.step.title || ''}.`,
      type: 'success',
    });
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  const handleConfirmConflictSwap = () => {
    if (!conflictPrompt || !selectedMask) return;
    const { targetStepId, targetStepTitle, targetStepIndex, conflictingMask, currentMaskPriorStep } = conflictPrompt;
    
    // Execute photomask swap
    const newFlow = swapMaskAssignments(flow, selectedMask.id, targetStepId);
    onUpdateFlow(newFlow);

    if (currentMaskPriorStep) {
      setFeedbackNotice({
        message: `Swapped masks: Step ${targetStepIndex} ("${targetStepTitle}") now uses "${selectedMask.name}", and Step ${currentMaskPriorStep.index} ("${currentMaskPriorStep.title}") now uses "${conflictingMask.name}".`,
        type: 'success',
      });
    } else {
      setFeedbackNotice({
        message: `Swapped mask on Step ${targetStepIndex} ("${targetStepTitle}"): now configured with "${selectedMask.name}". "${conflictingMask.name}" is now unassigned.`,
        type: 'success',
      });
    }
    setTimeout(() => setFeedbackNotice(null), 4500);
    setConflictPrompt(null);
  };

  const handleCancelConflictSwap = () => {
    setConflictPrompt(null);
  };

  // Handler: Jump to assigned step
  const handleJumpToStep = () => {
    if (assignedStepInfo && onSelectStepIndex) {
      onSelectStepIndex(assignedStepInfo.index);
      onClose();
    }
  };

  // Aperture CRUD on selected mask
  const handleAddWindow = () => {
    if (!selectedMask) return;
    const windows = selectedMask.windows || [];
    // Default 1500 nm window in center or next available space
    const center = Math.round(waferWidth * 0.5);
    const newWin: MaskWindow = {
      id: `w_${Date.now()}`,
      xStart: Math.max(0, center - 750),
      xEnd: Math.min(waferWidth, center + 750),
    };
    const updated: PhotomaskLevel = {
      ...selectedMask,
      windows: [...windows, newWin],
    };
    handleUpdateMask(updated);
    setActiveWindowId(newWin.id);
  };

  const handleRemoveWindow = (winId: string) => {
    if (!selectedMask) return;
    const updated: PhotomaskLevel = {
      ...selectedMask,
      windows: selectedMask.windows.filter((w) => w.id !== winId),
    };
    handleUpdateMask(updated);
    if (activeWindowId === winId) setActiveWindowId(null);
  };

  const handleUpdateWindowCoord = (winId: string, field: 'xStart' | 'xEnd', val: number) => {
    if (!selectedMask) return;
    const clamped = Math.max(0, Math.min(waferWidth, val));
    const updatedWins = selectedMask.windows.map((w) => {
      if (w.id === winId) {
        const u = { ...w, [field]: clamped };
        if (u.xStart > u.xEnd) {
          if (field === 'xStart') u.xEnd = u.xStart;
          else u.xStart = u.xEnd;
        }
        return u;
      }
      return w;
    });
    handleUpdateMask({
      ...selectedMask,
      windows: updatedWins,
    });
  };

  // Preset aperture patterns
  const handleApplyPreset = (type: 'center-slit' | 'dual-pad' | 'grating' | 'invert') => {
    if (!selectedMask) return;
    let newWindows: MaskWindow[] = [];

    if (type === 'center-slit') {
      const w = Math.round(waferWidth * 0.2);
      newWindows = [
        {
          id: `w_cs_${Date.now()}`,
          xStart: Math.round(waferWidth * 0.4),
          xEnd: Math.round(waferWidth * 0.4) + w,
        },
      ];
    } else if (type === 'dual-pad') {
      const w = Math.round(waferWidth * 0.18);
      newWindows = [
        { id: `w_dp1_${Date.now()}`, xStart: Math.round(waferWidth * 0.15), xEnd: Math.round(waferWidth * 0.15) + w },
        { id: `w_dp2_${Date.now()}`, xStart: Math.round(waferWidth * 0.67), xEnd: Math.round(waferWidth * 0.67) + w },
      ];
    } else if (type === 'grating') {
      // 3 periodic slits
      const slitW = Math.round(waferWidth * 0.1);
      const pitch = Math.round(waferWidth * 0.2);
      const startBase = Math.round(waferWidth * 0.25);
      newWindows = [
        { id: `w_g1_${Date.now()}`, xStart: startBase, xEnd: startBase + slitW },
        { id: `w_g2_${Date.now()}`, xStart: startBase + pitch, xEnd: startBase + pitch + slitW },
        { id: `w_g3_${Date.now()}`, xStart: startBase + pitch * 2, xEnd: startBase + pitch * 2 + slitW },
      ];
    } else if (type === 'invert') {
      // Invert current windows (clear becomes chrome, chrome becomes clear)
      const sorted = [...selectedMask.windows].sort((a, b) => a.xStart - b.xStart);
      let currX = 0;
      let counter = 0;
      for (const w of sorted) {
        if (w.xStart > currX) {
          newWindows.push({ id: `w_inv_${Date.now()}_${counter++}`, xStart: currX, xEnd: w.xStart });
        }
        currX = Math.max(currX, w.xEnd);
      }
      if (currX < waferWidth) {
        newWindows.push({ id: `w_inv_${Date.now()}_${counter++}`, xStart: currX, xEnd: waferWidth });
      }
    }

    handleUpdateMask({
      ...selectedMask,
      windows: newWindows,
    });
  };

  // Pointer drag logic for interactive aperture track
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    win: MaskWindow,
    type: 'resize-start' | 'resize-end' | 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveWindowId(win.id);
    setDragState({
      winId: win.id,
      type,
      startClientX: e.clientX,
      initialXStart: win.xStart,
      initialXEnd: win.xEnd,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || !trackRef.current || !selectedMask) return;

    const rect = trackRef.current.getBoundingClientRect();
    const trackWidthPx = rect.width;
    if (trackWidthPx <= 0) return;

    const deltaPx = e.clientX - dragState.startClientX;
    const nmPerPixel = waferWidth / trackWidthPx;
    const deltaNm = deltaPx * nmPerPixel;

    // Snap to 50 nm increments
    const snapTo = (val: number) => Math.round(val / 50) * 50;

    const updatedWins = selectedMask.windows.map((w) => {
      if (w.id !== dragState.winId) return w;

      if (dragState.type === 'move') {
        const width = dragState.initialXEnd - dragState.initialXStart;
        let newStart = snapTo(dragState.initialXStart + deltaNm);
        let newEnd = newStart + width;

        if (newStart < 0) {
          newStart = 0;
          newEnd = width;
        }
        if (newEnd > waferWidth) {
          newEnd = waferWidth;
          newStart = waferWidth - width;
        }

        return { ...w, xStart: newStart, xEnd: newEnd };
      }

      if (dragState.type === 'resize-start') {
        let newStart = snapTo(dragState.initialXStart + deltaNm);
        newStart = Math.max(0, Math.min(dragState.initialXEnd - 50, newStart));
        return { ...w, xStart: newStart };
      }

      if (dragState.type === 'resize-end') {
        let newEnd = snapTo(dragState.initialXEnd + deltaNm);
        newEnd = Math.min(waferWidth, Math.max(dragState.initialXStart + 50, newEnd));
        return { ...w, xEnd: newEnd };
      }

      return w;
    });

    handleUpdateMask({
      ...selectedMask,
      windows: updatedWins,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
      setDragState(null);
    }
  };

  const renderReticleSidebarContent = () => {
    const getMaskAssignedStep = (mask: PhotomaskLevel) =>
      mask.assignedStepId
        ? lithoSteps.find(({ step }) => step.id === mask.assignedStepId) || null
        : lithoSteps.find(({ step }) => step.lithography?.maskId === mask.id) || null;

    const assignedFilteredMasks = filteredMasks
      .filter((mask) => isMaskAssigned(mask))
      .sort((a, b) => {
        const sa = getMaskAssignedStep(a)?.index ?? Number.MAX_SAFE_INTEGER;
        const sb = getMaskAssignedStep(b)?.index ?? Number.MAX_SAFE_INTEGER;
        return sa - sb;
      });
    const unassignedFilteredMasks = filteredMasks.filter((mask) => !isMaskAssigned(mask));

    const renderMaskCard = (mask: PhotomaskLevel, idx: number) => {
      const isSelected = selectedMask?.id === mask.id;
      const assigned = getMaskAssignedStep(mask);
      const mMetrics = calculateMaskMetrics(mask, waferWidth);
      const isAssigned = isMaskAssigned(mask);

      return (
        <div
          key={mask.id}
          onClick={() => {
            setSelectedMaskId(mask.id);
            setMobileReticleDrawerOpen(false);
          }}
          className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-sky-950/30 border-sky-500/80 shadow-md shadow-sky-950/40'
              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
          }`}
        >
          {/* Header: Level Tag & Name */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: mask.color || RETICLE_PALETTE[idx % RETICLE_PALETTE.length] }}
              />
              <span className="font-mono text-[11px] font-semibold text-slate-400 shrink-0">
                {mask.layerCode || `L${idx + 1}`}
              </span>
              <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-sky-300 transition-colors">
                {mask.name}
              </span>
            </div>

            {/* Duplicate & Clear Track (Assigned) / Delete (Unassigned) actions */}
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleDuplicateMask(mask, e)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                title="Duplicate Mask Level"
              >
                <Copy className="w-3 h-3" />
              </button>
              {isAssigned ? (
                <button
                  onClick={(e) => handleClearApertureTrack(mask, e)}
                  disabled={mask.windows.length === 0}
                  className="p-1 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 disabled:opacity-30 disabled:pointer-events-none"
                  title={
                    mask.windows.length === 0
                      ? 'Aperture track is already clear (assigned masks cannot be deleted)'
                      : 'Clear aperture track (assigned mask levels cannot be deleted)'
                  }
                >
                  <Eraser className="w-3 h-3" />
                </button>
              ) : (
                <button
                  onClick={(e) => handleDeleteMask(mask.id, e)}
                  className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                  title="Delete Unassigned Mask Level"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Miniature Reticle Track Strip */}
          {(() => {
            const isLF = mask.maskField === 'light-field';
            return (
              <div
                className={`h-2 w-full rounded overflow-hidden border relative mb-2 ${
                  isLF
                    ? 'bg-sky-200/35 border-sky-400/40'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {mask.windows.map((w, wIdx) => {
                  const leftPct = (w.xStart / waferWidth) * 100;
                  const widthPct = ((w.xEnd - w.xStart) / waferWidth) * 100;
                  return (
                    <div
                      key={w.id || `mini_${wIdx}`}
                      className={`absolute top-0 bottom-0 ${
                        isLF ? 'border-x border-slate-300/80' : ''
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(1, widthPct)}%`,
                        backgroundColor: isLF ? '#0f172a' : mask.color || '#38bdf8',
                      }}
                    />
                  );
                })}
              </div>
            );
          })()}

          {/* Metadata strip */}
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`font-semibold ${
                  mMetrics.isLightField ? 'text-sky-300' : 'text-slate-300'
                }`}
              >
                {mMetrics.isLightField ? 'Light-Field' : 'Dark-Field'}
              </span>
              <span>·</span>
              <span className="capitalize text-slate-300 font-medium">
                {mask.polarity} Resist
              </span>
              <span>·</span>
              <span>
                {mMetrics.apertureCount}{' '}
                {mMetrics.isLightField
                  ? mMetrics.apertureCount === 1
                    ? 'Blocker'
                    : 'Blockers'
                  : mMetrics.apertureCount === 1
                  ? 'Aperture'
                  : 'Apertures'}
              </span>
              <span>·</span>
              <span className="font-mono text-amber-400/90">{mMetrics.clearPercentage}% Clear</span>
            </div>
          </div>

          {/* Assigned Step Status */}
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            {assigned ? (
              <div className="flex items-center gap-1 text-sky-400 truncate">
                <Check className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  Step {assigned.index + 1}: {assigned.step.title}
                </span>
              </div>
            ) : (
              <span className="text-amber-400/80 italic text-[10px]">
                Unassigned (Ready for assignment)
              </span>
            )}
          </div>
        </div>
      );
    };

    return (
      <>
        {/* Search Bar */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search mask levels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Mask Level Cards List: Assigned (Top) & Unassigned (Bottom) */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredMasks.length > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Check className="w-3 h-3" />
                    <span>Assigned Masks ({assignedFilteredMasks.length})</span>
                  </span>
                </div>
                {assignedFilteredMasks.length > 0 ? (
                  <div className="space-y-2">
                    {assignedFilteredMasks.map((mask, i) => renderMaskCard(mask, i))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-dashed border-slate-800 text-[11px] text-slate-500 italic">
                    No assigned masks{searchQuery.trim() ? ' match your search' : ''}.
                  </div>
                )}
              </div>

              <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Unassigned Masks ({unassignedFilteredMasks.length})
                  </span>
                </div>
                {unassignedFilteredMasks.length > 0 ? (
                  <div className="space-y-2">
                    {unassignedFilteredMasks.map((mask, i) =>
                      renderMaskCard(mask, assignedFilteredMasks.length + i)
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-lg border border-dashed border-slate-800 text-[11px] text-slate-500 italic">
                    No unassigned masks{searchQuery.trim() ? ' match your search' : ''}.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs">
              {masks.length === 0
                ? 'No mask levels defined yet. Click "+ Add Another Mask" below.'
                : 'No mask levels match your search.'}
            </div>
          )}
        </div>

        {/* Sidebar Bottom summary */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Total Reticles: {masks.length}</span>
          <button
            onClick={handleCreateNewMask}
            className="text-sky-400 hover:text-sky-300 font-medium hover:underline text-[11px]"
          >
            + Add Another Mask
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className={`relative flex flex-col w-full bg-slate-950 border-0 sm:border sm:border-slate-800 rounded-none sm:rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150 ${
          editorTab === 'gds' ? 'max-w-7xl h-[100dvh] sm:h-[94vh] sm:max-h-[900px]' : 'max-w-6xl h-[100dvh] sm:h-[92vh] sm:max-h-[850px]'
        }`}
      >
        {/* Top Header */}
        <div className="px-2.5 py-1.5 sm:px-5 sm:py-3 bg-slate-900 border-b border-slate-800 shrink-0 space-y-1.5 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-3">
          {/* Row 1: Title + New + Close */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-950/50 shrink-0">
                <Scan className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h2 className="text-xs sm:text-base font-bold text-white tracking-tight truncate">
                    Photolithography Mask Levels
                  </h2>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                    {masks.length}
                    <span className="hidden sm:inline"> {masks.length === 1 ? 'Reticle' : 'Reticles'}</span>
                  </span>
                </div>
                <p className="hidden md:block text-xs text-slate-400 truncate">
                  Manage reticle hierarchy, draw or import 2D GDS layouts, slice section lines, and configure 1D mask apertures.
                </p>
              </div>
            </div>

            {/* Mobile/Tablet Quick Close & New Mask Row 1 */}
            <div className="flex lg:hidden items-center gap-1.5 shrink-0">
              <button
                onClick={handleCreateNewMask}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold shadow-sm active:scale-95"
              >
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">New Mask</span>
                <span className="sm:hidden">New</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Mask Levels Panel"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Row 2 on <lg (compact reticle dropdown trigger + segmented switcher), Inline on lg+ */}
          <div className="flex items-center justify-between lg:justify-end gap-2 shrink-0">
            {/* Mobile / Tablet Active Reticle Selector Trigger */}
            <button
              type="button"
              onClick={() => setMobileReticleDrawerOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors min-w-0 flex-1 max-w-[55%]"
              title="Switch Reticle Level"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedMask?.color || '#38bdf8' }}
              />
              <span className="truncate font-mono text-[11px]">
                {selectedMask ? `${selectedMask.layerCode ? selectedMask.layerCode + ' · ' : ''}${selectedMask.name}` : 'Select Reticle'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-auto" />
            </button>

            {/* Workspace Mode Switcher */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px] sm:text-xs shrink-0">
              <button
                type="button"
                onClick={() => setEditorTab('apertures')}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-md font-medium transition-colors ${
                  editorTab === 'apertures'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>1D Track</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab('gds')}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-md font-medium transition-colors ${
                  editorTab === 'gds'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>2D GDS</span>
              </button>
            </div>

            {/* Desktop Masks List Toggle + New + Close */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDesktopMasksSidebarOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  desktopMasksSidebarOpen
                    ? 'bg-slate-800 border-slate-700 text-sky-300 hover:bg-slate-700'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title={desktopMasksSidebarOpen ? 'Hide Masks List' : 'Show Masks List'}
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span>{desktopMasksSidebarOpen ? 'Hide Masks' : 'Masks'}</span>
              </button>

              <button
                onClick={handleCreateNewMask}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-900/30 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Mask Level</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Mask Levels Panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Master-Detail Workspace */}
        <div className="relative flex-1 flex overflow-hidden min-h-0">
          {/* LEFT SIDEBAR: Desktop Docked Mask Set Hierarchy List */}
          {desktopMasksSidebarOpen && (
            <div className="hidden lg:flex w-80 xl:w-96 flex-col border-r border-slate-800 bg-slate-900/60 shrink-0">
              {renderReticleSidebarContent()}
            </div>
          )}

          {/* Mobile / Tablet Slide-Over Reticles Drawer */}
          {mobileReticleDrawerOpen && (
            <div className="lg:hidden absolute inset-0 z-30 flex">
              <div
                className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs"
                onClick={() => setMobileReticleDrawerOpen(false)}
              />
              <div className="relative w-80 max-w-[88vw] h-full flex flex-col border-r border-slate-800 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-900">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Reticle Library ({masks.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileReticleDrawerOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {renderReticleSidebarContent()}
              </div>
            </div>
          )}

          {/* RIGHT MAIN PANEL: Active Mask CAD Inspector or 2D GDS Layout Editor */}
          {editorTab === 'gds' ? (
            <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950 overflow-hidden">
              <GdsLayoutEditor
                flow={flow}
                selectedMask={selectedMask}
                onUpdateFlow={onUpdateFlow}
                onNotify={handleEditorNotify}
              />
            </div>
          ) : selectedMask ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-950 p-3 sm:p-6 space-y-3.5 sm:space-y-5">
              {/* Mask General Configuration Card */}
              <div className="p-3 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 sm:gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto sm:flex-1">
                    <span
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-white/20 shrink-0"
                      style={{ backgroundColor: selectedMask.color || '#38bdf8' }}
                    />
                    <input
                      type="text"
                      value={selectedMask.name}
                      onChange={(e) =>
                        handleUpdateMask({
                          ...selectedMask,
                          name: e.target.value,
                        })
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-1 font-bold text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500 min-w-0 flex-1 max-w-md"
                      placeholder="Mask Level Name"
                    />
                    <input
                      type="text"
                      value={selectedMask.layerCode || ''}
                      onChange={(e) =>
                        handleUpdateMask({
                          ...selectedMask,
                          layerCode: e.target.value.toUpperCase(),
                        })
                      }
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 sm:py-1 font-mono text-xs text-sky-400 focus:outline-none focus:border-sky-500 w-20 sm:w-24 text-center uppercase shrink-0"
                      placeholder="CODE"
                      title="Mask Layer Code (e.g. GATE-01)"
                    />
                  </div>

                  {/* Mask Field Polarity & Resist Tone + Duplicate/Delete */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div
                      className="grid grid-cols-2 flex-1 sm:flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 text-[11px] sm:text-xs"
                      title="Mask Field Polarity: Dark-Field (opaque chrome bg, movable blocks = clear apertures) vs Light-Field (clear quartz bg, movable blocks = opaque chrome blockers)"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateMask({
                            ...selectedMask,
                            maskField: 'dark-field',
                          })
                        }
                        className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                          (selectedMask.maskField || 'dark-field') === 'dark-field'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Dark-Field Mask: Opaque chrome background; movable blocks are clear UV apertures"
                      >
                        Dark-Field
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateMask({
                            ...selectedMask,
                            maskField: 'light-field',
                          })
                        }
                        className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                          selectedMask.maskField === 'light-field'
                            ? 'bg-cyan-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Light-Field Mask: Clear quartz background; movable blocks are opaque chrome blockers"
                      >
                        Light-Field
                      </button>
                    </div>

                    <div
                      className="grid grid-cols-2 flex-1 sm:flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 text-[11px] sm:text-xs"
                      title="Target Photoresist Tone: Positive (UV-exposed resist dissolves) vs Negative (UV-exposed resist crosslinks and stays)"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateMask({
                            ...selectedMask,
                            polarity: 'positive',
                          })
                        }
                        className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                          selectedMask.polarity === 'positive'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Positive Resist: UV-exposed resist dissolves in developer"
                      >
                        Positive Resist
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateMask({
                            ...selectedMask,
                            polarity: 'negative',
                          })
                        }
                        className={`px-2.5 py-1 rounded font-medium whitespace-nowrap transition-colors ${
                          selectedMask.polarity === 'negative'
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Negative Resist: UV-exposed resist crosslinks and remains; unexposed dissolves"
                      >
                        Negative Resist
                      </button>
                    </div>

                    <button
                      onClick={() => handleDuplicateMask(selectedMask)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors shrink-0"
                      title="Duplicate this Mask Level (creates an unassigned copy)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {!isMaskAssigned(selectedMask) && (
                      <button
                        onClick={() => handleDeleteMask(selectedMask.id)}
                        className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs transition-colors shrink-0"
                        title="Delete this unassigned Mask Level"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Step Assignment Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="min-w-0">
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                      Assigned Photolithography Step in Process Flow
                    </label>
                    <div className="flex items-center gap-2 min-w-0">
                      <select
                        value={selectedMask.assignedStepId || 'none'}
                        onChange={(e) => handleAssignStep(e.target.value)}
                        className="min-w-0 flex-1 w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono truncate"
                      >
                        <option value="none">-- Unassigned (Stand-alone Reticle) --</option>
                        {lithoSteps.map(({ step, index }) => {
                          const isCurrent = selectedMask.assignedStepId === step.id;
                          const conflicting = masks.find(
                            (m) => m.id !== selectedMask.id && m.assignedStepId === step.id
                          );
                          return (
                            <option key={step.id} value={step.id}>
                              Step {index + 1}: {step.title}
                              {step.side === 'back'
                                ? ' (Backside)'
                                : step.side === 'both'
                                ? ' (Both Sides)'
                                : ''}
                              {isCurrent
                                ? '  [Current Assigned Step]'
                                : conflicting
                                ? `  [Assigned to: ${conflicting.layerCode || 'Reticle'} ${conflicting.name}]`
                                : '  (Available)'}
                            </option>
                          );
                        })}
                      </select>

                      {assignedStepInfo && (
                        <button
                          onClick={handleJumpToStep}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-500/40 text-xs font-semibold shrink-0 transition-colors"
                          title="Jump directly to this step in the Cross-Section CAD"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Step</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                      Description / Layer Function Notes
                    </label>
                    <input
                      type="text"
                      value={selectedMask.description || ''}
                      onChange={(e) =>
                        handleUpdateMask({
                          ...selectedMask,
                          description: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      placeholder="e.g. Critical gate length definition for self-aligned CMOS"
                    />
                  </div>
                </div>

                {/* Reticle Color Swatches */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[11px] text-slate-400">Reticle Accent Color:</span>
                  <div className="flex items-center gap-1.5">
                    {RETICLE_PALETTE.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleUpdateMask({ ...selectedMask, color })}
                        className={`w-5 h-5 rounded-full border transition-transform ${
                          selectedMask.color === color ? 'scale-125 border-white shadow-sm' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Cleanroom DRC Metric Strip */}
              {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider">
                      {metrics.isLightField ? 'Chrome Blockers' : 'Clear Apertures'}
                    </span>
                    <span className="text-base font-bold font-mono text-white">{metrics.apertureCount}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Clear Field Area</span>
                    <span className="text-base font-bold font-mono text-amber-400">{metrics.clearPercentage}%</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Total Transmitted</span>
                    <span className="text-base font-bold font-mono text-sky-400">{metrics.totalClearWidthUm} µm</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Min Critical Feature</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      {metrics.minFeatureSizeNm >= 1000 ? `${metrics.minFeatureSizeUm} µm` : `${metrics.minFeatureSizeNm} nm`}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center col-span-2 sm:col-span-1">
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Wafer Field Span</span>
                    <span className="text-base font-bold font-mono text-slate-200">{(waferWidth / 1000).toFixed(1)} µm</span>
                  </div>
                </div>
              )}

              {/* INTERACTIVE MASK TRACK SECTION */}
              {(() => {
                const isLF = selectedMask.maskField === 'light-field';
                const featNoun = isLF ? 'Blocker' : 'Aperture';
                return (
                  <div className="p-3 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="font-semibold text-xs text-slate-200">
                          {isLF ? 'Light-Field Blocker Track' : 'Dark-Field Aperture Track'}
                        </span>
                        <span className="hidden sm:inline text-[11px] text-slate-400">
                          · {isLF ? 'Quartz bg (UV passes) · Blocks = Chrome blockers' : 'Chrome bg (UV blocked) · Blocks = Clear apertures'} · 50nm snap
                        </span>
                      </div>

                      {/* Preset Pattern Buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-[10px] text-slate-400 mr-0.5">Presets:</span>
                        <button
                          onClick={() => handleApplyPreset('center-slit')}
                          className="px-2 py-1 sm:py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors"
                          title={isLF ? 'Single Center Blocker' : 'Single Center Slit'}
                        >
                          {isLF ? 'Center Block' : 'Center Slit'}
                        </button>
                        <button
                          onClick={() => handleApplyPreset('dual-pad')}
                          className="px-2 py-1 sm:py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors"
                          title="Dual Symmetric Features"
                        >
                          Dual Pads
                        </button>
                        <button
                          onClick={() => handleApplyPreset('grating')}
                          className="px-2 py-1 sm:py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors"
                          title="Periodic Grating Lines"
                        >
                          Grating
                        </button>
                        <button
                          onClick={() => handleApplyPreset('invert')}
                          className="flex items-center gap-1 px-2 py-1 sm:py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700 transition-colors"
                          title="Invert Windows Across Wafer Span"
                        >
                          <FlipHorizontal className="w-3 h-3" />
                          <span>Invert</span>
                        </button>
                        <button
                          onClick={() => handleClearApertureTrack(selectedMask)}
                          disabled={selectedMask.windows.length === 0}
                          className="flex items-center gap-1 px-2 py-1 sm:py-0.5 rounded bg-slate-800 hover:bg-amber-950/50 text-amber-300 hover:text-amber-200 text-[11px] border border-slate-700 hover:border-amber-500/40 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          title={
                            isLF
                              ? 'Clear all chrome blockers (100% clear quartz field)'
                              : 'Clear all apertures from this mask track (100% opaque dark field)'
                          }
                        >
                          <Eraser className="w-3 h-3" />
                          <span>Clear Track</span>
                        </button>
                        <button
                          onClick={handleAddWindow}
                          className="flex items-center gap-1 px-2.5 py-1 sm:py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add {featNoun}</span>
                        </button>
                      </div>
                    </div>

                    {/* Visual Draggable Mask Track */}
                    <div
                      ref={trackRef}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      className={`relative h-14 rounded-xl overflow-hidden cursor-default select-none shadow-inner touch-none border ${
                        isLF
                          ? 'bg-gradient-to-b from-sky-200/35 via-cyan-100/25 to-amber-100/30 border-sky-400/50'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      {/* Background Field: Chrome (Dark-Field) OR Clear Quartz (Light-Field) */}
                      {isLF ? (
                        <div
                          className="absolute inset-0 pointer-events-none flex items-center justify-center"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, rgba(125,211,252,0.14) 1px, transparent 1px)',
                            backgroundSize: '24px 100%',
                          }}
                        >
                          {selectedMask.windows.length === 0 && (
                            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-sky-100/80">
                              Clear Quartz Field (100% UV Transmitting)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          className="absolute inset-0 opacity-40 flex items-center justify-center"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(45deg, #1e293b 0, #1e293b 8px, #0f172a 8px, #0f172a 16px)',
                          }}
                        />
                      )}

                      {/* Movable Blocks: Chrome Blockers (Light-Field) OR Clear Apertures (Dark-Field) */}
                      {selectedMask.windows.map((win, idx) => {
                        const leftPct = (win.xStart / waferWidth) * 100;
                        const widthPct = ((win.xEnd - win.xStart) / waferWidth) * 100;
                        const isActive = activeWindowId === win.id;
                        const widthNm = Math.round(win.xEnd - win.xStart);
                        const accentColor = selectedMask.color || '#38bdf8';

                        return (
                          <div
                            key={win.id || `win_${idx}`}
                            className={`absolute top-1 bottom-1 rounded-lg flex items-center justify-center transition-all ${
                              isActive
                                ? 'ring-2 ring-white shadow-xl z-20 brightness-110'
                                : 'hover:brightness-110 shadow-md z-10'
                            } ${isLF ? 'border-2' : ''}`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${Math.max(1, widthPct)}%`,
                              backgroundColor: isLF ? '#0f172a' : accentColor,
                              borderColor: isLF ? accentColor : undefined,
                              ...(isLF
                                ? {
                                    backgroundImage:
                                      'repeating-linear-gradient(135deg, rgba(148,163,184,0.16) 0, rgba(148,163,184,0.16) 5px, transparent 5px, transparent 10px)',
                                  }
                                : {}),
                              boxShadow: isActive
                                ? `0 0 0 2px #ffffff, 0 8px 18px -2px ${accentColor}90`
                                : `0 3px 10px -2px ${accentColor}60`,
                              cursor: 'grab',
                            }}
                            onPointerDown={(e) => handlePointerDown(e, win, 'move')}
                          >
                            {/* Left edge resize handle */}
                            <div
                              className={`absolute left-0 top-0 bottom-0 w-4 sm:w-3 cursor-ew-resize flex items-center justify-center group ${
                                isLF ? 'hover:bg-white/25' : 'hover:bg-white/40'
                              }`}
                              onPointerDown={(e) => handlePointerDown(e, win, 'resize-start')}
                              title="Drag to resize left edge"
                            >
                              <div
                                className={`w-1 h-4 rounded-full ${
                                  isLF
                                    ? 'bg-slate-300/70 group-hover:bg-white'
                                    : 'bg-slate-900/50 group-hover:bg-slate-950'
                                }`}
                              />
                            </div>

                            {/* Feature label (width) */}
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white backdrop-blur-xs select-none pointer-events-none truncate shadow-sm">
                              {widthNm >= 1000 ? `${(widthNm / 1000).toFixed(2)} µm` : `${widthNm} nm`}
                            </span>

                            {/* Right edge resize handle */}
                            <div
                              className={`absolute right-0 top-0 bottom-0 w-4 sm:w-3 cursor-ew-resize flex items-center justify-center group ${
                                isLF ? 'hover:bg-white/25' : 'hover:bg-white/40'
                              }`}
                              onPointerDown={(e) => handlePointerDown(e, win, 'resize-end')}
                              title="Drag to resize right edge"
                            >
                              <div
                                className={`w-1 h-4 rounded-full ${
                                  isLF
                                    ? 'bg-slate-300/70 group-hover:bg-white'
                                    : 'bg-slate-900/50 group-hover:bg-slate-950'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Coordinate Scale Bar beneath track */}
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1 pt-1">
                      <span>0.0 µm</span>
                      <span>{(waferWidth / 4000).toFixed(1)} µm</span>
                      <span>{(waferWidth / 2000).toFixed(1)} µm</span>
                      <span>{((waferWidth * 3) / 4000).toFixed(1)} µm</span>
                      <span>{(waferWidth / 1000).toFixed(1)} µm</span>
                    </div>
                  </div>
                );
              })()}

              {/* PRECISION NUMERIC FEATURE TABLE / MOBILE CARDS */}
              <div className="p-3 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-xs text-slate-200">
                    {selectedMask.maskField === 'light-field'
                      ? `Chrome Blockers (${selectedMask.windows.length})`
                      : `Aperture Windows (${selectedMask.windows.length})`}
                  </span>

                  <button
                    onClick={handleAddWindow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {selectedMask.maskField === 'light-field' ? 'Add Blocker' : 'Add Window'}
                    </span>
                  </button>
                </div>

                {/* Mobile Stacked Aperture Cards (< sm) */}
                <div className="sm:hidden space-y-2">
                  {selectedMask.windows.map((win, idx) => {
                    const widthNm = Math.round(win.xEnd - win.xStart);
                    const widthUm = (widthNm / 1000).toFixed(2);
                    return (
                      <div
                        key={`m_${win.id || idx}`}
                        className={`p-2.5 rounded-xl border space-y-2 ${
                          activeWindowId === win.id
                            ? 'bg-sky-950/25 border-sky-500/50'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-mono text-slate-200 font-semibold">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: selectedMask.color || '#38bdf8' }}
                            />
                            <span>W-{idx + 1}</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">
                              {widthNm >= 1000 ? `${widthUm} µm` : `${widthNm} nm`}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveWindow(win.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                            title="Delete this aperture"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1 block">
                            <span className="block text-[10px] font-mono text-slate-400">
                              Start X₁ ({(win.xStart / 1000).toFixed(2)} µm)
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={waferWidth}
                              step="50"
                              value={win.xStart}
                              onChange={(e) =>
                                handleUpdateWindowCoord(win.id, 'xStart', parseFloat(e.target.value || '0'))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                            />
                          </label>
                          <label className="space-y-1 block">
                            <span className="block text-[10px] font-mono text-slate-400">
                              End X₂ ({(win.xEnd / 1000).toFixed(2)} µm)
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={waferWidth}
                              step="50"
                              value={win.xEnd}
                              onChange={(e) =>
                                handleUpdateWindowCoord(win.id, 'xEnd', parseFloat(e.target.value || '0'))
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  {selectedMask.windows.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500 italic border border-slate-800 rounded-xl bg-slate-950/40">
                      {selectedMask.maskField === 'light-field'
                        ? 'No chrome blockers defined (100% clear quartz light field). Tap "Add Blocker" or pick a preset above.'
                        : 'No apertures defined (0% clear dark field). Tap "Add Window" or pick a preset above.'}
                    </div>
                  )}
                </div>

                {/* Desktop & Tablet Precision Numeric Table (>= sm) */}
                <div className="hidden sm:block border border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-[11px] text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-3.5 py-2">
                          {selectedMask.maskField === 'light-field' ? 'Blocker #' : 'Window #'}
                        </th>
                        <th className="px-3.5 py-2">Start X₁ (nm)</th>
                        <th className="px-3.5 py-2">End X₂ (nm)</th>
                        <th className="px-3.5 py-2">Width ΔX</th>
                        <th className="px-3.5 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                      {selectedMask.windows.map((win, idx) => {
                        const widthNm = Math.round(win.xEnd - win.xStart);
                        const widthUm = (widthNm / 1000).toFixed(2);

                        return (
                          <tr
                            key={win.id || `row_${idx}`}
                            className={`hover:bg-slate-900/40 transition-colors ${
                              activeWindowId === win.id ? 'bg-sky-950/20' : ''
                            }`}
                          >
                            <td className="px-3.5 py-2 font-mono text-slate-300">
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-2"
                                style={{ backgroundColor: selectedMask.color || '#38bdf8' }}
                              />
                              W-{idx + 1}
                            </td>

                            <td className="px-3.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={waferWidth}
                                  step="50"
                                  value={win.xStart}
                                  onChange={(e) =>
                                    handleUpdateWindowCoord(win.id, 'xStart', parseFloat(e.target.value || '0'))
                                  }
                                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({(win.xStart / 1000).toFixed(2)} µm)
                                </span>
                              </div>
                            </td>

                            <td className="px-3.5 py-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={waferWidth}
                                  step="50"
                                  value={win.xEnd}
                                  onChange={(e) =>
                                    handleUpdateWindowCoord(win.id, 'xEnd', parseFloat(e.target.value || '0'))
                                  }
                                  className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({(win.xEnd / 1000).toFixed(2)} µm)
                                </span>
                              </div>
                            </td>

                            <td className="px-3.5 py-2 font-mono text-amber-300 font-semibold">
                              {widthNm >= 1000 ? `${widthUm} µm` : `${widthNm} nm`}
                            </td>

                            <td className="px-3.5 py-2 text-right">
                              <button
                                onClick={() => handleRemoveWindow(win.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                                title="Delete this aperture"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {selectedMask.windows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-500 italic">
                            {selectedMask.maskField === 'light-field'
                              ? 'No chrome blockers defined. This reticle is completely clear quartz (100% light field). Click "Add Blocker" or choose a preset above.'
                              : 'No apertures defined. This reticle is completely opaque chrome (0% clear dark field). Click "Add Window" or choose a preset above.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500">
              Select or create a photomask level on the left to configure apertures.
            </div>
          )}
        </div>

        {/* Bottom Modal Footer (hidden on phones in 2D GDS tab to maximize canvas area) */}
        <div
          className={`${
            editorTab === 'gds' ? 'hidden sm:flex' : 'flex'
          } items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-900 border-t border-slate-800 text-xs shrink-0`}
        >
          <div className="flex items-center gap-2 text-slate-400 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="hidden sm:inline truncate">
              Changes made to mask levels automatically synchronize with assigned lithography steps in real time.
            </span>
            <span className="sm:hidden truncate">Live synced with flow steps</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all shadow-md active:scale-95 shrink-0"
          >
            Done
          </button>
        </div>

        {/* Transient Feedback Notice Banner */}
        {feedbackNotice && (
          <div
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl shadow-xl border text-xs font-medium flex items-center gap-2 transition-all ${
              feedbackNotice.type === 'warn'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/50'
                : 'bg-slate-900/90 text-emerald-300 border-emerald-500/50'
            }`}
          >
            {feedbackNotice.type === 'warn' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{feedbackNotice.message}</span>
          </div>
        )}
      </div>

      {/* Reassignment / Swap Conflict Confirmation Modal */}
      {conflictPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-amber-500/50 shadow-2xl p-6 space-y-5 text-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Swap Photomask Assignment?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="font-semibold text-white">Step {conflictPrompt.targetStepIndex}: {conflictPrompt.targetStepTitle}</span>{' '}
                  already has mask{' '}
                  <span className="font-semibold text-amber-300">
                    {conflictPrompt.conflictingMask.layerCode ? `${conflictPrompt.conflictingMask.layerCode} ` : ''}
                    {conflictPrompt.conflictingMask.name}
                  </span>{' '}
                  assigned.
                </p>
                <p className="text-xs text-slate-400">
                  Do you want to assign <span className="font-medium text-sky-300">{conflictPrompt.currentMask.name}</span> to this step? If you accept, the mask will be swapped.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-3">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                Photomask Swap Summary
              </div>

              {conflictPrompt.currentMaskPriorStep ? (
                /* Two-way step swap */
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/40">
                      <div className="text-[10px] text-sky-400 font-mono font-medium">
                        Step {conflictPrompt.targetStepIndex}: {conflictPrompt.targetStepTitle}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <span className="line-through text-slate-500 truncate">{conflictPrompt.conflictingMask.name}</span>
                        <span>→</span>
                        <span className="text-sky-300 font-semibold truncate">{conflictPrompt.currentMask.name}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40">
                      <div className="text-[10px] text-amber-400 font-mono font-medium">
                        Step {conflictPrompt.currentMaskPriorStep.index}: {conflictPrompt.currentMaskPriorStep.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <span className="line-through text-slate-500 truncate">{conflictPrompt.currentMask.name}</span>
                        <span>→</span>
                        <span className="text-amber-300 font-semibold truncate">{conflictPrompt.conflictingMask.name}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Both process steps will exchange their photomasks and update their aperture layouts and resist polarities automatically.
                  </p>
                </div>
              ) : (
                /* One-way step swap with unassigned reticle */
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/40">
                      <div className="text-[10px] text-sky-400 font-mono font-medium">
                        Step {conflictPrompt.targetStepIndex}: {conflictPrompt.targetStepTitle}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <span className="line-through text-slate-500 truncate">{conflictPrompt.conflictingMask.name}</span>
                        <span>→</span>
                        <span className="text-sky-300 font-semibold truncate">{conflictPrompt.currentMask.name}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700">
                      <div className="text-[10px] text-slate-400 font-mono font-medium">
                        Previous Reticle Status
                      </div>
                      <div className="text-[11px] text-amber-300 font-semibold mt-1 truncate">
                        {conflictPrompt.conflictingMask.name}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Swapped out to Unassigned in library
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    <span className="text-sky-300 font-medium">{conflictPrompt.currentMask.name}</span> will take over Step {conflictPrompt.targetStepIndex}, while <span className="text-amber-200 font-medium">{conflictPrompt.conflictingMask.name}</span> will be swapped out to unassigned.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelConflictSwap}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel (Keep Current Mask)
              </button>
              <button
                type="button"
                onClick={handleConfirmConflictSwap}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-900/40 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Confirm & Swap Mask</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
