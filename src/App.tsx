/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProcessFlow, ProcessStep, Material, EtchRecipe, VariableUnit } from './types/microfab';
import { PRESET_PROCESS_FLOWS } from './lib/presets';
import { simulateCrossSection, buildRenderPolygons } from './lib/simulationEngine';
import { Header } from './components/Header';
import { ProcessFlowSidebar } from './components/ProcessFlowSidebar';
import { CrossSectionCanvas } from './components/CrossSectionCanvas';
import { MaskEditor } from './components/MaskEditor';
import { StepEditor } from './components/StepEditor';
import { MultiStepFlowView } from './components/MultiStepFlowView';
import { MaterialsModal } from './components/MaterialsModal';
import { EtchRateLibraryModal } from './components/EtchRateLibraryModal';
import { RunSheetModal } from './components/RunSheetModal';
import { PresetPickerModal } from './components/PresetPickerModal';
import { MaskLevelsModal } from './components/MaskLevelsModal';
import { VariablesModal } from './components/VariablesModal';
import { VariantManagerModal } from './components/VariantManagerModal';
import { AboutModal } from './components/AboutModal';
import { SubstrateEditor } from './components/SubstrateEditor';
import { resolveFlowParameters } from './lib/variableUtils';
import { syncActiveVariantSnapshot } from './lib/variantUtils';
import {
  ensureFlowMasks,
  syncStepWindowsToMask,
  attachNewMaskToLithoStep,
} from './lib/maskUtils';
import { ensureFlowBlocks, createBlock, assignStepToBlock } from './lib/blockUtils';
import { DEFAULT_MATERIALS } from './lib/materials';
import {
  getEtchRecipes,
  getEtchRateNmMin,
  formatEtchRate,
  formatDurationCompact,
} from './lib/etchRates';
import { ThicknessUnit } from './lib/units';
import { ListOrdered, Layers as LayersIcon, Sliders as SlidersIcon, X } from 'lucide-react';

export default function App() {
  // Load initial process from localStorage if present, or fallback to CMOS preset
  const [flow, setFlow] = useState<ProcessFlow>(() => {
    try {
      const saved = localStorage.getItem('microflow_current_flow') || localStorage.getItem('etchflow_current_flow');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.steps)) {
          // ensure substrateLayers exists
          if (!parsed.substrateLayers || parsed.substrateLayers.length === 0) {
            parsed.substrateLayers = [
              {
                id: 'sub_default',
                name: 'Silicon <100> Substrate',
                materialId: parsed.substrateMaterialId || 'mat_si_sub',
                thickness: parsed.substrateThickness || 3000,
              },
            ];
          }
          const existingMatIds = new Set((parsed.materials || []).map((m: Material) => m.id));
          const missingDefaults = DEFAULT_MATERIALS.filter((d) => !existingMatIds.has(d.id));
          if (missingDefaults.length > 0) {
            parsed.materials = [...(parsed.materials || []), ...missingDefaults];
          }
          if (!parsed.etchLibrary) {
            try {
              const savedCustomEtch = localStorage.getItem('microflow_custom_etch_recipes');
              if (savedCustomEtch) {
                parsed.etchLibrary = JSON.parse(savedCustomEtch);
              }
            } catch {
              // ignore
            }
          }
          return resolveFlowParameters(ensureFlowBlocks(ensureFlowMasks(parsed)));
        }
      }
    } catch (e) {
      // ignore
    }
    const basePreset = { ...PRESET_PROCESS_FLOWS[0] };
    try {
      const savedCustomEtch = localStorage.getItem('microflow_custom_etch_recipes');
      if (savedCustomEtch) {
        basePreset.etchLibrary = JSON.parse(savedCustomEtch);
      }
    } catch {
      // ignore
    }
    return resolveFlowParameters(ensureFlowBlocks(ensureFlowMasks(basePreset)));
  });

  const [activeStepIndex, setActiveStepIndex] = useState<number>(() =>
    flow.steps.length > 0 ? 0 : -1
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [thicknessUnit, setThicknessUnit] = useState<ThicknessUnit>(() => {
    try {
      const saved = localStorage.getItem('microflow_thickness_unit');
      if (saved === 'um' || saved === 'nm') return saved;
    } catch {
      // ignore
    }
    return 'nm';
  });

  // Modals state
  const [showPresets, setShowPresets] = useState<boolean>(false);
  const [showMaterials, setShowMaterials] = useState<boolean>(false);
  const [showEtchLibrary, setShowEtchLibrary] = useState<boolean>(false);
  const [showMaskLevels, setShowMaskLevels] = useState<boolean>(false);
  const [focusMaskId, setFocusMaskId] = useState<string | undefined>(undefined);
  const [showVariables, setShowVariables] = useState<boolean>(false);
  const [showVariantManager, setShowVariantManager] = useState<boolean>(false);
  const [showRunSheet, setShowRunSheet] = useState<boolean>(false);
  const [showMultiStep, setShowMultiStep] = useState<boolean>(false);
  const [showAbout, setShowAbout] = useState<boolean>(false);

  // Panel visibility state: docked open on desktop (>=1024px), drawer-closed on mobile/tablet
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isMaskTrackMinimized, setIsMaskTrackMinimized] = useState<boolean>(false);
  const [showFinalInset, setShowFinalInset] = useState<boolean>(() => {
    try {
      return localStorage.getItem('microflow_show_final_inset') === 'true';
    } catch {
      return false;
    }
  });
  const [selectedInsetStepIndex, setSelectedInsetStepIndex] = useState<number | null>(null);

  // Save to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem('microflow_current_flow', JSON.stringify(flow));
    } catch (e) {
      // ignore
    }
  }, [flow]);

  useEffect(() => {
    try {
      localStorage.setItem('microflow_thickness_unit', thicknessUnit);
    } catch {
      // ignore
    }
  }, [thicknessUnit]);

  useEffect(() => {
    try {
      localStorage.setItem('microflow_show_final_inset', String(showFinalInset));
    } catch {
      // ignore
    }
  }, [showFinalInset]);

  // Handle Playback animation with adjustable speed
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(150, Math.round(1800 / playSpeed));
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= flow.steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isPlaying, flow.steps.length, playSpeed]);

  const handleTogglePlay = () => {
    if (!isPlaying) {
      setIsMaskTrackMinimized(true);
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setLeftSidebarOpen(false);
      }
    }
    if (!isPlaying && flow.steps.length > 0 && activeStepIndex >= flow.steps.length - 1) {
      setActiveStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  // Clamp activeStepIndex if steps count changes
  useEffect(() => {
    if (activeStepIndex >= flow.steps.length) {
      setActiveStepIndex(Math.max(-1, flow.steps.length - 1));
    }
  }, [flow.steps.length, activeStepIndex]);

  // Compute simulation mesh and polygons for the active step
  const activeMesh = useMemo(() => {
    return simulateCrossSection(flow, activeStepIndex);
  }, [flow, activeStepIndex]);

  const activePolygons = useMemo(() => {
    return buildRenderPolygons(activeMesh, flow.materials);
  }, [activeMesh, flow.materials]);

  // Identify the last enabled process step and all enabled steps after the currently selected step
  const finalEnabledStepIndex = useMemo(() => {
    for (let i = flow.steps.length - 1; i >= 0; i--) {
      if (flow.steps[i].enabled !== false) return i;
    }
    return -1;
  }, [flow.steps]);

  const laterInsetSteps = useMemo(() => {
    const list: { stepIndex: number; stepNumber: number; title: string }[] = [];
    for (let i = Math.max(0, activeStepIndex + 1); i < flow.steps.length; i++) {
      const step = flow.steps[i];
      if (step.enabled !== false) {
        list.push({
          stepIndex: i,
          stepNumber: i + 1,
          title: step.title,
        });
      }
    }
    return list;
  }, [flow.steps, activeStepIndex]);

  useEffect(() => {
    if (
      selectedInsetStepIndex !== null &&
      !laterInsetSteps.some((s) => s.stepIndex === selectedInsetStepIndex)
    ) {
      setSelectedInsetStepIndex(null);
    }
  }, [selectedInsetStepIndex, laterInsetSteps]);

  const resolvedInsetStepIndex = useMemo(() => {
    if (laterInsetSteps.length === 0) return -1;
    if (
      selectedInsetStepIndex !== null &&
      laterInsetSteps.some((s) => s.stepIndex === selectedInsetStepIndex)
    ) {
      return selectedInsetStepIndex;
    }
    return laterInsetSteps[laterInsetSteps.length - 1].stepIndex;
  }, [laterInsetSteps, selectedInsetStepIndex]);

  const insetEnabledSimIndex = useMemo(() => {
    if (resolvedInsetStepIndex < 0) return -1;
    let enabledCount = 0;
    for (let i = 0; i <= resolvedInsetStepIndex && i < flow.steps.length; i++) {
      if (flow.steps[i].enabled !== false) enabledCount++;
    }
    return enabledCount - 1;
  }, [flow.steps, resolvedInsetStepIndex]);

  const isIntermediateStep =
    resolvedInsetStepIndex >= 0 && activeStepIndex < resolvedInsetStepIndex;

  const finalMesh = useMemo(() => {
    if (!showFinalInset || !isIntermediateStep || insetEnabledSimIndex < 0) return null;
    return simulateCrossSection(flow, insetEnabledSimIndex);
  }, [showFinalInset, isIntermediateStep, flow, insetEnabledSimIndex]);

  const finalPolygons = useMemo(() => {
    if (!finalMesh) return [];
    return buildRenderPolygons(finalMesh, flow.materials);
  }, [finalMesh, flow.materials]);

  const isSubstrateActive = activeStepIndex === -1;
  const activeStep = !isSubstrateActive ? flow.steps[activeStepIndex] : undefined;

  // Handlers
  const handleUpdateFlow = (updatedFlow: ProcessFlow) => {
    setFlow(resolveFlowParameters(updatedFlow));
  };

  const handleCreateVariable = (
    name: string,
    value: number,
    unit: VariableUnit,
    description?: string
  ) => {
    setFlow((prev) =>
      resolveFlowParameters({
        ...prev,
        variables: [
          ...(prev.variables || []),
          {
            id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name,
            value,
            unit,
            description,
          },
        ],
      })
    );
  };

  const applyStepUpdateToFlow = (
    baseFlow: ProcessFlow,
    stepIdx: number,
    updatedStep: ProcessStep,
    preserveOldBlockIdForReassign: boolean
  ): ProcessFlow => {
    const prevStep = baseFlow.steps[stepIdx];
    const blockChanged = prevStep && updatedStep.blockId !== prevStep.blockId;
    const syncedPatchedStep = syncActiveVariantSnapshot(
      preserveOldBlockIdForReassign && blockChanged
        ? { ...updatedStep, blockId: prevStep.blockId }
        : updatedStep
    );
    const updatedSteps = baseFlow.steps.map((s, idx) =>
      idx === stepIdx ? syncedPatchedStep : s
    );
    let updatedFlow: ProcessFlow = { ...baseFlow, steps: updatedSteps };
    if (updatedStep.type === 'lithography') {
      if (prevStep && prevStep.type !== 'lithography') {
        const validUnclaimedMask = updatedStep.lithography?.maskId
          ? (updatedFlow.masks || []).find(
              (m) =>
                m.id === updatedStep.lithography?.maskId &&
                (!m.assignedStepId || m.assignedStepId === updatedStep.id)
            )
          : undefined;
        updatedFlow = validUnclaimedMask
          ? syncStepWindowsToMask(updatedFlow, syncedPatchedStep)
          : attachNewMaskToLithoStep(updatedFlow, syncedPatchedStep.id);
      } else {
        updatedFlow = syncStepWindowsToMask(updatedFlow, syncedPatchedStep);
      }
    } else if (prevStep && prevStep.type === 'lithography' && updatedFlow.masks) {
      updatedFlow = {
        ...updatedFlow,
        masks: updatedFlow.masks.map((m) =>
          m.assignedStepId === updatedStep.id
            ? { ...m, assignedStepId: undefined, assignedVariantId: undefined }
            : m
        ),
      };
    }

    if (preserveOldBlockIdForReassign && blockChanged) {
      updatedFlow = assignStepToBlock(updatedFlow, updatedStep.id, updatedStep.blockId || null);
    }

    return resolveFlowParameters(updatedFlow);
  };

  const handleUpdateStep = (updatedStep: ProcessStep) => {
    if (activeStepIndex < 0) return;
    const prevStep = flow.steps[activeStepIndex];
    const blockChanged = prevStep && updatedStep.blockId !== prevStep.blockId;

    if (blockChanged) {
      const updatedFlow = applyStepUpdateToFlow(flow, activeStepIndex, updatedStep, true);
      const newIdx = updatedFlow.steps.findIndex((s) => s.id === updatedStep.id);
      setFlow(updatedFlow);
      if (newIdx >= 0 && newIdx !== activeStepIndex) {
        setActiveStepIndex(newIdx);
      }
      return;
    }

    setFlow((prev) => {
      const idx = prev.steps.findIndex((s) => s.id === updatedStep.id);
      const targetIdx = idx >= 0 ? idx : activeStepIndex;
      if (targetIdx < 0 || targetIdx >= prev.steps.length) return prev;
      return applyStepUpdateToFlow(prev, targetIdx, updatedStep, false);
    });
  };

  const handleUpdateTitle = (title: string) => {
    setFlow((prev) => ({ ...prev, title }));
  };

  const allEtchRecipes = useMemo(
    () => getEtchRecipes(flow.etchLibrary),
    [flow.etchLibrary]
  );

  const handleSelectPreset = (preset: ProcessFlow) => {
    const withEtchLib = flow.etchLibrary?.length
      ? { ...preset, etchLibrary: flow.etchLibrary }
      : preset;
    setFlow(resolveFlowParameters(ensureFlowBlocks(ensureFlowMasks(withEtchLib))));
    setActiveStepIndex(preset.steps.length > 0 ? 0 : -1);
    setSelectedInsetStepIndex(null);
    setIsPlaying(false);
    setShowPresets(false);
  };

  const handleUpdateMaterials = (updatedMats: Material[]) => {
    setFlow({ ...flow, materials: updatedMats });
  };

  const handleUpdateEtchRecipes = (updatedCustom: EtchRecipe[]) => {
    try {
      localStorage.setItem('microflow_custom_etch_recipes', JSON.stringify(updatedCustom));
    } catch {
      // ignore
    }
    setFlow({ ...flow, etchLibrary: updatedCustom });
  };

  const handleApplyEtchRecipeToStep = (
    recipe: EtchRecipe,
    rateMode: 'manual' | 'time-rate',
    etchTimeSec: number
  ) => {
    if (!activeStep || activeStep.type !== 'etch') return;
    const targetMatId = activeStep.etch?.targetMaterialId || 'all';
    const isSameRecipe = activeStep.etch?.etchRecipeId === recipe.id;
    const nextRefMatId =
      isSameRecipe ? activeStep.etch?.referenceMaterialId : undefined;
    const refMatId =
      nextRefMatId || (targetMatId !== 'all' ? targetMatId : recipe.primaryMaterialId);
    const refRate = getEtchRateNmMin(recipe, refMatId);
    const derivedDepth =
      rateMode === 'time-rate' && refRate > 0
        ? Math.max(5, Math.round((refRate * etchTimeSec) / 60))
        : activeStep.etch?.depth ?? activeStep.thickness ?? 300;

    handleUpdateStep({
      ...activeStep,
      thickness: derivedDepth,
      etch: {
        ...(activeStep.etch || {
          etchType: recipe.etchType,
          depth: derivedDepth,
          targetMaterialId: 'all',
          isotropy: recipe.isotropy,
          sidewallAngle: recipe.sidewallAngle,
        }),
        etchRecipeId: recipe.id,
        referenceMaterialId: nextRefMatId,
        etchType: recipe.etchType,
        isotropy: recipe.isotropy,
        sidewallAngle: recipe.sidewallAngle,
        scallopEffect: recipe.scallopEffect ?? (recipe.etchType === 'drie-bosch'),
        scallopDepth: recipe.scallopDepth ?? activeStep.etch?.scallopDepth,
        scallopPitch: recipe.scallopPitch ?? activeStep.etch?.scallopPitch,
        ardeEnabled: recipe.ardeEnabled ?? activeStep.etch?.ardeEnabled,
        ardeStrength: recipe.ardeStrength ?? activeStep.etch?.ardeStrength,
        rateMode,
        etchTimeSec,
        depth: derivedDepth,
      },
      toolRecipe: {
        ...(activeStep.toolRecipe || {
          toolName: '',
          gases: '',
          power: '',
          pressure: '',
          temperature: '',
          duration: '',
        }),
        toolName: recipe.toolName || activeStep.toolRecipe?.toolName || '',
        gases: recipe.gases || recipe.chemistry,
        power: recipe.power || '',
        pressure: recipe.pressure || '',
        temperature: recipe.temperature || '',
        duration: formatDurationCompact(etchTimeSec),
        targetRate: refRate > 0 ? formatEtchRate(refRate, thicknessUnit) : '',
      },
    });
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(flow, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `${flow.title.toLowerCase().replace(/\s+/g, '_')}_recipe.json`
    );
    downloadAnchor.click();
  };

  const handleImportJson = (newFlow: ProcessFlow) => {
    // ensure substrateLayers exists
    if (!newFlow.substrateLayers || newFlow.substrateLayers.length === 0) {
      newFlow.substrateLayers = [
        {
          id: 'sub_default',
          name: 'Silicon <100> Substrate',
          materialId: newFlow.substrateMaterialId || 'mat_si_sub',
          thickness: newFlow.substrateThickness || 3000,
        },
      ];
    }
    setFlow(resolveFlowParameters(ensureFlowBlocks(ensureFlowMasks(newFlow))));
    setActiveStepIndex(newFlow.steps.length > 0 ? 0 : -1);
    setSelectedInsetStepIndex(null);
  };

  const isCompactViewport = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024;

  const handleToggleLeftSidebar = () => {
    setLeftSidebarOpen((prev) => {
      const next = !prev;
      if (next && isCompactViewport()) setRightSidebarOpen(false);
      return next;
    });
  };

  const handleToggleRightSidebar = () => {
    setRightSidebarOpen((prev) => {
      const next = !prev;
      if (next && isCompactViewport()) setLeftSidebarOpen(false);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Application Header */}
      <Header
        flow={flow}
        thicknessUnit={thicknessUnit}
        onChangeThicknessUnit={setThicknessUnit}
        onUpdateTitle={handleUpdateTitle}
        onOpenPresets={() => setShowPresets(true)}
        onOpenMaterials={() => setShowMaterials(true)}
        onOpenEtchLibrary={() => setShowEtchLibrary(true)}
        onOpenMaskLevels={() => {
          setFocusMaskId(undefined);
          setShowMaskLevels(true);
        }}
        onOpenVariables={() => setShowVariables(true)}
        variableCount={flow.variables?.length || 0}
        onOpenVariantManager={() => setShowVariantManager(true)}
        variantStepCount={flow.steps.filter((s) => s.variants && s.variants.length > 1).length}
        onOpenRunSheet={() => setShowRunSheet(true)}
        onOpenMultiStepView={() => setShowMultiStep(true)}
        onOpenAbout={() => setShowAbout(true)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={handleToggleLeftSidebar}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={handleToggleRightSidebar}
      />

      {/* Main 3-Column CAD Workspace (Drawers on <1024px mobile/tablet, Docked Columns on lg+) */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Compact-viewport Backdrop for active drawer */}
        {(leftSidebarOpen || rightSidebarOpen) && (
          <div
            onClick={() => {
              setLeftSidebarOpen(false);
              setRightSidebarOpen(false);
            }}
            className="lg:hidden fixed inset-0 z-30 bg-slate-950/65 backdrop-blur-[1px]"
          />
        )}

        {/* Left: Process Flow Timeline */}
        {leftSidebarOpen && (
          <aside className="fixed inset-y-0 left-0 z-40 w-[86vw] max-w-[330px] h-full border-r border-slate-800 bg-slate-900 shadow-2xl flex flex-col lg:static lg:z-auto lg:w-72 xl:w-80 lg:shadow-none flex-shrink-0">
            <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
                <span>Process Flow Timeline</span>
              </span>
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-300 hover:text-white text-[11px]"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ProcessFlowSidebar
                flow={flow}
                activeStepIndex={activeStepIndex}
                thicknessUnit={thicknessUnit}
                isPlaying={isPlaying}
                playSpeed={playSpeed}
                onChangePlaySpeed={setPlaySpeed}
                onTogglePlay={handleTogglePlay}
                onSelectStepIndex={(idx) => {
                  setActiveStepIndex(idx);
                  setIsPlaying(false);
                }}
                onUpdateFlow={handleUpdateFlow}
                onOpenPresets={() => setShowPresets(true)}
                onOpenParameters={() => {
                  setRightSidebarOpen(true);
                  if (isCompactViewport()) {
                    setLeftSidebarOpen(false);
                  }
                }}
              />
            </div>
          </aside>
        )}

        {/* Adjacent: Substrate Layer Editor OR Step Deep Parameters Editor (Docked next to Process Timeline) */}
        {rightSidebarOpen && (
          <aside className="fixed inset-y-0 left-0 z-40 w-[88vw] max-w-[370px] h-full border-r border-slate-800 bg-slate-900 shadow-2xl flex flex-col lg:static lg:z-auto lg:w-80 xl:w-[340px] lg:shadow-none flex-shrink-0">
            <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <SlidersIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>{isSubstrateActive ? 'Substrate Stack' : 'Step Parameters'}</span>
              </span>
              <button
                type="button"
                onClick={() => setRightSidebarOpen(false)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-300 hover:text-white text-[11px]"
              >
                <X className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {isSubstrateActive ? (
                <SubstrateEditor
                  flow={flow}
                  thicknessUnit={thicknessUnit}
                  onUpdateFlow={handleUpdateFlow}
                  onOpenMaterialsModal={() => setShowMaterials(true)}
                  onCreateVariable={handleCreateVariable}
                  onOpenVariablesModal={() => setShowVariables(true)}
                />
              ) : activeStep ? (
                <StepEditor
                  step={activeStep}
                  waferWidth={flow.substrateWidth}
                  materials={flow.materials}
                  etchRecipes={allEtchRecipes}
                  thicknessUnit={thicknessUnit}
                  onUpdateStep={handleUpdateStep}
                  onOpenMaterialsModal={() => setShowMaterials(true)}
                  onOpenEtchLibrary={() => setShowEtchLibrary(true)}
                  onMergeMaterials={(incomingMats) => {
                    const existingIds = new Set(flow.materials.map((m) => m.id));
                    const missing = incomingMats.filter((m) => !existingIds.has(m.id));
                    if (missing.length > 0) {
                      setFlow((prev) => {
                        const prevIds = new Set(prev.materials.map((m) => m.id));
                        const toAdd = incomingMats.filter((m) => !prevIds.has(m.id));
                        if (toAdd.length === 0) return prev;
                        return { ...prev, materials: [...prev.materials, ...toAdd] };
                      });
                    }
                  }}
                  blocks={flow.blocks}
                  masks={flow.masks}
                  variables={flow.variables || []}
                  onCreateVariable={handleCreateVariable}
                  onOpenVariablesModal={() => setShowVariables(true)}
                  onOpenVariantManager={() => setShowVariantManager(true)}
                  onOpenMaskLevelsModal={(maskId) => {
                    setFocusMaskId(maskId);
                    setShowMaskLevels(true);
                  }}
                  onCreateBlock={(name) => {
                    const { flow: updated, block: newBlock } = createBlock(flow, name);
                    const currentStep = updated.steps[activeStepIndex];
                    if (currentStep) {
                      const assignedFlow = assignStepToBlock(updated, currentStep.id, newBlock.id);
                      const newIdx = assignedFlow.steps.findIndex((s) => s.id === currentStep.id);
                      setFlow(assignedFlow);
                      if (newIdx >= 0 && newIdx !== activeStepIndex) {
                        setActiveStepIndex(newIdx);
                      }
                    } else {
                      setFlow(updated);
                    }
                  }}
                />
              ) : null}
            </div>
          </aside>
        )}

        {/* Main Viewport: Canvas & Photomask Track */}
        <main className="flex-1 flex flex-col h-full bg-[#030712] p-1.5 sm:p-3 overflow-hidden space-y-2 sm:space-y-3 min-w-0">
          {/* Photomask Aperture Editor (Active if current step is Lithography) */}
          {activeStep && activeStep.type === 'lithography' && (
            <div className="flex-shrink-0">
              <MaskEditor
                step={activeStep}
                waferWidth={flow.substrateWidth}
                onUpdateStep={handleUpdateStep}
                onOpenMaskLevels={() => {
                  setFocusMaskId(activeStep.lithography?.maskId);
                  setShowMaskLevels(true);
                }}
                isMinimized={isMaskTrackMinimized}
                onToggleMinimize={() => setIsMaskTrackMinimized((prev) => !prev)}
                variables={flow.variables || []}
                onCreateVariable={handleCreateVariable}
                onOpenVariablesModal={() => setShowVariables(true)}
              />
            </div>
          )}

          {/* Interactive Cross-Section Canvas */}
          <div className="flex-1 min-h-0">
            <CrossSectionCanvas
              mesh={activeMesh}
              polygons={activePolygons}
              materials={flow.materials}
              waferWidth={flow.substrateWidth}
              flowId={flow.id}
              thicknessUnit={thicknessUnit}
              title={flow.title}
              stepNumber={isSubstrateActive ? 0 : activeStepIndex + 1}
              totalSteps={flow.steps.length}
              activeStepTitle={
                isSubstrateActive
                  ? 'Multi-Layer Starting Substrate Stack'
                  : activeStep?.title
              }
              activeStepSide={isSubstrateActive ? undefined : activeStep?.side}
              finalMesh={finalMesh}
              finalPolygons={finalPolygons}
              finalStepNumber={
                resolvedInsetStepIndex >= 0 ? resolvedInsetStepIndex + 1 : undefined
              }
              finalStepTitle={
                resolvedInsetStepIndex >= 0
                  ? flow.steps[resolvedInsetStepIndex]?.title
                  : undefined
              }
              canShowInsetButton={finalEnabledStepIndex >= 0}
              insetStepOptions={laterInsetSteps}
              selectedInsetStepIndex={
                resolvedInsetStepIndex >= 0 ? resolvedInsetStepIndex : undefined
              }
              isInsetFinalStep={
                resolvedInsetStepIndex >= 0 && resolvedInsetStepIndex === finalEnabledStepIndex
              }
              onChangeInsetStep={(stepIndex) => {
                if (stepIndex === finalEnabledStepIndex) {
                  setSelectedInsetStepIndex(null);
                } else {
                  setSelectedInsetStepIndex(stepIndex);
                }
              }}
              showFinalInset={showFinalInset}
              onToggleFinalInset={() => setShowFinalInset((prev) => !prev)}
              onSelectFinalStep={() => {
                if (resolvedInsetStepIndex >= 0) {
                  setActiveStepIndex(resolvedInsetStepIndex);
                  setIsPlaying(false);
                }
              }}
            />
          </div>
        </main>
      </div>

      {/* Mobile & Tablet Bottom Panel Switcher (< lg) */}
      <nav className="lg:hidden shrink-0 grid grid-cols-3 bg-slate-900 border-t border-slate-800 text-[11px] font-medium select-none z-20">
        <button
          type="button"
          onClick={handleToggleLeftSidebar}
          className={`flex items-center justify-center gap-1.5 py-2.5 border-r border-slate-800/80 transition-colors ${
            leftSidebarOpen
              ? 'bg-sky-950/50 text-sky-300 font-semibold'
              : 'text-slate-300 active:bg-slate-800'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>Flow ({flow.steps.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setLeftSidebarOpen(false);
            setRightSidebarOpen(false);
          }}
          className={`flex items-center justify-center gap-1.5 py-2.5 border-r border-slate-800/80 transition-colors ${
            !leftSidebarOpen && !rightSidebarOpen
              ? 'bg-sky-950/50 text-sky-300 font-semibold'
              : 'text-slate-300 active:bg-slate-800'
          }`}
        >
          <LayersIcon className="w-3.5 h-3.5" />
          <span>Wafer View</span>
        </button>
        <button
          type="button"
          onClick={handleToggleRightSidebar}
          className={`flex items-center justify-center gap-1.5 py-2.5 transition-colors ${
            rightSidebarOpen
              ? 'bg-sky-950/50 text-sky-300 font-semibold'
              : 'text-slate-300 active:bg-slate-800'
          }`}
        >
          <SlidersIcon className="w-3.5 h-3.5" />
          <span>{isSubstrateActive ? 'Substrate' : 'Params'}</span>
        </button>
      </nav>

      {/* Modals */}
      {showPresets && (
        <PresetPickerModal
          onSelectPreset={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}

      {showMaterials && (
        <MaterialsModal
          materials={flow.materials}
          onUpdateMaterials={handleUpdateMaterials}
          onClose={() => setShowMaterials(false)}
        />
      )}

      {showEtchLibrary && (
        <EtchRateLibraryModal
          recipes={allEtchRecipes}
          materials={flow.materials}
          thicknessUnit={thicknessUnit}
          activeStep={activeStep}
          onUpdateRecipes={handleUpdateEtchRecipes}
          onApplyRecipeToStep={handleApplyEtchRecipeToStep}
          onClose={() => setShowEtchLibrary(false)}
        />
      )}

      {showMaskLevels && (
        <MaskLevelsModal
          flow={flow}
          isOpen={showMaskLevels}
          onClose={() => setShowMaskLevels(false)}
          onUpdateFlow={handleUpdateFlow}
          onSelectStepIndex={(idx) => {
            setActiveStepIndex(idx);
            setIsPlaying(false);
          }}
          initialMaskId={focusMaskId}
          onOpenVariablesModal={() => setShowVariables(true)}
          activeStepIndex={activeStepIndex}
          thicknessUnit={thicknessUnit}
        />
      )}

      {showVariables && (
        <VariablesModal
          flow={flow}
          isOpen={showVariables}
          onClose={() => setShowVariables(false)}
          onUpdateFlow={handleUpdateFlow}
        />
      )}

      {showVariantManager && (
        <VariantManagerModal
          flow={flow}
          isOpen={showVariantManager}
          thicknessUnit={thicknessUnit}
          onClose={() => setShowVariantManager(false)}
          onUpdateFlow={handleUpdateFlow}
          onSelectStepIndex={(idx) => {
            setActiveStepIndex(idx);
            setIsPlaying(false);
          }}
        />
      )}

      {showRunSheet && (
        <RunSheetModal
          flow={flow}
          thicknessUnit={thicknessUnit}
          onClose={() => setShowRunSheet(false)}
        />
      )}

      {showMultiStep && (
        <MultiStepFlowView
          flow={flow}
          thicknessUnit={thicknessUnit}
          onSelectStepIndex={(idx) => setActiveStepIndex(idx)}
          onUpdateFlow={handleUpdateFlow}
          onClose={() => setShowMultiStep(false)}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}
