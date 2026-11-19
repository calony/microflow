/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Material } from '../types/microfab';

export const DEFAULT_MATERIALS: Material[] = [
  // Substrates & Base Semiconductors
  {
    id: 'mat_si_sub',
    name: 'Silicon Substrate',
    formula: 'Si <100>',
    color: '#64748b', // Slate 500
    strokeColor: '#334155',
    pattern: 'diagonal-right',
    category: 'substrate',
    density: 2.33,
    refractiveIndex: 3.88,
    notes: 'Single-crystal Czochralski silicon wafer, p-type boron doped',
    crystallineAnisotropic: true,
  },
  {
    id: 'mat_si_n',
    name: 'Silicon (n-type)',
    formula: 'Si:P',
    color: '#475569',
    strokeColor: '#1e293b',
    pattern: 'diagonal-left',
    category: 'semiconductor',
    density: 2.33,
    refractiveIndex: 3.88,
    notes: 'Phosphorus doped n-type silicon region / well',
    crystallineAnisotropic: true,
  },
  {
    id: 'mat_poly_si',
    name: 'Polysilicon',
    formula: 'poly-Si',
    color: '#f97316', // Orange 500
    strokeColor: '#c2410c',
    pattern: 'crosshatch',
    category: 'semiconductor',
    density: 2.32,
    refractiveIndex: 3.9,
    notes: 'LPCVD polycrystalline silicon gate material / structural MEMS layer',
  },
  {
    id: 'mat_quartz',
    name: 'Quartz / Fused Silica',
    formula: 'SiO₂ (bulk)',
    color: '#e0f2fe',
    strokeColor: '#7dd3fc',
    pattern: 'dots',
    category: 'substrate',
    density: 2.2,
    refractiveIndex: 1.46,
    notes: 'Optically transparent amorphous quartz substrate',
  },
  
  // Dielectrics & Oxides
  {
    id: 'mat_sio2_thermal',
    name: 'Thermal Silicon Dioxide',
    formula: 'SiO₂ (Thermal)',
    color: '#38bdf8', // Sky 400
    strokeColor: '#0284c7',
    pattern: 'solid',
    category: 'dielectric',
    density: 2.27,
    refractiveIndex: 1.46,
    notes: 'Dry or wet furnace thermal oxide, high quality gate or isolation dielectric',
  },
  {
    id: 'mat_sio2_pecvd',
    name: 'PECVD Silicon Dioxide',
    formula: 'SiO₂ (PECVD)',
    color: '#7dd3fc', // Sky 300
    strokeColor: '#0369a1',
    pattern: 'horizontal',
    category: 'dielectric',
    density: 2.15,
    refractiveIndex: 1.47,
    notes: 'Low-temperature plasma-enhanced chemical vapor deposition oxide',
  },
  {
    id: 'mat_si3n4',
    name: 'Silicon Nitride',
    formula: 'Si₃N₄',
    color: '#14b8a6', // Teal 500
    strokeColor: '#0f766e',
    pattern: 'diagonal-right',
    category: 'dielectric',
    density: 3.1,
    refractiveIndex: 2.01,
    notes: 'LPCVD low-stress silicon nitride, excellent etch stop and passivation barrier',
  },
  {
    id: 'mat_al2o3',
    name: 'Aluminum Oxide (ALD)',
    formula: 'Al₂O₃',
    color: '#a855f7', // Purple 500
    strokeColor: '#7e22ce',
    pattern: 'dots',
    category: 'dielectric',
    density: 3.95,
    refractiveIndex: 1.76,
    notes: 'Atomic Layer Deposition high-k gate dielectric or hermetic sealing layer',
  },
  {
    id: 'mat_hafnium',
    name: 'Hafnium Oxide',
    formula: 'HfO₂',
    color: '#c084fc',
    strokeColor: '#9333ea',
    pattern: 'crosshatch',
    category: 'dielectric',
    density: 9.68,
    refractiveIndex: 2.1,
    notes: 'High-k gate dielectric for sub-45nm CMOS',
  },

  // Metals & Conductors
  {
    id: 'mat_al',
    name: 'Aluminum',
    formula: 'Al',
    color: '#94a3b8', // Slate 400
    strokeColor: '#475569',
    pattern: 'vertical',
    category: 'metal',
    density: 2.7,
    notes: 'Sputtered metal interconnect and contact pads',
  },
  {
    id: 'mat_au',
    name: 'Gold',
    formula: 'Au',
    color: '#eab308', // Yellow 500
    strokeColor: '#a16207',
    pattern: 'solid',
    category: 'metal',
    density: 19.3,
    notes: 'E-beam evaporated wire-bond pads, electrodes, and plasmonic structures',
  },
  {
    id: 'mat_cr',
    name: 'Chromium',
    formula: 'Cr',
    color: '#64748b',
    strokeColor: '#334155',
    pattern: 'crosshatch',
    category: 'metal',
    density: 7.19,
    notes: 'Hard mask material and adhesion layer for gold',
  },
  {
    id: 'mat_ti',
    name: 'Titanium',
    formula: 'Ti',
    color: '#cbd5e1',
    strokeColor: '#64748b',
    pattern: 'diagonal-left',
    category: 'metal',
    density: 4.5,
    notes: 'Adhesion promoter layer for noble metals (Au, Pt) and contact barrier',
  },
  {
    id: 'mat_cu',
    name: 'Copper',
    formula: 'Cu',
    color: '#f87171', // Red 400
    strokeColor: '#dc2626',
    pattern: 'solid',
    category: 'metal',
    density: 8.96,
    notes: 'Damascene electroplated interconnect metallization',
  },
  {
    id: 'mat_pt',
    name: 'Platinum',
    formula: 'Pt',
    color: '#e2e8f0',
    strokeColor: '#94a3b8',
    pattern: 'stipple',
    category: 'metal',
    density: 21.45,
    notes: 'Inert electrode for electrochemical and bio-MEMS sensors',
  },

  // Polymers & Photoresists
  {
    id: 'mat_pr_pos',
    name: 'Positive Photoresist',
    formula: 'AZ1518 / SPR',
    color: '#f43f5e', // Rose 500
    strokeColor: '#be123c',
    pattern: 'diagonal-right',
    category: 'photoresist',
    density: 1.2,
    refractiveIndex: 1.62,
    notes: 'Diazoquinone (DNQ) positive tone resist; UV exposed areas dissolve in developer',
  },
  {
    id: 'mat_pr_neg',
    name: 'Negative Photoresist',
    formula: 'AZ nLOF / NR9',
    color: '#f59e0b', // Amber 500
    strokeColor: '#b45309',
    pattern: 'diagonal-left',
    category: 'photoresist',
    density: 1.15,
    refractiveIndex: 1.61,
    notes: 'Negative tone photoresist; UV exposed areas crosslink and remain after development',
  },
  {
    id: 'mat_pr_su8',
    name: 'SU-8 Negative Resist',
    formula: 'SU-8 Epoxy',
    color: '#d97706', // Amber 600
    strokeColor: '#b45309',
    pattern: 'crosshatch',
    category: 'polymer',
    density: 1.19,
    refractiveIndex: 1.67,
    notes: 'High-aspect-ratio negative epoxy photoresist for microfluidics and MEMS molds',
  },
  {
    id: 'mat_dfr',
    name: 'Dry Film Photoresist',
    formula: 'DFR / Ordyl',
    color: '#ec4899', // Pink 500
    strokeColor: '#be185d',
    pattern: 'horizontal',
    category: 'photoresist',
    density: 1.18,
    refractiveIndex: 1.56,
    notes: 'Laminated dry film photoresist sheet that tents across cavities and channels for 3D microfluidics and plating molds',
  },
  {
    id: 'mat_polyimide',
    name: 'Polyimide Dry Film',
    formula: 'PI (Kapton)',
    color: '#fbbf24', // Amber 400
    strokeColor: '#b45309',
    pattern: 'stipple',
    category: 'polymer',
    density: 1.42,
    refractiveIndex: 1.7,
    notes: 'Laminated permanent polyimide dielectric/capping film for MEMS sealing and flexible substrates',
  },
  {
    id: 'mat_pdms',
    name: 'PDMS Silicone',
    formula: '(C₂H₆OSi)ₙ',
    color: '#bae6fd',
    strokeColor: '#38bdf8',
    pattern: 'dots',
    category: 'polymer',
    density: 0.965,
    refractiveIndex: 1.41,
    notes: 'Polydimethylsiloxane elastomer for microfluidic channels and soft lithography',
  },

  // Dicing Tapes, Carrier Films & Packaging Adhesives
  {
    id: 'mat_dicing_tape',
    name: 'Blue Dicing Tape (PVC/PO)',
    formula: 'Dicing Tape',
    color: '#0284c7', // Sky 600
    strokeColor: '#0369a1',
    pattern: 'diagonal-left',
    category: 'polymer',
    density: 1.15,
    notes: 'Standard cleanroom pressure-sensitive dicing carrier tape mounted on stainless steel ring frame',
  },
  {
    id: 'mat_uv_tape',
    name: 'UV-Release Dicing Tape',
    formula: 'UV Tape',
    color: '#6366f1', // Indigo 500
    strokeColor: '#4338ca',
    pattern: 'horizontal',
    category: 'polymer',
    density: 1.12,
    notes: 'High-tack acrylic adhesive tape whose tack drops sharply upon UV irradiation for easy die pick-up / demount',
  },
  {
    id: 'mat_bg_tape',
    name: 'Backgrind (BG) Tape',
    formula: 'BG Tape',
    color: '#2dd4bf', // Teal 400
    strokeColor: '#0d9488',
    pattern: 'stipple',
    category: 'polymer',
    density: 1.1,
    notes: 'Frontside protective lamination tape used during backside wafer grinding and DBG thinning',
  },
  {
    id: 'mat_daf',
    name: 'Die Attach Film (DAF)',
    formula: 'DAF Epoxy',
    color: '#a78bfa', // Violet 400
    strokeColor: '#7c3aed',
    pattern: 'dots',
    category: 'polymer',
    density: 1.25,
    notes: 'B-stage epoxy adhesive film laminated to wafer backside and diced together with individual dies',
  },
];

export const CARRIER_TAPE_IDS = new Set([
  'mat_dicing_tape',
  'mat_uv_tape',
  'mat_bg_tape',
]);

export const CRYSTALLINE_ANISOTROPIC_MATERIAL_IDS = new Set([
  'mat_si_sub',
  'mat_si_n',
]);

/**
 * Returns true if a material etches anisotropically along crystal planes (e.g. Si {111} at 54.74°)
 * in alkaline wet etches (KOH / TMAH). Amorphous dielectrics, metals, polymers, and polysilicon
 * do not have long-range crystal orientation and therefore etch isotropically when attacked.
 */
export function isCrystallineKohMaterial(mat: Material): boolean {
  if (typeof mat.crystallineAnisotropic === 'boolean') {
    return mat.crystallineAnisotropic;
  }
  return CRYSTALLINE_ANISOTROPIC_MATERIAL_IDS.has(mat.id);
}

export function resolveResistMaterialId(
  polarity: 'positive' | 'negative' = 'positive',
  currentMaterialId?: string
): string {
  if (
    !currentMaterialId ||
    currentMaterialId === 'mat_pr_pos' ||
    currentMaterialId === 'mat_pr_neg'
  ) {
    return polarity === 'negative' ? 'mat_pr_neg' : 'mat_pr_pos';
  }
  return currentMaterialId;
}

export function getMaterialById(materials: Material[], id: string): Material {
  const found = materials.find((m) => m.id === id);
  if (found) return found;
  const def = DEFAULT_MATERIALS.find((m) => m.id === id);
  if (def) return def;
  return {
    id,
    name: 'Unknown Material',
    formula: '?',
    color: '#94a3b8',
    pattern: 'solid',
    category: 'custom',
  };
}
