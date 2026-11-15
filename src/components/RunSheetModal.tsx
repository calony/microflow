/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ProcessFlow, ProcessStep } from '../types/microfab';
import { buildTimelineItems } from '../lib/blockUtils';
import { ThicknessUnit, formatThickness } from '../lib/units';
import { X, Copy, Check, Printer, FileText, Layers, CornerDownRight } from 'lucide-react';

interface RunSheetModalProps {
  flow: ProcessFlow;
  thicknessUnit?: ThicknessUnit;
  onClose: () => void;
}

export const RunSheetModal: React.FC<RunSheetModalProps> = ({
  flow,
  thicknessUnit = 'nm',
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const timelineItems = useMemo(() => buildTimelineItems(flow), [flow]);
  const moduleCount = useMemo(
    () => timelineItems.filter((item) => item.kind === 'block').length,
    [timelineItems]
  );

  const formatStepTypeLabel = (step: ProcessStep) => {
    if (step.type === 'cmp') return 'Grind/Polish/Planarize';
    if (step.type === 'bonding') return 'Wafer Bonding';
    return step.type;
  };

  const formatStepSideLabel = (step: ProcessStep) => {
    if (step.side === 'back') return 'Backside';
    if (step.side === 'both') return 'Both Sides';
    return 'Frontside';
  };

  const generateMarkdown = () => {
    const subLayers = flow.substrateLayers || [
      {
        id: 'sub_default',
        name: 'Bulk Silicon <100>',
        materialId: flow.substrateMaterialId || 'mat_si_sub',
        thickness: flow.substrateThickness || 3000,
      },
    ];
    const totalSubThick = subLayers.reduce((acc, l) => acc + (l.thickness || 0), 0);
    const subDesc = subLayers
      .map((l) => `${l.name || l.materialId} (${formatThickness(l.thickness, thicknessUnit)})`)
      .join(' / ');

    let md = `# Cleanroom Process Traveller: ${flow.title}\n\n`;
    md += `**Description**: ${flow.description}\n`;
    md += `**Starting Substrate**: ${subDesc} · Total: ${formatThickness(totalSubThick, thicknessUnit)} · Width: ${(flow.substrateWidth / 1000).toFixed(1)} µm\n`;
    if (moduleCount > 0) {
      md += `**Structure**: ${moduleCount} ${moduleCount === 1 ? 'Module' : 'Modules'} · ${flow.steps.length} Fabrication Steps\n`;
    }
    md += `\n| Step | Module / Process Operation | Tool / Equipment | Recipe & Parameters | Target / Metrology |\n`;
    md += `|---|---|---|---|---|\n`;
    md += `| 0 | Starting Substrate Stack | Substrate Preparation | Multi-layer stack: ${subDesc} | Cleanliness & layer thickness verification |\n`;

    const formatStepMdRow = (step: ProcessStep, idx: number, nestedInModule: boolean) => {
      const r = step.toolRecipe;
      const params = [
        r?.temperature ? `Temp: ${r.temperature}` : null,
        r?.gases ? `Gases: ${r.gases}` : null,
        r?.pressure ? `Pressure: ${r.pressure}` : null,
        r?.power ? `Power: ${r.power}` : null,
        r?.duration ? `Time: ${r.duration}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      const sideLabel = formatStepSideLabel(step);
      const statusSuffix = step.enabled ? '' : ' [SKIPPED]';
      const prefix = nestedInModule ? '↳ ' : '';
      return `| ${idx + 1} | ${prefix}${step.title} (${sideLabel})${statusSuffix} | ${r?.toolName || 'Standard Cleanroom Bench'} | ${params || 'Standard Recipe'} | ${r?.inspectionNotes || step.notes || 'Visual microscope inspection'} |\n`;
    };

    let modSeq = 0;
    timelineItems.forEach((item) => {
      if (item.kind === 'block') {
        modSeq += 1;
        const stepCount = item.steps.length;
        const rangeText =
          stepCount === 0
            ? 'No steps assigned'
            : stepCount === 1
            ? `Step ${item.steps[0].idx + 1}`
            : `Steps ${item.steps[0].idx + 1}–${item.steps[stepCount - 1].idx + 1}`;
        md += `| **M${modSeq}** | **${item.block.name}** | *Process Module* | *${item.block.description || rangeText}* | *${rangeText} (${stepCount} ${stepCount === 1 ? 'op' : 'ops'})* |\n`;
        item.steps.forEach(({ step, idx }) => {
          md += formatStepMdRow(step, idx, true);
        });
      } else {
        md += formatStepMdRow(item.step, item.idx, false);
      }
    });

    return md;
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const subLayers = flow.substrateLayers || [
    {
      id: 'sub_default',
      name: 'Bulk Silicon <100>',
      materialId: flow.substrateMaterialId || 'mat_si_sub',
      thickness: flow.substrateThickness || 3000,
    },
  ];
  const totalSubThickness = subLayers.reduce((acc, l) => acc + (l.thickness || 0), 0);

  const renderStepRow = (
    step: ProcessStep,
    idx: number,
    moduleAccentColor?: string
  ) => {
    const r = step.toolRecipe;
    const isNested = Boolean(moduleAccentColor);

    return (
      <tr
        key={step.id}
        className={`hover:bg-slate-900/50 transition-colors ${
          !step.enabled ? 'opacity-50' : ''
        } ${isNested ? 'bg-slate-950/35' : ''}`}
      >
        <td
          className="py-3 px-3 text-center font-mono font-semibold text-sky-400 relative"
          style={
            isNested
              ? { borderLeft: `3px solid ${moduleAccentColor}` }
              : undefined
          }
        >
          <div className="flex items-center justify-center gap-1">
            {isNested && (
              <CornerDownRight className="w-3 h-3 text-slate-500 shrink-0" />
            )}
            <span>{idx + 1}</span>
          </div>
        </td>
        <td className={`py-3 px-3 ${isNested ? 'pl-4' : ''}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-100">{step.title}</span>
            {!step.enabled && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono uppercase text-slate-400">
                Skipped
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1.5 flex-wrap mt-0.5">
            <span>{formatStepTypeLabel(step)}</span>
            <span>·</span>
            <span
              className={
                step.side === 'back'
                  ? 'text-amber-400 font-semibold'
                  : step.side === 'both'
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400'
              }
            >
              {formatStepSideLabel(step)}
            </span>
            {step.type === 'lithography' && step.lithography?.maskName && (
              <>
                <span>·</span>
                <span className="text-amber-400/90 font-medium">
                  Reticle: {step.lithography.maskName}
                </span>
              </>
            )}
            {step.type === 'bonding' && step.bonding && (
              <>
                <span>·</span>
                <span className="text-indigo-400/90 font-medium">
                  {step.bonding.sourceType === 'imported-flow'
                    ? step.bonding.importedFlowTitle ||
                      step.bonding.importedFlow?.title ||
                      'Imported Flow'
                    : 'Custom Substrate'}
                </span>
              </>
            )}
          </div>
        </td>
        <td className="py-3 px-3 font-mono text-slate-300">
          {r?.toolName || 'Cleanroom Station'}
        </td>
        <td className="py-3 px-3">
          <div className="space-y-0.5 font-mono text-[11px] text-slate-300">
            {r?.gases && <div>Gases: {r.gases}</div>}
            {r?.temperature && <div>Temp: {r.temperature}</div>}
            {r?.power && <div>Power: {r.power}</div>}
            {r?.pressure && <div>Pressure: {r.pressure}</div>}
            {r?.duration && <div>Duration: {r.duration}</div>}
            {!r?.gases &&
              !r?.temperature &&
              !r?.power &&
              !r?.pressure &&
              !r?.duration && (
                <span className="text-slate-500">Standard cleanroom recipe</span>
              )}
          </div>
        </td>
        <td className="py-3 px-3">
          <div className="text-slate-300">
            {r?.inspectionNotes || step.notes || 'Optical microscope check'}
          </div>
        </td>
        <td className="py-3 px-3 text-center">
          <div className="w-12 h-6 border border-slate-700 rounded bg-slate-950/60 mx-auto" />
        </td>
      </tr>
    );
  };

  let renderedModuleIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-5xl max-h-[94dvh] sm:max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <FileText className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                Cleanroom Traveller & SOP Run-Card
              </h2>
              <p className="hidden sm:block text-xs text-slate-400">
                Printable fabrication traveller sheet organized by process module hierarchy & metrology checkpoints
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Copy Markdown</span>
                  <span className="sm:hidden">Copy MD</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Traveller</span>
              <span className="sm:hidden">Print</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Run Card Sheet */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-950/50 space-y-4 font-sans text-xs">
          {/* Metadata Card */}
          <div className="p-3 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <span className="text-[11px] text-slate-400 block">Process Title</span>
                <span className="font-semibold text-white text-sm">{flow.title}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Starting Substrate Stack</span>
                <span className="font-mono text-emerald-400 font-semibold block">
                  {subLayers.length} {subLayers.length === 1 ? 'Layer' : 'Layers'} · {formatThickness(totalSubThickness, thicknessUnit)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono truncate block">
                  {subLayers.map((l) => l.name || l.materialId).join(' / ')}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Traveller Hierarchy</span>
                <span className="font-mono text-sky-400 block">
                  {moduleCount > 0
                    ? `${moduleCount} ${moduleCount === 1 ? 'Module' : 'Modules'} · ${flow.steps.length} Steps`
                    : `Substrate + ${flow.steps.length} fabrication steps`}
                </span>
              </div>
            </div>

            {moduleCount > 0 && (
              <div className="pt-2.5 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                  <Layers className="w-3 h-3 text-sky-400" />
                  <span>Module Sequence:</span>
                </span>
                {timelineItems.map((item, idx) => {
                  if (item.kind !== 'block') return null;
                  const count = item.steps.length;
                  const rangeLabel =
                    count === 0
                      ? '0 steps'
                      : count === 1
                      ? `Step ${item.steps[0].idx + 1}`
                      : `Steps ${item.steps[0].idx + 1}–${item.steps[count - 1].idx + 1}`;
                  return (
                    <span
                      key={item.block.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-200"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.block.color || '#0ea5e9' }}
                      />
                      <span className="font-medium truncate max-w-[180px]">
                        {item.block.name}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        ({rangeLabel})
                      </span>
                      {idx < timelineItems.length - 1 && (
                        <span className="sr-only">,</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hierarchical SOP Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-14 text-center">#</th>
                  <th className="py-2.5 px-3">Module / Process Operation</th>
                  <th className="py-2.5 px-3">Equipment / Tool</th>
                  <th className="py-2.5 px-3">Recipe & Parameter Specs</th>
                  <th className="py-2.5 px-3">Metrology & Quality Target</th>
                  <th className="py-2.5 px-3 w-20 text-center">Sign-off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {timelineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 px-4 text-center text-slate-500 text-xs"
                    >
                      No fabrication steps defined in this process flow yet.
                    </td>
                  </tr>
                ) : (
                  timelineItems.map((item) => {
                    if (item.kind === 'step') {
                      return renderStepRow(item.step, item.idx);
                    }

                    renderedModuleIndex += 1;
                    const modNum = renderedModuleIndex;
                    const accentColor = item.block.color || '#0ea5e9';
                    const stepCount = item.steps.length;
                    const rangeLabel =
                      stepCount === 0
                        ? 'Empty Module'
                        : stepCount === 1
                        ? `Step ${item.steps[0].idx + 1} · 1 Operation`
                        : `Steps ${item.steps[0].idx + 1}–${
                            item.steps[stepCount - 1].idx + 1
                          } · ${stepCount} Operations`;

                    return (
                      <React.Fragment key={item.block.id}>
                        {/* Module Group Header Row */}
                        <tr className="bg-slate-900/95">
                          <td
                            colSpan={6}
                            className="py-2.5 px-3"
                            style={{ borderLeft: `4px solid ${accentColor}` }}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-slate-950 shrink-0"
                                  style={{ backgroundColor: accentColor }}
                                >
                                  M{modNum}
                                </span>
                                <span className="font-bold text-xs sm:text-[13px] text-white truncate">
                                  {item.block.name}
                                </span>
                                {item.block.description && (
                                  <span className="hidden sm:inline text-[11px] text-slate-400 truncate">
                                    — {item.block.description}
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 shrink-0">
                                {rangeLabel}
                              </span>
                            </div>
                            {item.block.description && (
                              <div className="sm:hidden text-[11px] text-slate-400 mt-1">
                                {item.block.description}
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Nested Steps inside Module */}
                        {item.steps.length === 0 ? (
                          <tr className="bg-slate-950/35">
                            <td
                              colSpan={6}
                              className="py-2.5 px-6 text-[11px] italic text-slate-500"
                              style={{ borderLeft: `3px solid ${accentColor}` }}
                            >
                              No fabrication operations assigned to this module yet.
                            </td>
                          </tr>
                        ) : (
                          item.steps.map(({ step, idx }) =>
                            renderStepRow(step, idx, accentColor)
                          )
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
