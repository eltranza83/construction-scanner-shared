import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

import {
  executeClientToolCall,
  TOOL_REGISTRY,
  resetWriteIdempotencyState
} from '../src/services/aiTools.js';
import {
  loadProjectPurchasingDoc,
  saveProjectPurchasingDoc,
  syncMasterPurchasingToProjects,
  cloneMasterToNewProject,
  MASTER_PROJECT_ID
} from '../src/services/googleDocsPurchasingService.js';
import {
  resetActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';

const MASTER_INITIAL_DOC = `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template)
DocumentId: doc_master_template_uuid

<!-- section: quartz -->
## 1. Quartz Hardware
- [ ] Electrical pass-through caps

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] Security lights
- [ ] Contractor doorbell chime kit

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser
- [ ] Garbage disposal
`;

const LOT_3_WORKING_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Lot 3
DocumentId: doc_lot_3_uuid

<!-- section: quartz -->
## 1. Quartz Hardware
- [ ] Electrical pass-through caps

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] Security lights

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [x] Soap dispenser
`;

const LOT_37_WORKING_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Lot 37
DocumentId: doc_lot_37_uuid

<!-- section: electrical -->
## Electrical Package
- [ ] Can lights — Qty: 12

<!-- section: plumbing -->
## Plumbing Package
- [ ] Tankless water heater
`;

describe('Master Purchasing Template & Non-Destructive Sync Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    saveProjectPurchasingDoc(localStorage, MASTER_PROJECT_ID, MASTER_INITIAL_DOC);
    saveProjectPurchasingDoc(localStorage, 'lot_3', LOT_3_WORKING_DOC);
    saveProjectPurchasingDoc(localStorage, 'lot_37', LOT_37_WORKING_DOC);
    resetActiveSessionCognitiveState();
    resetWriteIdempotencyState();
  });

  test('1. Adding item to Master updates ONLY the Master Template by default', async () => {
    const res = await executeClientToolCall('add_purchasing_item', {
      item: '200A main panel breaker',
      quantity: 1,
      projectId: 'master'
    }, {});

    assert.equal(res.success, true);
    assert.equal(res.resourceType, 'purchasing_master');

    const updatedMaster = loadProjectPurchasingDoc(localStorage, MASTER_PROJECT_ID);
    const lot3Doc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    const lot37Doc = loadProjectPurchasingDoc(localStorage, 'lot_37');

    assert.ok(updatedMaster.includes('200A main panel breaker'), 'Master must include new standard breaker');
    assert.ok(!lot3Doc.includes('200A main panel breaker'), 'Lot 3 must NOT be modified automatically');
    assert.ok(!lot37Doc.includes('200A main panel breaker'), 'Lot 37 must NOT be modified automatically');
  });

  test('2. Non-Destructive Sync: Adds missing items from Master without resetting checked items or custom quantities', async () => {
    // 1. Add new standard item to Master
    await executeClientToolCall('add_purchasing_item', {
      item: 'GFCI outlets',
      quantity: 6,
      projectId: 'master'
    }, {});

    // 2. Run non-destructive sync across active lots [lot_3, lot_37]
    const syncRes = await executeClientToolCall('sync_purchasing_master_to_projects', {
      targetProjectIds: ['lot_3', 'lot_37']
    }, {});

    assert.equal(syncRes.success, true);
    assert.equal(syncRes.projectsSynced.length, 2);

    const lot3DocAfter = loadProjectPurchasingDoc(localStorage, 'lot_3');
    const lot37DocAfter = loadProjectPurchasingDoc(localStorage, 'lot_37');

    // Verification 1: Missing items from Master are added
    assert.ok(lot3DocAfter.includes('GFCI outlets — Qty: 6'), 'Lot 3 must receive GFCI outlets');
    assert.ok(lot37DocAfter.includes('GFCI outlets — Qty: 6'), 'Lot 37 must receive GFCI outlets');
    assert.ok(lot37DocAfter.includes('Contractor doorbell chime kit'), 'Lot 37 must receive missing doorbell chime kit from master');

    // Verification 2: Preserves purchased [x] status
    assert.ok(lot3DocAfter.includes('- [x] Soap dispenser'), 'Lot 3 checked off status MUST remain [x]');

    // Verification 3: Preserves custom project quantities
    assert.ok(lot37DocAfter.includes('Can lights — Qty: 12'), 'Lot 37 custom Qty: 12 must NOT be overwritten');

    // Verification 4: Preserves lot-specific custom items
    assert.ok(lot37DocAfter.includes('Tankless water heater'), 'Lot 37 custom item must NOT be deleted');
  });

  test('3. Cloning Master Template for a New Project (Lot 60) creates fresh checklist', () => {
    // Master has some items
    const newLotDoc = cloneMasterToNewProject(localStorage, 'lot_60');

    assert.ok(newLotDoc.includes('Project lot_60'));
    assert.ok(newLotDoc.includes('Security lights'));
    assert.ok(newLotDoc.includes('Soap dispenser'));
    assert.ok(!newLotDoc.includes('[x]'), 'All items in new project must be unchecked [ ]');

    const loaded = loadProjectPurchasingDoc(localStorage, 'lot_60');
    assert.ok(loaded.includes('Project lot_60'));
  });
});
