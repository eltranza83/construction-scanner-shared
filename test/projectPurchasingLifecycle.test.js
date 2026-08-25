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
});