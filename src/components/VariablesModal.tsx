/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { DesignVariable, ProcessFlow, VariableUnit } from '../types/microfab';
import {
  VARIABLE_PRESETS,
  countVariableUsages,
  formatVariableValue,
  fromCanonicalValue,
  removeVariableFromFlow,
  renameVariableInFlow,
  resolveFlowParameters,
  resolveVariables,
  sanitizeVariableName,
  suggestVariableName,
  toCanonicalValue,
} from '../lib/variableUtils';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Variable as VariableIcon,
  Sparkles,
  Link2,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface VariablesModalProps {
  flow: ProcessFlow;
  isOpen: boolean;
  onClose: () => void;
  onUpdateFlow: (updated: ProcessFlow) => void;
}

export const VariablesModal: React.FC<VariablesModalProps> = ({
  flow,
  isOpen,
  onClose,
  onUpdateFlow,
}) => {
  const variables = useMemo(() => flow.variables || [], [flow.variables]);
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [expandedUsages, setExpandedUsages] = useState<Record<string, boolean>>({});
  const [showSyntaxHelp, setShowSyntaxHelp] = useState<boolean>(false);

  const { diagnostics } = useMemo(
    () => resolveVariables(variables, flow.substrateWidth || 10000),
    [variables, flow.substrateWidth]
  );

  const usageMap = useMemo(() => countVariableUsages(flow), [flow]);

  const totalBindings = useMemo(() => {
    let count = 0;
    for (const u of Object.values(usageMap)) count += u.count;
    return count;
  }, [usageMap]);

  if (!isOpen) return null;

  const commitVariables = (nextVars: DesignVariable[], baseFlow: ProcessFlow = flow) => {
    const updated = resolveFlowParameters({
      ...baseFlow,
      variables: nextVars,
    });
    onUpdateFlow(updated);
  };

  const handleAddVariable = () => {
    const name = suggestVariableName('param', variables);
    const newVar: DesignVariable = {
      id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      value: 500,
      unit: 'nm',
      description: '',
    };
    commitVariables([...variables, newVar]);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = VARIABLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const existingNames = new Set(variables.map((v) => v.name));
    const toAdd: DesignVariable[] = [];
    preset.variables.forEach((pv, idx) => {
      if (!existingNames.has(pv.name)) {
        toAdd.push({
          ...pv,
          id: `var_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        });
      }
    });
    if (toAdd.length > 0) {
      commitVariables([...variables, ...toAdd]);
    }
  };

  const handleDuplicateVariable = (v: DesignVariable) => {
    const nextName = suggestVariableName(`${v.name}_copy`, variables);
    const dup: DesignVariable = {
      ...v,
      id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: nextName,
    };
    commitVariables([...variables, dup]);
  };

  const handleDeleteVariable = (v: DesignVariable) => {
    const cleaned = removeVariableFromFlow(flow, v.name);
    onUpdateFlow(resolveFlowParameters(cleaned));
  };

  const handleCommitName = (v: DesignVariable, rawDraft: string) => {
    const cleaned = sanitizeVariableName(rawDraft);
    const nextEditing = { ...editingNames };
    delete nextEditing[v.id];
    setEditingNames(nextEditing);

    if (cleaned === v.name) return;
    const conflict = variables.some((other) => other.id !== v.id && other.name === cleaned);
    const finalName = conflict ? suggestVariableName(cleaned, variables) : cleaned;
    const renamedFlow = renameVariableInFlow(flow, v.name, finalName);
    onUpdateFlow(resolveFlowParameters(renamedFlow));
  };

  const handleUpdateVar = (id: string, patch: Partial<DesignVariable>) => {
    const nextVars = variables.map((v) => (v.id === id ? { ...v, ...patch } : v));
    commitVariables(nextVars);
  };

  const handleChangeUnit = (v: DesignVariable, nextUnit: VariableUnit) => {
    let nextVal = v.value;
    if (v.unit === 'nm' && nextUnit === 'um') {
      nextVal = Math.round((v.value / 1000) * 100000) / 100000;
    } else if (v.unit === 'um' && nextUnit === 'nm') {
      nextVal = Math.round(v.value * 1000 * 100) / 100;
    }
    handleUpdateVar(v.id, { unit: nextUnit, value: nextVal });
  };

  const getSliderBounds = (v: DesignVariable) => {
    if (v.unit === 'um') {
      const max = Math.max(10, Math.ceil(Math.abs(v.value) * 2.5));
      return { min: 0, max, step: 0.05 };
    }
    if (v.unit === 'nm') {
      const max = Math.max(2000, Math.ceil((Math.abs(v.value) * 2.5) / 100) * 100);
      return { min: 0, max, step: 10 };
    }
    if (v.unit === 'deg') {
      return { min: 45, max: 110, step: 0.5 };
    }
    if (v.unit === 'sec') {
      const max = Math.max(300, Math.ceil(Math.abs(v.value) * 2.5));
      return { min: 1, max, step: 1 };
    }
    const max = Math.max(10, Math.ceil(Math.abs(v.value) * 2.5));
    return { min: 0, max, step: 0.1 };
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/35 backdrop-blur-[1px]">
      <div className="flex-1" onClick={onClose} />

      <aside className="relative w-full sm:w-[480px] max-w-full h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/35 flex items-center justify-center text-violet-300 shrink-0">
              <VariableIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate">
                  Design Variables
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 font-mono text-[10px] font-semibold">
                  {variables.length}
                </span>
                {totalBindings > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                    {totalBindings} bound
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Parametrize wafer, films, etches, mask windows &amp; GDS shapes live
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Close Variables Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 shrink-0">
          <button
            type="button"
            onClick={handleAddVariable}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Variable</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSyntaxHelp((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] transition-colors ${
                showSyntaxHelp
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Expression syntax & built-in functions"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Syntax</span>
            </button>
          </div>
        </div>

        {/* Collapsible Syntax Reference */}
        {showSyntaxHelp && (
          <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-300 space-y-1.5 shrink-0">
            <div className="font-semibold text-sky-300 flex items-center justify-between">
              <span>Parametric Expression Guide</span>
              <span className="text-[10px] font-mono text-slate-400">
                Built-in: WAFER_W = {flow.substrateWidth} nm
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              Length variables (<span className="font-mono text-slate-200">nm</span> &amp;{' '}
              <span className="font-mono text-slate-200">µm</span>) share canonical nanometer math so{' '}
              <span className="font-mono text-violet-300">gate_cd * 2 + 50nm</span> or{' '}
              <span className="font-mono text-violet-300">WAFER_W / 2 - 0.5um</span> work seamlessly.
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              {['+ - * / ^', '500nm', '1.2um', 'WAFER_W', 'PI', 'min(a,b)', 'max(a,b)', 'clamp(x,lo,hi)'].map(
                (tok) => (
                  <span
                    key={tok}
                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300"
                  >
                    {tok}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* Variables List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {variables.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 text-center space-y-3">
              <div className="w-10 h-10 mx-auto rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                <VariableIcon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-white">No Design Variables Yet</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Create variables here or click <span className="font-mono text-violet-300 italic font-bold">fx</span> next to any thickness, mask aperture, wafer width, or GDS shape property to parametrize your geometry.
                </p>
              </div>
              <div className="pt-2 space-y-1.5 text-left">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span>Quick Starter Parameter Sets</span>
                </span>
                {VARIABLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/40 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100">{preset.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{preset.description}</div>
                    </div>
                    <span className="text-[10px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 rounded shrink-0">
                      +{preset.variables.length} vars
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            variables.map((v) => {
              const diag = diagnostics[v.id];
              const usage = usageMap[v.name];
              const isFormula = v.expression !== undefined;
              const nameDraft = editingNames[v.id] ?? v.name;
              const bounds = getSliderBounds(v);
              const canonicalNm =
                diag?.canonicalValue ?? toCanonicalValue(v.value, v.unit);
              const isUsageOpen = Boolean(expandedUsages[v.id]);

              return (
                <div
                  key={v.id}
                  className={`p-3 rounded-xl bg-slate-950/80 border space-y-2.5 transition-colors ${
                    diag?.error
                      ? 'border-rose-500/50'
                      : usage?.count
                      ? 'border-violet-500/35'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Top Row: Name, Unit, Mode Toggle, Actions */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) =>
                        setEditingNames((prev) => ({ ...prev, [v.id]: e.target.value }))
                      }
                      onBlur={() => handleCommitName(v, nameDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 focus:border-violet-500 text-violet-300 font-mono font-semibold text-xs focus:outline-none"
                      title="Variable identifier (used in formulas)"
                    />

                    <select
                      value={v.unit}
                      onChange={(e) => handleChangeUnit(v, e.target.value as VariableUnit)}
                      className="px-1.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                      title="Variable unit"
                    >
                      <option value="nm">nm</option>
                      <option value="um">µm</option>
                      <option value="deg">deg</option>
                      <option value="sec">sec</option>
                      <option value="none">scalar</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateVar(v.id, {
                          expression: isFormula ? undefined : String(v.value),
                        })
                      }
                      className={`px-2 py-1 rounded-lg border font-mono text-[10px] font-bold italic transition-colors shrink-0 ${
                        isFormula
                          ? 'bg-violet-600/25 border-violet-500/60 text-violet-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-violet-300'
                      }`}
                      title={
                        isFormula
                          ? 'Switch to direct numeric value & slider'
                          : 'Switch to formula expression'
                      }
                    >
                      fx
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicateVariable(v)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                      title="Duplicate variable"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVariable(v)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                      title={
                        usage?.count
                          ? `Delete variable (unbinds ${usage.count} reference${usage.count > 1 ? 's' : ''})`
                          : 'Delete variable'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Value / Formula Editor */}
                  {isFormula ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-violet-400 shrink-0">=</span>
                        <input
                          type="text"
                          value={v.expression ?? ''}
                          onChange={(e) =>
                            handleUpdateVar(v.id, { expression: e.target.value })
                          }
                          placeholder="e.g. gate_cd * 2 + 100nm"
                          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 focus:border-violet-500 text-slate-100 font-mono text-xs focus:outline-none"
                        />
                        <span className="text-[11px] font-mono text-emerald-300 font-semibold shrink-0">
                          {diag?.error
                            ? 'ERR'
                            : formatVariableValue(diag?.value ?? v.value, v.unit)}
                        </span>
                      </div>
                      {diag?.error && (
                        <div className="flex items-center gap-1 text-[10px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded px-2 py-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{diag.error}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step={v.unit === 'um' ? '0.05' : v.unit === 'none' ? '0.1' : '1'}
                          value={v.value}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value);
                            if (Number.isFinite(parsed)) {
                              handleUpdateVar(v.id, { value: parsed });
                            }
                          }}
                          className="w-24 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 focus:border-violet-500 text-slate-100 font-mono text-xs focus:outline-none"
                        />
                        <input
                          type="range"
                          min={bounds.min}
                          max={bounds.max}
                          step={bounds.step}
                          value={Math.min(bounds.max, Math.max(bounds.min, v.value))}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (Number.isFinite(val)) {
                              handleUpdateVar(v.id, { value: val });
                            }
                          }}
                          className="flex-1 accent-violet-500 min-w-0"
                        />
                        {(v.unit === 'nm' || v.unit === 'um') && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 w-16 text-right">
                            {v.unit === 'nm'
                              ? `${(canonicalNm / 1000).toFixed(2)} µm`
                              : `${Math.round(canonicalNm)} nm`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Description & Bindings Footer */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <input
                      type="text"
                      value={v.description || ''}
                      onChange={(e) =>
                        handleUpdateVar(v.id, { description: e.target.value })
                      }
                      placeholder="Optional note (e.g. Gate critical dimension)"
                      className="flex-1 min-w-0 bg-transparent text-[10.5px] text-slate-400 placeholder:text-slate-600 focus:text-slate-200 focus:outline-none"
                    />

                    {usage && usage.count > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedUsages((prev) => ({
                            ...prev,
                            [v.id]: !prev[v.id],
                          }))
                        }
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] shrink-0 hover:bg-emerald-500/20"
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        <span>
                          {usage.count} {usage.count === 1 ? 'binding' : 'bindings'}
                        </span>
                        {isUsageOpen ? (
                          <ChevronDown className="w-2.5 h-2.5" />
                        ) : (
                          <ChevronRight className="w-2.5 h-2.5" />
                        )}
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600 font-mono shrink-0">
                        Unused
                      </span>
                    )}
                  </div>

                  {isUsageOpen && usage && usage.targets.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-1">
                      {usage.targets.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-mono"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Additional Starter Presets dropdown when user already has variables */}
          {variables.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span>Add Preset Variable Pack</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/40 text-[10.5px] text-slate-300 hover:text-violet-200 transition-colors"
                    title={preset.description}
                  >
                    + {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <span className="text-slate-400 truncate">
            Live-linked to cross-section &amp; GDS geometry
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      </aside>
    </div>
  );
};
