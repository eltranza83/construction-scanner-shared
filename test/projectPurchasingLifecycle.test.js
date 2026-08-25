import { test, describe } from 'node:test';
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
  toCanonicalProjectId,
  resolveTargetProjectId,
  generateItemId
} from '../src/services/googleDocsPurchasingService.js';

import {
  purchasingService,
  PurchasingService,
  LocalStoragePurchasingAdapter,
  PURCHASING_STATUSES
} from '../src/services/purchasingService.js';

import { executeClientToolCall } from '../src/services/aiTools.js';
import { synthesizeGroundedEvidence } from '../src/services/semanticIntentService.js';

describe('Project Purchasing Lifecycle & Identity Architecture Suite', () => {

  test('1. Canonical Project ID Resolution Normalization', () => {
    assert.equal(toCanonicalProjectId('Lot 55'), 'lot_55');
    assert.equal(toCanonicalProjectId('lot 55'), 'lot_55');
    assert.equal(toCanonicalProjectId('lot-55'), 'lot_55');
    assert.equal(toCanonicalProjectId('LOT_55'), 'lot_55');
    assert.equal(toCanonicalProjectId('Lot 3'), 'lot_3');
    assert.equal(toCanonicalProjectId('Lot 3B'), 'lot_3b');
    assert.equal(toCanonicalProjectId('Westlake Commercial Lot 12'), 'westlake_commercial_lot_12');
    assert.equal(toCanonicalProjectId('master'), 'master');
    assert.equal(toCanonicalProjectId('purchasing_master'), 'master');

    const context = {
      activeProject: { id: 'proj_1740999', name: 'Lot 55' },
      activeProjectName: 'Lot 55',
      projects: [{ id: 'proj_1740999', name: 'Lot 55' }]
    };

    assert.equal(resolveTargetProjectId('Lot 55', context), 'lot_55');
    assert.equal(resolveTargetProjectId('lot_55', context), 'lot_55');
    assert.equal(resolveTargetProjectId('proj_1740999', context), 'lot_55');
    assert.equal(resolveTargetProjectId(null, context), 'lot_55');
  });

  test('2. Deterministic Item IDs with Category Scoping', () => {
    const quartzCapId = generateItemId('Pass-through caps', 'quartz');
    const electricalCapId = generateItemId('Pass-through caps', 'electrical');

    assert.equal(quartzCapId, 'item_quartz_pass_through_caps');
    assert.equal(electricalCapId, 'item_electrical_pass_through_caps');
    assert.notEqual(quartzCapId, electricalCapId, 'Cross-trade identical item names must not collide');

    // Existing item ID preservation
    const existingItem = { id: 'legacy_cap_id_123', itemName: 'Pass-through caps' };
    const preservedId = generateItemId('Pass-through caps', 'quartz', existingItem);
    assert.equal(preservedId, 'legacy_cap_id_123', 'Must preserve existing item ID');
  });

  test('3. Idempotent Google Doc Ingestion & Metadata Sentinel', async () => {
    const testAdapter = new LocalStoragePurchasingAdapter();
    const service = new PurchasingService(testAdapter);
    const testProj = 'lot_99_test';
    const sampleDoc = `# Master Fixtures & Hardware Purchasing Checklist - Lot 99
## 1. Quartz Hardware
- [ ] Undermount sink clips — Qty: 4
- [x] Pass-through hole caps

## 2. Electrical Hardware Fixtures
- [ ] Security floodlights — Qty: 2
- [ ] Smart doorbell
`;

    assert.equal(await service.isProjectInitialized(testProj), false);

    const res1 = await service.migrateFromGoogleDocContent(testProj, sampleDoc, {
      sourceDocId: 'doc_lot99_test',
      sourceDocName: 'Lot 99 Purchasing Checklist'
    });

    assert.equal(res1.success, true);
    assert.equal(res1.count, 4);
    assert.equal(await service.isProjectInitialized(testProj), true);

    const meta = await testAdapter.getMetadata(testProj);
    assert.equal(meta.initialized, true);
    assert.equal(meta.sourceDocId, 'doc_lot99_test');

    // Repeated import must produce 0 duplicate items
    const res2 = await service.migrateFromGoogleDocContent(testProj, sampleDoc, {
      sourceDocId: 'doc_lot99_test',
      sourceDocName: 'Lot 99 Purchasing Checklist'
    });

    assert.equal(res2.count, 4);
    const items = await service.getItems(testProj);
    assert.equal(items.length, 4);
  });

  test('4. Strict Error Guard: Unreadable Drive Doc Reports Error and NEVER Silently Populates Master', async () => {
    const testProj = 'lot_unreadable_test';
    const projectContext = {
      projectId: testProj,
      activeProjectName: 'Lot Unreadable Test',
      googleToken: 'mock_expired_token',
      driveTree: {
        folders: [
          {
            name: 'Google Docs Purchasing List',
            files: [
              { id: 'unreadable_file_123', name: 'Purchasing Checklist - Lot Unreadable', mimeType: 'application/vnd.google-apps.document' }
            ]
          }
        ]
      }
    };

    const result = await executeClientToolCall('get_purchasing_list', {
      projectId: testProj
    }, projectContext);

    assert.equal(result.success, false);
    assert.equal(result.readError, true);
    assert.match(result.message, /unable to retrieve its contents/i);

    const itemsInStore = await purchasingService.getItems(testProj);
    assert.equal(itemsInStore.length, 0, 'Must NOT populate master template items when project doc is unreadable');
  });

  test('5. Live Ingestion Lifecycle for Newly Recreated Lot (e.g. Lot 55)', async () => {
    const testProj = 'lot_55';
    const projectContext = {
      projectId: testProj,
      activeProjectName: 'Lot 55',
      ['lot_55']: {
        purchasingDocContent: `# Master Fixtures & Hardware Purchasing Checklist - Lot 55
## 1. Quartz Hardware
- [ ] Quartz pass-through caps (2)

## 2. Electrical Hardware Fixtures
- [ ] Smart switches — Qty: 8
- [ ] Garage ceiling lights
- [x] Security lights

## 3. Plumbing Hardware Fixtures
- [ ] Kitchen sink faucet
- [ ] Soap dispenser
`
      }
    };

    const toolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'Lot 55',
      unpurchasedOnly: true
    }, projectContext);

    assert.equal(toolRes.found, true);
    assert.equal(toolRes.totalPurchased, 1);
    assert.equal(toolRes.totalItems, 5);

    const synth = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: toolRes }], 'What do we still need to purchase for Lot 55?', projectContext);
    assert.match(synth, /You still have 5 items to purchase for Lot 55/i);
    assert.match(synth, /You have 1 item marked as purchased/i);

    const itemStatusSynth = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: toolRes }], 'Did we already buy the security lights?', projectContext);
    assert.match(itemStatusSynth, /Yes\. The Security lights are marked as purchased on Lot 55\./i);
  });

  test('6. Lot 3 Preservation: Lot 3 remains intact with 20 items', async () => {
    const projectContext = { projectId: 'lot_3', activeProjectName: 'Lot 3' };
    const res = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3'
    }, projectContext);

    assert.equal(res.found, true);
    assert.ok(res.totalItems >= 19, 'Lot 3 must retain its full checklist');
  });
});