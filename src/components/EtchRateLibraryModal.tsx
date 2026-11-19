/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  EtchRecipe,
  EtchRateCategory,
  EtchConfig,
  Material,
  ProcessStep,
} from '../types/microfab';
import {
  ETCH_CATEGORY_LABELS,
  getEtchRateNmMin,
  computeSelectivityRatio,
  formatEtchRate,
  formatDurationCompact,
} from '../lib/etchRates';
import { getMaterialById, isCrystallineKohMaterial } from '../lib/materials';
import { ThicknessUnit, formatThickness } from '../lib/units';
import {
  Plus,
  Trash2,
  X,
  Search,
  Copy,
  Check,
  Flame,
  Clock,
  FlaskConical,
  Edit2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface EtchRateLibraryModalProps {
  recipes: EtchRecipe[];
  materials: Material[];
  thicknessUnit?: ThicknessUnit;
  activeStep?: ProcessStep;
  onUpdateRecipes: (updatedCustomRecipes: EtchRecipe[]) => void;
  onApplyRecipeToStep?: (
    recipe: EtchRecipe,
    rateMode: 'manual' | 'time-rate',
    etchTimeSec: number
  ) => void;
  onClose: () => void;
}

export const EtchRateLibraryModal: React.FC<EtchRateLibraryModalProps> = ({
  recipes,
  materials,
  thicknessUnit = 'nm',
  activeStep,
  onUpdateRecipes,
  onApplyRecipeToStep,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (activeStep?.type === 'etch' && activeStep.etch?.etchRecipeId) {
      return activeStep.etch.etchRecipeId;
    }
    return recipes[0]?.id || '';
  });
  const [filterCategory, setFilterCategory] = useState<'all' | EtchRateCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [calcTimeSec, setCalcTimeSec] = useState<number>(() =>
    activeStep?.type === 'etch' && activeStep.etch?.etchTimeSec
      ? activeStep.etch.etchTimeSec
      : 60
  );
  const [calcMode, setCalcMode] = useState<'time-rate' | 'manual'>('time-rate');
  const [showZeroRates, setShowZeroRates] = useState<boolean>(false);

  // Edit / Create Draft State
  const [editingRecipe, setEditingRecipe] = useState<EtchRecipe | null>(null);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedId) || recipes[0] || null,
    [recipes, selectedId]
  );

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipes.filter((r) => {
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      if (!q) return true;
      const primaryMat = getMaterialById(materials, r.primaryMaterialId);
      const hay = [
        r.name,
        r.chemistry,
        r.etchType,
        r.gases || '',
        r.toolName || '',
        primaryMat.name,
        primaryMat.formula,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recipes, filterCategory, searchQuery, materials]);

  const handleStartNew = () => {
    const draft: EtchRecipe = {
      id: `etch_custom_${Date.now()}`,
      name: 'Custom Etch Chemistry',
      chemistry: 'Custom Plasma / Wet',
      category: 'custom',
      etchType: 'rie',
      isotropy: 0.05,
      sidewallAngle: 90,
      primaryMaterialId: 'mat_si_sub',
      defaultRateNmMin: 0,
      rates: {
        mat_si_sub: 250,
        mat_sio2_thermal: 20,
        mat_pr_pos: 40,
      },
      toolName: 'Custom Cleanroom Tool',
      gases: '',
      power: '',
      pressure: '',
      temperature: '20 °C',
      notes: '',
      isCustom: true,
    };
    setEditingRecipe(draft);
    setSelectedId(draft.id);
  };

  const handleDuplicate = (base: EtchRecipe) => {
    const draft: EtchRecipe = {
      ...base,
      id: `etch_custom_${Date.now()}`,
      name: `${base.name} (Custom)`,
      category: 'custom',
      rates: { ...base.rates },
      isCustom: true,
    };
    setEditingRecipe(draft);
  };

  const handleSaveDraft = () => {
    if (!editingRecipe || !editingRecipe.name.trim()) return;
    const cleaned: EtchRecipe = {
      ...editingRecipe,
      name: editingRecipe.name.trim(),
      chemistry: editingRecipe.chemistry.trim() || 'Custom',
      isCustom: true,
    };
    const customList = recipes.filter((r) => r.isCustom);
    const exists = customList.some((r) => r.id === cleaned.id);
    const nextCustom = exists
      ? customList.map((r) => (r.id === cleaned.id ? cleaned : r))
      : [...customList, cleaned];
    onUpdateRecipes(nextCustom);
    setSelectedId(cleaned.id);
    setEditingRecipe(null);
  };

  const handleDeleteCustom = (id: string) => {
    const nextCustom = recipes.filter((r) => r.isCustom && r.id !== id);
    onUpdateRecipes(nextCustom);
    if (editingRecipe?.id === id) setEditingRecipe(null);
    if (selectedId === id) {
      setSelectedId(recipes.find((r) => r.id !== id)?.id || '');
    }
  };

  const inspected = editingRecipe || selectedRecipe;

  const sortedMaterialsForTable = useMemo(() => {
    if (!inspected) return [];
    const list = [...materials];
    list.sort((a, b) => {
      if (a.id === inspected.primaryMaterialId) return -1;
      if (b.id === inspected.primaryMaterialId) return 1;
      const ra = getEtchRateNmMin(inspected, a.id);
      const rb = getEtchRateNmMin(inspected, b.id);
      if (rb !== ra) return rb - ra;
      return a.name.localeCompare(b.name);
    });
    if (editingRecipe || showZeroRates) return list;
    return list.filter(
      (m) =>
        m.id === inspected.primaryMaterialId ||
        getEtchRateNmMin(inspected, m.id) > 0 ||
        ['mat_si_sub', 'mat_sio2_thermal', 'mat_si3n4', 'mat_pr_pos', 'mat_al'].includes(m.id)
    );
  }, [inspected, materials, editingRecipe, showZeroRates]);

  const isActiveStepEtch = activeStep?.type === 'etch';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-5xl max-h-[94dvh] sm:max-h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FlaskConical className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                Etch Rate &amp; Chemistry Library
              </h2>
              <p className="hidden sm:block text-xs text-slate-400">
                Material-specific etch rates, selectivity ratios, and time-to-depth chemistry models
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={handleStartNew}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Custom Recipe</span>
              <span className="sm:hidden">Custom</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* Left: Search, Categories & Recipe List */}
          <div className="w-full md:w-[42%] border-b md:border-b-0 md:border-r border-slate-800 flex flex-col max-h-[40dvh] md:max-h-none shrink-0 md:shrink">
            <div className="p-2.5 bg-slate-950/60 border-b border-slate-800 space-y-2">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chemistry, SF6, BOE, KOH, Al..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-slate-500 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-0.5">
                {(['all', 'dry-rie', 'drie-vapor', 'wet-chemical', 'physical-ash', 'custom'] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFilterCategory(cat)}
                      className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterCategory === cat
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      {cat === 'all' ? 'All' : ETCH_CATEGORY_LABELS[cat]}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredRecipes.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No etch recipes match "{searchQuery}".
                </div>
              ) : (
                filteredRecipes.map((recipe) => {
                  const isSelected = !editingRecipe && selectedRecipe?.id === recipe.id;
                  const primaryMat = getMaterialById(materials, recipe.primaryMaterialId);
                  const primaryRate = getEtchRateNmMin(recipe, recipe.primaryMaterialId);
                  const isLinkedToActive =
                    isActiveStepEtch && activeStep?.etch?.etchRecipeId === recipe.id;

                  return (
                    <div
                      key={recipe.id}
                      onClick={() => {
                        setEditingRecipe(null);
                        setSelectedId(recipe.id);
                      }}
                      className={`p-2.5 rounded-xl text-xs cursor-pointer border transition-colors ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500/80 text-white shadow-md'
                          : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold truncate">{recipe.name}</span>
                            {recipe.isCustom && (
                              <span className="px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-500/40 text-[9px] font-mono uppercase text-sky-300">
                                Custom
                              </span>
                            )}
                            {isLinkedToActive && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-mono uppercase text-emerald-300">
                                Active Step
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-amber-400/90 font-mono mt-0.5 truncate">
                            {recipe.chemistry}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-200">
                            {formatEtchRate(primaryRate, thicknessUnit)}
                          </span>
                          {recipe.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCustom(recipe.id);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Delete custom recipe"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="truncate">
                          Target: {primaryMat.formula} · {recipe.etchType.toUpperCase()}
                        </span>
                        <span>
                          Iso {Math.round(recipe.isotropy * 100)}% · {recipe.sidewallAngle}°
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Recipe Inspector / Custom Editor / Calculator */}
          <div className="w-full md:w-[58%] p-3.5 sm:p-5 md:overflow-y-auto bg-slate-950/40 space-y-4">
            {inspected ? (
              <>
                {/* Top Action / Title Header */}
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="min-w-0">
                    {editingRecipe ? (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 block mb-1">
                        {recipes.some((r) => r.id === editingRecipe.id)
                          ? 'Editing Custom Etch Recipe'
                          : 'Creating Custom Etch Recipe'}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-bold text-white">
                          {inspected.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300">
                          {ETCH_CATEGORY_LABELS[inspected.category]}
                        </span>
                      </div>
                    )}
                    {!editingRecipe && (
                      <div className="text-xs text-amber-400 font-mono mt-0.5">
                        {inspected.chemistry} · {inspected.etchType.toUpperCase()} · Isotropy{' '}
                        {Math.round(inspected.isotropy * 100)}% · {inspected.sidewallAngle}°
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {editingRecipe ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingRecipe(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Recipe</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {inspected.isCustom ? (
                          <button
                            type="button"
                            onClick={() => setEditingRecipe({ ...inspected, rates: { ...inspected.rates } })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDuplicate(inspected)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium"
                            title="Clone into an editable custom recipe"
                          >
                            <Copy className="w-3.5 h-3.5 text-sky-400" />
                            <span>Customize</span>
                          </button>
                        )}
                        {onApplyRecipeToStep && isActiveStepEtch && (
                          <button
                            type="button"
                            onClick={() => {
                              onApplyRecipeToStep(inspected, calcMode, calcTimeSec);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition-colors"
                          >
                            <span>Apply to Step</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Custom Recipe Metadata Fields (Edit Mode) */}
                {editingRecipe && (
                  <div className="space-y-2.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Recipe Name</label>
                        <input
                          type="text"
                          value={editingRecipe.name}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, name: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Chemistry / Etchant</label>
                        <input
                          type="text"
                          value={editingRecipe.chemistry}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, chemistry: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Mechanism</label>
                        <select
                          value={editingRecipe.etchType}
                          onChange={(e) =>
                            setEditingRecipe({
                              ...editingRecipe,
                              etchType: e.target.value as EtchConfig['etchType'],
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="rie">RIE</option>
                          <option value="drie-bosch">Bosch DRIE</option>
                          <option value="wet-isotropic">Wet Isotropic</option>
                          <option value="wet-koh">Wet KOH (54.74°)</option>
                          <option value="ion-beam">Ion Mill</option>
                          <option value="ashing">O₂ Ashing</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Primary Material</label>
                        <select
                          value={editingRecipe.primaryMaterialId}
                          onChange={(e) =>
                            setEditingRecipe({
                              ...editingRecipe,
                              primaryMaterialId: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-500"
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Isotropy (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(editingRecipe.isotropy * 100)}
                          onChange={(e) =>
                            setEditingRecipe({
                              ...editingRecipe,
                              isotropy: Math.max(
                                0,
                                Math.min(1, (parseFloat(e.target.value) || 0) / 100)
                              ),
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Angle (°)</label>
                        <input
                          type="number"
                          min={15}
                          max={110}
                          step={0.5}
                          value={editingRecipe.sidewallAngle}
                          onChange={(e) =>
                            setEditingRecipe({
                              ...editingRecipe,
                              sidewallAngle: parseFloat(e.target.value) || 90,
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Gases / Bath</label>
                        <input
                          type="text"
                          value={editingRecipe.gases || ''}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, gases: e.target.value })
                          }
                          placeholder="SF6: 40 sccm"
                          className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Power</label>
                        <input
                          type="text"
                          value={editingRecipe.power || ''}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, power: e.target.value })
                          }
                          placeholder="200 W RF"
                          className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Pressure</label>
                        <input
                          type="text"
                          value={editingRecipe.pressure || ''}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, pressure: e.target.value })
                          }
                          placeholder="20 mTorr"
                          className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Temp</label>
                        <input
                          type="text"
                          value={editingRecipe.temperature || ''}
                          onChange={(e) =>
                            setEditingRecipe({ ...editingRecipe, temperature: e.target.value })
                          }
                          placeholder="22 °C"
                          className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Time-to-Depth & Selectivity Calculator */}
                {!editingRecipe && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Etch Time &amp; Selectivity Simulator</span>
                      </div>

                      {onApplyRecipeToStep && isActiveStepEtch && (
                        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setCalcMode('time-rate')}
                            className={`px-2 py-0.5 rounded font-medium ${
                              calcMode === 'time-rate'
                                ? 'bg-amber-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Apply Time-Rate
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalcMode('manual')}
                            className={`px-2 py-0.5 rounded font-medium ${
                              calcMode === 'manual'
                                ? 'bg-amber-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Apply Depth
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] text-slate-400">Duration (s):</label>
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={calcTimeSec}
                          onChange={(e) =>
                            setCalcTimeSec(Math.max(1, parseFloat(e.target.value) || 1))
                          }
                          className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({formatDurationCompact(calcTimeSec)})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 ml-auto">
                        {[15, 30, 60, 120, 300].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setCalcTimeSec(sec)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                              calcTimeSec === sec
                                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tool / Chemistry Metadata Strip */}
                    {(inspected.toolName || inspected.gases || inspected.temperature) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                        {inspected.toolName && <span>Tool: {inspected.toolName}</span>}
                        {inspected.gases && <span>Chem: {inspected.gases}</span>}
                        {inspected.power && <span>Power: {inspected.power}</span>}
                        {inspected.pressure && <span>Press: {inspected.pressure}</span>}
                        {inspected.temperature && <span>Temp: {inspected.temperature}</span>}
                      </div>
                    )}
                    {inspected.notes && (
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {inspected.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Per-Material Etch Rate & Selectivity Table */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
                    <span className="font-semibold text-slate-200">
                      Material Etch Rates &amp; Selectivity
                    </span>
                    {!editingRecipe && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showZeroRates}
                          onChange={(e) => setShowZeroRates(e.target.checked)}
                          className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                        />
                        <span>Show all {materials.length} materials</span>
                      </label>
                    )}
                  </div>

                  <div className="overflow-x-auto max-h-64 md:max-h-72 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Material</th>
                          <th className="py-2 px-3 text-right">
                            Rate ({editingRecipe ? 'nm/min' : thicknessUnit === 'um' ? 'µm/min' : 'nm/min'})
                          </th>
                          <th className="py-2 px-3 text-right">Selectivity</th>
                          {!editingRecipe && (
                            <th className="py-2 px-3 text-right">
                              Etched in {formatDurationCompact(calcTimeSec)}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {sortedMaterialsForTable.map((mat) => {
                          const primaryRate = getEtchRateNmMin(
                            inspected,
                            inspected.primaryMaterialId
                          );
                          const rate = getEtchRateNmMin(inspected, mat.id);
                          const isPrimary = mat.id === inspected.primaryMaterialId;
                          const etchedNm = (rate * calcTimeSec) / 60;

                          return (
                            <tr
                              key={mat.id}
                              className={`${
                                isPrimary ? 'bg-amber-950/25' : 'hover:bg-slate-900/50'
                              }`}
                            >
                              <td className="py-1.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                                    style={{ backgroundColor: mat.color }}
                                  />
                                  <span className="font-medium text-slate-200 truncate max-w-[150px]">
                                    {mat.name}
                                  </span>
                                  {isPrimary && (
                                    <span className="px-1 rounded bg-amber-500/20 text-[9px] font-mono text-amber-300">
                                      REF
                                    </span>
                                  )}
                                  {inspected.etchType === 'wet-koh' && rate > 0 && (
                                    <span
                                      className={`px-1 rounded text-[9px] font-mono ${
                                        isCrystallineKohMaterial(mat)
                                          ? 'bg-sky-500/20 text-sky-300'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                      title={
                                        isCrystallineKohMaterial(mat)
                                          ? 'Etches anisotropically along {111} crystal planes'
                                          : 'Etches isotropically in KOH / TMAH'
                                      }
                                    >
                                      {isCrystallineKohMaterial(mat) ? '{111}' : 'Iso'}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-1.5 px-3 text-right font-mono">
                                {editingRecipe ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step={5}
                                    value={rate}
                                    onChange={(e) => {
                                      const v = Math.max(0, parseFloat(e.target.value) || 0);
                                      setEditingRecipe({
                                        ...editingRecipe,
                                        rates: {
                                          ...editingRecipe.rates,
                                          [mat.id]: v,
                                        },
                                      });
                                    }}
                                    className="w-24 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-right text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                                  />
                                ) : rate <= 0 ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>0 (Stop)</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-100">
                                    {formatEtchRate(rate, thicknessUnit)}
                                  </span>
                                )}
                              </td>

                              <td className="py-1.5 px-3 text-right font-mono text-[11px]">
                                {isPrimary ? (
                                  <span className="text-amber-400">1.0:1</span>
                                ) : rate <= 0 ? (
                                  <span className="text-emerald-400 font-semibold">∞ : 1</span>
                                ) : (
                                  <span className="text-slate-300">
                                    {computeSelectivityRatio(primaryRate, rate)}
                                  </span>
                                )}
                              </td>

                              {!editingRecipe && (
                                <td className="py-1.5 px-3 text-right font-mono text-[11px]">
                                  {rate <= 0 ? (
                                    <span className="text-emerald-400/90">Etch Stop</span>
                                  ) : (
                                    <span className={isPrimary ? 'text-amber-300 font-semibold' : 'text-slate-300'}>
                                      {formatThickness(Math.round(etchedNm * 10) / 10, thicknessUnit)}
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Select an etch recipe or click "Add Custom Recipe".
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
