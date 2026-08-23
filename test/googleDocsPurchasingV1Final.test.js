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
  RESOURCE_TYPES,
  loadMasterPurchasingDoc,
  saveMasterPurchasingDoc,
  loadProjectPurchasingDoc,
  saveProjectPurchasingDoc,
  syncMasterPurchasingToProjects,
  cloneMasterToNewProject,
  deprecateMasterItem,
  parseMasterVersion,
  incrementMasterVersion,
  updateMasterVersionInDoc,
  parseGoogleDocPurchasingStructure
} from '../src/services/googleDocsPurchasingService.js';

import {
  executeClientToolCall,
  resetWriteIdempotencyState
} from '../src/services/aiTools.js';

const MASTER_V1_DOC = `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template — v1.0)
<!-- version: 1.0 -->

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] 200A main panel breaker <!-- id: item_200a_breaker --> — Qty: 1
- [ ] GFCI outlets <!-- id: item_gfci_outlets --> — Qty: 6
- [ ] Contractor doorbell chime kit <!-- id: item_doorbell_chime --> — Qty: 1

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser <!-- id: item_soap_dispenser -->
`;

const LOT_37_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Project lot_37 (Template: v1.0)
<!-- initial_master_version: v1.0 -->

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] GFCI outlets <!-- id: item_gfci_outlets --> — Qty: 12

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [x] Soap dispenser <!-- id: item_soap_dispenser --> — Notes: Brushed Gold (PO-991)
- [ ] Custom bidette attachment <!-- id: item_custom_bidette -->
`;

describe('V1 Final Master Purchasing Architecture Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    saveMasterPurchasingDoc(localStorage, MASTER_V1_DOC);
    saveProjectPurchasingDoc(localStorage, 'lot_37', LOT_37_DOC);
    resetWriteIdempotencyState();
  });

  test('1. Automatic Master Versioning: Auto-increments from v1.0 to v1.1 on write', () => {
    const currentVer = parseMasterVersion(MASTER_V1_DOC);
    assert.equal(currentVer, 'v1.0');

    const nextVer = incrementMasterVersion(currentVer);
    assert.equal(nextVer, 'v1.1');

    const updated = updateMasterVersionInDoc(MASTER_V1_DOC, nextVer);
    assert.ok(updated.includes('Company Master Template — v1.1'));
    assert.ok(updated.includes('<!-- version: 1.1 -->'));
  });

  test('2. New Project Provenance: Cloned project records initialMasterVersion', () => {
    // Clone project lot 60 from current Master v1.0
    const lot60Doc = cloneMasterToNewProject(localStorage, 'lot_60');
    assert.ok(lot60Doc.includes('Project lot_60 (Template: v1.0)'));
    assert.ok(lot60Doc.includes('<!-- initial_master_version: v1.0 -->'));
    assert.ok(lot60Doc.includes('200A main panel breaker'));
  });

  test('3. Dual-Payload Sync Preview: Concise voiceSummary for audio & detailedPreview for UI', () => {
    const preview = syncMasterPurchasingToProjects(localStorage, ['lot_37'], { dryRun: true });

    // 1. Voice summary is concise and conversational
    assert.ok(preview.voiceSummary.includes('I found 1 project(s) missing 2 Master items. Want me to sync them?'));

    // 2. UI Detailed preview contains structured breakdown
    assert.equal(preview.detailedPreview.length, 1);
    const lot37Preview = preview.detailedPreview[0];
    assert.equal(lot37Preview.projectId, 'lot_37');
    assert.equal(lot37Preview.missingCount, 2); // 200a breaker & doorbell chime
    assert.equal(lot37Preview.customUntouchedCount, 2); // custom 12 GFCI & [x] Soap dispenser with notes
  });

  test('4. Item Deprecation: Deprecated item is excluded from new projects but preserved on active projects', () => {
    // Deprecate doorbell chime kit
    const depRes = deprecateMasterItem(localStorage, 'item_doorbell_chime');
    assert.equal(depRes.success, true);
    assert.equal(depRes.newVersion, 'v1.1');

    // Verify Master is now v1.1 and has deprecated tag
    const masterDoc = loadMasterPurchasingDoc(localStorage);
    assert.ok(masterDoc.includes('<!-- status: deprecated -->'));
    assert.ok(masterDoc.includes('v1.1'));

    // New project created from v1.1 excludes deprecated doorbell chime
    const lot61Doc = cloneMasterToNewProject(localStorage, 'lot_61');
    assert.ok(lot61Doc.includes('Project lot_61 (Template: v1.1)'));
    assert.ok(!lot61Doc.includes('item_doorbell_chime'), 'Must exclude deprecated item from new projects');
    assert.ok(lot61Doc.includes('200A main panel breaker'), 'Must include active items');

    // Existing Lot 37 doc still has its historical items intact
    const lot37Doc = loadProjectPurchasingDoc(localStorage, 'lot_37');
    assert.ok(lot37Doc.includes('Soap dispenser'), 'Active projects keep all items');
  });

  test('5. Sync Idempotency: Running sync twice produces 0 duplicate writes or items', () => {
    // First sync
    const sync1 = syncMasterPurchasingToProjects(localStorage, ['lot_37'], { dryRun: false });
    assert.equal(sync1.projectsSynced.length, 1);
    assert.equal(sync1.itemsAddedSummary['lot_37'].length, 2);

    const docAfterSync1 = loadProjectPurchasingDoc(localStorage, 'lot_37');

    // Second sync
    const sync2 = syncMasterPurchasingToProjects(localStorage, ['lot_37'], { dryRun: false });
    const docAfterSync2 = loadProjectPurchasingDoc(localStorage, 'lot_37');

    assert.equal(sync2.itemsAddedSummary['lot_37'].length, 0, 'Second sync must add 0 items');
    assert.equal(docAfterSync1, docAfterSync2, 'Document content must remain 100% identical');
  });

  test('6. Conflict Protection: Custom quantities, notes, and [x] status strictly preserved during sync', () => {
    syncMasterPurchasingToProjects(localStorage, ['lot_37'], { dryRun: false });
    const doc = loadProjectPurchasingDoc(localStorage, 'lot_37');

    // Lot 37 had 12 GFCI outlets (Master had 6) -> Must remain 12
    assert.ok(doc.includes('GFCI outlets') && doc.includes('Qty: 12'), 'Custom Qty: 12 must be preserved');
    
    // Lot 37 had [x] Soap dispenser with PO-991 notes -> Must remain [x] and have notes
    assert.ok(doc.includes('- [x] Soap dispenser') && doc.includes('Notes: Brushed Gold (PO-991)'), 'Custom [x] and notes preserved');

    // Lot 37 had custom lot-specific item -> Must NOT be deleted
    assert.ok(doc.includes('Custom bidette attachment'), 'Lot-specific items must never be deleted');
  });
});
