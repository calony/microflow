/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { ProcessFlow } from '../types/microfab';
import { PRESET_PROCESS_FLOWS } from '../lib/presets';
import { X, Cpu, Plus, Upload, AlertTriangle } from 'lucide-react';

interface PresetPickerModalProps {
  onSelectPreset: (preset: ProcessFlow) => void;
  onImportFlow?: (imported: ProcessFlow) => void;
  onClose: () => void;
}

export const PresetPickerModal: React.FC<PresetPickerModalProps> = ({
  onSelectPreset,
  onImportFlow,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleLoadBlank = () => {
    const blank: ProcessFlow = {
      id: `flow_${Date.now()}`,
      title: 'Custom Cleanroom Fabrication Flow',
      description: 'Custom microfabrication process flow sequence.',
      substrateWidth: 10000,
      substrateThickness: 3000,
      substrateMaterialId: 'mat_si_sub',
      substrateLayers: [
        {
          id: `sub_layer_${Date.now()}`,
          name: 'Bulk Silicon <100>',
          materialId: 'mat_si_sub',
          thickness: 3000,
        },
      ],
      materials: [...PRESET_PROCESS_FLOWS[0].materials],
      blocks: [],
      steps: [],
    };
    onSelectPreset(blank);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.steps) && parsed.substrateWidth) {
          if (onImportFlow) {
            onImportFlow(parsed as ProcessFlow);
          } else {
            onSelectPreset(parsed as ProcessFlow);
          }
          onClose();
        } else {
          setImportError('Invalid process flow JSON: missing steps or substrateWidth.');
        }
      } catch {
        setImportError('Failed to parse JSON file. Please select a valid MicroFlow recipe JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-4xl max-h-[94dvh] sm:max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white truncate">
              Microfabrication Process Flow Templates
            </h2>
            <p className="hidden sm:block text-xs text-slate-400">
              Start blank, import a saved JSON recipe, or load a cleanroom template
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          className="hidden"
        />

        {importError && (
          <div className="mx-3 sm:mx-6 mt-3 px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{importError}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="text-rose-300 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Preset Cards Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-950/40">
          {/* 1. Blank Recipe Option */}
          <div
            onClick={handleLoadBlank}
            className="group p-4 rounded-xl border border-dashed border-slate-700 hover:border-sky-500/80 bg-slate-950/40 hover:bg-slate-900/60 cursor-pointer transition-all flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                <Plus className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-sm group-hover:text-sky-300 transition-colors">
                  Blank Process Flow
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                  Start from scratch with a bare silicon wafer substrate
                </p>
              </div>
            </div>
            <span className="text-[11px] text-sky-400 font-semibold group-hover:underline shrink-0">
              Start Blank →
            </span>
          </div>

          {/* 2. Import Flow Option */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group p-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/40 hover:bg-slate-900/60 cursor-pointer transition-all flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Upload className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-sm group-hover:text-indigo-300 transition-colors">
                  Import Process Flow
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                  Load a saved MicroFlow recipe file (.json) from disk
                </p>
              </div>
            </div>
            <span className="text-[11px] text-indigo-400 font-semibold group-hover:underline shrink-0">
              Choose JSON →
            </span>
          </div>

          {PRESET_PROCESS_FLOWS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => onSelectPreset(preset)}
              className="group p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-sky-500/80 hover:bg-slate-850 cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <Cpu className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                    {preset.steps.length} steps
                  </span>
                </div>

                <h3 className="font-semibold text-white text-sm group-hover:text-sky-300 transition-colors">
                  {preset.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {preset.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono">
                  Wafer: {(preset.substrateWidth / 1000).toFixed(1)} µm slice
                </span>
                <span className="text-sky-400 font-semibold group-hover:underline">
                  Load Template →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
