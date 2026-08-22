import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  askGeminiBrain,
  resetActiveSessionCognitiveState,
  getActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';

import {
  loadInitiativeMemory,
  saveInitiativeMemory
} from '../src/services/cognitiveInitiativeEngine.js';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('SiteTactix Cognitive Initiative Conversational E2E Hardening Suite', () => {
  const mockInspections = [
    {
      id: 'rough_in_combo',
      title: 'Rough-in Combo (Plumbing, Electrical, Mechanical)',
      isPassed: false,
      progress: 60,
      items: [{ title: 'Electrical Rough-in Box Verification', checked: false }]
    }
  ];

  beforeEach(() => {
    localStorage.clear();
    resetActiveSessionCognitiveState();
    localStorage.setItem('jobscan_inspections_lot_3', JSON.stringify(mockInspections));
    localStorage.setItem('jobscan_active_project_id', 'lot_3');
  });

  test('E2E Scenario 1: Multi-Turn Turn 1 (Observation) -> Turn 2 (Confirmation "Yeah, check that") -> Turn 3 (Sign-off "Thanks")', async () => {
    // --- Turn 1: User says "I'm heading over to Lot 3." ---
    globalThis.fetch = async (url, options = {}) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Good evening. Drive safe to Lot 3.',
          telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
        })
      };
    };

    const turn1Res = await askGeminiBrain("I'm heading over to Lot 3.", [], 'Lot 3');
    
    // Verify Turn 1
    assert.ok(turn1Res.text.includes('Lot 3'), 'Must acknowledge destination');
    assert.ok(turn1Res.text.includes('inspections') || turn1Res.text.includes('pending'), 'Must weave single proactive offer');
    assert.doesNotMatch(turn1Res.text, /\$310,500/, 'Must NOT dump unrequested budget');
    
    const stateAfterTurn1 = getActiveSessionCognitiveState();
    assert.ok(stateAfterTurn1.pendingProactiveSuggestion, 'Pending suggestion must be stored in session state');

    // --- Turn 2: User responds "Yeah, check that." ---
    const turn2Res = await askGeminiBrain("Yeah, check that.", [
      { role: 'user', content: "I'm heading over to Lot 3." },
      { role: 'assistant', content: turn1Res.text }
    ], 'Lot 3');

    // Verify Turn 2: Immediate tool execution with truthful provenance
    assert.ok(turn2Res.text.includes('Rough-in Combo') || turn2Res.text.includes('inspection'), 'Must return inspection status');
    assert.equal(turn2Res.telemetry?.intent, 'Proactive Action Confirmed');
    assert.deepEqual(turn2Res.telemetry?.sourcesUsed, ['Municipal Inspections'], 'Source MUST be Municipal Inspections, never Google Sheets or Field Reminders');
    
    const stateAfterTurn2 = getActiveSessionCognitiveState();
    assert.equal(stateAfterTurn2.pendingProactiveSuggestion, null, 'Pending suggestion must be cleared');

    // Verify Initiative Memory updated
    const memory = loadInitiativeMemory('default_user');
    assert.ok(memory.totalAccepted >= 1, 'Initiative memory must record accepted suggestion');

    // --- Turn 3: User says "Thanks." ---
    const turn3Res = await askGeminiBrain("Thanks Jarvis!", [], 'Lot 3');
    assert.ok(turn3Res.text.includes('welcome') || turn3Res.text.includes('Lot 3'), 'Must give clean conversational sign-off');
    assert.equal(turn3Res.telemetry?.intent, 'Sign Off');
    assert.doesNotMatch(turn3Res.text, /\$310,500/, 'Must NOT dump data on sign-off');
  });

  test('E2E Scenario 2: Confirmation with "Go ahead" immediately executes tool', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Good.', telemetry: { modelUsed: 'gemini-3.5-flash-lite' } })
    });

    await askGeminiBrain("The electrician is finishing today.", [], 'Lot 3');
    
    const confirmRes = await askGeminiBrain("Go ahead, check it.", [], 'Lot 3');
    assert.equal(confirmRes.telemetry?.intent, 'Proactive Action Confirmed');
    assert.deepEqual(confirmRes.telemetry?.sourcesUsed, ['Municipal Inspections']);
  });

  test('E2E Scenario 3: Suggestion Rejected ("No thanks") clears pending state and respects decline', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Good.', telemetry: { modelUsed: 'gemini-3.5-flash-lite' } })
    });

    await askGeminiBrain("The electrician is finishing today.", [], 'Lot 3');
    
    const rejectRes = await askGeminiBrain("No thanks, don't check.", [], 'Lot 3');
    assert.ok(rejectRes.text.includes("won't check") || rejectRes.text.includes("Understood"));
    assert.equal(rejectRes.telemetry?.intent, 'Proactive Suggestion Rejected');
    
    const state = getActiveSessionCognitiveState();
    assert.equal(state.pendingProactiveSuggestion, null);
  });

  test('E2E Scenario 4: User ignores suggestion and changes topic -> No repetitive nagging', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Sparky Electric remaining balance is $15,000.',
        telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
      })
    });

    // Turn 1: Generates suggestion
    await askGeminiBrain("I'm heading over to Lot 3.", [], 'Lot 3');
    
    // Turn 2: User asks completely different question (ignores suggestion)
    const turn2Res = await askGeminiBrain("What do we owe the electrician?", [], 'Lot 3');
    
    assert.ok(turn2Res.text.includes('$15,000'));
    assert.doesNotMatch(turn2Res.text, /Want me to check if any municipal inspections/i, 'Must NOT repeat the ignored suggestion');
  });

  test('E2E Scenario 5: Number Correction suppresses initiative completely', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Understood. I have updated the electrical balance record to $12,000.',
        telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
      })
    });

    const res = await askGeminiBrain("No, that's not $15,000. It's $12,000.", [], 'Lot 3');
    assert.ok(res.text.includes('$12,000'));
    assert.doesNotMatch(res.text, /Want me to check/i, 'Must NOT make proactive suggestions when user is correcting data');
  });
});
