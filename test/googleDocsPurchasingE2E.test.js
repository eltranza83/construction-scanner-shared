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
  TOOL_REGISTRY
} from '../src/services/aiTools.js';
import {
  askGeminiBrain,
  resetActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';
import {
  saveProjectPurchasingDoc,
  loadProjectPurchasingDoc
} from '../src/services/googleDocsPurchasingService.js';

const INITIAL_PURCHASING_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Lot 3
Applicable to all lots and standard builds.

<!-- section: quartz -->
## 1. Quartz Hardware
- [ ] Electrical pass-through caps
- [ ] Sinks

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] Security lights
- [ ] Smart doorbell — Qty: 1
- [ ] Vanity lights

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser
- [ ] Garbage disposal
- [ ] Toilets
`;

describe('SiteTactix Google Docs Master Purchasing List Integration E2E Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    saveProjectPurchasingDoc(localStorage, 'lot_3', INITIAL_PURCHASING_DOC);
    resetActiveSessionCognitiveState();
  });

  test('1. TOOL_REGISTRY has exact truthful provenance for purchasing tools', () => {
    assert.equal(TOOL_REGISTRY.get_purchasing_list.source, 'Google Docs (Master Purchasing Checklist)');
    assert.equal(TOOL_REGISTRY.add_purchasing_item.source, 'Google Docs (Master Purchasing Checklist)');
    assert.equal(TOOL_REGISTRY.update_purchasing_item_status.source, 'Google Docs (Master Purchasing Checklist)');
  });

  test('2. get_purchasing_list retrieves and filters trade items', async () => {
    const res = await executeClientToolCall('get_purchasing_list', { trade: 'plumbing' }, { projectId: 'lot_3' });
    assert.equal(res.success, true);
    assert.equal(res.found, true);
    assert.equal(res.totalItems, 3);
    assert.equal(res.sections[0].category, 'Plumbing Hardware Fixtures');
  });

  test('3. add_purchasing_item routes automatically to Electrical and inserts at section end', async () => {
    const res = await executeClientToolCall('add_purchasing_item', { item: 'dimmer switches', quantity: 2 }, { projectId: 'lot_3' });
    assert.equal(res.success, true);
    assert.equal(res.category, 'Electrical Hardware Fixtures');

    const updatedDoc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    assert.ok(updatedDoc.includes('- [ ] dimmer switches — Qty: 2'));
    
    // Verify it was inserted before plumbing section
    const dimmerIndex = updatedDoc.indexOf('dimmer switches');
    const plumbingIndex = updatedDoc.indexOf('Plumbing Hardware Fixtures');
    assert.ok(dimmerIndex < plumbingIndex, 'Must insert before next section begins');
  });

  test('4. add_purchasing_item with existing item performs autonomous quantity increment', async () => {
    // Existing has "Smart doorbell — Qty: 1"
    const res = await executeClientToolCall('add_purchasing_item', { item: 'Smart doorbell', quantity: 2 }, { projectId: 'lot_3' });
    assert.equal(res.success, true);
    assert.equal(res.isDuplicate, true);
    assert.equal(res.updatedQuantity, 3);

    const updatedDoc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    assert.ok(updatedDoc.includes('Smart doorbell — Qty: 3'));
  });

  test('5. add_purchasing_item respects explicit trade override', async () => {
    const res = await executeClientToolCall('add_purchasing_item', { 
      item: 'Support brackets', 
      quantity: 4, 
      category: 'quartz' 
    }, { projectId: 'lot_3' });
    assert.equal(res.success, true);
    assert.equal(res.category, 'Quartz Hardware');

    const updatedDoc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    assert.ok(updatedDoc.includes('Support brackets — Qty: 4'));
  });

  test('6. update_purchasing_item_status marks item as purchased [x]', async () => {
    const res = await executeClientToolCall('update_purchasing_item_status', { 
      itemName: 'Soap dispenser', 
      isPurchased: true 
    }, { projectId: 'lot_3' });
    assert.equal(res.success, true);
    assert.equal(res.isPurchased, true);

    const updatedDoc = loadProjectPurchasingDoc(localStorage, 'lot_3');
    assert.ok(updatedDoc.includes('- [x] Soap dispenser'));
  });

  test('7. End-to-End askGeminiBrain query routes to Google Docs provenance', async () => {
    globalThis.fetch = async (url, options = {}) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'According to your master purchasing checklist in Google Docs, you still need to buy 1 soap dispenser, 1 garbage disposal, and toilets for the plumber.',
          toolCalls: [{ name: 'get_purchasing_list', args: { trade: 'plumbing', projectId: 'lot_3' } }]
        })
      };
    };

    const res = await askGeminiBrain('What do I still need for the plumber?', [], 'Lot 3');
    assert.ok(res.text.includes('soap dispenser'));
    assert.equal(res.telemetry?.toolsExecuted[0], 'get_purchasing_list');
    assert.ok(res.telemetry?.sourcesUsed.includes('Google Docs (Master Purchasing Checklist)'));
  });
});
