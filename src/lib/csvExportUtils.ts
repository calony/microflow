/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProcessFlow,
  ProcessStep,
  SubstrateLayer,
} from '../types/microfab';
import { getMaterialById } from './materials';
import { buildTimelineItems } from './blockUtils';
import { getActiveStepVariant } from './variantUtils';
import { resolveFlowParameters } from './variableUtils';
import { slugifyFilename } from './batchExportUtils';

export const PROCESS_CSV_HEADERS = [
  'Flow_ID',
  'Flow_Title',
  'Wafer_Width_um',
  'Record_Type',
  'Sequence_Step',
  'Status',
  'Module_Code',
  'Module_Name',
  'Step_ID',
  'Step_Title',
  'Operation_Category',
  'Operation_Method',
  'Wafer_Side',
  'Milestone_Label',
  'Active_Variant',
  'Material_Name',
  'Material_Formula',
  'Target_Thickness_Depth_nm',
  'Target_Thickness_Depth_um',
  'Stop_Or_Interface_Material',
  'Mask_Reticle',
  'Mask_Polarity',
  'Feature_Count',
  'Process_Parameters',
  'Equipment_Tool',
  'Gases_Chemistry',
  'Temperature',
  'Pressure',
  'Power',
  'Duration',
  'Target_Rate',
  'Metrology_Inspection',
  'Engineering_Notes',
  'Variable_Bindings',
] as const;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith(' ') ||
    str.endsWith(' ')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatNmToUm(nm: number | undefined): string {
  if (nm === undefined || !Number.isFinite(nm)) return '';
  return (nm / 1000).toFixed(4).replace(/\.?0+$/, '');
}

function formatNumNm(nm: number | undefined): string {
  if (nm === undefined || !Number.isFinite(nm)) return '';
  return String(Math.round(nm * 1000) / 1000);
}

function formatSideLabel(side?: ProcessStep['side']): string {
  if (side === 'back') return 'Backside (-Z)';
  if (side === 'both') return 'Double-Sided (±Z)';
  return 'Frontside (+Z)';
}

function formatBindings(bindings?: Record<string, string>): string {
  if (!bindings) return '';
  const entries = Object.entries(bindings).filter(([, expr]) => Boolean(expr));
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractStepCsvDetails(
  step: ProcessStep,
  flow: ProcessFlow
): {
  method: string;
  materialName: string;
  materialFormula: string;
  thicknessNm?: number;
  stopOrInterface: string;
  maskReticle: string;
  maskPolarity: string;
  featureCount: string;
  params: string;
  chemistryFallback: string;
} {
  const mats = flow.materials;
  const resolveMat = (matId?: string) => {
    if (!matId) return null;
    return getMaterialById(mats, matId);
  };

  let method = '';
  let materialName = '';
  let materialFormula = '';
  let thicknessNm: number | undefined;
  let stopOrInterface = '';
  let maskReticle = '';
  let maskPolarity = '';
  let featureCount = '';
  const paramList: string[] = [];
  let chemistryFallback = '';

  switch (step.type) {
    case 'deposition': {
      const dep = step.deposition;
      const mat = resolveMat(step.materialId);
      method = dep?.method || dep?.depositionType || 'Deposition';
      materialName = mat?.name || '';
      materialFormula = mat?.formula || '';
      thicknessNm = dep?.thickness ?? step.thickness;
      if (dep) {
        paramList.push(`mode=${dep.depositionType}`);
        if (dep.stepCoverage !== undefined) paramList.push(`step_coverage=${dep.stepCoverage}%`);
        if (dep.tiltAngle) paramList.push(`tilt=${dep.tiltAngle}deg`);
        if (dep.planarization !== undefined) paramList.push(`planarization=${dep.planarization}%`);
        if (dep.laminationSag !== undefined) paramList.push(`lamination_sag=${dep.laminationSag}%`);
        if (dep.platingSelective) {
          paramList.push(`selective_seed=${dep.platingSeedScope || 'conductive'}`);
        }
        if (dep.convexCornerEffect) {
          paramList.push(`corner_breadloaf=${dep.convexCornerStrength ?? 0.6}`);
        }
      }
      break;
    }

    case 'lithography': {
      const litho = step.lithography;
      const mat = resolveMat(litho?.resistMaterialId || step.materialId);
      method = litho?.exposureMethod || 'Photolithography';
      materialName = mat?.name || '';
      materialFormula = mat?.formula || '';
      thicknessNm = litho?.resistThickness ?? step.thickness;
      const linkedMask = litho?.maskId
        ? flow.masks?.find((m) => m.id === litho.maskId)
        : undefined;
      maskReticle = linkedMask
        ? linkedMask.layerCode
          ? `${linkedMask.name} (${linkedMask.layerCode})`
          : linkedMask.name
        : litho?.maskName || '';
      if (litho) {
        maskPolarity = `${litho.polarity} (${litho.maskField || 'dark-field'})`;
        featureCount = String(litho.windows?.length ?? 0);
        paramList.push(`coat=${litho.coatMethod || 'spin-coat'}`);
        paramList.push(`sidewall=${litho.sidewallAngle}deg`);
        if (litho.coatMethod === 'lor-bilayer') {
          paramList.push(`lor_thickness=${litho.lorThickness ?? 400}nm`);
          paramList.push(`lor_undercut=${litho.lorUndercut ?? 350}nm`);
        }
        if (litho.windows && litho.windows.length > 0) {
          const winDesc = litho.windows
            .map((w) => `[${formatNumNm(w.xStart)}..${formatNumNm(w.xEnd)}nm]`)
            .join(',');
          paramList.push(`windows=${winDesc}`);
        }
      }
      break;
    }

    case 'etch': {
      const etch = step.etch;
      method = etch?.etchType || 'Etch';
      if (etch?.targetMaterialId && etch.targetMaterialId !== 'all') {
        const mat = resolveMat(etch.targetMaterialId);
        materialName = mat?.name || etch.targetMaterialId;
        materialFormula = mat?.formula || '';
      } else {
        materialName = 'All Exposed Materials';
      }
      thicknessNm = etch?.depth ?? step.thickness;
      if (etch?.stopLayerMaterialId) {
        stopOrInterface = resolveMat(etch.stopLayerMaterialId)?.name || etch.stopLayerMaterialId;
      }
      if (etch) {
        paramList.push(`isotropy=${etch.isotropy}`);
        paramList.push(`sidewall=${etch.sidewallAngle}deg`);
        if (etch.selectivityToMask !== undefined) {
          paramList.push(`mask_selectivity=${etch.selectivityToMask}:1`);
        }
        if (etch.rateMode === 'time-rate') {
          paramList.push(`rate_mode=time-rate (${etch.etchTimeSec ?? 60}s)`);
        }
        if (etch.scallopEffect) {
          paramList.push(
            `scallops=${etch.scallopDepth ?? 45}nm/${etch.scallopPitch ?? 200}nm`
          );
        }
        if (etch.ardeEnabled) {
          paramList.push(`arde_k=${etch.ardeStrength ?? 0.5}`);
        }
      }
      break;
    }

    case 'strip':
    case 'liftoff': {
      const strip = step.strip;
      method =
        strip?.stripType === 'sacrificial-release'
          ? 'Sacrificial Release'
          : step.type === 'liftoff' || strip?.stripType === 'metal-liftoff'
          ? 'Metal Lift-Off'
          : 'Resist Strip';
      if (strip?.targetMaterialId) {
        const mat = resolveMat(strip.targetMaterialId);
        materialName = mat?.name || '';
        materialFormula = mat?.formula || '';
      } else if (step.materialId) {
        const mat = resolveMat(step.materialId);
        materialName = mat?.name || '';
        materialFormula = mat?.formula || '';
      }
      chemistryFallback = strip?.solvent || '';
      if (strip?.stripType === 'sacrificial-release') {
        const scope = strip.releaseScope || 'all';
        paramList.push(`release_scope=${scope}`);
        if (scope === 'regions') {
          const keepCount = strip.releaseRegions?.length ?? 0;
          featureCount = String(keepCount);
          if (strip.releaseRegions && strip.releaseRegions.length > 0) {
            const regStr = strip.releaseRegions
              .map((r) => `[${formatNumNm(r.xStart)}..${formatNumNm(r.xEnd)}nm]`)
              .join(',');
            paramList.push(`protected_keep_regions=${regStr}`);
          }
        }
      }
      break;
    }

    case 'cmp': {
      const cmp = step.cmp;
      method =
        cmp?.operation === 'grind'
          ? 'Wafer Backgrind'
          : cmp?.operation === 'polish'
          ? 'Fine Polish'
          : 'CMP Planarization';
      if (cmp?.mode === 'stop-on-layer' && cmp.stopMaterialId) {
        stopOrInterface = resolveMat(cmp.stopMaterialId)?.name || cmp.stopMaterialId;
      }
      thicknessNm =
        cmp?.mode === 'target-height' ? cmp.targetHeight : cmp?.depth ?? step.thickness;
      if (cmp) {
        paramList.push(`cmp_mode=${cmp.mode}`);
        if (cmp.dishing !== undefined) paramList.push(`dishing=${cmp.dishing}%`);
        if (cmp.erosion !== undefined) paramList.push(`erosion=${cmp.erosion}%`);
      }
      break;
    }

    case 'anneal': {
      method = 'Thermal Anneal / Drive-In';
      break;
    }

    case 'bonding': {
      const b = step.bonding;
      method = b ? `${b.bondingMethod} bond (${b.sourceType})` : 'Wafer Bonding';
      if (b?.sourceType === 'imported-flow') {
        materialName =
          b.importedFlowTitle || b.importedFlow?.title || 'Imported Process Wafer';
      } else if (b?.customLayers && b.customLayers.length > 0) {
        materialName = b.customLayers
          .map((l) => resolveMat(l.materialId)?.name || l.name || l.materialId)
          .join(' / ');
        thicknessNm = b.customLayers.reduce((acc, l) => acc + (l.thickness || 0), 0);
      }
      if (b?.interfaceLayer?.enabled) {
        const ifaceMat = resolveMat(b.interfaceLayer.materialId);
        stopOrInterface = `${ifaceMat?.name || b.interfaceLayer.materialId} (${b.interfaceLayer.thickness} nm)`;
      }
      if (b) {
        paramList.push(`incoming_face=${b.incomingFace || 'front'}`);
        if (b.mirrorHorizontal) paramList.push('mirror_x=true');
        if (b.widthMismatchMode) paramList.push(`width_mismatch=${b.widthMismatchMode}`);
        if (b.widthAlignment) paramList.push(`alignment=${b.widthAlignment}`);
        if (b.widthPaddingMode) paramList.push(`padding=${b.widthPaddingMode}`);
      }
      break;
    }

    case 'dicing': {
      const d = step.dicing;
      method = d ? `${d.method} dicing` : 'Wafer Dicing';
      thicknessNm = d?.cutMode === 'partial-depth' ? d.cutDepth : undefined;
      if (d) {
        featureCount = String(d.streets?.length ?? 0);
        paramList.push(`cut_mode=${d.cutMode}`);
        paramList.push(`kerf=${d.kerfWidth}nm`);
        if (d.sidewallAngle !== undefined) paramList.push(`sidewall=${d.sidewallAngle}deg`);
        if (d.tapeOvercut !== undefined) paramList.push(`tape_overcut=${d.tapeOvercut}nm`);
        if (d.streets && d.streets.length > 0) {
          paramList.push(
            `streets_x=${d.streets.map((s) => `${formatNumNm(s.xCenter)}nm`).join(',')}`
          );
        }
      }
      break;
    }

    case 'tape-frame': {
      const tf = step.tapeFrame;
      method = tf?.action === 'demount' ? 'Demount Tape Frame' : 'Mount Tape Frame';
      if (tf?.tapeMaterialId) {
        const mat = resolveMat(tf.tapeMaterialId);
        materialName = mat?.name || tf.tapeMaterialId;
        materialFormula = mat?.formula || '';
      }
      thicknessNm = tf?.action === 'mount' ? tf.thickness : undefined;
      if (tf) {
        paramList.push(`conformality=${tf.conformality}`);
        paramList.push(`show_frame=${tf.showFrame}`);
      }
      break;
    }

    default:
      method = step.type;
  }

  return {
    method,
    materialName,
    materialFormula,
    thicknessNm,
    stopOrInterface,
    maskReticle,
    maskPolarity,
    featureCount,
    params: paramList.join('; '),
    chemistryFallback,
  };
}

function buildSubstrateRow(
  layer: SubstrateLayer,
  idx: number,
  flow: ProcessFlow,
  waferWidthUm: string
): string[] {
  const mat = getMaterialById(flow.materials, layer.materialId);
  return [
    flow.id,
    flow.title,
    waferWidthUm,
    'Substrate_Layer',
    `0.${idx + 1}`,
    'Enabled',
    '',
    'Starting Substrate',
    layer.id,
    layer.name || mat.name,
    'substrate',
    'Starting Wafer Layer',
    'N/A',
    '',
    '',
    mat.name,
    mat.formula || '',
    formatNumNm(layer.thickness),
    formatNmToUm(layer.thickness),
    '',
    '',
    '',
    '',
    `substrate_layer_index=${idx + 1}`,
    'Wafer Inventory',
    '',
    '',
    '',
    '',
    '',
    '',
    'Incoming substrate thickness & surface verification',
    '',
    formatBindings(layer.paramBindings),
  ];
}

function buildStepRow(
  step: ProcessStep,
  stepIdx: number,
  flow: ProcessFlow,
  waferWidthUm: string,
  moduleCode: string,
  moduleName: string
): string[] {
  const r = step.toolRecipe;
  const details = extractStepCsvDetails(step, flow);
  const activeVar =
    step.variants && step.variants.length > 1 ? getActiveStepVariant(step) : null;
  const milestone = step.bookmarked
    ? step.bookmarkLabel || 'Milestone'
    : '';

  return [
    flow.id,
    flow.title,
    waferWidthUm,
    'Process_Step',
    String(stepIdx + 1),
    step.enabled ? 'Enabled' : 'Disabled',
    moduleCode,
    moduleName,
    step.id,
    step.title,
    step.type,
    details.method,
    formatSideLabel(step.side),
    milestone,
    activeVar ? activeVar.name : '',
    details.materialName,
    details.materialFormula,
    formatNumNm(details.thicknessNm),
    formatNmToUm(details.thicknessNm),
    details.stopOrInterface,
    details.maskReticle,
    details.maskPolarity,
    details.featureCount,
    details.params,
    r?.toolName || '',
    r?.gases || details.chemistryFallback || '',
    r?.temperature || '',
    r?.pressure || '',
    r?.power || '',
    r?.duration || '',
    r?.targetRate || '',
    r?.inspectionNotes || '',
    step.notes || '',
    formatBindings(step.paramBindings),
  ];
}

/**
 * Generates a structured RFC 4180 CSV string representing the entire process flow
 * (starting substrate layers + fabrication steps in module/timeline order).
 */
export function generateProcessFlowCsv(
  rawFlow: ProcessFlow,
  options: { includeBom?: boolean } = { includeBom: true }
): string {
  const flow = resolveFlowParameters(rawFlow);
  const waferWidthUm = formatNmToUm(flow.substrateWidth || 10000);

  const subLayers: SubstrateLayer[] =
    flow.substrateLayers && flow.substrateLayers.length > 0
      ? flow.substrateLayers
      : [
          {
            id: 'sub_default',
            name: 'Bulk Silicon <100>',
            materialId: flow.substrateMaterialId || 'mat_si_sub',
            thickness: flow.substrateThickness || 3000,
          },
        ];

  const rows: string[][] = [];
  rows.push([...PROCESS_CSV_HEADERS]);

  subLayers.forEach((layer, idx) => {
    rows.push(buildSubstrateRow(layer, idx, flow, waferWidthUm));
  });

  const timelineItems = buildTimelineItems(flow);
  let modSeq = 0;

  for (const item of timelineItems) {
    if (item.kind === 'block') {
      modSeq += 1;
      const modCode = `M${modSeq}`;
      for (const { step, idx } of item.steps) {
        rows.push(
          buildStepRow(step, idx, flow, waferWidthUm, modCode, item.block.name)
        );
      }
    } else {
      rows.push(buildStepRow(item.step, item.idx, flow, waferWidthUm, '', ''));
    }
  }

  const csvBody = rows
    .map((cols) => cols.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');

  return options.includeBom !== false ? `\uFEFF${csvBody}` : csvBody;
}

export function downloadProcessFlowCsv(flow: ProcessFlow): string {
  const csv = generateProcessFlowCsv(flow, { includeBom: true });
  const filename = `${slugifyFilename(flow.title, 'microflow')}_process_flow.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
