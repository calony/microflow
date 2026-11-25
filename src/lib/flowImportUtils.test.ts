import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESET_PROCESS_FLOWS } from './presets';
import { getEtchRecipes } from './etchRates';
import {
  ImportFromFlowOptions,
  mergeImportedFlowItems,
  normalizeIncomingFlow,
} from './flowImportUtils';

const options: ImportFromFlowOptions = {
  importMode: 'replace-flow',
  selectedStepIds: [],
  selectedMaskIds: [],
  maskAssignmentMode: 'keep-unassigned',
  insertMode: 'after-active',
  activeStepIndex: 1,
  widthScaleMode: 'scale',
  blockMode: 'single-block',
};

function makeFlows() {
  const current = normalizeIncomingFlow(PRESET_PROCESS_FLOWS[0])!;
  const source = normalizeIncomingFlow(PRESET_PROCESS_FLOWS[1])!;
  source.id = 'incoming_recipe';
  current.materials.push({ ...current.materials[0], id: 'old_custom_material', isCustom: true });
  current.variables = [{ id: 'old_variable', name: 'old_width', value: 100, unit: 'nm' }];
  current.etchLibrary = [{ ...getEtchRecipes()[0], id: 'old_etch_recipe', isCustom: true }];
  current.gdsLayout = { name: 'Old layout', layers: [], shapes: [] };
  source.substrateWidth = 25000;
  source.substrateLayers[0].thickness = 5000;
  source.materials.push({ ...source.materials[0], id: 'incoming_custom_material', isCustom: true });
  source.variables = [{ id: 'incoming_variable', name: 'incoming_width', value: 200, unit: 'nm' }];
  source.etchLibrary = [{ ...getEtchRecipes()[0], id: 'incoming_etch_recipe', isCustom: true }];
  source.gdsLayout = { name: 'Incoming layout', layers: [], shapes: [] };
  return { current, source };
}

test('replacing loads the complete source recipe at step zero without modifying either input', () => {
  const { current, source } = makeFlows();
  const before = JSON.stringify({ current, source });
  const result = mergeImportedFlowItems(current, source, options);

  assert.deepEqual(result.updatedFlow, normalizeIncomingFlow(source));
  assert.equal(result.firstImportedStepIndex, -1);
  assert.equal(result.importedStepCount, source.steps.length);
  assert.equal(result.importedMaskCount, source.masks!.length);
  assert.equal(JSON.stringify({ current, source }), before);
  assert.notEqual(result.updatedFlow.steps, source.steps);
});

test('replacing removes old steps, masks, blocks, libraries, variables, and layout', () => {
  const { current, source } = makeFlows();
  source.steps = [source.steps.find((step) => step.type === 'deposition')!];
  source.steps[0].blockId = undefined;
  source.masks = [];
  source.blocks = [];
  delete source.etchLibrary;
  delete source.variables;
  delete source.gdsLayout;

  const { updatedFlow } = mergeImportedFlowItems(current, source, options);

  assert.deepEqual(updatedFlow.steps.map((step) => step.id), source.steps.map((step) => step.id));
  assert.deepEqual(updatedFlow.masks, []);
  assert.deepEqual(updatedFlow.blocks, []);
  assert.equal(updatedFlow.etchLibrary, undefined);
  assert.equal(updatedFlow.variables, undefined);
  assert.equal(updatedFlow.gdsLayout, undefined);
  assert.ok(!updatedFlow.materials.some((material) => material.id === 'old_custom_material'));
  assert.equal(updatedFlow.substrateWidth, 25000);
  assert.equal(updatedFlow.substrateLayers[0].thickness, 5000);
});

test('an empty recipe clears the previous traveller and retains the incoming substrate', () => {
  const { current, source } = makeFlows();
  source.steps = [];
  source.masks = [];
  source.blocks = [];
  const result = mergeImportedFlowItems(current, source, options);

  assert.deepEqual(result.updatedFlow.steps, []);
  assert.equal(result.firstImportedStepIndex, -1);
  assert.equal(result.importedStepCount, 0);
  assert.deepEqual(result.updatedFlow.substrateLayers, source.substrateLayers);
});

test('explicitly adding steps preserves the current recipe and appends selected source steps', () => {
  const { current, source } = makeFlows();
  const result = mergeImportedFlowItems(current, source, {
    ...options,
    importMode: 'steps-and-masks',
    selectedStepIds: [source.steps[0].id],
    insertMode: 'end',
  });

  assert.equal(result.updatedFlow.id, current.id);
  assert.equal(result.updatedFlow.title, current.title);
  assert.deepEqual(result.updatedFlow.substrateLayers, current.substrateLayers);
  assert.equal(result.updatedFlow.steps.length, current.steps.length + 1);
  assert.equal(result.updatedFlow.steps.at(-1)!.title, source.steps[0].title);
  assert.equal(result.firstImportedStepIndex, current.steps.length);
});

test('masks-only import preserves the traveller and current substrate', () => {
  const { current, source } = makeFlows();
  assert.ok(source.masks!.length > 0);
  const result = mergeImportedFlowItems(current, source, {
    ...options,
    importMode: 'masks-only',
    selectedMaskIds: source.masks!.map((mask) => mask.id),
  });

  assert.deepEqual(result.updatedFlow.steps, current.steps);
  assert.deepEqual(result.updatedFlow.substrateLayers, current.substrateLayers);
  assert.equal(result.importedStepCount, 0);
  assert.equal(result.importedMaskCount, source.masks!.length);
  assert.equal(result.updatedFlow.masks!.length, current.masks!.length + source.masks!.length);
});
