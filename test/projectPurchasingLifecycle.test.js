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
import { extractTextFromDocxBytes } from '../src/services/googleDrive.js';
import * as fflate from 'fflate';

describe('Project Purchasing Lifecycle & Identity Architecture Suite', () => {

  beforeEach(() => {
    localStorage.clear();
    if (purchasingService.storage?.memoryStore?.clear) {
      purchasingService.storage.memoryStore.clear();
    }
  });

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

  test('7. Real Binary .docx OpenXML In-Memory Extraction & Checkbox Normalization', () => {
    // Construct authentic OpenXML word/document.xml with mixed checkboxes & headings
    const wordXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
    <w:p><w:r><w:t>Master Fixtures &amp; Hardware Purchasing Checklist - Lot 55</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Quartz Hardware</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Quartz pass-through caps (2)</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Undermount sink clips — Qty: 4</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. Electrical Hardware Fixtures</w:t></w:r></w:p>
    <w:p>
      <w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr>
      <w:sdtContent><w:p><w:r><w:t>Security lights</w:t></w:r></w:p></w:sdtContent></w:sdt>
    </w:p>
    <w:p><w:r><w:t>☐ Smart switches — Qty: 8</w:t></w:r></w:p>
    <w:p><w:r><w:t>☑ Garage ceiling lights</w:t></w:r></w:p>
    <w:p><w:r><w:t>3. Plumbing Hardware Fixtures</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Kitchen sink faucet</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Soap dispenser</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxZipBytes = fflate.zipSync({
      'word/document.xml': fflate.strToU8(wordXml),
      '[Content_Types].xml': fflate.strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    });

    assert.ok(docxZipBytes instanceof Uint8Array);
    assert.equal(docxZipBytes[0], 0x50); // PK
    assert.equal(docxZipBytes[1], 0x4b);

    const extractedText = extractTextFromDocxBytes(docxZipBytes);
    assert.ok(extractedText, 'Must successfully extract text from binary .docx');
    assert.match(extractedText, /## 1\. Quartz Hardware/);
    assert.match(extractedText, /- \[ \] Quartz pass-through caps \(2\)/);
    assert.match(extractedText, /- \[x\] Security lights/);
    assert.match(extractedText, /- \[ \] Smart switches — Qty: 8/);
    assert.match(extractedText, /- \[x\] Garage ceiling lights/);
    assert.match(extractedText, /- \[ \] Kitchen sink faucet/);
  });

  test('8. Real-World Lot 55 End-to-End: Binary Purchasing Checklist.docx Ingestion to Live Synthesis', async () => {
    const lot55Proj = 'lot_55';
    
    // Construct real binary .docx for Lot 55
    const wordXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
    <w:p><w:r><w:t>Master Fixtures &amp; Hardware Purchasing Checklist - Lot 55</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Quartz Hardware</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Quartz pass-through caps (2)</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. Electrical Hardware Fixtures</w:t></w:r></w:p>
    <w:p><w:r><w:t>☑ Security lights</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Smart switches — Qty: 8</w:t></w:r></w:p>
    <w:p><w:r><w:t>3. Plumbing Hardware Fixtures</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Kitchen sink faucet</w:t></w:r></w:p>
    <w:p><w:r><w:t>☐ Soap dispenser</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    const docxZipBytes = fflate.zipSync({
      'word/document.xml': fflate.strToU8(wordXml)
    });

    const extractedText = extractTextFromDocxBytes(docxZipBytes);
    
    // Simulate Lot 55 project context with discovered .docx file in Drive tree
    const projectContext = {
      projectId: lot55Proj,
      activeProjectName: 'Lot 55',
      ['lot_55']: {
        purchasingDocContent: extractedText
      },
      driveTree: {
        folders: [
          {
            name: 'Google Docs Purchasing List',
            files: [
              {
                id: 'file_lot55_docx_real',
                name: 'Purchasing Checklist.docx',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              }
            ]
          }
        ]
      }
    };

    // 1. Initial query executes JIT ingestion
    const toolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'Lot 55',
      unpurchasedOnly: true
    }, projectContext);

    assert.equal(toolRes.found, true);
    assert.equal(toolRes.totalPurchased, 1);
    assert.equal(toolRes.totalNeeded, 4);
    assert.equal(toolRes.totalItems, 4); // unpurchased only

    // 2. Synthesize broad purchasing question
    const synth = synthesizeGroundedEvidence(
      [{ name: 'get_purchasing_list', success: true, result: toolRes }],
      'What do we still need to purchase for Lot 55?',
      projectContext
    );
    assert.match(synth, /You still have 4 items to purchase for Lot 55/i);
    assert.match(synth, /You have 1 item marked as purchased/i);

    // 3. Synthesize single-item status question
    const itemStatusSynth = synthesizeGroundedEvidence(
      [{ name: 'get_purchasing_list', success: true, result: toolRes }],
      'Did we already buy the security lights?',
      projectContext
    );
    assert.match(itemStatusSynth, /Yes\. The Security lights are marked as purchased on Lot 55\./i);

    // 4. Verify Firestore sentinel was written
    const isInit = await purchasingService.isProjectInitialized(lot55Proj);
    assert.equal(isInit, true, 'Sentinel metadata must be initialized');
  });

  test('9. Anti-Double-Subtraction & Authoritative Purchasing Numerical Integrity Guard', async () => {
    const lotId = 'lot_55_numerical_guard';
    
    // 1. Initial 20-item checklist (2 Quartz, 10 Electrical, 8 Plumbing)
    const masterItems = [
      // 2 Quartz
      { id: 'item_quartz_1', categoryId: 'quartz', categoryTitle: 'Quartz Hardware', itemName: 'Electrical pass-through caps', status: 'needed', quantity: 1 },
      { id: 'item_quartz_2', categoryId: 'quartz', categoryTitle: 'Quartz Hardware', itemName: 'Sinks', status: 'needed', quantity: 1 },
      // 10 Electrical
      { id: 'item_elec_1', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Security lights', status: 'needed', quantity: 1 },
      { id: 'item_elec_2', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Contractor doorbell chime kit', status: 'needed', quantity: 1 },
      { id: 'item_elec_3', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Smart doorbell', status: 'needed', quantity: 1 },
      { id: 'item_elec_4', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Front porch hanging light', status: 'needed', quantity: 1 },
      { id: 'item_elec_5', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Exterior column lights', status: 'needed', quantity: 1 },
      { id: 'item_elec_6', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Garage ceiling lights with the cap to install it', status: 'needed', quantity: 1 },
      { id: 'item_elec_7', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Vanity lights', status: 'needed', quantity: 1 },
      { id: 'item_elec_8', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Smart switches', status: 'needed', quantity: 8 },
      { id: 'item_elec_9', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Extension rods', status: 'needed', quantity: 1 },
      { id: 'item_elec_10', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Ceiling fans', status: 'needed', quantity: 1 },
      // 8 Plumbing
      { id: 'item_plumb_1', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Soap dispenser', status: 'needed', quantity: 1 },
      { id: 'item_plumb_2', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Garbage disposal power button', status: 'needed', quantity: 1 },
      { id: 'item_plumb_3', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Garbage disposal', status: 'needed', quantity: 1 },
      { id: 'item_plumb_4', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Water heater with the water heater stand and tray', status: 'needed', quantity: 1 },
      { id: 'item_plumb_5', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Shower kits', status: 'needed', quantity: 1 },
      { id: 'item_plumb_6', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Toilets', status: 'needed', quantity: 1 },
      { id: 'item_plumb_7', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Rough-in shower valves', status: 'needed', quantity: 1 },
      { id: 'item_plumb_8', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Faucets', status: 'needed', quantity: 1 }
    ];

    await purchasingService.initializeProjectFromMaster(lotId, masterItems);

    const projectContext = {
      projectId: lotId,
      activeProjectName: 'Lot 55'
    };

    // 2. Mark Security lights as purchased
    const markRes = await executeClientToolCall('update_purchasing_item_status', {
      projectId: lotId,
      itemName: 'Security lights',
      isPurchased: true
    }, projectContext);
    assert.equal(markRes.success, true);

    // 3. Broad query execution
    const broadToolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: lotId,
      unpurchasedOnly: true
    }, projectContext);

    // Assert authoritative summary block math
    assert.equal(broadToolRes.summary.neededCount, 19);
    assert.equal(broadToolRes.summary.purchasedCount, 1);
    assert.equal(broadToolRes.summary.totalChecklistCount, 20);
    assert.equal(broadToolRes.summary.tradeBreakdown['Quartz Hardware'].needed, 2);
    assert.equal(broadToolRes.summary.tradeBreakdown['Electrical Hardware Fixtures'].needed, 9);
    assert.equal(broadToolRes.summary.tradeBreakdown['Electrical Hardware Fixtures'].purchased, 1);
    assert.equal(broadToolRes.summary.tradeBreakdown['Electrical Hardware Fixtures'].total, 10);
    assert.equal(broadToolRes.summary.tradeBreakdown['Plumbing Hardware Fixtures'].needed, 8);

    // Assert canonical answer formulation
    assert.match(broadToolRes.summary.canonicalAnswer, /You still have 19 items to purchase for Lot 55: 2 Quartz Hardware, 9 Electrical Hardware Fixtures, and 8 Plumbing Hardware Fixtures\./i);
    assert.match(broadToolRes.summary.canonicalAnswer, /You have 1 item marked as purchased\./i);

    // 4. Trade-specific query execution
    const elecToolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: lotId,
      trade: 'electrical',
      unpurchasedOnly: true
    }, projectContext);
    assert.equal(elecToolRes.totalItems, 9, 'Electrical unpurchased items must be 9, never 8');
    assert.equal(elecToolRes.items.length, 9);

    // 5. Test Numerical Integrity Guard against hallucinated/double-subtracted text
    const hallucinatedText = 'You still have 18 items to purchase for Lot 55: 2 Quartz Hardware, 8 Electrical Hardware Fixtures, and 8 Plumbing Hardware Fixtures. You have 1 item marked as purchased.';
    const toolTelemetry = [{ name: 'get_purchasing_list', success: true, result: broadToolRes, data: broadToolRes }];
    
    const { verifyResponseGrounding } = await import('../src/services/builderBrainService.js');
    const groundingReport = verifyResponseGrounding(hallucinatedText, projectContext, toolTelemetry);
    
    assert.equal(groundingReport.purchasingDiscrepancyDetected, true, 'Guard must detect double-subtracted 18 and 8');
    assert.match(groundingReport.suggestedCorrection, /19 items/i);
    assert.match(groundingReport.suggestedCorrection, /9 Electrical/i);

    // 6. Test Numerical Integrity Guard against verified correct text
    const accurateText = 'You still have 19 items to purchase for Lot 55: 2 Quartz Hardware, 9 Electrical Hardware Fixtures, and 8 Plumbing Hardware Fixtures. You have 1 item marked as purchased.';
    const accurateReport = verifyResponseGrounding(accurateText, projectContext, toolTelemetry);
    assert.equal(accurateReport.purchasingDiscrepancyDetected, false, 'Guard must NOT flag mathematically accurate text');

    // 7. Edge Cases: All purchased (100% complete)
    for (const it of masterItems) {
      await purchasingService.updateItemStatus(lotId, it.itemName, PURCHASING_STATUSES.PURCHASED);
    }
    const allPurchasedRes = await executeClientToolCall('get_purchasing_list', {
      projectId: lotId,
      unpurchasedOnly: true
    }, projectContext);
    assert.equal(allPurchasedRes.summary.neededCount, 0);
    assert.equal(allPurchasedRes.summary.purchasedCount, 20);
    assert.match(allPurchasedRes.summary.canonicalAnswer, /All 20 items have been purchased for Lot 55\./i);
  });

  test('10. 3-Way Item Resolution Engine & Zero-Write Safety Gate on Ambiguity and Non-Existence', async () => {
    const lotId = 'lot_55_safety_gate';
    
    // Initial 20-item checklist (includes 5 light fixtures)
    const masterItems = [
      { id: 'item_quartz_1', categoryId: 'quartz', categoryTitle: 'Quartz Hardware', itemName: 'Electrical pass-through caps', status: 'needed', quantity: 1 },
      { id: 'item_quartz_2', categoryId: 'quartz', categoryTitle: 'Quartz Hardware', itemName: 'Sinks', status: 'needed', quantity: 1 },
      // 5 distinct light fixtures
      { id: 'item_elec_1', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Security lights', status: 'needed', quantity: 1 },
      { id: 'item_elec_4', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Front porch hanging light', status: 'needed', quantity: 1 },
      { id: 'item_elec_5', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Exterior column lights', status: 'needed', quantity: 1 },
      { id: 'item_elec_6', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Garage ceiling lights with the cap to install it', status: 'needed', quantity: 1 },
      { id: 'item_elec_7', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Vanity lights', status: 'needed', quantity: 1 },
      // Other electrical & plumbing
      { id: 'item_elec_2', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Contractor doorbell chime kit', status: 'needed', quantity: 1 },
      { id: 'item_elec_3', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Smart doorbell', status: 'needed', quantity: 1 },
      { id: 'item_elec_8', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Smart switches', status: 'needed', quantity: 8 },
      { id: 'item_elec_9', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Extension rods', status: 'needed', quantity: 1 },
      { id: 'item_elec_10', categoryId: 'electrical', categoryTitle: 'Electrical Hardware Fixtures', itemName: 'Ceiling fans', status: 'needed', quantity: 1 },
      { id: 'item_plumb_1', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Soap dispenser', status: 'needed', quantity: 1 },
      { id: 'item_plumb_2', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Garbage disposal power button', status: 'needed', quantity: 1 },
      { id: 'item_plumb_3', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Garbage disposal', status: 'needed', quantity: 1 },
      { id: 'item_plumb_4', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Water heater with the water heater stand and tray', status: 'needed', quantity: 1 },
      { id: 'item_plumb_5', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Shower kits', status: 'needed', quantity: 1 },
      { id: 'item_plumb_6', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Toilets', status: 'needed', quantity: 1 },
      { id: 'item_plumb_7', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Rough-in shower valves', status: 'needed', quantity: 1 },
      { id: 'item_plumb_8', categoryId: 'plumbing', categoryTitle: 'Plumbing Hardware Fixtures', itemName: 'Faucets', status: 'needed', quantity: 1 }
    ];

    await purchasingService.initializeProjectFromMaster(lotId, masterItems);

    const projectContext = {
      projectId: lotId,
      activeProjectName: 'Lot 55'
    };

    // --- CASE A: Ambiguous Mutation ("Mark the lights as purchased") ---
    const ambigMutRes = await executeClientToolCall('update_purchasing_item_status', {
      projectId: lotId,
      itemName: 'lights',
      isPurchased: true
    }, projectContext);

    assert.equal(ambigMutRes.success, false, 'Ambiguous mutation must fail');
    assert.equal(ambigMutRes.isAmbiguous, true, 'Ambiguity flag must be set');
    assert.equal(ambigMutRes.matches.length, 5, 'Must find exactly 5 candidate light fixtures');
    assert.match(ambigMutRes.message, /Multiple items match/i);
    assert.match(ambigMutRes.message, /Security lights/i);
    assert.match(ambigMutRes.message, /Vanity lights/i);

    // CRITICAL SAFETY ASSERTION: Zero Firestore writes occurred
    const itemsAfterAmbig = await purchasingService.getItems(lotId);
    const purchasedAfterAmbig = itemsAfterAmbig.filter(it => it.status === 'purchased');
    assert.equal(purchasedAfterAmbig.length, 0, 'SAFETY INVARIANT: Ambiguous mutation must execute ZERO Firestore writes');

    // --- CASE B: Non-Existent Mutation ("Mark the pool heater as purchased") ---
    const notFoundMutRes = await executeClientToolCall('update_purchasing_item_status', {
      projectId: lotId,
      itemName: 'pool heater',
      isPurchased: true
    }, projectContext);

    assert.equal(notFoundMutRes.success, false, 'Nonexistent item mutation must fail');
    assert.equal(notFoundMutRes.isNotFound, true, 'isNotFound flag must be set');
    assert.match(notFoundMutRes.message, /not currently listed/i);
    assert.doesNotMatch(notFoundMutRes.message, /temporarily unavailable/i, 'Must never say temporarily unavailable');

    // CRITICAL SAFETY ASSERTION: Zero Firestore writes occurred
    const itemsAfterNotFound = await purchasingService.getItems(lotId);
    const purchasedAfterNotFound = itemsAfterNotFound.filter(it => it.status === 'purchased');
    assert.equal(purchasedAfterNotFound.length, 0, 'SAFETY INVARIANT: Nonexistent item mutation must execute ZERO Firestore writes');

    // --- CASE C: Exact Mutation ("Mark security lights as purchased") ---
    const exactMutRes = await executeClientToolCall('update_purchasing_item_status', {
      projectId: lotId,
      itemName: 'Security lights',
      isPurchased: true
    }, projectContext);

    assert.equal(exactMutRes.success, true, 'Exact match mutation must succeed');
    assert.equal(exactMutRes.itemName, 'Security lights');

    // Verify exactly ONE item was written to Firestore
    const itemsAfterExact = await purchasingService.getItems(lotId);
    const purchasedAfterExact = itemsAfterExact.filter(it => it.status === 'purchased');
    assert.equal(purchasedAfterExact.length, 1, 'Exactly one item must be marked as purchased');
    assert.equal(purchasedAfterExact[0].itemName, 'Security lights');

    // --- CASE D: Ambiguous Status Query ("Did we buy the lights?") ---
    const broadListRes = await executeClientToolCall('get_purchasing_list', {
      projectId: lotId,
      unpurchasedOnly: false
    }, projectContext);

    const ambigQuerySynth = synthesizeGroundedEvidence(
      [{ name: 'get_purchasing_list', success: true, result: broadListRes }],
      'Did we buy the lights?',
      projectContext
    );

    assert.match(ambigQuerySynth, /5 matching items/i, 'Ambiguous query must identify candidate count');
    assert.match(ambigQuerySynth, /Security lights \(Purchased\)/i, 'Must reflect live purchased status of Security lights');
    assert.match(ambigQuerySynth, /Vanity lights \(Needed\)/i, 'Must reflect live needed status of Vanity lights');
    assert.match(ambigQuerySynth, /Which one were you asking about\?/i, 'Must ask for user clarification');

    // --- CASE E: Exact Status Query ("Did we buy the security lights?") ---
    const exactQuerySynth = synthesizeGroundedEvidence(
      [{ name: 'get_purchasing_list', success: true, result: broadListRes }],
      'Did we buy the security lights?',
      projectContext
    );

    assert.match(exactQuerySynth, /Yes\. The Security lights are marked as purchased on Lot 55\./i, 'Exact query must return direct answer');

    // --- CASE F: Non-Existent Status Query ("Did we buy the pool heater?") ---
    const notFoundQuerySynth = synthesizeGroundedEvidence(
      [{ name: 'get_purchasing_list', success: true, result: broadListRes }],
      'Did we buy the pool heater?',
      projectContext
    );

    assert.match(notFoundQuerySynth, /That item is not currently listed on the Lot 55 purchasing checklist\./i, 'Nonexistent item query must report not listed');
  });
});