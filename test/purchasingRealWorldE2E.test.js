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
  purchasingService,
  PURCHASING_STATUSES,
  LocalStoragePurchasingAdapter
} from '../src/services/purchasingService.js';
import { executeClientToolCall } from '../src/services/aiTools.js';
import { resetActiveSessionCognitiveState } from '../src/services/builderBrainService.js';

// The exact 20 items from the real Lot 3 Purchasing Checklist Google Doc
const REAL_LOT3_GOOGLE_DOC = `Applicable to all lots and standard builds.

## 1. Quartz Hardware
- [ ] Electrical pass-through caps
- [ ] Sinks

## 2. Electrical Hardware Fixtures
- [ ] Security lights
- [ ] Contractor doorbell chime kit
- [ ] Smart doorbell — Qty: 1
- [ ] Front porch hanging light
- [ ] Exterior column lights
- [ ] Garage ceiling lights with the cap to install it
- [ ] Vanity lights
- [ ] Smart switches
- [ ] Extension rods
- [ ] Ceiling fans

## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser
- [ ] Garbage disposal power button
- [ ] Garbage disposal
- [ ] Water heater with the water heater stand and tray
- [ ] Shower kits
- [ ] Toilets
- [ ] Rough-in shower valves
- [ ] Faucets
`;

describe('Unified Real-World 9-Step Purchasing E2E Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    resetActiveSessionCognitiveState();
    purchasingService.setStorageAdapter(new LocalStoragePurchasingAdapter(localStorage));
  });

  test('Execute All 9 Sequential Real-World Steps', async () => {
    const lot3Context = { projectId: 'lot_3', activeProjectName: 'Lot 3' };
    const lot4Context = { projectId: 'lot_4', activeProjectName: 'Lot 4' };

    // STEP 1: Initial Lot 3 Migration from real Google Doc
    const migration = await purchasingService.migrateFromGoogleDocContent('lot_3', REAL_LOT3_GOOGLE_DOC);
    assert.equal(migration.success, true, 'Step 1: Migration must succeed');
    assert.equal(migration.count, 20, 'Step 1: Must migrate all 20 items');
    assert.equal(migration.items.every(i => i.status === PURCHASING_STATUSES.NEEDED), true, 'Step 1: All items must initially be needed');

    // STEP 2: "What do I still need to buy?" (Lot 3)
    const step2Res = await executeClientToolCall('get_purchasing_list', { unpurchasedOnly: true }, lot3Context);
    assert.equal(step2Res.projectId, 'lot_3', 'Step 2: Scoped to Lot 3');
    assert.equal(step2Res.totalItems, 20, 'Step 2: All 20 items needed');
    assert.equal(step2Res.unpurchasedOnly, true, 'Step 2: unpurchasedOnly is true');

    // STEP 3: "What plumbing items do I need?" (Lot 3)
    const step3Res = await executeClientToolCall('get_purchasing_list', { trade: 'plumbing', unpurchasedOnly: true }, lot3Context);
    assert.equal(step3Res.projectId, 'lot_3', 'Step 3: Scoped to Lot 3');
    assert.equal(step3Res.totalItems, 8, 'Step 3: Must return exactly 8 plumbing items');
    assert.ok(step3Res.sections.every(s => s.sectionId === 'plumbing'), 'Step 3: Only plumbing section returned');
    assert.ok(step3Res.items.some(i => i.name === 'Faucets'), 'Step 3: Faucets present');
    assert.ok(step3Res.items.some(i => i.name === 'Soap dispenser'), 'Step 3: Soap dispenser present');

    // STEP 4: "Mark the faucets as purchased." (Lot 3)
    const step4Res = await executeClientToolCall('update_purchasing_item_status', {
      itemName: 'faucets',
      status: 'purchased'
    }, lot3Context);
    assert.equal(step4Res.success, true, 'Step 4: Update must succeed');
    assert.equal(step4Res.status, 'purchased', 'Step 4: Status set to purchased');
    assert.equal(step4Res.item.itemName, 'Faucets', 'Step 4: Correct item matched via stem matching');

    // STEP 5: "What have I already purchased?" (Lot 3)
    const step5Res = await executeClientToolCall('get_purchasing_list', { status: 'purchased' }, lot3Context);
    assert.equal(step5Res.projectId, 'lot_3', 'Step 5: Scoped to Lot 3');
    assert.equal(step5Res.totalItems, 1, 'Step 5: Exactly 1 item purchased');
    assert.equal(step5Res.items[0].name, 'Faucets', 'Step 5: Purchased item is Faucets');

    // Also verify unpurchased list now has 19 items
    const step5NeededRes = await executeClientToolCall('get_purchasing_list', { unpurchasedOnly: true }, lot3Context);
    assert.equal(step5NeededRes.totalItems, 19, 'Step 5: 19 needed items remain');

    // STEP 6: "Add 6 GFCI outlets." (Lot 3)
    const step6Res = await executeClientToolCall('add_purchasing_item', {
      item: 'GFCI outlets',
      quantity: 6
    }, lot3Context);
    assert.equal(step6Res.success, true, 'Step 6: Add must succeed');
    assert.equal(step6Res.quantity, 6, 'Step 6: Quantity is 6');
    assert.equal(step6Res.category, 'Electrical Hardware Fixtures', 'Step 6: Auto-categorized to Electrical');
    assert.equal(step6Res.sectionId, 'electrical', 'Step 6: Section is electrical');

    // STEP 7: "Remove the soap dispenser." (Lot 3)
    const step7Res = await executeClientToolCall('remove_purchasing_item', {
      itemName: 'soap dispenser'
    }, lot3Context);
    assert.equal(step7Res.success, true, 'Step 7: Remove must succeed');
    assert.equal(step7Res.found, true, 'Step 7: Item was found and removed');

    // Verify Lot 3 items: 20 original - 1 removed + 1 added = 20 total (19 needed, 1 purchased)
    const lot3AllItems = await purchasingService.getItems('lot_3');
    assert.equal(lot3AllItems.length, 20, 'Lot 3 total item count');
    assert.ok(!lot3AllItems.some(i => i.itemName.toLowerCase().includes('soap dispenser')), 'Soap dispenser is gone');
    assert.ok(lot3AllItems.some(i => i.itemName === 'GFCI outlets' && i.quantity === 6), 'GFCI outlets (Qty: 6) present');
    assert.ok(lot3AllItems.some(i => i.itemName === 'Faucets' && i.status === 'purchased'), 'Faucets are purchased');

    // STEP 8: Switch to Lot 4 -> Strict Isolation Verification
    // Initialize Lot 4 from Master Template
    await purchasingService.initializeProjectFromMaster('lot_4');
    const lot4AllItems = await purchasingService.getItems('lot_4');
    assert.equal(lot4AllItems.length, 20, 'Step 8: Lot 4 initialized with standard master items');
    
    // Lot 4 must NOT have GFCI outlets (added only to Lot 3)
    assert.ok(!lot4AllItems.some(i => i.itemName === 'GFCI outlets'), 'Step 8: Lot 4 must NOT contain Lot 3 GFCI outlets');
    // Lot 4 MUST still have Soap dispenser (removed only from Lot 3)
    assert.ok(lot4AllItems.some(i => i.itemName === 'Soap dispenser'), 'Step 8: Lot 4 MUST still have Soap dispenser');
    // Lot 4 Faucets must still be "needed" (NOT purchased)
    const lot4Faucets = lot4AllItems.find(i => i.itemName === 'Faucets');
    assert.equal(lot4Faucets.status, 'needed', 'Step 8: Lot 4 Faucets must be needed, not purchased');

    // STEP 9: "Export the purchasing list" -> One-Way Google Doc Markdown Export
    const exportedMarkdown = await purchasingService.exportToGoogleDocMarkdown('lot_3');
    assert.ok(exportedMarkdown.includes('# Master Fixtures & Hardware Purchasing Checklist - Lot 3'), 'Step 9: Correct document title');
    assert.ok(exportedMarkdown.includes('## 1. Quartz Hardware'), 'Step 9: Quartz section present');
    assert.ok(exportedMarkdown.includes('## 2. Electrical Hardware Fixtures'), 'Step 9: Electrical section present');
    assert.ok(exportedMarkdown.includes('- [ ] GFCI outlets — Qty: 6'), 'Step 9: Added GFCI outlets rendered with Qty: 6');
    assert.ok(!exportedMarkdown.includes('Soap dispenser'), 'Step 9: Removed Soap dispenser NOT in export');
    assert.ok(exportedMarkdown.includes('- [x] Faucets'), 'Step 9: Purchased Faucets rendered as [x]');
    assert.ok(exportedMarkdown.includes('Smart doorbell'), 'Step 9: Preserves Smart doorbell');

    // Verify whitespace rules: exactly 1 blank line between sections, 0 between checklist items
    assert.ok(!exportedMarkdown.includes('\n\n\n'), 'Step 9: No triple newlines');
    assert.ok(!exportedMarkdown.includes('- [ ] \n'), 'Step 9: No empty checklist lines');
  });
});
