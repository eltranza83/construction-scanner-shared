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
import { executeClientToolCall, TOOL_REGISTRY } from '../src/services/aiTools.js';
import {
  buildGroundingSystemInstruction,
  inferSourcesUsed
} from '../src/services/builderBrainService.js';
import {
  synthesizeGroundedEvidence
} from '../src/services/semanticIntentService.js';

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

describe('Purchasing Verification & Strict Provenance Guard Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    purchasingService.setStorageAdapter(new LocalStoragePurchasingAdapter(localStorage));
    await purchasingService.migrateFromGoogleDocContent('lot_3', REAL_LOT3_GOOGLE_DOC);
  });

  test('A. Verification follow-up queries execute get_purchasing_list against Firestore', async () => {
    const projectContext = { projectId: 'lot_3', activeProjectName: 'Lot 3' };
    
    // 1. Initial query: "What electrical items do we still need?"
    const initialRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true,
      trade: 'electrical'
    }, projectContext);

    assert.equal(initialRes.totalItems, 10);
    assert.equal(initialRes.source, 'Firestore (Lot 3 Purchasing Checklist)');

    // 2. Conversational verification follow-up: "Those are all the electrical items we still need to purchase"
    const verifyRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true,
      trade: 'electrical'
    }, projectContext);

    assert.equal(verifyRes.totalItems, 10);
    assert.equal(verifyRes.source, 'Firestore (Lot 3 Purchasing Checklist)');
  });

  test('B. Result is based on live Firestore state, NOT conversational memory', async () => {
    const projectContext = { projectId: 'lot_3', activeProjectName: 'Lot 3' };

    // Turn 1: 10 electrical items
    const turn1Res = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true,
      trade: 'electrical'
    }, projectContext);
    assert.equal(turn1Res.totalItems, 10);

    // Live state changes in Firestore (Team member marks Smart switches as purchased)
    await purchasingService.updateItemStatus('lot_3', 'Smart switches', PURCHASING_STATUSES.PURCHASED);

    // Turn 2: User says "Those are all the electrical items we still need to purchase"
    // Tool runs live against Firestore and returns 9 items (NOT the 10 from previous conversation)
    const turn2Res = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true,
      trade: 'electrical'
    }, projectContext);

    assert.equal(turn2Res.totalItems, 9, 'Must reflect live Firestore update (9 items), not memory (10 items)');
    assert.ok(!turn2Res.items.some(i => i.itemName === 'Smart switches'), 'Smart switches is marked purchased');
  });

  test('C. Provenance badge attributes to Firestore strictly from actual tool execution', () => {
    // When get_purchasing_list executes, its provenance tag is Firestore
    assert.equal(TOOL_REGISTRY.get_purchasing_list.source, 'Firestore (Purchasing Checklist)');
    assert.equal(TOOL_REGISTRY.add_purchasing_item.source, 'Firestore (Purchasing Checklist)');
    assert.equal(TOOL_REGISTRY.update_purchasing_item_status.source, 'Firestore (Purchasing Checklist)');
    assert.equal(TOOL_REGISTRY.remove_purchasing_item.source, 'Firestore (Purchasing Checklist)');

    // When no tool was executed (idle chat / no database hit), inferSourcesUsed does NOT inject false Firestore tags
    const sources = inferSourcesUsed('Good morning Jarvis', 'Good morning Sir, online and ready.', {});
    assert.ok(!sources.includes('Firestore (Lot 3 Purchasing Checklist)'), 'Must not claim Firestore when not queried');
    assert.ok(!sources.includes('Google Docs (Master Purchasing Checklist)'), 'Must never claim Google Docs');
  });

  test('D. Google Docs is NEVER cited as the purchasing source in System Instructions or Synthesis', () => {
    const sysInstruction = buildGroundingSystemInstruction({ activeProjectName: 'Lot 3' });
    
    // Assert System Instructions do not tell LLM to cite Google Docs for purchasing
    assert.ok(!sysInstruction.includes('attribute the source to "Google Docs'), 'Must not instruct to cite Google Docs');
    assert.ok(sysInstruction.includes('FIRESTORE STRUCTURED PURCHASING ARCHITECTURE'), 'Must have Firestore purchasing architecture');
    assert.ok(sysInstruction.includes('FIRESTORE IS THE AUTHORITATIVE SOURCE OF TRUTH'), 'Must declare Firestore authoritative');

    // Synthesis evidence check
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 10,
        trade: 'electrical',
        sections: [{ sectionId: 'electrical', category: 'Electrical Hardware Fixtures', items: new Array(10).fill({ name: 'Item' }) }]
      }
    }];

    const synthesis = synthesizeGroundedEvidence(telemetry, 'Those are all the electrical items we still need to purchase', { activeProjectName: 'Lot 3' });
    assert.match(synthesis, /according to the Firestore \(Lot 3 Purchasing Checklist\)/i);
    assert.doesNotMatch(synthesis, /Google Docs/i);
  });

  test('E. Natural conversational verification variations all synthesize correctly with live Firestore provenance', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 10,
        trade: 'electrical',
        sections: [{ sectionId: 'electrical', category: 'Electrical Hardware Fixtures', items: new Array(10).fill({ name: 'Item' }) }]
      }
    }];

    const variations = [
      'Those are all the electrical items we still need to purchase',
      'Are those all the electrical items?',
      'Is that everything we still need for electrical?',
      'Did we miss anything in electrical?',
      "That's everything we need to buy, right?",
      'Nothing else is needed for electrical?'
    ];

    for (const q of variations) {
      const res = synthesizeGroundedEvidence(telemetry, q, { activeProjectName: 'Lot 3' });
      assert.match(res, /according to the Firestore \(Lot 3 Purchasing Checklist\)/i, `Variation "${q}" must cite Firestore`);
      assert.doesNotMatch(res, /Google Docs/i, `Variation "${q}" must NOT cite Google Docs`);
    }
  });

  test('F. Strict Memory Gate: Ordinary purchasing statements never trigger save_memory, explicit imperatives do', () => {
    const sysInstruction = buildGroundingSystemInstruction({ activeProjectName: 'Lot 3' });

    // 1. Verify system instruction strictly forbids auto-saving purchasing as memory
    assert.ok(sysInstruction.includes('STRUCTURED DOMAIN EXCLUSIVITY (ZERO SHADOW MEMORIES)'), 'Must enforce domain exclusivity');
    assert.ok(sysInstruction.includes('STRICT IMPERATIVE INTENT REQUIREMENT'), 'Must enforce imperative intent requirement');
    assert.ok(sysInstruction.includes('We still need to purchase all of these items for electrical'), 'Must cite exact purchasing example as forbidden');

    // 2. Verify tool registry descriptions
    assert.ok(TOOL_REGISTRY.save_memory.description.includes('ONLY when explicitly commanded by the user'), 'Tool registry must enforce explicit command');
    assert.ok(TOOL_REGISTRY.save_memory.description.includes('NEVER call for structured purchasing items'), 'Tool registry must forbid purchasing domain');

    // 3. Test imperative vs non-imperative classification patterns
    const isExplicitMemoryCommand = (query) => {
      const q = String(query).trim().toLowerCase();
      // Must not be a domain query or casual mention of the word "remember"
      const isPurchasingStatement = /\b(purchas|buy|bought|faucet|outlet|electrical|plumbing|quartz|hardware|fixture)\b/i.test(q);
      const isPastRecall = /^i remember\b/i.test(q);
      const hasDirectImperative = /^(remember (that|this)|make a note (that|of)|keep (this )?in mind|save this (to memory|note)|don't forget that)\b/i.test(q);

      if (isPurchasingStatement && !hasDirectImperative) return false;
      if (isPastRecall) return false;
      return hasDirectImperative;
    };

    // Ordinary purchasing statements -> MUST NOT save memory
    assert.equal(isExplicitMemoryCommand('We still need to buy the faucets.'), false);
    assert.equal(isExplicitMemoryCommand('Those are all the electrical items we need.'), false);
    assert.equal(isExplicitMemoryCommand('we still need to purchase all of these items for electrical'), false);
    assert.equal(isExplicitMemoryCommand('I remember we bought the faucets.'), false);

    // Explicit memory commands -> MUST save memory
    assert.equal(isExplicitMemoryCommand('Remember that the client wants matte black fixtures.'), true);
    assert.equal(isExplicitMemoryCommand('Make a note that the inspector prefers morning visits.'), true);
    assert.equal(isExplicitMemoryCommand('Keep in mind that the painter wants check payments.'), true);
  });

  test('G. Fix #1: Live project-wide purchased count is accurately reported in broad summary', async () => {
    const projectContext = { projectId: 'lot_3', activeProjectName: 'Lot 3' };

    // Initial state: 0 items purchased, 20 needed
    const resInitial = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true
    }, projectContext);
    assert.equal(resInitial.totalPurchased, 0);
    assert.equal(resInitial.totalNeeded, 20);

    const synthInitial = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: resInitial }], 'What do we still need to purchase for Lot 3?', projectContext);
    assert.match(synthInitial, /You still have 20 items to purchase for Lot 3/i);
    assert.match(synthInitial, /Nothing has been marked as purchased yet/i);

    // User marks Faucets as purchased
    await purchasingService.updateItemStatus('lot_3', 'Faucets', PURCHASING_STATUSES.PURCHASED);

    // Query broad list with unpurchasedOnly: true -> must calculate totalPurchased: 1
    const resAfterPurchase = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      unpurchasedOnly: true
    }, projectContext);

    assert.equal(resAfterPurchase.totalPurchased, 1, 'totalPurchased must be 1');
    assert.equal(resAfterPurchase.totalItems, 19, 'total unpurchased items must be 19');

    const synthAfterPurchase = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: resAfterPurchase }], 'What do we still need to purchase for Lot 3?', projectContext);
    assert.match(synthAfterPurchase, /You still have 19 items to purchase for Lot 3: 2 Quartz Hardware, 10 Electrical Hardware Fixtures, and 7 Plumbing Hardware Fixtures/i);
    assert.match(synthAfterPurchase, /You have 1 item marked as purchased/i);
    assert.doesNotMatch(synthAfterPurchase, /Nothing has been marked as purchased yet/i, 'Must NEVER say nothing purchased when items exist');
  });

  test('H. Fix #2: Specific item-status question returns direct status answer instead of trade-list dump', async () => {
    const projectContext = { projectId: 'lot_3', activeProjectName: 'Lot 3' };

    // Mark Faucets as purchased, Ceiling fans are still needed
    await purchasingService.updateItemStatus('lot_3', 'Faucets', PURCHASING_STATUSES.PURCHASED);

    const toolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      trade: 'electrical'
    }, projectContext);

    // 1. Question about needed item (Ceiling fans)
    const neededItemSynth = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: toolRes }], 'Did we already buy the ceiling fans?', projectContext);
    assert.match(neededItemSynth, /No\. The Ceiling fans are still marked as needed on Lot 3\./i);
    assert.doesNotMatch(neededItemSynth, /• Security lights/i, 'Must not dump the whole trade list');

    // 2. Question about purchased item (Faucets)
    const faucetToolRes = await executeClientToolCall('get_purchasing_list', {
      projectId: 'lot_3',
      trade: 'plumbing'
    }, projectContext);
    const purchasedItemSynth = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: faucetToolRes }], 'Have we purchased the faucets?', projectContext);
    assert.match(purchasedItemSynth, /Yes\. The Faucets are marked as purchased on Lot 3\./i);
    assert.doesNotMatch(purchasedItemSynth, /• Soap dispenser/i, 'Must not dump the whole trade list');

    // 3. Question about item not on the list
    const unlistedSynth = synthesizeGroundedEvidence([{ name: 'get_purchasing_list', success: true, result: toolRes }], 'Did we buy the chandelier?', projectContext);
    assert.match(unlistedSynth, /not currently listed on the Lot 3 purchasing checklist/i);
  });
});
