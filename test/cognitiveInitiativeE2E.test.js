import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  askGeminiBrain,
  resetActiveSessionCognitiveState,
  getActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';

import {
  loadInitiativeMemory
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

describe('SiteTactix Cognitive Initiative Conversational E2E Test Suite', () => {
  const mockContext = {
    activeProjectName: 'Lot 3',
    projectId: 'lot_3',
    userId: 'e2e_builder_1',
    dashData: {
      projectInfo: {
        budgetGross: '$310,500.00',
        budgetBuild: '$240,000.00',
        totalSpent: '$6,000.00',
        capitalBalance: '$234,000.00'
      },
      subcontractors: [
        {
          phase: 'Electrical Rough-in',
          payee: 'Sparky Electric LLC',
          originalQuote: '$18,000.00',
          totalSpent: '$3,000.00',
          remainingBalance: '$15,000.00'
        }
      ]
    },
    items: [
      {
        id: 'rem_insp_1',
        title: 'Municipal Electrical Rough-in Inspection',
        category: 'reminder',
        status: 'pending',
        targetDate: '2026-08-22'
      }
    ],
    memoriesData: []
  };

  beforeEach(() => {
    localStorage.clear();
    resetActiveSessionCognitiveState();
    localStorage.setItem('jobscan_reminders', JSON.stringify(mockContext.items));
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

    // Verify Turn 2: Immediate tool execution without asking twice
    assert.ok(turn2Res.text.includes('Electrical Rough-in Inspection'), 'Must return inspection status');
    assert.equal(turn2Res.telemetry?.intent, 'Proactive Action Confirmed');
    assert.ok(turn2Res.telemetry?.sourcesUsed?.includes('Municipal Inspections') || turn2Res.telemetry?.sourcesUsed?.includes('Field Reminders (SiteTactix App)'));
    
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

  test('E2E Scenario 2: Suggestion Rejected ("No thanks") clears pending state and respects decline', async () => {
    // Setup pending suggestion in session
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

  test('E2E Scenario 3: Number Correction suppresses initiative completely', async () => {
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
