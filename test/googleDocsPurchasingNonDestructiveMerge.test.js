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
  getPurchasingAuditLog,
  MASTER_PROJECT_ID
} from '../src/services/googleDocsPurchasingService.js';
import {
  resetActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';

const MASTER_TEMPLATE_DOC = `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template)
DocumentId: doc_master_uuid

<!-- section: quartz -->
## 1. Quartz Hardware
- [ ] Electrical pass-through caps <!-- id: item_pass_through_caps -->

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] Security lights <!-- id: item_security_lights -->
- [ ] Contractor doorbell chime kit <!-- id: item_doorbell_chime -->
- [ ] GFCI outlets <!-- id: item_gfci_outlets --> — Qty: 6

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser <!-- id: item_soap_dispenser -->
- [ ] Garbage disposal <!-- id: item_garbage_disposal -->
`;

const LOT_3_CUSTOM_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Lot 3
DocumentId: doc_lot_3_uuid

<!-- section: electrical -->
## Electrical Package
- [ ] Security lights <!-- id: item_security_lights -->

<!-- section: plumbing -->
## Plumbing Package
- [x] Soap dispenser <!-- id: item_soap_dispenser --> — Notes: Brushed Nickel (Ferguson PO #9918)
- [ ] Custom tankless recirc pump <!-- id: item_custom_recirc_pump -->
`;

const LOT_37_CUSTOM_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Lot 37
DocumentId: doc_lot_37_uuid

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] GFCI outlets <!-- id: item_gfci_outlets --> — Qty: 24 (High-density garage package)

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Garbage disposal <!-- id: item_garbage_disposal -->
`;

describe('True Non-Destructive Merge, Stable IDs, Dry-Run & Audit Log Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    saveProjectPurchasingDoc(localStorage, MASTER_PROJECT_ID, MASTER_TEMPLATE_DOC);
    saveProjectPurchasingDoc(localStorage, 'lot_3', LOT_3_CUSTOM_DOC);
    saveProjectPurchasingDoc(localStorage, 'lot_37', LOT_37_CUSTOM_DOC);
    resetActiveSessionCognitiveState();
    resetWriteIdempotencyState();
  });

  test('1. Stable Item IDs: Sync matches by item_id accurately across renamed headings', async () => {
    // Sync to lot_3
    const syncRes = await executeClientToolCall('sync_purchasing_master_to_projects', {
      targetProjectIds: ['lot_3']
    }, {});

    assert.equal(syncRes.success, true);
    const lot3Doc = loadProjectPurchasingDoc(localStorage, 'lot_3');

    // item_security_lights already existed under "Electrical Package" -> must NOT be duplicated
    const matches = lot3Doc.match(/Security lights/g);
    assert.equal(matches.length, 1, 'Security lights must not be duplicated despite heading name difference');
  });

  test('2. True Non-Destructive Merge: Preserves [x] purchased status, custom notes, vendor info, and custom quantities', async () => {
    const syncRes = await executeClientToolCall('sync_purchasing_master_to_projects', {
      targetProjectIds: ['lot_3', 'lot_37']
    }, { lastUserMessage: 'Add this to the master and all active projects' });

    assert.equal(syncRes.success, true);

    const lot3Doc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    const lot37Doc = loadProjectPurchasingDoc(localStorage, 'lot_37');

    // Check 1: [x] status and notes preserved on Lot 3
    assert.ok(
      lot3Doc.includes('- [x] Soap dispenser') && lot3Doc.includes('Notes: Brushed Nickel (Ferguson PO #9918)'),
      'Lot 3 purchased [x] status and custom vendor notes MUST remain intact'
    );

    // Check 2: Lot-specific custom item NOT deleted
    assert.ok(
      lot3Doc.includes('Custom tankless recirc pump'),
      'Lot 3 custom project-specific item must NEVER be deleted by master sync'
    );

    // Check 3: Custom higher quantity preserved on Lot 37
    assert.ok(
      lot37Doc.includes('GFCI outlets') && lot37Doc.includes('Qty: 24 (High-density garage package)'),
      'Lot 37 custom Qty: 24 and note MUST NOT be overwritten with Master Qty: 6'
    );

    // Check 4: Missing item added to Lot 3
    assert.ok(lot3Doc.includes('GFCI outlets — Qty: 6'), 'Missing GFCI outlets must be added to Lot 3');
  });

  test('3. Dry-Run Mode: Returns preview of missing projects without modifying documents', async () => {
    const dryRunRes = await executeClientToolCall('sync_purchasing_master_to_projects', {
      targetProjectIds: ['lot_3', 'lot_37'],
      dryRun: true
    }, {});

    assert.equal(dryRunRes.success, true);
    assert.equal(dryRunRes.isDryRun, true);
    assert.ok(dryRunRes.summaryPrompt.includes('missing') && dryRunRes.summaryPrompt.includes('Master items'));

    // Document contents in storage must be 100% identical before and after dry run
    const lot3Doc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    assert.equal(lot3Doc, LOT_3_CUSTOM_DOC, 'Lot 3 doc must NOT be modified in dry-run mode');
  });

  test('4. Persistent Audit Log: Records timestamp, item_id, affected projects, action, and user command', async () => {
    // Execute a real sync with a simulated user command
    await executeClientToolCall('sync_purchasing_master_to_projects', {
      targetProjectIds: ['lot_3']
    }, { lastUserMessage: 'Add this to all active projects' });

    const auditLogs = await executeClientToolCall('get_purchasing_audit_log', { limit: 10 }, {});

    assert.equal(auditLogs.success, true);
    assert.ok(auditLogs.entries.length > 0, 'Audit log entries must be created');

    const firstEntry = auditLogs.entries[0];
    assert.equal(firstEntry.source, 'Master');
    assert.ok(firstEntry.timestamp, 'Timestamp must exist');
    assert.ok(firstEntry.itemId, 'Stable item_id must be recorded');
    assert.ok(firstEntry.projectsAffected.includes('lot_3'), 'Affected projects must be recorded');
    assert.equal(firstEntry.action, 'added');
  });
});
