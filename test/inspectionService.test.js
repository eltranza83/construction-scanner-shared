import test from 'node:test';
import assert from 'node:assert';
import {
  INSPECTION_STAGES,
  INITIAL_PLUMBING_ITEMS,
  loadInspectionData,
  saveInspectionData,
  getInspectionStorageKey
} from '../src/services/inspectionService.js';

test('INSPECTION_STAGES contains all 6 municipal inspection milestones', () => {
  assert.strictEqual(INSPECTION_STAGES.length, 6);
  assert.strictEqual(INSPECTION_STAGES[0].id, 'rough-in-plumbing');
  assert.strictEqual(INSPECTION_STAGES[1].id, 'foundation');
  assert.strictEqual(INSPECTION_STAGES[2].id, 'framing');
  assert.strictEqual(INSPECTION_STAGES[3].id, 'insulation');
  assert.strictEqual(INSPECTION_STAGES[4].id, 'infiltration');
  assert.strictEqual(INSPECTION_STAGES[5].id, 'final');
});

test('INITIAL_PLUMBING_ITEMS pre-loads essential Rough-In Plumbing inspection requirements', () => {
  assert.strictEqual(INITIAL_PLUMBING_ITEMS.length, 10);

  const waterMeter = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-water-meter');
  assert.ok(waterMeter);
  assert.strictEqual(waterMeter.title, 'City Water Meter Set & Installed');

  const vacuumBreaker = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-vacuum-breaker');
  assert.ok(vacuumBreaker);
  assert.ok(vacuumBreaker.title.includes('Vacuum Breaker'));

  const permitBoard = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-permit-board');
  assert.ok(permitBoard);

  const erosionControl = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-erosion-control');
  assert.ok(erosionControl);
  assert.ok(erosionControl.note.includes('4ft or 5ft lot perimeter fence'));

  const portAPotty = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-port-a-potty');
  assert.ok(portAPotty);

  const postBackfill = INITIAL_PLUMBING_ITEMS.find(i => i.id === 'item-post-inspection-backfill');
  assert.ok(postBackfill);
});

test('getInspectionStorageKey normalizes project and stage ids', () => {
  assert.strictEqual(
    getInspectionStorageKey('Lot 3 ', 'Rough-In-Plumbing'),
    'jobscan_inspections_lot 3_rough-in-plumbing'
  );
});

test('loadInspectionData returns default Rough-In Plumbing items when unconfigured', () => {
  const items = loadInspectionData('proj_123', 'rough-in-plumbing');
  assert.strictEqual(items.length, 10);
  assert.strictEqual(items[0].id, 'item-water-meter');
});

test('loadInspectionData returns default Foundation items when stage is foundation', () => {
  const items = loadInspectionData('proj_123', 'foundation');
  assert.strictEqual(items.length, 5);
  assert.strictEqual(items[0].id, 'item-foundation-pad-forms');
});

test('loadInspectionData returns default Framing items when stage is framing', () => {
  const items = loadInspectionData('proj_123', 'framing');
  assert.strictEqual(items.length, 14);
  assert.strictEqual(items[0].id, 'item-framing-nail-pattern');
});

test('loadInspectionData returns default Insulation items when stage is insulation', () => {
  const items = loadInspectionData('proj_123', 'insulation');
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].id, 'item-insulation-wall-batts');
});

test('loadInspectionData returns default Infiltration items when stage is infiltration', () => {
  const items = loadInspectionData('proj_123', 'infiltration');
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].id, 'item-infiltration-blower-door');
});

test('loadInspectionData returns default Final items when stage is final', () => {
  const items = loadInspectionData('proj_123', 'final');
  assert.strictEqual(items.length, 14);
  assert.strictEqual(items[0].id, 'item-final-hvac-foam-insulation');
});
