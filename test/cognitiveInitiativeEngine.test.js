import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCognitiveInitiative,
  resolvePendingSuggestionConfirmation,
  recordSuggestionOutcome,
  isConversationEnding,
  isUserCorrectingInformation,
  loadInitiativeMemory,
  saveInitiativeMemory,
  DEFAULT_INITIATIVE_CONFIG,
  INITIATIVE_OUTCOMES
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

describe('SiteTactix Cognitive Initiative Engine Unit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Default threshold is 0.70 (Balanced)', () => {
    assert.equal(DEFAULT_INITIATIVE_CONFIG.defaultThreshold, 0.70);
    assert.equal(DEFAULT_INITIATIVE_CONFIG.brevityThreshold, 0.85);
  });

  test('2. High-value observation (Jobsite visit) triggers warranted suggestion', () => {
    const decision = evaluateCognitiveInitiative({
      query: "I'm heading over to Lot 3.",
      conversationHistory: [],
      context: { userId: 'builder_1', activeProjectName: 'Lot 3' },
      preferences: [],
      sessionState: { turnIndex: 1, lastSuggestionTurn: -999 }
    });

    assert.equal(decision.warranted, true);
    assert.ok(decision.score >= 0.70, `Score ${decision.score} should be >= 0.70`);
    assert.equal(decision.domain, 'municipal_inspections');
    assert.ok(decision.suggestionText.includes('inspections') || decision.suggestionText.includes('pending'));
    assert.ok(decision.suppressData.includes('grossBudget'), 'Must suppress unrequested financial data');
  });

  test('3. High-value observation (Trade finishing) triggers inspection check suggestion', () => {
    const decision = evaluateCognitiveInitiative({
      query: "The electrician is finishing today.",
      conversationHistory: [],
      context: { userId: 'builder_1', activeProjectName: 'Lot 3' },
      preferences: [],
      sessionState: { turnIndex: 1, lastSuggestionTurn: -999 }
    });

    assert.equal(decision.warranted, true);
    assert.ok(decision.score >= 0.70);
    assert.equal(decision.domain, 'municipal_inspections');
    assert.ok(decision.suggestionText.includes('electrician') || decision.suggestionText.includes('inspection'));
  });

  test('4. Casual greeting suppresses initiative and data dumps', () => {
    const decision = evaluateCognitiveInitiative({
      query: "What's up Jarvis?",
      conversationHistory: [],
      context: { userId: 'builder_1' },
      preferences: [],
      sessionState: { turnIndex: 1 }
    });

    assert.equal(decision.warranted, false);
    assert.equal(decision.suppressSuggestions, true);
    assert.ok(decision.unsolicitedDataToSuppress.includes('all_project_data'));
  });

  test('5. User correcting information sets interruptionCost to 1.0 and suppresses initiative', () => {
    const isCorr = isUserCorrectingInformation("No, that's not $15,000. It's $12,000.");
    assert.equal(isCorr, true);

    const decision = evaluateCognitiveInitiative({
      query: "No, that's not $15,000. It's $12,000.",
      conversationHistory: [],
      context: { userId: 'builder_1' },
      preferences: [],
      sessionState: { turnIndex: 3 }
    });

    assert.equal(decision.warranted, false);
    assert.equal(decision.interruptionCost, 1.0);
    assert.equal(decision.suppressSuggestions, true);
  });

  test('6. Conversation-ending phrases suppress initiative and recognize sign-off', () => {
    assert.equal(isConversationEnding("Thanks Jarvis!"), true);
    assert.equal(isConversationEnding("Got it, that's all."), true);
    assert.equal(isConversationEnding("All set for now."), true);

    const decision = evaluateCognitiveInitiative({
      query: "Thanks Jarvis, all set for now.",
      conversationHistory: [],
      context: { userId: 'builder_1' },
      preferences: [],
      sessionState: { turnIndex: 5 }
    });

    assert.equal(decision.warranted, false);
    assert.equal(decision.intentType, 'sign_off');
  });

  test('7. Affirmative confirmation detection recognizes multiple confirmation forms', () => {
    const pendingSession = {
      pendingProactiveSuggestion: {
        id: 'sug_test_1',
        domain: 'municipal_inspections',
        suggestionText: 'Want me to check pending inspections?',
        suggestedAction: { toolName: 'get_project_schedule', args: { category: 'reminder' } }
      }
    };

    const confirmations = [
      'Yeah.', 'Sure', 'Go ahead', 'Check it', 'Do that', 'Please', 'Yup', 'Check that', 'Let\'s check'
    ];

    for (const phrase of confirmations) {
      const res = resolvePendingSuggestionConfirmation(phrase, pendingSession);
      assert.ok(res, `Failed for phrase: "${phrase}"`);
      assert.equal(res.isConfirmed, true, `Should be confirmed for phrase: "${phrase}"`);
      assert.equal(res.pendingAction.toolName, 'get_project_schedule');
    }
  });

  test('8. Rejection detection recognizes decline phrases', () => {
    const pendingSession = {
      pendingProactiveSuggestion: {
        id: 'sug_test_2',
        domain: 'municipal_inspections',
        suggestionText: 'Want me to check pending inspections?',
        suggestedAction: { toolName: 'get_project_schedule' }
      }
    };

    const rejections = ['No', 'Don\'t', 'Stop', 'Nah', 'Not now', 'Don\'t check', 'No thanks'];
    for (const phrase of rejections) {
      const res = resolvePendingSuggestionConfirmation(phrase, pendingSession);
      assert.ok(res, `Failed for rejection: "${phrase}"`);
      assert.equal(res.isConfirmed, false);
      assert.equal(res.isRejected, true);
    }
  });

  test('9. Initiative memory updates domain affinity on acceptance and rejection', () => {
    const userId = 'builder_affinity_test';
    
    // Initial state
    const mem1 = loadInitiativeMemory(userId);
    const initialInspAffinity = mem1.domainAffinities.municipal_inspections;

    // Accept suggestion
    recordSuggestionOutcome(userId, 'municipal_inspections', INITIATIVE_OUTCOMES.ACCEPTED);
    const mem2 = loadInitiativeMemory(userId);
    assert.ok(mem2.domainAffinities.municipal_inspections > initialInspAffinity, 'Affinity should increase after acceptance');

    // Reject suggestion
    recordSuggestionOutcome(userId, 'finances', INITIATIVE_OUTCOMES.REJECTED);
    const mem3 = loadInitiativeMemory(userId);
    assert.ok(mem3.domainAffinities.finances < 0.60, 'Finances affinity should decrease after rejection');
    assert.ok(mem3.rejectedCooldowns.finances > Date.now(), '7-day cooldown should be set');
  });

  test('10. Brevity preference raises threshold and filters low-confidence opportunities', () => {
    const brevityPreferences = [
      {
        id: 'pref_brevity',
        category: 'response_style',
        inferredIntent: 'concise_bottom_line',
        status: 'active'
      }
    ];

    const decision = evaluateCognitiveInitiative({
      query: "I'm heading over to Lot 3.",
      conversationHistory: [],
      context: { userId: 'builder_1' },
      preferences: brevityPreferences,
      sessionState: { turnIndex: 1, lastSuggestionTurn: -999 }
    });

    assert.equal(decision.threshold, 0.85, 'Threshold should be elevated to 0.85');
  });

  test('11. Explicit opt-out preference shuts off all proactive initiative', () => {
    const optOutPreferences = [
      {
        id: 'pref_optout',
        category: 'proactivity',
        inferredIntent: 'disable_proactivity',
        preferenceStatement: "Don't suggest anything unless I ask.",
        status: 'active'
      }
    ];

    const decision = evaluateCognitiveInitiative({
      query: "I'm heading over to Lot 3.",
      conversationHistory: [],
      context: { userId: 'builder_1' },
      preferences: optOutPreferences,
      sessionState: { turnIndex: 1 }
    });

    assert.equal(decision.warranted, false);
    assert.equal(decision.score, 0.0);
    assert.equal(decision.suppressSuggestions, true);
  });
});
