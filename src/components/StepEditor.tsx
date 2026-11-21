/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ProcessStep,
  ProcessFlow,
  SubstrateLayer,
  Material,
  ProcessStepType,
  ProcessSide,
  ToolRecipe,
  MaskWindow,
  ProcessBlock,
  PhotomaskLevel,
  BondingConfig,
  DicingConfig,
  TapeFrameConfig,
  EtchRecipe,
  DesignVariable,
  VariableUnit,
} from '../types/microfab';
import { ThicknessUnit, getUnitLabel, formatThickness } from '../lib/units';
import { resolveResistMaterialId, isCrystallineKohMaterial } from '../lib/materials';
import {
  getEtchRecipes,
  getEtchRateNmMin,
  computeSelectivityRatio,
  formatEtchRate,
  formatDurationCompact,
} from '../lib/etchRates';
import { getDefaultStepTitle } from '../lib/stepDefaults';
import { ThicknessInput } from './ThicknessInput';
import {
  ParametricThicknessInput,
  ParamBindingBadge,
  ParamBindingPanel,
} from './ParamBindingControl';
import {
  Layers,
  Sliders,
  Wrench,
  Flame,
  Scissors,
  Eraser,
  Sparkles,
  Disc,
  Clock,
  Gauge,
  Thermometer,
  Zap,
  Wind,
  Plus,
  Trash2,
  Scan,
  Edit2,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Link2,
  Upload,
  FileCheck,
  FlipHorizontal2,
  Frame,
  Slice,
  FlaskConical,
  Bookmark,
} from 'lucide-react';

interface StepEditorProps {
  step: ProcessStep;
  waferWidth: number;
  materials: Material[];
  etchRecipes?: EtchRecipe[];
  thicknessUnit?: ThicknessUnit;
  onUpdateStep: (updated: ProcessStep) => void;
  onOpenMaterialsModal: () => void;
  onOpenEtchLibrary?: () => void;
  onMergeMaterials?: (materials: Material[]) => void;
  blocks?: ProcessBlock[];
  masks?: PhotomaskLevel[];
  onOpenMaskLevelsModal?: (maskId?: string) => void;
  onCreateBlock?: (name?: string) => void;
  variables?: DesignVariable[];
  onCreateVariable?: (name: string, value: number, unit: VariableUnit, description?: string) => void;
  onOpenVariablesModal?: () => void;
}

export const StepEditor: React.FC<StepEditorProps> = ({
  step,
  waferWidth,
  materials,
  etchRecipes,
  thicknessUnit = 'nm',
  onUpdateStep,
  onOpenMaterialsModal,
  onOpenEtchLibrary,
  onMergeMaterials,
  blocks,
  masks,
  onOpenMaskLevelsModal,
  onCreateBlock,
  variables = [],
  onCreateVariable,
  onOpenVariablesModal,
}) => {
  const [activeTab, setActiveTab] = useState<'process' | 'equipment' | 'notes'>('process');
  const [isAddingBlockInline, setIsAddingBlockInline] = useState<boolean>(false);
  const [inlineBlockName, setInlineBlockName] = useState<string>('');
  const [isEditingMaskName, setIsEditingMaskName] = useState<boolean>(false);
  const [editingMaskName, setEditingMaskName] = useState<string>('');
  const [bondingImportError, setBondingImportError] = useState<string | null>(null);
  const [openStreetBindId, setOpenStreetBindId] = useState<string | null>(null);

  useEffect(() => {
    setIsEditingMaskName(false);
    setEditingMaskName(step.lithography?.maskName || '');
    setBondingImportError(null);
  }, [step.id, step.lithography?.maskName]);

  const handleUpdate = (patch: Partial<ProcessStep>) => {
    onUpdateStep({ ...step, ...patch });
  };

  const setStepParamBinding = (key: string, expr: string | undefined) => {
    const next = { ...(step.paramBindings || {}) };
    if (expr && expr.trim()) {
      next[key] = expr.trim();
    } else {
      delete next[key];
    }
    handleUpdate({
      paramBindings: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const handleUpdateRecipe = (field: keyof ToolRecipe, val: string) => {
    const current = step.toolRecipe || {
      toolName: '',
      gases: '',
      power: '',
      pressure: '',
      temperature: '',
      duration: '',
      targetRate: '',
      inspectionNotes: '',
    };
    handleUpdate({
      toolRecipe: {
        ...current,
        [field]: val,
      },
    });
  };

  return (
    <div className="flex flex-col h-full min-w-0 bg-slate-900 text-slate-200">
      {/* Editor Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
              {step.type}
            </span>
            <span className="text-xs text-slate-400 font-mono">Step Config</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                handleUpdate({
                  bookmarked: !step.bookmarked,
                  bookmarkLabel: !step.bookmarked ? step.bookmarkLabel : undefined,
                })
              }
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                step.bookmarked
                  ? 'bg-amber-500/15 border-amber-500/45 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-amber-300 hover:border-slate-700'
              }`}
              title={
                step.bookmarked
                  ? 'Remove milestone bookmark from this step'
                  : 'Bookmark this step as a process milestone'
              }
            >
              <Bookmark
                className={`w-3 h-3 ${step.bookmarked ? 'fill-amber-400 text-amber-400' : ''}`}
              />
              <span>{step.bookmarked ? 'Bookmarked' : 'Bookmark'}</span>
            </button>

            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        {/* Step Title Input */}
        <input
          type="text"
          value={step.title}
          onChange={(e) => handleUpdate({ title: e.target.value })}
          placeholder="Step title..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-medium text-sm focus:outline-none focus:border-sky-500 transition-colors"
        />

        {/* Milestone Bookmark Label (when bookmarked) */}
        {step.bookmarked && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-amber-300 shrink-0 font-medium flex items-center gap-1">
              <Bookmark className="w-3 h-3 fill-amber-400 text-amber-400" />
              Milestone:
            </span>
            <input
              type="text"
              value={step.bookmarkLabel || ''}
              onChange={(e) =>
                handleUpdate({ bookmarkLabel: e.target.value || undefined })
              }
              placeholder="Optional milestone tag (e.g. Gate Stack, Via Open)..."
              className="min-w-0 flex-1 px-2 py-1 rounded bg-slate-950 border border-amber-500/40 text-xs text-amber-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Fabrication Block / Module Assignment */}
        <div className="mt-2.5 flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-slate-400 shrink-0 font-medium">Module:</span>
          <select
            value={step.blockId || 'none'}
            onChange={(e) =>
              handleUpdate({ blockId: e.target.value === 'none' ? undefined : e.target.value })
            }
            className="min-w-0 flex-1 w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono truncate"
          >
            <option value="none">-- Ungrouped Operation --</option>
            {blocks?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {onCreateBlock && (
            <button
              type="button"
              onClick={() => {
                setInlineBlockName(`Module ${(blocks?.length || 0) + 1}: `);
                setIsAddingBlockInline(!isAddingBlockInline);
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 text-xs transition-colors shrink-0"
              title="Create new fabrication block / module"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Inline Module Creation Row */}
        {isAddingBlockInline && (
          <div className="flex items-center gap-1.5 mt-2 p-1.5 rounded-lg bg-slate-950 border border-sky-500/60 animate-in fade-in zoom-in-95 duration-100">
            <input
              type="text"
              autoFocus
              value={inlineBlockName}
              onChange={(e) => setInlineBlockName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inlineBlockName.trim() && onCreateBlock) {
                  onCreateBlock(inlineBlockName.trim());
                  setIsAddingBlockInline(false);
                  setInlineBlockName('');
                }
                if (e.key === 'Escape') {
                  setIsAddingBlockInline(false);
                  setInlineBlockName('');
                }
              }}
              placeholder="e.g. Module 3: Interconnect"
              className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500 font-medium"
            />
            <button
              type="button"
              onClick={() => {
                if (inlineBlockName.trim() && onCreateBlock) {
                  onCreateBlock(inlineBlockName.trim());
                  setIsAddingBlockInline(false);
                  setInlineBlockName('');
                }
              }}
              className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingBlockInline(false);
                setInlineBlockName('');
              }}
              className="p-1 rounded text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 mt-3 p-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('process')}
            className={`flex-1 py-1 rounded-md font-medium transition-colors ${
              activeTab === 'process'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Process Physics
          </button>
          <button
            onClick={() => setActiveTab('equipment')}
            className={`flex-1 py-1 rounded-md font-medium transition-colors ${
              activeTab === 'equipment'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tool & Recipe SOP
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {activeTab === 'process' && (
          <>
            {/* Step Type Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Process Mechanism
              </label>
              <select
                value={step.type}
                onChange={(e) => {
                  const newType = e.target.value as ProcessStepType;
                  if (newType === step.type) return;
                  const patch: Partial<ProcessStep> = {
                    type: newType,
                    title: getDefaultStepTitle(newType),
                    thickness: step.thickness || 200,
                  };
                  if (newType === 'deposition') {
                    if (!step.materialId) {
                      patch.materialId = 'mat_sio2_thermal';
                    }
                    if (!step.deposition) {
                      patch.deposition = {
                        method: 'PECVD',
                        depositionType: 'conformal',
                        thickness: step.thickness || 200,
                      };
                    }
                  }
                  if (newType === 'lithography' && !step.lithography) {
                    patch.lithography = {
                      resistMaterialId: 'mat_pr_pos',
                      resistThickness: 1000,
                      polarity: 'positive',
                      windows: [
                        {
                          id: `w_${Date.now()}`,
                          xStart: Math.round(waferWidth * 0.35),
                          xEnd: Math.round(waferWidth * 0.65),
                        },
                      ],
                      sidewallAngle: 90,
                      exposureMethod: 'UV Contact (365nm)',
                    };
                  }
                  if (newType === 'etch' && !step.etch) {
                    patch.etch = {
                      etchType: 'rie',
                      depth: step.thickness || 200,
                      targetMaterialId: 'all',
                      isotropy: 0.05,
                      sidewallAngle: 90,
                    };
                  }
                  if (newType === 'strip') {
                    patch.strip = {
                      solvent: step.strip?.solvent || 'O₂ Plasma Ashing',
                      ...step.strip,
                      stripType:
                        step.strip?.stripType === 'sacrificial-release'
                          ? 'sacrificial-release'
                          : 'resist-strip',
                    };
                  }
                  if (newType === 'liftoff') {
                    patch.strip = {
                      solvent: step.strip?.solvent || 'Acetone / NMP Ultrasonic',
                      ...step.strip,
                      stripType: 'metal-liftoff',
                    };
                  }
                  if (newType === 'cmp' && !step.cmp) {
                    patch.cmp = {
                      operation: 'cmp',
                      mode: 'polish-depth',
                      depth: 300,
                    };
                  }
                  if (newType === 'bonding') {
                    if (step.side === 'both') {
                      patch.side = 'front';
                    }
                    if (!step.bonding) {
                      patch.bonding = {
                        sourceType: 'custom-substrate',
                        bondingMethod: 'fusion',
                        incomingFace: 'front',
                        customLayers: [
                          {
                            id: `bond_layer_${Date.now()}`,
                            name: 'Cap Wafer (Silicon <100>)',
                            materialId: 'mat_si_sub',
                            thickness: 2500,
                          },
                        ],
                      };
                    }
                  }
                  if (newType === 'dicing' && !step.dicing) {
                    patch.dicing = {
                      method: 'blade',
                      cutMode: 'through-wafer',
                      kerfWidth: 400,
                      cutDepth: 1500,
                      sidewallAngle: 90,
                      tapeOvercut: 120,
                      streets: [
                        {
                          id: `street_${Date.now()}`,
                          xCenter: Math.round(waferWidth * 0.5),
                        },
                      ],
                    };
                  }
                  if (newType === 'tape-frame') {
                    if (!step.side || step.side === 'both') {
                      patch.side = 'back';
                    }
                    if (!step.tapeFrame) {
                      patch.tapeFrame = {
                        action: 'mount',
                        tapeMaterialId: 'mat_dicing_tape',
                        thickness: 600,
                        conformality: 'flat',
                        showFrame: true,
                      };
                    }
                  }
                  handleUpdate(patch);
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-sky-500"
              >
                <option value="deposition">Deposition / Thin Film Growth</option>
                <option value="lithography">Photolithography &amp; Patterning</option>
                <option value="etch">Etching (Dry RIE / Wet / Bosch DRIE)</option>
                <option value="strip">Strip / Sacrificial Release</option>
                <option value="liftoff">Metal Lift-off</option>
                <option value="cmp">Grind/Polish/Planarize (Grinding &amp; CMP)</option>
                <option value="bonding">Wafer Bonding (Substrate / Pre-Processed Flow)</option>
                <option value="tape-frame">Tape &amp; Frame (Mount / UV Demount)</option>
                <option value="dicing">Wafer Dicing (Blade / Laser / Plasma)</option>
                <option value="anneal">Thermal Anneal / Drive-In</option>
                <option value="substrate">Substrate Initialization</option>
              </select>
            </div>

            {/* Wafer Processing Side Selector (Front / Back / Both) */}
            {step.type !== 'substrate' && step.type !== 'anneal' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    {step.type === 'bonding'
                      ? 'Bond Target Side'
                      : step.type === 'tape-frame'
                      ? 'Tape Lamination Side'
                      : 'Substrate Side'}
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {(step.side || 'front') === 'front'
                      ? 'Top Surface (+Z)'
                      : step.side === 'back'
                      ? 'Backside (-Z)'
                      : 'Double-Sided (±Z)'}
                  </span>
                </div>
                <div
                  className={`grid ${
                    step.type === 'bonding' || step.type === 'tape-frame'
                      ? 'grid-cols-2'
                      : 'grid-cols-3'
                  } gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 text-xs`}
                >
                  {(
                    [
                      { id: 'front' as ProcessSide, label: 'Front', icon: ArrowUp, activeClass: 'bg-sky-600 text-white shadow-sm' },
                      { id: 'back' as ProcessSide, label: 'Back', icon: ArrowDown, activeClass: 'bg-amber-600 text-white shadow-sm' },
                      ...(step.type === 'bonding' || step.type === 'tape-frame'
                        ? []
                        : [{ id: 'both' as ProcessSide, label: 'Both Sides', icon: ArrowUpDown, activeClass: 'bg-emerald-600 text-white shadow-sm' }]),
                    ]
                  ).map((opt) => {
                    const currentSide: ProcessSide =
                      (step.type === 'bonding' || step.type === 'tape-frame') &&
                      step.side === 'both'
                        ? step.type === 'tape-frame'
                          ? 'back'
                          : 'front'
                        : step.side || (step.type === 'tape-frame' ? 'back' : 'front');
                    const isActive = currentSide === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdate({ side: opt.id })}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium transition-all ${
                          isActive
                            ? opt.activeClass
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Customization for DEPOSITION */}
            {step.type === 'deposition' && (
              <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-sky-400">
                    Deposition Material
                  </label>
                  <button
                    onClick={onOpenMaterialsModal}
                    className="text-[11px] text-sky-400 hover:underline"
                  >
                    + Manage Materials
                  </button>
                </div>

                <select
                  value={step.materialId || 'mat_sio2_thermal'}
                  onChange={(e) => handleUpdate({ materialId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.formula})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Film Thickness ({getUnitLabel(thicknessUnit)})
                    </label>
                    <ParametricThicknessInput
                      valueNm={step.deposition?.thickness ?? step.thickness ?? 200}
                      onChangeNm={(val) => {
                        handleUpdate({
                          thickness: val,
                          deposition: {
                            ...(step.deposition || {
                              method: 'PECVD',
                              depositionType: 'conformal',
                              thickness: val,
                            }),
                            thickness: val,
                          },
                        });
                      }}
                      unit={thicknessUnit}
                      minNm={5}
                      stepNm={10}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                      expression={step.paramBindings?.['deposition.thickness']}
                      variables={variables}
                      waferWidth={waferWidth}
                      suggestedVarName="dep_thick"
                      targetLabel={`${step.title} · Film Thickness`}
                      onChangeExpression={(expr) => setStepParamBinding('deposition.thickness', expr)}
                      onCreateVariable={onCreateVariable}
                      onOpenVariablesModal={onOpenVariablesModal}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Deposition Method
                    </label>
                    <select
                      value={step.deposition?.method || 'PECVD'}
                      onChange={(e) => {
                        const nextMethod = e.target.value as NonNullable<ProcessStep['deposition']>['method'];
                        const prevDep = step.deposition || {
                          depositionType: 'conformal' as const,
                          thickness: step.thickness || 200,
                          method: 'PECVD' as const,
                        };
                        const wasPlating =
                          prevDep.method === 'Electroplating' ||
                          prevDep.method === 'Electroless Plating';
                        const isNextPlating =
                          nextMethod === 'Electroplating' ||
                          nextMethod === 'Electroless Plating';
                        const wasDryFilm = prevDep.method === 'Dry Film Lamination';
                        const isNextDryFilm = nextMethod === 'Dry Film Lamination';
                        const wasSpinCoat = prevDep.method === 'Spin Coat';
                        const isNextSpinCoat = nextMethod === 'Spin Coat';

                        handleUpdate({
                          deposition: {
                            ...prevDep,
                            method: nextMethod,
                            ...(isNextPlating && !wasPlating
                              ? {
                                  depositionType:
                                    nextMethod === 'Electroplating'
                                      ? 'bottom-up'
                                      : 'conformal',
                                  platingSelective: prevDep.platingSelective ?? true,
                                  platingSeedScope: prevDep.platingSeedScope ?? 'conductive',
                                }
                              : isNextDryFilm && !wasDryFilm
                              ? {
                                  depositionType: 'dry-film' as const,
                                  laminationSag: prevDep.laminationSag ?? 0,
                                }
                              : isNextSpinCoat && !wasSpinCoat
                              ? {
                                  depositionType: 'spin-coat' as const,
                                  planarization: prevDep.planarization ?? 100,
                                }
                              : !isNextDryFilm &&
                                (prevDep.depositionType === 'dry-film' ||
                                  (wasSpinCoat && prevDep.depositionType === 'spin-coat'))
                              ? {
                                  depositionType:
                                    nextMethod === 'E-Beam Evaporation'
                                      ? 'directional'
                                      : 'conformal',
                                }
                              : {}),
                          },
                        });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="PECVD">PECVD</option>
                      <option value="LPCVD">LPCVD</option>
                      <option value="ALD">ALD (Atomic Layer)</option>
                      <option value="Sputter">Sputtering (PVD)</option>
                      <option value="E-Beam Evaporation">E-Beam Evap</option>
                      <option value="Electroplating">Electroplating (ECD)</option>
                      <option value="Electroless Plating">Electroless Plating</option>
                      <option value="Thermal Oxidation">Thermal Oxide</option>
                      <option value="Spin Coat">Spin Coat</option>
                      <option value="Dry Film Lamination">Dry Film Lamination</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Conformity & Topography Coverage
                  </label>
                  <select
                    value={step.deposition?.depositionType || 'conformal'}
                    onChange={(e) =>
                      handleUpdate({
                        deposition: {
                          ...(step.deposition || {
                            method: 'PECVD',
                            thickness: step.thickness || 200,
                            depositionType: 'conformal',
                          }),
                          depositionType: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="conformal">Conformal (Uniform sidewalls & top)</option>
                    <option value="directional">Directional (Line-of-sight, E-Beam)</option>
                    <option value="semi-conformal">Semi-Conformal (Custom sidewall coverage)</option>
                    <option value="spin-coat">Planarizing Spin-Coat / Superfill (Fills valleys flat)</option>
                    <option value="dry-film">Dry Film Lamination / Tenting (Bridges cavities flat)</option>
                    <option value="bottom-up">Bottom-Up / Through-Mask Plating (Vertical growth)</option>
                  </select>
                </div>

                {step.deposition?.depositionType === 'spin-coat' && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Planarization (Viscosity vs Topography)
                      </span>
                      <span className="font-mono text-sky-400">
                        {step.deposition?.planarization ?? 100}%{' '}
                        {(step.deposition?.planarization ?? 100) >= 95
                          ? '(Ideal Flat)'
                          : (step.deposition?.planarization ?? 100) >= 65
                          ? '(Low Visc.)'
                          : (step.deposition?.planarization ?? 100) >= 35
                          ? '(Moderate)'
                          : '(High Visc.)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={step.deposition?.planarization ?? 100}
                      onChange={(e) =>
                        handleUpdate({
                          deposition: {
                            ...(step.deposition || {
                              method: 'Spin Coat',
                              depositionType: 'spin-coat',
                              thickness: step.thickness || 200,
                            }),
                            planarization: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                    <div className="flex items-center justify-between gap-1">
                      {[
                        { val: 25, label: '25% High Visc.' },
                        { val: 65, label: '65% Standard' },
                        { val: 100, label: '100% Ideal' },
                      ].map((preset) => {
                        const active = (step.deposition?.planarization ?? 100) === preset.val;
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...(step.deposition || {
                                    method: 'Spin Coat',
                                    depositionType: 'spin-coat',
                                    thickness: step.thickness || 200,
                                  }),
                                  planarization: preset.val,
                                },
                              })
                            }
                            className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                              active
                                ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(step.deposition?.planarization ?? 100) >= 95
                        ? 'Ideal planarization: levels completely flat across all steps and valleys.'
                        : 'Models non-ideal viscous spin-coating: capillary forces fill narrow trenches faster while wider topography steps sag and dish.'}
                    </p>
                  </div>
                )}

                {(step.deposition?.method === 'Dry Film Lamination' ||
                  step.deposition?.depositionType === 'dry-film') && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Vacuum / Roll Conformality (Sag)
                      </span>
                      <span className="font-mono text-sky-400">
                        {step.deposition?.laminationSag ?? 0}%{' '}
                        {(step.deposition?.laminationSag ?? 0) === 0
                          ? '(Rigid Tent)'
                          : (step.deposition?.laminationSag ?? 0) <= 45
                          ? '(Warm Roll)'
                          : '(Vacuum Drape)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={step.deposition?.laminationSag ?? 0}
                      onChange={(e) =>
                        handleUpdate({
                          deposition: {
                            ...(step.deposition || {
                              method: 'Dry Film Lamination',
                              depositionType: 'dry-film',
                              thickness: step.thickness || 200,
                            }),
                            laminationSag: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                    <div className="flex items-center justify-between gap-1">
                      {[
                        { val: 0, label: '0% Rigid Tent' },
                        { val: 35, label: '35% Warm Roll' },
                        { val: 75, label: '75% Vacuum' },
                      ].map((preset) => {
                        const active = (step.deposition?.laminationSag ?? 0) === preset.val;
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...(step.deposition || {
                                    method: 'Dry Film Lamination',
                                    depositionType: 'dry-film',
                                    thickness: step.thickness || 200,
                                  }),
                                  laminationSag: preset.val,
                                },
                              })
                            }
                            className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                              active
                                ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(step.deposition?.laminationSag ?? 0) === 0
                        ? 'Laminates as a flat rigid sheet over peaks, tenting across channels & cavities to form sealed voids.'
                        : 'Bridges narrow trenches while smoothly draping onto wider open terraces under roller/vacuum pressure.'}
                    </p>

                    {(() => {
                      const activeMat = materials.find(
                        (m) => m.id === (step.materialId || 'mat_sio2_thermal')
                      );
                      const filmCandidates = materials.filter(
                        (m) => m.category === 'polymer' || m.category === 'photoresist'
                      );
                      if (
                        activeMat &&
                        (activeMat.category === 'polymer' || activeMat.category === 'photoresist')
                      ) {
                        return null;
                      }
                      if (filmCandidates.length === 0) return null;
                      return (
                        <div className="p-2 rounded-lg bg-sky-950/30 border border-sky-500/30 space-y-1.5">
                          <div className="text-[10px] text-sky-300 leading-snug">
                            Selected material ({activeMat?.name || 'dielectric'}) is inorganic. Quick-select a dry film sheet:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {filmCandidates.slice(0, 4).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleUpdate({ materialId: m.id })}
                                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-200 font-mono"
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(step.deposition?.method === 'Electroplating' ||
                  step.deposition?.method === 'Electroless Plating') && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(step.deposition?.platingSelective)}
                        onChange={(e) =>
                          handleUpdate({
                            deposition: {
                              ...step.deposition!,
                              platingSelective: e.target.checked,
                              platingSeedScope:
                                step.deposition?.platingSeedScope ?? 'conductive',
                            },
                          })
                        }
                        className="mt-0.5 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <div>
                        <span className="text-[11px] font-medium text-slate-200 block">
                          Selective Seed-Surface Plating
                        </span>
                        <span className="text-[10px] text-slate-400 leading-snug block">
                          Plates only onto exposed seed/conductive regions; skips photoresist molds &amp; dielectrics.
                        </span>
                      </div>
                    </label>

                    {step.deposition?.platingSelective && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 block font-medium">
                          Active Plating Seed Surfaces
                        </span>
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px]">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...step.deposition!,
                                  platingSeedScope: 'conductive',
                                },
                              })
                            }
                            className={`py-1 px-2 rounded font-medium transition-colors ${
                              (step.deposition?.platingSeedScope ?? 'conductive') ===
                              'conductive'
                                ? 'bg-sky-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Metals &amp; Si
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...step.deposition!,
                                  platingSeedScope: 'metal-only',
                                },
                              })
                            }
                            className={`py-1 px-2 rounded font-medium transition-colors ${
                              step.deposition?.platingSeedScope === 'metal-only'
                                ? 'bg-sky-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Metals Only
                          </button>
                        </div>
                      </div>
                    )}

                    {(() => {
                      const activeMat = materials.find(
                        (m) => m.id === (step.materialId || 'mat_sio2_thermal')
                      );
                      const metalCandidates = materials
                        .filter((m) => m.category === 'metal')
                        .slice(0, 4);
                      if (activeMat?.category === 'metal' || metalCandidates.length === 0) {
                        return null;
                      }
                      return (
                        <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 space-y-1.5">
                          <div className="text-[10px] text-amber-300 leading-snug">
                            Selected material ({activeMat?.name || 'oxide'}) is non-metallic. Quick-select a plated metal:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {metalCandidates.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleUpdate({ materialId: m.id })}
                                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-200 font-mono"
                              >
                                {m.formula}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {step.deposition?.depositionType === 'directional' && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Substrate Tilt Angle
                      </span>
                      <div className="flex items-center gap-2">
                        {(step.deposition?.tiltAngle ?? 0) !== 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...step.deposition!,
                                  tiltAngle: 0,
                                },
                              })
                            }
                            className="text-[10px] text-slate-400 hover:text-sky-400 underline"
                          >
                            Reset 0°
                          </button>
                        )}
                        <span className="font-mono text-sky-400">
                          {(step.deposition?.tiltAngle ?? 0) > 0
                            ? `+${step.deposition?.tiltAngle}°`
                            : `${step.deposition?.tiltAngle ?? 0}°`}
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="-75"
                      max="75"
                      step="1"
                      value={step.deposition?.tiltAngle ?? 0}
                      onChange={(e) =>
                        handleUpdate({
                          deposition: {
                            ...step.deposition!,
                            tiltAngle: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                    <div className="flex items-center justify-between gap-1">
                      {[-45, -30, 0, 30, 45].map((presetDeg) => {
                        const active = (step.deposition?.tiltAngle ?? 0) === presetDeg;
                        return (
                          <button
                            key={presetDeg}
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                deposition: {
                                  ...step.deposition!,
                                  tiltAngle: presetDeg,
                                },
                              })
                            }
                            className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                              active
                                ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {presetDeg > 0 ? `+${presetDeg}°` : `${presetDeg}°`}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(step.deposition?.tiltAngle ?? 0) === 0
                        ? 'Normal incidence (vertical flux only, no sidewall coating).'
                        : (step.deposition?.tiltAngle ?? 0) > 0
                        ? 'Flux arrives from upper-right (+X): coats right-facing walls and casts shadows left.'
                        : 'Flux arrives from upper-left (-X): coats left-facing walls and casts shadows right.'}
                    </p>
                  </div>
                )}

                {step.deposition?.depositionType === 'semi-conformal' && (
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Sidewall Step Coverage</span>
                      <span className="font-mono text-sky-400">
                        {step.deposition?.stepCoverage ?? 60}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={step.deposition?.stepCoverage ?? 60}
                      onChange={(e) =>
                        handleUpdate({
                          deposition: {
                            ...step.deposition!,
                            stepCoverage: parseInt(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                )}

                {((step.deposition?.depositionType || 'conformal') === 'conformal' ||
                  step.deposition?.depositionType === 'semi-conformal') && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(step.deposition?.convexCornerEffect)}
                        onChange={(e) =>
                          handleUpdate({
                            deposition: {
                              ...(step.deposition || {
                                depositionType: 'conformal',
                                method: 'PECVD',
                                thickness: step.thickness || 200,
                              }),
                              convexCornerEffect: e.target.checked,
                              convexCornerStrength:
                                step.deposition?.convexCornerStrength ?? 0.6,
                            },
                          })
                        }
                        className="mt-0.5 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <div>
                        <span className="text-[11px] font-medium text-slate-200 block">
                          Faster Deposition at Convex Corners
                        </span>
                        <span className="text-[10px] text-slate-400 leading-snug block">
                          Outer/convex step corners receive wider precursor flux and build thicker film (bread-loafing).
                        </span>
                      </div>
                    </label>

                    {step.deposition?.convexCornerEffect && (
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Corner Rate Boost</span>
                          <span className="font-mono text-sky-400">
                            +{Math.round((step.deposition?.convexCornerStrength ?? 0.6) * 100)}%{' '}
                            {(step.deposition?.convexCornerStrength ?? 0.6) < 0.4
                              ? '(Mild)'
                              : (step.deposition?.convexCornerStrength ?? 0.6) > 0.9
                              ? '(Strong)'
                              : '(Moderate)'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="150"
                          step="5"
                          value={Math.round((step.deposition?.convexCornerStrength ?? 0.6) * 100)}
                          onChange={(e) =>
                            handleUpdate({
                              deposition: {
                                ...step.deposition!,
                                convexCornerStrength: parseInt(e.target.value) / 100,
                              },
                            })
                          }
                          className="w-full accent-sky-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Customization for LITHOGRAPHY */}
            {step.type === 'lithography' && (
              <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-rose-400">
                    Photoresist & Exposure
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Mask apertures edited on canvas track
                  </span>
                </div>

                {/* Mask Level Linking / Reticle Assignment */}
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5 min-w-0">
                      <Scan className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Photomask Level / Reticle</span>
                    </span>
                    {onOpenMaskLevelsModal && (
                      <button
                        onClick={() => onOpenMaskLevelsModal(step.lithography?.maskId)}
                        className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 font-medium shrink-0"
                      >
                        <span>Manage Reticles →</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <select
                      value={step.lithography?.maskId || 'none'}
                      onChange={(e) => {
                        const maskId = e.target.value === 'none' ? undefined : e.target.value;
                        const matchingMask = masks?.find((m) => m.id === maskId);
                        if (matchingMask) {
                          handleUpdate({
                            lithography: {
                              ...(step.lithography || {
                                resistMaterialId: 'mat_pr_pos',
                                resistThickness: 1000,
                                polarity: 'positive',
                                windows: [],
                                sidewallAngle: 90,
                                exposureMethod: 'UV Contact (365nm)',
                              }),
                              maskId: matchingMask.id,
                              maskName: matchingMask.name,
                              maskColor: matchingMask.color,
                              polarity: matchingMask.polarity,
                              maskField: matchingMask.maskField || 'dark-field',
                              resistMaterialId: resolveResistMaterialId(
                                matchingMask.polarity,
                                step.lithography?.resistMaterialId
                              ),
                              windows: matchingMask.windows.map((w) => ({ ...w })),
                            },
                          });
                          setIsEditingMaskName(false);
                        } else {
                          handleUpdate({
                            lithography: {
                              ...step.lithography!,
                              maskId: undefined,
                            },
                          });
                          setIsEditingMaskName(false);
                        }
                      }}
                      className="min-w-0 flex-1 w-full truncate px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:border-sky-500"
                    >
                      <option value="none">-- Unlinked Custom Features --</option>
                      {masks?.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.windows?.length || 0}{' '}
                          {m.maskField === 'light-field' ? 'blockers' : 'apertures'} ·{' '}
                          {m.maskField === 'light-field' ? 'light-field' : 'dark-field'} ·{' '}
                          {m.polarity})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Click-to-edit Assigned Mask Name */}
                  <div className="flex items-center justify-between gap-2 pt-0.5 min-w-0">
                    <span className="text-[11px] text-slate-400 shrink-0">Mask Name:</span>
                    {isEditingMaskName ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          type="text"
                          autoFocus
                          value={editingMaskName}
                          onChange={(e) => setEditingMaskName(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingMaskName.trim();
                            if (trimmed && step.lithography) {
                              handleUpdate({
                                lithography: {
                                  ...step.lithography,
                                  maskName: trimmed,
                                },
                              });
                            }
                            setIsEditingMaskName(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = editingMaskName.trim();
                              if (trimmed && step.lithography) {
                                handleUpdate({
                                  lithography: {
                                    ...step.lithography,
                                    maskName: trimmed,
                                  },
                                });
                              }
                              setIsEditingMaskName(false);
                            }
                            if (e.key === 'Escape') {
                              setIsEditingMaskName(false);
                            }
                          }}
                          className="flex-1 min-w-0 px-2 py-0.5 rounded bg-slate-950 border border-sky-500 text-xs text-white font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const trimmed = editingMaskName.trim();
                            if (trimmed && step.lithography) {
                              handleUpdate({
                                lithography: {
                                  ...step.lithography,
                                  maskName: trimmed,
                                },
                              });
                            }
                            setIsEditingMaskName(false);
                          }}
                          className="p-0.5 text-emerald-400 hover:text-emerald-300"
                          title="Save Mask Name"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMaskName(step.lithography?.maskName || 'Photomask Layer');
                          setIsEditingMaskName(true);
                        }}
                        className="group/editmask flex items-center gap-1.5 text-xs font-mono text-slate-200 hover:text-white px-2 py-0.5 rounded bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors truncate min-w-0 max-w-full"
                        title="Click to rename assigned mask"
                      >
                        <span className="truncate">
                          {step.lithography?.maskName || 'Photomask Layer'}
                        </span>
                        <Edit2 className="w-3 h-3 text-slate-500 group-hover/editmask:text-sky-400 shrink-0" />
                      </button>
                    )}
                  </div>

                  {step.lithography?.windows && (
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] text-slate-400 font-mono pt-0.5">
                      <span>
                        {step.lithography.maskField === 'light-field'
                          ? 'Light-Field'
                          : 'Dark-Field'}{' '}
                        · {step.lithography.windows.length}{' '}
                        {step.lithography.maskField === 'light-field'
                          ? step.lithography.windows.length === 1
                            ? 'blocker'
                            : 'blockers'
                          : step.lithography.windows.length === 1
                          ? 'aperture'
                          : 'apertures'}
                      </span>
                      <span className="text-amber-400">
                        {step.lithography.polarity === 'positive'
                          ? 'Positive Resist (Exposed dissolves)'
                          : 'Negative Resist (Exposed crosslinks)'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] text-slate-400">
                    Resist Application Method
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                    {(
                      [
                        { id: 'spin-coat' as const, label: 'Spin Coat (Fill)' },
                        { id: 'dry-film' as const, label: 'Dry Film Lamination' },
                      ]
                    ).map((opt) => {
                      const active = (step.lithography?.coatMethod ?? 'spin-coat') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            const prevLith = step.lithography || {
                              resistMaterialId: 'mat_pr_pos',
                              resistThickness: 1000,
                              polarity: 'positive' as const,
                              windows: [],
                              sidewallAngle: 90,
                              exposureMethod: 'UV Contact (365nm)' as const,
                            };
                            const hasDfr = materials.some((m) => m.id === 'mat_dfr');
                            handleUpdate({
                              lithography: {
                                ...prevLith,
                                coatMethod: opt.id,
                                ...(opt.id === 'dry-film' &&
                                hasDfr &&
                                (prevLith.resistMaterialId === 'mat_pr_pos' ||
                                  prevLith.resistMaterialId === 'mat_pr_neg')
                                  ? { resistMaterialId: 'mat_dfr' }
                                  : opt.id === 'spin-coat' &&
                                    prevLith.resistMaterialId === 'mat_dfr'
                                  ? {
                                      resistMaterialId:
                                        prevLith.polarity === 'negative'
                                          ? 'mat_pr_neg'
                                          : 'mat_pr_pos',
                                    }
                                  : {}),
                              },
                            });
                          }}
                          className={`py-1 px-2 rounded-md font-medium transition-colors ${
                            active
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(step.lithography?.coatMethod ?? 'spin-coat') === 'spin-coat' ? (
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Spin-Coat Planarization (Viscosity)
                      </span>
                      <span className="font-mono text-rose-400">
                        {step.lithography?.planarization ?? 100}%{' '}
                        {(step.lithography?.planarization ?? 100) >= 95
                          ? '(Ideal)'
                          : (step.lithography?.planarization ?? 100) >= 50
                          ? '(Partial)'
                          : '(High Visc.)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={step.lithography?.planarization ?? 100}
                      onChange={(e) =>
                        handleUpdate({
                          lithography: {
                            ...(step.lithography || {
                              resistMaterialId: 'mat_pr_pos',
                              resistThickness: 1000,
                              polarity: 'positive',
                              windows: [],
                              sidewallAngle: 90,
                              exposureMethod: 'UV Contact (365nm)',
                            }),
                            planarization: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-rose-500"
                    />
                    <div className="flex items-center justify-between gap-1">
                      {[
                        { val: 25, label: '25% High Visc.' },
                        { val: 65, label: '65% Standard' },
                        { val: 100, label: '100% Ideal' },
                      ].map((preset) => {
                        const active = (step.lithography?.planarization ?? 100) === preset.val;
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                lithography: {
                                  ...(step.lithography || {
                                    resistMaterialId: 'mat_pr_pos',
                                    resistThickness: 1000,
                                    polarity: 'positive',
                                    windows: [],
                                    sidewallAngle: 90,
                                    exposureMethod: 'UV Contact (365nm)',
                                  }),
                                  planarization: preset.val,
                                },
                              })
                            }
                            className={`flex-1 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              active
                                ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(step.lithography?.planarization ?? 100) >= 95
                        ? 'Flat planarized resist surface across all underlying topography.'
                        : 'High-viscosity resist dips over wide valleys while narrow trenches fill more flatly.'}
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Lamination Conformality (Sag)
                      </span>
                      <span className="font-mono text-rose-400">
                        {step.lithography?.laminationSag ?? 0}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={step.lithography?.laminationSag ?? 0}
                      onChange={(e) =>
                        handleUpdate({
                          lithography: {
                            ...step.lithography!,
                            laminationSag: parseInt(e.target.value, 10),
                          },
                        })
                      }
                      className="w-full accent-rose-500"
                    />
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(step.lithography?.laminationSag ?? 0) === 0
                        ? 'Dry film resist tents flat across cavities before UV exposure & development.'
                        : 'Dry film bridges narrow trenches while draping into wider topography.'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Mask Field Polarity
                    </label>
                    <select
                      value={step.lithography?.maskField || 'dark-field'}
                      onChange={(e) => {
                        const nextField = e.target.value as 'dark-field' | 'light-field';
                        handleUpdate({
                          lithography: {
                            ...(step.lithography || {
                              resistMaterialId: 'mat_pr_pos',
                              resistThickness: 1000,
                              polarity: 'positive',
                              windows: [],
                              sidewallAngle: 90,
                              exposureMethod: 'UV Contact (365nm)',
                            }),
                            maskField: nextField,
                          },
                        });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="dark-field">Dark-Field (Blocks = Apertures)</option>
                      <option value="light-field">Light-Field (Blocks = Chrome Blockers)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Resist Tone (Chemistry)
                    </label>
                    <select
                      value={step.lithography?.polarity || 'positive'}
                      onChange={(e) => {
                        const nextPolarity = e.target.value as 'positive' | 'negative';
                        handleUpdate({
                          lithography: {
                            ...(step.lithography || {
                              resistMaterialId: 'mat_pr_pos',
                              resistThickness: 1000,
                              polarity: 'positive',
                              windows: [],
                              sidewallAngle: 90,
                              exposureMethod: 'UV Contact (365nm)',
                            }),
                            polarity: nextPolarity,
                            resistMaterialId: resolveResistMaterialId(
                              nextPolarity,
                              step.lithography?.resistMaterialId
                            ),
                          },
                        });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="positive">Positive (Exposed dissolves)</option>
                      <option value="negative">Negative (Unexposed dissolves)</option>
                    </select>
                  </div>
                </div>

                <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 leading-snug">
                  {(step.lithography?.maskField || 'dark-field') === 'light-field' ? (
                    (step.lithography?.polarity || 'positive') === 'positive' ? (
                      <span>
                        <strong className="text-sky-300">Light-Field + Positive:</strong> Clear quartz exposes &amp; dissolves background resist; resist <strong className="text-slate-200">remains under chrome blockers</strong>.
                      </span>
                    ) : (
                      <span>
                        <strong className="text-sky-300">Light-Field + Negative:</strong> Clear quartz crosslinks background resist; resist <strong className="text-slate-200">dissolves under chrome blockers</strong>.
                      </span>
                    )
                  ) : (step.lithography?.polarity || 'positive') === 'positive' ? (
                    <span>
                      <strong className="text-amber-300">Dark-Field + Positive:</strong> UV passes through apertures to <strong className="text-slate-200">dissolve resist at apertures</strong>; background chrome protects resist.
                    </span>
                  ) : (
                    <span>
                      <strong className="text-amber-300">Dark-Field + Negative:</strong> UV passes through apertures to <strong className="text-slate-200">crosslink resist at apertures</strong>; unexposed background dissolves.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Resist Thickness ({getUnitLabel(thicknessUnit)})
                  </label>
                  <ParametricThicknessInput
                    valueNm={step.lithography?.resistThickness ?? 1000}
                    onChangeNm={(val) =>
                      handleUpdate({
                        lithography: {
                          ...(step.lithography || {
                            resistMaterialId: 'mat_pr_pos',
                            polarity: 'positive',
                            windows: [],
                            sidewallAngle: 90,
                            exposureMethod: 'UV Contact (365nm)',
                            resistThickness: 1000,
                          }),
                          resistThickness: val,
                        },
                      })
                    }
                    unit={thicknessUnit}
                    minNm={100}
                    stepNm={100}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                    expression={step.paramBindings?.['lithography.resistThickness']}
                    variables={variables}
                    waferWidth={waferWidth}
                    suggestedVarName="pr_thick"
                    targetLabel={`${step.title} · Resist Thickness`}
                    onChangeExpression={(expr) => setStepParamBinding('lithography.resistThickness', expr)}
                    onCreateVariable={onCreateVariable}
                    onOpenVariablesModal={onOpenVariablesModal}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Sidewall Profile Angle</span>
                    <span className="font-mono text-rose-400">
                      {step.lithography?.sidewallAngle ?? 90}°{' '}
                      {(step.lithography?.sidewallAngle ?? 90) > 90
                        ? '(Retrograde / Lift-off Undercut)'
                        : (step.lithography?.sidewallAngle ?? 90) < 90
                        ? '(Tapered)'
                        : '(Vertical 90°)'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="75"
                    max="105"
                    value={step.lithography?.sidewallAngle ?? 90}
                    onChange={(e) =>
                      handleUpdate({
                        lithography: {
                          ...step.lithography!,
                          sidewallAngle: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Exposure Tool Wavelength
                  </label>
                  <select
                    value={step.lithography?.exposureMethod || 'UV Contact (365nm)'}
                    onChange={(e) =>
                      handleUpdate({
                        lithography: {
                          ...step.lithography!,
                          exposureMethod: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="UV Contact (365nm)">UV Contact Aligner (i-line 365nm)</option>
                    <option value="DUV Stepper (248nm)">DUV Projection Stepper (248nm)</option>
                    <option value="E-Beam Litho">Electron Beam Lithography (EBL)</option>
                    <option value="Direct Write Laser">Direct Write Laser (MLA150)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Customization for ETCH */}
            {step.type === 'etch' && (() => {
              const libraryRecipes = getEtchRecipes(etchRecipes);
              const currentEtchType = step.etch?.etchType || 'rie';
              const matchingRecipes = libraryRecipes.filter(
                (r) => r.etchType === currentEtchType
              );
              const linkedRecipe = step.etch?.etchRecipeId
                ? matchingRecipes.find((r) => r.id === step.etch?.etchRecipeId)
                : undefined;
              const rateMode =
                linkedRecipe && step.etch?.rateMode === 'time-rate'
                  ? 'time-rate'
                  : 'manual';
              const targetMatId = step.etch?.targetMaterialId || 'all';
              const defaultRefMatId =
                targetMatId !== 'all'
                  ? targetMatId
                  : linkedRecipe?.primaryMaterialId || 'mat_si_sub';
              const refMatId =
                linkedRecipe && step.etch?.referenceMaterialId
                  ? step.etch.referenceMaterialId
                  : defaultRefMatId;
              const refMat = materials.find((m) => m.id === refMatId);
              const refRate = linkedRecipe ? getEtchRateNmMin(linkedRecipe, refMatId) : 0;
              const prRate = linkedRecipe ? getEtchRateNmMin(linkedRecipe, 'mat_pr_pos') : 0;
              const stopMatId = step.etch?.stopLayerMaterialId;
              const stopRate =
                linkedRecipe && stopMatId
                  ? getEtchRateNmMin(linkedRecipe, stopMatId)
                  : undefined;
              const etchTimeSec = step.etch?.etchTimeSec ?? 60;
              const currentDepth = step.etch?.depth ?? step.thickness ?? 300;
              const estTimeSec =
                refRate > 0 ? Math.max(1, (currentDepth / refRate) * 60) : 0;

              return (
              <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-400">
                    Etch Parameters &amp; Isotropy
                  </span>
                  {onOpenEtchLibrary && (
                    <button
                      type="button"
                      onClick={onOpenEtchLibrary}
                      className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 hover:underline shrink-0"
                    >
                      <FlaskConical className="w-3 h-3" />
                      <span>Etch Rate Library</span>
                    </button>
                  )}
                </div>

                {/* Etch Rate Library Recipe Selector */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[11px] text-slate-400">
                      Etch Chemistry / Rate Recipe
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">
                      {matchingRecipes.length}{' '}
                      {matchingRecipes.length === 1 ? 'recipe' : 'recipes'} for mechanism
                    </span>
                  </div>
                  <select
                    value={
                      step.etch?.etchRecipeId &&
                      matchingRecipes.some((r) => r.id === step.etch?.etchRecipeId)
                        ? step.etch.etchRecipeId
                        : ''
                    }
                    onChange={(e) => {
                      const nextId = e.target.value;
                      if (!nextId) {
                        handleUpdate({
                          etch: {
                            ...(step.etch || {
                              etchType: currentEtchType,
                              depth: currentDepth,
                              targetMaterialId: 'all',
                              isotropy: 0.05,
                              sidewallAngle: 90,
                            }),
                            etchRecipeId: undefined,
                            referenceMaterialId: undefined,
                            rateMode: 'manual',
                          },
                        });
                        return;
                      }
                      const chosen = matchingRecipes.find((r) => r.id === nextId);
                      if (!chosen) return;
                      const isSameRecipe = step.etch?.etchRecipeId === chosen.id;
                      const nextRefMatId = isSameRecipe
                        ? step.etch?.referenceMaterialId
                        : undefined;
                      const chosenRefMatId =
                        nextRefMatId ||
                        (targetMatId !== 'all' ? targetMatId : chosen.primaryMaterialId);
                      const chosenRefRate = getEtchRateNmMin(chosen, chosenRefMatId);
                      const nextMode = step.etch?.rateMode || 'time-rate';
                      const nextSec =
                        step.etch?.etchTimeSec ||
                        (chosenRefRate > 0
                          ? Math.max(5, Math.min(600, Math.round((currentDepth / chosenRefRate) * 60)))
                          : 60);
                      const derivedDepth =
                        nextMode === 'time-rate' && chosenRefRate > 0
                          ? Math.max(5, Math.round((chosenRefRate * nextSec) / 60))
                          : currentDepth;

                      handleUpdate({
                        thickness: derivedDepth,
                        etch: {
                          ...(step.etch || {
                            etchType: chosen.etchType,
                            depth: derivedDepth,
                            targetMaterialId: 'all',
                            isotropy: chosen.isotropy,
                            sidewallAngle: chosen.sidewallAngle,
                          }),
                          etchRecipeId: chosen.id,
                          referenceMaterialId: nextRefMatId,
                          etchType: chosen.etchType,
                          isotropy: chosen.isotropy,
                          sidewallAngle: chosen.sidewallAngle,
                          scallopEffect: chosen.scallopEffect ?? (chosen.etchType === 'drie-bosch'),
                          scallopDepth: chosen.scallopDepth ?? step.etch?.scallopDepth,
                          scallopPitch: chosen.scallopPitch ?? step.etch?.scallopPitch,
                          ardeEnabled: chosen.ardeEnabled ?? step.etch?.ardeEnabled,
                          ardeStrength: chosen.ardeStrength ?? step.etch?.ardeStrength,
                          rateMode: nextMode,
                          etchTimeSec: nextSec,
                          depth: derivedDepth,
                        },
                        toolRecipe: {
                          ...(step.toolRecipe || {
                            toolName: '',
                            gases: '',
                            power: '',
                            pressure: '',
                            temperature: '',
                            duration: '',
                          }),
                          toolName: chosen.toolName || step.toolRecipe?.toolName || '',
                          gases: chosen.gases || chosen.chemistry,
                          power: chosen.power || '',
                          pressure: chosen.pressure || '',
                          temperature: chosen.temperature || '',
                          duration: formatDurationCompact(nextSec),
                          targetRate:
                            chosenRefRate > 0
                              ? formatEtchRate(chosenRefRate, thicknessUnit)
                              : '',
                        },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Manual Depth (Custom Parameters) --</option>
                    {matchingRecipes.map((r) => {
                      const rRate = getEtchRateNmMin(r, r.primaryMaterialId);
                      return (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.chemistry} · {formatEtchRate(rRate, thicknessUnit)})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Mode Switcher & Selectivity Readout when Recipe Linked */}
                {linkedRecipe && (
                  <div className="p-2.5 rounded-lg bg-amber-950/25 border border-amber-500/30 space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          const syncedDepth =
                            refRate > 0
                              ? Math.max(5, Math.round((refRate * etchTimeSec) / 60))
                              : currentDepth;
                          handleUpdate({
                            thickness: syncedDepth,
                            etch: {
                              ...step.etch!,
                              rateMode: 'time-rate',
                              etchTimeSec,
                              depth: syncedDepth,
                            },
                          });
                        }}
                        className={`py-1 px-2 rounded text-[10px] font-medium transition-colors ${
                          rateMode === 'time-rate'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Time &amp; Rate Physics
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdate({
                            etch: {
                              ...step.etch!,
                              rateMode: 'manual',
                            },
                          })
                        }
                        className={`py-1 px-2 rounded text-[10px] font-medium transition-colors ${
                          rateMode === 'manual'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Fixed Target Depth
                      </button>
                    </div>

                    {rateMode === 'manual' && (
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Reference Material (for Equiv. Etch Time)
                        </label>
                        <select
                          value={refMatId}
                          onChange={(e) =>
                            handleUpdate({
                              etch: {
                                ...step.etch!,
                                referenceMaterialId: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px] focus:outline-none focus:border-amber-500"
                        >
                          {[...materials]
                            .sort((a, b) => {
                              const ra = getEtchRateNmMin(linkedRecipe, a.id);
                              const rb = getEtchRateNmMin(linkedRecipe, b.id);
                              if ((ra > 0) !== (rb > 0)) return rb > 0 ? 1 : -1;
                              return rb - ra;
                            })
                            .map((m) => {
                              const mRate = getEtchRateNmMin(linkedRecipe, m.id);
                              return (
                                <option
                                  key={m.id}
                                  value={m.id}
                                  disabled={mRate <= 0 && m.id !== refMatId}
                                >
                                  {m.name} ({m.formula}) ·{' '}
                                  {mRate > 0
                                    ? formatEtchRate(mRate, thicknessUnit)
                                    : '0 (Etch Stop)'}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-slate-300">
                      <span>
                        {refMat?.formula || 'Ref'}:{' '}
                        <strong className="text-amber-300">
                          {formatEtchRate(refRate, thicknessUnit)}
                        </strong>
                      </span>
                      <span>
                        vs PR:{' '}
                        <strong className="text-emerald-300">
                          {computeSelectivityRatio(refRate, prRate)}
                        </strong>
                        {prRate > 0 && (() => {
                          const effSec =
                            rateMode === 'time-rate' ? etchTimeSec : estTimeSec;
                          const prLossNm = Math.round((prRate * effSec) / 60);
                          return prLossNm > 0 ? (
                            <span className="text-rose-300">
                              {' '}(-{formatThickness(prLossNm, thicknessUnit)})
                            </span>
                          ) : null;
                        })()}
                      </span>
                      {stopRate !== undefined && (
                        <span>
                          vs Stop:{' '}
                          <strong className="text-sky-300">
                            {computeSelectivityRatio(refRate, stopRate)}
                          </strong>
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 leading-snug">
                      {rateMode === 'time-rate'
                        ? 'Multi-layer selectivity & photoresist mask erosion active; 0-rate layers act as etch stops.'
                        : refRate > 0
                        ? `Equiv. time from ${refMat?.formula || 'reference'} (${formatDurationCompact(estTimeSec)}); all open & masked layers follow recipe etch rates.`
                        : 'Selected reference material has 0 nm/min etch rate in this recipe — select an etched material.'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {linkedRecipe && rateMode === 'time-rate' ? (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Etch Time (sec)
                      </label>
                      <div className="space-y-1">
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={etchTimeSec}
                          onChange={(e) => {
                            const sec = Math.max(1, parseFloat(e.target.value) || 1);
                            const nextDepth =
                              refRate > 0
                                ? Math.max(5, Math.round((refRate * sec) / 60))
                                : currentDepth;
                            handleUpdate({
                              thickness: nextDepth,
                              etch: {
                                ...step.etch!,
                                etchTimeSec: sec,
                                depth: nextDepth,
                              },
                            });
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                        />
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-300/90">
                          <span>{formatDurationCompact(etchTimeSec)}</span>
                          <span>
                            {refRate > 0
                              ? `→ ${formatThickness(Math.round((refRate * etchTimeSec) / 60), thicknessUnit)}`
                              : '0 nm'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Etch Depth ({getUnitLabel(thicknessUnit)})
                      </label>
                      <ParametricThicknessInput
                        valueNm={step.etch?.depth ?? step.thickness ?? 300}
                        onChangeNm={(val) => {
                          handleUpdate({
                            thickness: val,
                            etch: {
                              ...(step.etch || {
                                etchType: 'rie',
                                targetMaterialId: 'all',
                                depth: val,
                                isotropy: 0.05,
                                sidewallAngle: 90,
                              }),
                              depth: val,
                            },
                          });
                        }}
                        unit={thicknessUnit}
                        minNm={10}
                        stepNm={25}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                        expression={step.paramBindings?.['etch.depth']}
                        variables={variables}
                        waferWidth={waferWidth}
                        suggestedVarName="etch_depth"
                        targetLabel={`${step.title} · Etch Depth`}
                        onChangeExpression={(expr) => setStepParamBinding('etch.depth', expr)}
                        onCreateVariable={onCreateVariable}
                        onOpenVariablesModal={onOpenVariablesModal}
                      />
                      {linkedRecipe && refRate > 0 && (
                        <span className="text-[10px] font-mono text-amber-300/90 block mt-0.5">
                          Est. time: {formatDurationCompact(estTimeSec)}
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Etch Mechanism
                    </label>
                    <select
                      value={currentEtchType}
                      onChange={(e) => {
                        const nextEtchType = e.target.value as any;
                        const keepRecipe =
                          linkedRecipe && linkedRecipe.etchType === nextEtchType;
                        handleUpdate({
                          etch: {
                            ...(step.etch || {
                              depth: step.thickness || 300,
                              targetMaterialId: 'all',
                              isotropy: 0.05,
                              sidewallAngle: 90,
                              etchType: 'rie',
                            }),
                            etchType: nextEtchType,
                            ...(keepRecipe
                              ? {}
                              : {
                                  etchRecipeId: undefined,
                                  referenceMaterialId: undefined,
                                  rateMode: 'manual' as const,
                                }),
                            isotropy:
                              nextEtchType === 'wet-isotropic'
                                ? 0.95
                                : nextEtchType === 'drie-bosch' || nextEtchType === 'wet-koh'
                                ? 0.02
                                : nextEtchType === 'ashing'
                                ? 0.45
                                : 0.05,
                            sidewallAngle:
                              nextEtchType === 'wet-koh'
                                ? 54.74
                                : nextEtchType === 'wet-isotropic' || nextEtchType === 'ashing'
                                ? 90
                                : nextEtchType === 'ion-beam'
                                ? Math.min(
                                    90,
                                    step.etch?.sidewallAngle === 54.74
                                      ? 85
                                      : step.etch?.sidewallAngle ?? 85
                                  )
                                : step.etch?.sidewallAngle === 54.74
                                ? 90
                                : step.etch?.sidewallAngle ?? 90,
                            scallopEffect: nextEtchType === 'drie-bosch',
                            scallopDepth:
                              nextEtchType === 'drie-bosch'
                                ? step.etch?.scallopDepth ?? 45
                                : step.etch?.scallopDepth,
                            scallopPitch:
                              nextEtchType === 'drie-bosch'
                                ? step.etch?.scallopPitch ?? 200
                                : step.etch?.scallopPitch,
                          },
                        });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="rie">Reactive Ion Etch (RIE)</option>
                      <option value="drie-bosch">Deep RIE (Bosch DRIE)</option>
                      <option value="wet-isotropic">Wet Chemical (HF/BOE - Isotropic)</option>
                      <option value="wet-koh">Wet KOH / TMAH Anisotropic (54.74°)</option>
                      <option value="ion-beam">Ion Beam Milling</option>
                      <option value="ashing">Oxygen Plasma Ashing</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Target Material to Etch
                  </label>
                  <select
                    value={step.etch?.targetMaterialId || 'all'}
                    onChange={(e) => {
                      const nextTarget = e.target.value;
                      handleUpdate({
                        etch: {
                          ...(step.etch || {
                            etchType: 'rie',
                            depth: step.thickness || 300,
                            isotropy: 0.05,
                            sidewallAngle: 90,
                          }),
                          targetMaterialId: nextTarget,
                          ...(nextTarget !== 'all'
                            ? { referenceMaterialId: undefined }
                            : {}),
                        },
                      });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="all">All Exposed Layers</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        Selective: {m.name} ({m.formula})
                        {currentEtchType === 'wet-koh'
                          ? isCrystallineKohMaterial(m)
                            ? ' — Crystal {111}'
                            : ' — Isotropic'
                          : ''}
                      </option>
                    ))}
                  </select>
                  {currentEtchType === 'wet-koh' && (() => {
                    const selectedTargetMat =
                      targetMatId !== 'all'
                        ? materials.find((m) => m.id === targetMatId)
                        : undefined;
                    if (selectedTargetMat && !isCrystallineKohMaterial(selectedTargetMat)) {
                      return (
                        <p className="mt-1.5 px-2 py-1.5 rounded-lg bg-sky-950/40 border border-sky-500/30 text-[10px] text-sky-200 leading-snug">
                          <strong>{selectedTargetMat.name}</strong> is not monocrystalline and does not etch along crystal planes — it will etch <strong>isotropically</strong> (circular undercut) in KOH / TMAH.
                        </p>
                      );
                    }
                    return (
                      <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">
                        {selectedTargetMat
                          ? `${selectedTargetMat.name} etches anisotropically along crystal planes (${step.etch?.sidewallAngle ?? 54.74}°).`
                          : 'Crystal-plane etching (54.74°) applies only to single-crystal materials (Si <100>, Si:P); other etched layers (e.g. poly-Si, Al, SiO₂) etch isotropically.'}
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>
                      {step.etch?.etchType === 'wet-koh'
                        ? 'Crystal {111} Mask Undercut'
                        : 'Etch Isotropy (Mask Undercut)'}
                    </span>
                    {(() => {
                      const isoVal =
                        step.etch?.isotropy ??
                        (step.etch?.etchType === 'wet-isotropic' ? 0.95 : 0.05);
                      const isKoh = step.etch?.etchType === 'wet-koh';
                      const angleLabel = `${step.etch?.sidewallAngle ?? 54.74}°`;
                      return (
                        <span className="font-mono text-amber-400">
                          {Math.round(isoVal * 100)}%{' '}
                          {isKoh
                            ? isoVal < 0.05
                              ? `(${angleLabel} Zero Undercut)`
                              : isoVal > 0.7
                              ? `(${angleLabel} High Lateral Undercut)`
                              : `(${angleLabel} Lateral Undercut)`
                            : isoVal < 0.1
                            ? '(Anisotropic Vertical)'
                            : isoVal > 0.7
                            ? '(Isotropic Circular Undercut)'
                            : '(Moderate Undercut)'}
                        </span>
                      );
                    })()}
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(
                      (step.etch?.isotropy ??
                        (step.etch?.etchType === 'wet-isotropic' ? 0.95 : 0.05)) * 100
                    )}
                    onChange={(e) =>
                      handleUpdate({
                        etch: {
                          ...step.etch!,
                          isotropy: parseInt(e.target.value) / 100,
                        },
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>

                {/* Sidewall Taper Angle for RIE, DRIE, and Ion Beam Milling */}
                {(['rie', 'drie-bosch', 'ion-beam'].includes(step.etch?.etchType || 'rie')) && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Sidewall Taper Angle</span>
                      {(() => {
                        const isIonBeam = step.etch?.etchType === 'ion-beam';
                        const rawAngle = step.etch?.sidewallAngle ?? (isIonBeam ? 85 : 90);
                        const angleVal = isIonBeam ? Math.min(90, rawAngle) : rawAngle;
                        return (
                          <span className="font-mono text-amber-400">
                            {angleVal}°{' '}
                            {angleVal > 90.25
                              ? `(${+(angleVal - 90).toFixed(1)}° Re-entrant)`
                              : angleVal < 89.75
                              ? `(${+(90 - angleVal).toFixed(1)}° Positive Taper)`
                              : '(Vertical 90°)'}
                          </span>
                        );
                      })()}
                    </div>
                    <input
                      type="range"
                      min={step.etch?.etchType === 'ion-beam' ? '75' : '80'}
                      max={step.etch?.etchType === 'ion-beam' ? '90' : '100'}
                      step="0.5"
                      value={
                        step.etch?.etchType === 'ion-beam'
                          ? Math.max(75, Math.min(90, step.etch?.sidewallAngle ?? 85))
                          : Math.max(80, Math.min(100, step.etch?.sidewallAngle ?? 90))
                      }
                      onChange={(e) =>
                        handleUpdate({
                          etch: {
                            ...(step.etch || {
                              etchType: 'rie',
                              depth: step.thickness || 300,
                              targetMaterialId: 'all',
                              isotropy: 0.05,
                              sidewallAngle: 90,
                            }),
                            sidewallAngle: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-amber-500"
                    />
                    <div className="flex items-center justify-between gap-1">
                      {(step.etch?.etchType === 'ion-beam'
                        ? [75, 80, 85, 88, 90]
                        : [80, 85, 88, 90, 95, 100]
                      ).map((presetAngle) => {
                        const currentA =
                          step.etch?.sidewallAngle ??
                          (step.etch?.etchType === 'ion-beam' ? 85 : 90);
                        const active = Math.abs(currentA - presetAngle) < 0.25;
                        return (
                          <button
                            key={presetAngle}
                            type="button"
                            onClick={() =>
                              handleUpdate({
                                etch: {
                                  ...(step.etch || {
                                    etchType: 'rie',
                                    depth: step.thickness || 300,
                                    targetMaterialId: 'all',
                                    isotropy: 0.05,
                                    sidewallAngle: 90,
                                  }),
                                  sidewallAngle: presetAngle,
                                },
                              })
                            }
                            className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                              active
                                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {presetAngle}°
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Adjustable Bosch DRIE Sidewall Scallops */}
                {step.etch?.etchType === 'drie-bosch' && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(step.etch?.scallopEffect)}
                        onChange={(e) =>
                          handleUpdate({
                            etch: {
                              ...step.etch!,
                              scallopEffect: e.target.checked,
                              scallopDepth: step.etch?.scallopDepth ?? 45,
                              scallopPitch: step.etch?.scallopPitch ?? 200,
                            },
                          })
                        }
                        className="mt-0.5 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <div>
                        <span className="text-[11px] font-medium text-slate-200 block">
                          Bosch DRIE Sidewall Scallops
                        </span>
                        <span className="text-[10px] text-slate-400 leading-snug block">
                          Periodic SF₆/C₄F₈ etch-passivation undulations along etched trench walls.
                        </span>
                      </div>
                    </label>

                    {step.etch?.scallopEffect && (
                      <div className="space-y-2.5 pl-1">
                        <div>
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Scallop Depth (Amplitude)</span>
                            <span className="font-mono text-amber-400">
                              {formatThickness(step.etch?.scallopDepth ?? 45, thicknessUnit)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="250"
                            step="5"
                            value={step.etch?.scallopDepth ?? 45}
                            onChange={(e) =>
                              handleUpdate({
                                etch: {
                                  ...step.etch!,
                                  scallopDepth: parseInt(e.target.value, 10),
                                },
                              })
                            }
                            className="w-full accent-amber-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Scallop Pitch (Cycle Height)</span>
                            {(() => {
                              const effCycleDepth =
                                linkedRecipe && rateMode === 'time-rate' && refRate > 0
                                  ? Math.round((refRate * etchTimeSec) / 60)
                                  : step.etch?.depth ?? step.thickness ?? 300;
                              const pitchNm = Math.max(20, step.etch?.scallopPitch ?? 200);
                              return (
                                <span className="font-mono text-amber-400">
                                  {formatThickness(step.etch?.scallopPitch ?? 200, thicknessUnit)} (~
                                  {Math.max(1, Math.round(effCycleDepth / pitchNm))}{' '}
                                  cycles)
                                </span>
                              );
                            })()}
                          </div>
                          <input
                            type="range"
                            min="60"
                            max="600"
                            step="10"
                            value={step.etch?.scallopPitch ?? 200}
                            onChange={(e) =>
                              handleUpdate({
                                etch: {
                                  ...step.etch!,
                                  scallopPitch: parseInt(e.target.value, 10),
                                },
                              })
                            }
                            className="w-full accent-amber-500"
                          />
                        </div>
                        {step.etch?.ardeEnabled && (
                          <p className="text-[10px] text-slate-400 leading-snug">
                            Knudsen ARDE transport preserves total cycle count across narrow &amp; wide trenches while compressing local pitch and attenuating bottom scallops.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Etch Stop Layer (Auto Endpoint)
                  </label>
                  <select
                    value={step.etch?.stopLayerMaterialId || ''}
                    onChange={(e) =>
                      handleUpdate({
                        etch: {
                          ...step.etch!,
                          stopLayerMaterialId: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="">None (Time Etch)</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        Stop at: {m.name} ({m.formula})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Aspect Ratio Dependent Etching (ARDE / RIE Lag) for Dry Etching */}
                {(['rie', 'drie-bosch', 'ion-beam', 'ashing'].includes(
                  step.etch?.etchType || 'rie'
                )) && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(step.etch?.ardeEnabled)}
                        onChange={(e) =>
                          handleUpdate({
                            etch: {
                              ...(step.etch || {
                                etchType: 'rie',
                                depth: step.thickness || 300,
                                targetMaterialId: 'all',
                                isotropy: 0.05,
                                sidewallAngle: 90,
                              }),
                              ardeEnabled: e.target.checked,
                              ardeStrength: step.etch?.ardeStrength ?? 0.5,
                            },
                          })
                        }
                        className="mt-0.5 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <div>
                        <span className="text-[11px] font-medium text-slate-200 block">
                          Apply ARDE / RIE Lag Effect
                        </span>
                        <span className="text-[10px] text-slate-400 leading-snug block">
                          Narrow openings etch shallower than wide openings based on local feature aspect ratio.
                        </span>
                      </div>
                    </label>

                    {step.etch?.ardeEnabled && (
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>RIE Lag Strength (k)</span>
                          <span className="font-mono text-amber-400">
                            {Math.round((step.etch?.ardeStrength ?? 0.5) * 100)}%{' '}
                            {(step.etch?.ardeStrength ?? 0.5) < 0.35
                              ? '(Mild)'
                              : (step.etch?.ardeStrength ?? 0.5) > 0.7
                              ? '(Strong)'
                              : '(Moderate)'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="5"
                          value={Math.round((step.etch?.ardeStrength ?? 0.5) * 100)}
                          onChange={(e) =>
                            handleUpdate({
                              etch: {
                                ...step.etch!,
                                ardeStrength: parseInt(e.target.value) / 100,
                              },
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Convex Corner Acceleration for Isotropic Etching (and isotropic layers in KOH/TMAH) */}
                {(step.etch?.etchType === 'wet-isotropic' ||
                  step.etch?.etchType === 'wet-koh' ||
                  (step.etch?.isotropy ?? 0.05) >= 0.15) && (
                  <div className="pt-2.5 border-t border-slate-800 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(step.etch?.convexCornerEffect)}
                        onChange={(e) =>
                          handleUpdate({
                            etch: {
                              ...(step.etch || {
                                etchType: 'wet-isotropic',
                                depth: step.thickness || 300,
                                targetMaterialId: 'all',
                                isotropy: 0.95,
                                sidewallAngle: 90,
                              }),
                              convexCornerEffect: e.target.checked,
                              convexCornerStrength:
                                step.etch?.convexCornerStrength ?? 0.6,
                            },
                          })
                        }
                        className="mt-0.5 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <div>
                        <span className="text-[11px] font-medium text-slate-200 block">
                          Faster Etch at Convex Corners
                        </span>
                        <span className="text-[10px] text-slate-400 leading-snug block">
                          Convex corners exposed to wider etchant solid angle etch faster, rounding sharp step edges.
                        </span>
                      </div>
                    </label>

                    {step.etch?.convexCornerEffect && (
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                          <span>Corner Rate Boost</span>
                          <span className="font-mono text-amber-400">
                            +{Math.round((step.etch?.convexCornerStrength ?? 0.6) * 100)}%{' '}
                            {(step.etch?.convexCornerStrength ?? 0.6) < 0.4
                              ? '(Mild)'
                              : (step.etch?.convexCornerStrength ?? 0.6) > 0.9
                              ? '(Strong)'
                              : '(Moderate)'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="150"
                          step="5"
                          value={Math.round((step.etch?.convexCornerStrength ?? 0.6) * 100)}
                          onChange={(e) =>
                            handleUpdate({
                              etch: {
                                ...step.etch!,
                                convexCornerStrength: parseInt(e.target.value) / 100,
                              },
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* Customization for STRIP / LIFTOFF */}
            {(step.type === 'strip' || step.type === 'liftoff') && (
              <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-emerald-400">
                  Strip & Release Mechanism
                </span>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Action Type
                  </label>
                  <select
                    value={step.strip?.stripType || (step.type === 'liftoff' ? 'metal-liftoff' : 'resist-strip')}
                    onChange={(e) =>
                      handleUpdate({
                        strip: {
                          ...(step.strip || { solvent: 'Acetone / Plasma' }),
                          stripType: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="resist-strip">Standard Resist Strip (Dissolves PR only)</option>
                    <option value="metal-liftoff">Metal Lift-off (Dissolves PR + lifts top films)</option>
                    <option value="sacrificial-release">MEMS Sacrificial Release (Releases cavities)</option>
                  </select>
                </div>

                {step.strip?.stripType === 'sacrificial-release' && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Sacrificial Material to Dissolve
                    </label>
                    <select
                      value={step.strip?.targetMaterialId || 'mat_sio2_thermal'}
                      onChange={(e) =>
                        handleUpdate({
                          strip: {
                            ...step.strip!,
                            targetMaterialId: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.formula})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Solvent / Chemical Bath
                  </label>
                  <input
                    type="text"
                    value={step.strip?.solvent || 'Remover PG at 65°C'}
                    onChange={(e) =>
                      handleUpdate({
                        strip: {
                          ...(step.strip || { stripType: 'resist-strip', solvent: '' }),
                          solvent: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g. Acetone, O2 Plasma, HF Vapor..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {/* Customization for Grind / Polish / Planarize (CMP & Grinding) */}
            {step.type === 'cmp' && (
              <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-cyan-400">
                  Grind / Polish / Planarize Parameters
                </span>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Operation Type
                  </label>
                  <select
                    value={step.cmp?.operation || 'cmp'}
                    onChange={(e) =>
                      handleUpdate({
                        cmp: {
                          ...(step.cmp || { mode: 'polish-depth', depth: 300 }),
                          operation: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="cmp">CMP Planarization (Chemical Mechanical Polish)</option>
                    <option value="grind">Mechanical Wafer Grinding / Thinning</option>
                    <option value="polish">Fine Lapping / Surface Polishing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Removal / Planarization Mode
                  </label>
                  <select
                    value={step.cmp?.mode || 'polish-depth'}
                    onChange={(e) =>
                      handleUpdate({
                        cmp: {
                          ...(step.cmp || { depth: 300 }),
                          mode: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="polish-depth">Fixed Removal Depth ({getUnitLabel(thicknessUnit)})</option>
                    <option value="stop-on-layer">Endpoint Stop on Barrier Layer</option>
                    <option value="target-height">Planarize to Absolute Z Plane ({getUnitLabel(thicknessUnit)})</option>
                  </select>
                </div>

                {(step.cmp?.mode || 'polish-depth') === 'polish-depth' && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Removed Thickness / Grind Depth ({getUnitLabel(thicknessUnit)})
                    </label>
                    <ParametricThicknessInput
                      valueNm={step.cmp?.depth ?? 300}
                      onChangeNm={(val) =>
                        handleUpdate({
                          cmp: {
                            ...(step.cmp || { mode: 'polish-depth' }),
                            depth: val,
                          },
                        })
                      }
                      unit={thicknessUnit}
                      minNm={10}
                      stepNm={25}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                      expression={step.paramBindings?.['cmp.depth']}
                      variables={variables}
                      waferWidth={waferWidth}
                      suggestedVarName="cmp_depth"
                      targetLabel={`${step.title} · CMP Removal Depth`}
                      onChangeExpression={(expr) => setStepParamBinding('cmp.depth', expr)}
                      onCreateVariable={onCreateVariable}
                      onOpenVariablesModal={onOpenVariablesModal}
                    />
                  </div>
                )}

                {step.cmp?.mode === 'target-height' && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Target Z Plane Coordinate ({getUnitLabel(thicknessUnit)})
                    </label>
                    <ParametricThicknessInput
                      valueNm={step.cmp?.targetHeight ?? 2500}
                      onChangeNm={(val) =>
                        handleUpdate({
                          cmp: {
                            ...(step.cmp || { mode: 'target-height' }),
                            targetHeight: val,
                          },
                        })
                      }
                      unit={thicknessUnit}
                      minNm={-10000}
                      stepNm={50}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                      expression={step.paramBindings?.['cmp.targetHeight']}
                      variables={variables}
                      waferWidth={waferWidth}
                      suggestedVarName="cmp_z"
                      targetLabel={`${step.title} · CMP Target Z`}
                      onChangeExpression={(expr) => setStepParamBinding('cmp.targetHeight', expr)}
                      onCreateVariable={onCreateVariable}
                      onOpenVariablesModal={onOpenVariablesModal}
                    />
                  </div>
                )}

                {step.cmp?.mode === 'stop-on-layer' && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Stop Layer (e.g. Si3N4)
                    </label>
                    <select
                      value={step.cmp?.stopMaterialId || 'mat_si3n4'}
                      onChange={(e) =>
                        handleUpdate({
                          cmp: {
                            ...(step.cmp || { mode: 'stop-on-layer' }),
                            stopMaterialId: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.formula})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Customization for WAFER BONDING */}
            {step.type === 'bonding' && (() => {
              const bondCfg: BondingConfig = step.bonding || {
                sourceType: 'custom-substrate',
                bondingMethod: 'fusion',
                incomingFace: 'front',
                customLayers: [
                  {
                    id: 'bond_layer_default',
                    name: 'Cap Wafer (Silicon <100>)',
                    materialId: 'mat_si_sub',
                    thickness: 2500,
                  },
                ],
              };
              const customLayers: SubstrateLayer[] =
                bondCfg.customLayers && bondCfg.customLayers.length > 0
                  ? bondCfg.customLayers
                  : [
                      {
                        id: 'bond_layer_default',
                        name: 'Cap Wafer (Silicon <100>)',
                        materialId: 'mat_si_sub',
                        thickness: 2500,
                      },
                    ];

              const updateBonding = (patch: Partial<BondingConfig>) => {
                handleUpdate({
                  bonding: {
                    ...bondCfg,
                    ...patch,
                  },
                });
              };

              const handleBondFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBondingImportError(null);
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const parsed = JSON.parse(ev.target?.result as string) as ProcessFlow;
                    if (!parsed || !Array.isArray(parsed.steps) || !parsed.substrateWidth) {
                      setBondingImportError('Invalid MicroFlow JSON: missing steps or substrateWidth.');
                      return;
                    }
                    if (!parsed.substrateLayers || parsed.substrateLayers.length === 0) {
                      parsed.substrateLayers = [
                        {
                          id: 'sub_imported_default',
                          name: 'Bulk Silicon <100>',
                          materialId: parsed.substrateMaterialId || 'mat_si_sub',
                          thickness: parsed.substrateThickness || 3000,
                        },
                      ];
                    }
                    if (parsed.materials && parsed.materials.length > 0 && onMergeMaterials) {
                      onMergeMaterials(parsed.materials);
                    }
                    updateBonding({
                      sourceType: 'imported-flow',
                      importedFlow: parsed,
                      importedFlowTitle: parsed.title || file.name,
                    });
                  } catch {
                    setBondingImportError('Could not parse JSON process file.');
                  }
                };
                reader.readAsText(file);
                e.target.value = '';
              };

              return (
                <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Wafer Bonding Parameters</span>
                    </span>
                  </div>

                  {/* Bonding Method */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Bonding Mechanism
                    </label>
                    <select
                      value={bondCfg.bondingMethod || 'fusion'}
                      onChange={(e) =>
                        updateBonding({ bondingMethod: e.target.value as any })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="fusion">Direct / Fusion Bond (Si–Si / SiO₂–SiO₂)</option>
                      <option value="anodic">Anodic Bond (Si–Glass / Quartz)</option>
                      <option value="adhesive">Adhesive / Polymer Bond (SU-8 / BCB)</option>
                      <option value="eutectic">Eutectic / Thermo-Compression (Au–Au / Au–Sn)</option>
                      <option value="hybrid">Cu–Cu Hybrid Direct Bond</option>
                    </select>
                  </div>

                  {/* Second Wafer Source Selector */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Bonded Substrate Source
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => updateBonding({ sourceType: 'custom-substrate' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          bondCfg.sourceType === 'custom-substrate'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        New User Substrate
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBonding({ sourceType: 'imported-flow' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          bondCfg.sourceType === 'imported-flow'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Imported Process File
                      </button>
                    </div>
                  </div>

                  {/* Incoming Wafer Orientation */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Incoming Wafer Mating Face
                    </label>
                    <select
                      value={bondCfg.incomingFace || 'front'}
                      onChange={(e) =>
                        updateBonding({ incomingFace: e.target.value as 'front' | 'back' })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="front">Frontside Face (Face-to-Face / Flip-Chip)</option>
                      <option value="back">Backside Face (Face-to-Back Stacking)</option>
                    </select>
                  </div>

                  {/* Source 1: Newly User-Defined Substrate Stack */}
                  {bondCfg.sourceType === 'custom-substrate' && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-300">
                          Bonded Substrate Stack ({customLayers.length}{' '}
                          {customLayers.length === 1 ? 'Layer' : 'Layers'})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateBonding({
                              customLayers: [
                                ...customLayers,
                                {
                                  id: `bond_layer_${Date.now()}`,
                                  name: `Film Layer #${customLayers.length + 1}`,
                                  materialId: 'mat_sio2_thermal',
                                  thickness: 300,
                                },
                              ],
                            })
                          }
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Layer</span>
                        </button>
                      </div>

                      {/* Quick Substrate Presets */}
                      <div className="flex flex-wrap gap-1">
                        {[
                          {
                            label: 'Bare Si',
                            layers: [
                              { name: 'Silicon <100>', materialId: 'mat_si_sub', thickness: 2500 },
                            ],
                          },
                          {
                            label: 'Quartz Cap',
                            layers: [
                              { name: 'Quartz Glass Lid', materialId: 'mat_quartz', thickness: 2000 },
                            ],
                          },
                          {
                            label: 'Si + Oxide',
                            layers: [
                              { name: 'Silicon Handle', materialId: 'mat_si_sub', thickness: 2500 },
                              { name: 'Thermal Oxide', materialId: 'mat_sio2_thermal', thickness: 400 },
                            ],
                          },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              updateBonding({
                                customLayers: preset.layers.map((l, idx) => ({
                                  ...l,
                                  id: `bond_layer_${Date.now()}_${idx}`,
                                })),
                              })
                            }
                            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-white transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {/* Layer cards (rendered top surface first) */}
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                        {[...customLayers].reverse().map((layer, revIdx) => {
                          const actualIdx = customLayers.length - 1 - revIdx;
                          return (
                            <div
                              key={layer.id}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <input
                                  type="text"
                                  value={layer.name || ''}
                                  onChange={(e) => {
                                    const next = customLayers.map((l, i) =>
                                      i === actualIdx ? { ...l, name: e.target.value } : l
                                    );
                                    updateBonding({ customLayers: next });
                                  }}
                                  placeholder="Layer name..."
                                  className="flex-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] text-white focus:outline-none focus:border-sky-500"
                                />
                                <button
                                  type="button"
                                  disabled={customLayers.length <= 1}
                                  onClick={() => {
                                    if (customLayers.length <= 1) return;
                                    updateBonding({
                                      customLayers: customLayers.filter((_, i) => i !== actualIdx),
                                    });
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-rose-400 disabled:opacity-20"
                                  title="Remove Layer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={layer.materialId}
                                  onChange={(e) => {
                                    const next = customLayers.map((l, i) =>
                                      i === actualIdx ? { ...l, materialId: e.target.value } : l
                                    );
                                    updateBonding({ customLayers: next });
                                  }}
                                  className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                                >
                                  {materials.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-1">
                                  <ThicknessInput
                                    valueNm={layer.thickness}
                                    onChangeNm={(val) => {
                                      const next = customLayers.map((l, i) =>
                                        i === actualIdx ? { ...l, thickness: val } : l
                                      );
                                      updateBonding({ customLayers: next });
                                    }}
                                    unit={thicknessUnit}
                                    minNm={5}
                                    stepNm={50}
                                    className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-white focus:outline-none focus:border-sky-500"
                                  />
                                  <span className="text-[10px] text-slate-500">
                                    {getUnitLabel(thicknessUnit)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Source 2: Pre-Processed Substrate from Imported Process JSON */}
                  {bondCfg.sourceType === 'imported-flow' && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-dashed border-indigo-500/60 hover:border-indigo-400 text-xs font-medium text-indigo-300 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>
                          {bondCfg.importedFlow
                            ? 'Replace Imported Process File (.json)'
                            : 'Import Pre-Processed Wafer (.json)'}
                        </span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleBondFileUpload}
                          className="hidden"
                        />
                      </label>

                      {bondingImportError && (
                        <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-500/40 text-[11px] text-rose-300">
                          {bondingImportError}
                        </div>
                      )}

                      {bondCfg.importedFlow ? (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-500/40 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1.5 truncate">
                              <FileCheck className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {bondCfg.importedFlowTitle || bondCfg.importedFlow.title}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateBonding({
                                  importedFlow: undefined,
                                  importedFlowTitle: undefined,
                                })
                              }
                              className="text-[10px] text-slate-400 hover:text-rose-400 shrink-0"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                            <span>
                              {bondCfg.importedFlow.steps.filter((s) => s.enabled).length} enabled steps simulated
                            </span>
                            <span>
                              Width: {(bondCfg.importedFlow.substrateWidth / 1000).toFixed(1)} µm
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic leading-relaxed">
                          Upload an exported MicroFlow <span className="font-mono">.json</span> process file. All its enabled fabrication steps will be simulated and bonded onto the selected side.
                        </p>
                      )}

                      <label className="flex items-start gap-2 pt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(bondCfg.mirrorHorizontal)}
                          onChange={(e) =>
                            updateBonding({ mirrorHorizontal: e.target.checked })
                          }
                          className="mt-0.5 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
                        />
                        <div>
                          <span className="text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
                            <FlipHorizontal2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>Mirror Pre-Processed Substrate (Left ↔ Right)</span>
                          </span>
                          <span className="text-[10px] text-slate-400 leading-snug block">
                            Mirrors the imported wafer horizontally across X (useful for flipping asymmetric structures during bonding).
                          </span>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Optional Bonding Interface Seam Layer */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(bondCfg.interfaceLayer?.enabled)}
                        onChange={(e) =>
                          updateBonding({
                            interfaceLayer: {
                              enabled: e.target.checked,
                              materialId: bondCfg.interfaceLayer?.materialId || 'mat_sio2_thermal',
                              thickness: bondCfg.interfaceLayer?.thickness || 100,
                            },
                          })
                        }
                        className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
                      />
                      <span>Include Bonding Interface / Adhesive Seam Layer</span>
                    </label>

                    {bondCfg.interfaceLayer?.enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={bondCfg.interfaceLayer.materialId}
                          onChange={(e) =>
                            updateBonding({
                              interfaceLayer: {
                                ...bondCfg.interfaceLayer!,
                                materialId: e.target.value,
                              },
                            })
                          }
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <div>
                          <ParametricThicknessInput
                            valueNm={bondCfg.interfaceLayer.thickness}
                            onChangeNm={(val) =>
                              updateBonding({
                                interfaceLayer: {
                                  ...bondCfg.interfaceLayer!,
                                  thickness: val,
                                },
                              })
                            }
                            unit={thicknessUnit}
                            minNm={5}
                            stepNm={25}
                            className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-white focus:outline-none focus:border-sky-500"
                            expression={step.paramBindings?.['bonding.interfaceLayer.thickness']}
                            variables={variables}
                            waferWidth={waferWidth}
                            suggestedVarName="bond_seam"
                            targetLabel={`${step.title} · Bond Seam`}
                            onChangeExpression={(expr) =>
                              setStepParamBinding('bonding.interfaceLayer.thickness', expr)
                            }
                            onCreateVariable={onCreateVariable}
                            onOpenVariablesModal={onOpenVariablesModal}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Customization for TAPE & FRAME */}
            {step.type === 'tape-frame' && (() => {
              const tfCfg: TapeFrameConfig = step.tapeFrame || {
                action: 'mount',
                tapeMaterialId: 'mat_dicing_tape',
                thickness: 600,
                conformality: 'flat',
                showFrame: true,
              };
              const updateTf = (patch: Partial<TapeFrameConfig>) => {
                handleUpdate({
                  tapeFrame: {
                    ...tfCfg,
                    ...patch,
                  },
                });
              };
              const tapeMaterials = materials.filter(
                (m) =>
                  m.id === 'mat_dicing_tape' ||
                  m.id === 'mat_uv_tape' ||
                  m.id === 'mat_bg_tape' ||
                  m.id === 'mat_daf' ||
                  m.category === 'polymer'
              );

              return (
                <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                      <Frame className="w-3.5 h-3.5" />
                      <span>Tape &amp; Frame Parameters</span>
                    </span>
                  </div>

                  {/* Operation Toggle */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Frame Operation
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => updateTf({ action: 'mount' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          tfCfg.action === 'mount'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Mount Tape &amp; Frame
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTf({ action: 'demount' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          tfCfg.action === 'demount'
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        UV Release / Demount
                      </button>
                    </div>
                  </div>

                  {tfCfg.action === 'mount' ? (
                    <>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Carrier Tape / Film Type
                        </label>
                        <select
                          value={tfCfg.tapeMaterialId}
                          onChange={(e) => updateTf({ tapeMaterialId: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                        >
                          {(tapeMaterials.length > 0 ? tapeMaterials : materials).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.formula})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Tape Thickness ({getUnitLabel(thicknessUnit)})
                          </label>
                          <ParametricThicknessInput
                            valueNm={tfCfg.thickness}
                            onChangeNm={(val) => updateTf({ thickness: val })}
                            unit={thicknessUnit}
                            minNm={25}
                            stepNm={50}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                            expression={step.paramBindings?.['tapeFrame.thickness']}
                            variables={variables}
                            waferWidth={waferWidth}
                            suggestedVarName="tape_thick"
                            targetLabel={`${step.title} · Tape Thickness`}
                            onChangeExpression={(expr) => setStepParamBinding('tapeFrame.thickness', expr)}
                            onCreateVariable={onCreateVariable}
                            onOpenVariablesModal={onOpenVariablesModal}
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Lamination Tension
                          </label>
                          <select
                            value={tfCfg.conformality}
                            onChange={(e) =>
                              updateTf({ conformality: e.target.value as 'flat' | 'conformal' })
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                          >
                            <option value="flat">Flat Tensioned Frame</option>
                            <option value="conformal">Conformal Roller Press</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-start gap-2 pt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tfCfg.showFrame}
                          onChange={(e) => updateTf({ showFrame: e.target.checked })}
                          className="mt-0.5 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                        />
                        <div>
                          <span className="text-[11px] font-medium text-slate-200 block">
                            Render Stainless Ring Frame Clamps
                          </span>
                          <span className="text-[10px] text-slate-400 leading-snug block">
                            Shows film-frame edge grips holding the wafer during grinding &amp; singulation.
                          </span>
                        </div>
                      </label>
                    </>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
                      UV irradiation reduces tape tack and peels the mounted dicing / backgrind carrier tape off the selected wafer side, leaving any singulated dies free.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Customization for WAFER DICING */}
            {step.type === 'dicing' && (() => {
              const dCfg: DicingConfig = step.dicing || {
                method: 'blade',
                cutMode: 'through-wafer',
                kerfWidth: 400,
                cutDepth: 1500,
                sidewallAngle: 90,
                tapeOvercut: 120,
                streets: [
                  { id: 'st_default', xCenter: Math.round(waferWidth * 0.5) },
                ],
              };
              const updateDicing = (patch: Partial<DicingConfig>) => {
                handleUpdate({
                  dicing: {
                    ...dCfg,
                    ...patch,
                  },
                });
              };
              const streets = dCfg.streets || [];

              const setEvenStreets = (count: number) => {
                const next = Array.from({ length: count }, (_, idx) => ({
                  id: `st_${Date.now()}_${idx}`,
                  xCenter: Math.round(((idx + 1) / (count + 1)) * waferWidth),
                }));
                updateDicing({ streets: next });
              };

              return (
                <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                      <Slice className="w-3.5 h-3.5" />
                      <span>Wafer Dicing &amp; Singulation</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Dicing Method
                      </label>
                      <select
                        value={dCfg.method}
                        onChange={(e) => {
                          const nextMethod = e.target.value as DicingConfig['method'];
                          const defaultKerf =
                            nextMethod === 'blade'
                              ? 400
                              : nextMethod === 'laser-ablation'
                              ? 160
                              : 90;
                          const defaultAngle = nextMethod === 'laser-ablation' ? 82 : 90;
                          updateDicing({
                            method: nextMethod,
                            kerfWidth: defaultKerf,
                            sidewallAngle: defaultAngle,
                          });
                        }}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      >
                        <option value="blade">Mechanical Blade Saw</option>
                        <option value="laser-ablation">Laser Ablation / Grooving</option>
                        <option value="stealth">Stealth Dicing (Laser)</option>
                        <option value="plasma">Plasma Dicing (DRIE)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Kerf Width ({getUnitLabel(thicknessUnit)})
                      </label>
                      <ParametricThicknessInput
                        valueNm={dCfg.kerfWidth}
                        onChangeNm={(val) => updateDicing({ kerfWidth: val })}
                        unit={thicknessUnit}
                        minNm={20}
                        stepNm={25}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                        expression={step.paramBindings?.['dicing.kerfWidth']}
                        variables={variables}
                        waferWidth={waferWidth}
                        suggestedVarName="kerf_w"
                        targetLabel={`${step.title} · Kerf Width`}
                        onChangeExpression={(expr) => setStepParamBinding('dicing.kerfWidth', expr)}
                        onCreateVariable={onCreateVariable}
                        onOpenVariablesModal={onOpenVariablesModal}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Cut Depth Mode
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => updateDicing({ cutMode: 'through-wafer' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          dCfg.cutMode === 'through-wafer'
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Through-Wafer Cut
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDicing({ cutMode: 'partial-depth' })}
                        className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                          dCfg.cutMode === 'partial-depth'
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Partial / Pre-Cut (DBG)
                      </button>
                    </div>
                  </div>

                  {dCfg.cutMode === 'partial-depth' ? (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Pre-Cut Kerf Depth ({getUnitLabel(thicknessUnit)})
                      </label>
                      <ParametricThicknessInput
                        valueNm={dCfg.cutDepth ?? 1500}
                        onChangeNm={(val) => updateDicing({ cutDepth: val })}
                        unit={thicknessUnit}
                        minNm={20}
                        stepNm={100}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                        expression={step.paramBindings?.['dicing.cutDepth']}
                        variables={variables}
                        waferWidth={waferWidth}
                        suggestedVarName="cut_depth"
                        targetLabel={`${step.title} · Pre-Cut Depth`}
                        onChangeExpression={(expr) => setStepParamBinding('dicing.cutDepth', expr)}
                        onCreateVariable={onCreateVariable}
                        onOpenVariablesModal={onOpenVariablesModal}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Dicing Tape Overcut Depth ({getUnitLabel(thicknessUnit)})
                      </label>
                      <ParametricThicknessInput
                        valueNm={dCfg.tapeOvercut ?? 120}
                        onChangeNm={(val) => updateDicing({ tapeOvercut: val })}
                        unit={thicknessUnit}
                        minNm={0}
                        stepNm={25}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                        expression={step.paramBindings?.['dicing.tapeOvercut']}
                        variables={variables}
                        waferWidth={waferWidth}
                        suggestedVarName="tape_overcut"
                        targetLabel={`${step.title} · Tape Overcut`}
                        onChangeExpression={(expr) => setStepParamBinding('dicing.tapeOvercut', expr)}
                        onCreateVariable={onCreateVariable}
                        onOpenVariablesModal={onOpenVariablesModal}
                      />
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Stops cleanly inside mounted dicing tape while cutting all wafer &amp; DAF layers.
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Kerf Sidewall Angle</span>
                      <span className="font-mono text-orange-400">
                        {dCfg.sidewallAngle ?? 90}°{' '}
                        {(dCfg.sidewallAngle ?? 90) < 89 ? '(V-Taper)' : '(Vertical)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="65"
                      max="90"
                      step="1"
                      value={dCfg.sidewallAngle ?? 90}
                      onChange={(e) =>
                        updateDicing({ sidewallAngle: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>

                  {/* Dicing Streets List */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Dicing Streets ({streets.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateDicing({
                            streets: [
                              ...streets,
                              {
                                id: `st_${Date.now()}`,
                                xCenter: Math.round(waferWidth * 0.5),
                              },
                            ],
                          })
                        }
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-medium"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Cut</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setEvenStreets(cnt)}
                          className={`flex-1 py-1 rounded text-[10px] font-mono border transition-colors ${
                            streets.length === cnt
                              ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {cnt} {cnt === 1 ? 'Cut' : 'Cuts'}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                      {streets.map((st, idx) => {
                        const streetExpr = st.paramBindings?.xCenter;
                        const isStreetOpen = openStreetBindId === st.id;
                        return (
                          <div
                            key={st.id}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-orange-400 w-7 shrink-0">
                                #{idx + 1}
                              </span>
                              {streetExpr ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenStreetBindId(isStreetOpen ? null : st.id)
                                  }
                                  className="flex-1 min-w-0 px-2 py-0.5 rounded bg-violet-950/40 border border-violet-500/40 text-left text-[10px] font-mono text-violet-200 truncate"
                                >
                                  = {streetExpr}
                                </button>
                              ) : (
                                <input
                                  type="range"
                                  min={Math.round(waferWidth * 0.05)}
                                  max={Math.round(waferWidth * 0.95)}
                                  step={50}
                                  value={st.xCenter}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    updateDicing({
                                      streets: streets.map((s) =>
                                        s.id === st.id ? { ...s, xCenter: val } : s
                                      ),
                                    });
                                  }}
                                  className="flex-1 accent-orange-500 min-w-0"
                                />
                              )}
                              <span className="text-[10px] font-mono text-slate-300 w-14 text-right shrink-0">
                                {(st.xCenter / 1000).toFixed(2)}µm
                              </span>
                              <ParamBindingBadge
                                expression={streetExpr}
                                isOpen={isStreetOpen}
                                onToggle={() =>
                                  setOpenStreetBindId(isStreetOpen ? null : st.id)
                                }
                                compact
                              />
                              <button
                                type="button"
                                disabled={streets.length <= 1}
                                onClick={() => {
                                  if (streets.length <= 1) return;
                                  updateDicing({
                                    streets: streets.filter((s) => s.id !== st.id),
                                  });
                                }}
                                className="p-0.5 text-slate-400 hover:text-rose-400 disabled:opacity-20 shrink-0"
                                title="Remove dicing street"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            {isStreetOpen && (
                              <ParamBindingPanel
                                expression={streetExpr}
                                variables={variables}
                                waferWidth={waferWidth}
                                currentValue={st.xCenter}
                                unit="um"
                                suggestedVarName={`street_x_${idx + 1}`}
                                targetLabel={`Dicing Street #${idx + 1} X`}
                                onChangeExpression={(expr) => {
                                  updateDicing({
                                    streets: streets.map((s) => {
                                      if (s.id !== st.id) return s;
                                      const nextB = { ...(s.paramBindings || {}) };
                                      if (expr) nextB.xCenter = expr;
                                      else delete nextB.xCenter;
                                      return {
                                        ...s,
                                        paramBindings:
                                          Object.keys(nextB).length > 0 ? nextB : undefined,
                                      };
                                    }),
                                  });
                                }}
                                onCreateVariable={onCreateVariable}
                                onOpenVariablesModal={onOpenVariablesModal}
                                onClose={() => setOpenStreetBindId(null)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Tab 2: Cleanroom Equipment & SOP Recipe */}
        {activeTab === 'equipment' && (
          <div className="space-y-3.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-sky-400">
              Cleanroom Run-Sheet & Tool Parameters
            </span>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Equipment / Tool Tag
              </label>
              <input
                type="text"
                value={step.toolRecipe?.toolName || ''}
                onChange={(e) => handleUpdateRecipe('toolName', e.target.value)}
                placeholder="e.g. Plasma-Therm 790 RIE, Tystar Furnace..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                  <Thermometer className="w-3 h-3 text-rose-400" />
                  <span>Temperature</span>
                </label>
                <input
                  type="text"
                  value={step.toolRecipe?.temperature || ''}
                  onChange={(e) => handleUpdateRecipe('temperature', e.target.value)}
                  placeholder="e.g. 950 °C"
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                  <Gauge className="w-3 h-3 text-sky-400" />
                  <span>Chamber Pressure</span>
                </label>
                <input
                  type="text"
                  value={step.toolRecipe?.pressure || ''}
                  onChange={(e) => handleUpdateRecipe('pressure', e.target.value)}
                  placeholder="e.g. 20 mTorr"
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>RF / ICP Power</span>
                </label>
                <input
                  type="text"
                  value={step.toolRecipe?.power || ''}
                  onChange={(e) => handleUpdateRecipe('power', e.target.value)}
                  placeholder="e.g. 150 W RF"
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>Process Duration</span>
                </label>
                <input
                  type="text"
                  value={step.toolRecipe?.duration || ''}
                  onChange={(e) => handleUpdateRecipe('duration', e.target.value)}
                  placeholder="e.g. 75 s"
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
                <Wind className="w-3 h-3 text-teal-400" />
                <span>Gas Flows (sccm)</span>
              </label>
              <input
                type="text"
                value={step.toolRecipe?.gases || ''}
                onChange={(e) => handleUpdateRecipe('gases', e.target.value)}
                placeholder="e.g. SF6: 30 sccm, O2: 5 sccm"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Metrology & Inspection Checkpoints
              </label>
              <textarea
                value={step.toolRecipe?.inspectionNotes || ''}
                onChange={(e) => handleUpdateRecipe('inspectionNotes', e.target.value)}
                rows={2}
                placeholder="e.g. Measure step height on Dektak stylus profilometer..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}

        {/* Step Notes / Description */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Process Step Notes
          </label>
          <textarea
            value={step.notes || ''}
            onChange={(e) => handleUpdate({ notes: e.target.value })}
            rows={2}
            placeholder="Cleanroom instructions, chemical precautions, target specs..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>
    </div>
  );
};
