/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProcessStepType } from '../types/microfab';

export const DEFAULT_STEP_TITLES: Record<ProcessStepType, string> = {
  deposition: 'Thin Film Deposition',
  lithography: 'Photolithography Patterning',
  etch: 'Etch',
  strip: 'Photoresist Strip',
  liftoff: 'Metal Lift-off',
  cmp: 'Grind / Polish / Planarize',
  bonding: 'Wafer Bonding',
  'tape-frame': 'Mount on Tape & Frame',
  dicing: 'Wafer Dicing',
  anneal: 'Thermal Dopant Drive-in / Anneal',
  substrate: 'Substrate Initialization',
};

export function getDefaultStepTitle(type: ProcessStepType): string {
  return DEFAULT_STEP_TITLES[type] || 'Generic Process Step';
}
