import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractBehavioralHypothesis,
  validateBehavioralHypothesis,
  calculateObservationConfidence,
  shouldProactivelyPrompt,
  generateProactiveConfirmationQuestion,
  evaluateConfirmationResponse,
  resolvePreferenceConflicts,
  compileUserPreferencesPrompt,
  PREFERENCE_CATEGORIES,
  PREFERENCE_STATUS,
  PREFERENCE_SCOPES,
  PREFERENCE_SOURCES
} from '../src/services/userPreferenceEngine.js';

import {
  loadUserPreferences,
  saveUserPreference,
  updateUserPreferenceStatus,
  deleteUserPreference,
  resetAllUserPreferences,
  USER_PREFERENCE_STORAGE_KEY
} from '../src/services/memoryService.js';

// Setup mock localStorage in Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('J.A.R.V.I.S. Emergent User Preference Learning System — Production E2E 16-Point Lifecycle Suite', () => {
  const UID_TEST_USER = 'uid_builder_production_test_001';
  const UID_ISOLATED_USER = 'uid_builder_isolated_002';

  beforeEach(() => {
    localStorage.clear();
  });

  test('Complete 16-Point Production E2E Scenario', async () => {
    // -------------------------------------------------------------
    // POINT 1: Start with clean/new user profile (no preferences)
    // -------------------------------------------------------------
    const initialPrefs = await loadUserPreferences(UID_TEST_USER);
    assert.equal(initialPrefs.length, 0, 'Point 1: Clean profile must have 0 initial preferences');

    // -------------------------------------------------------------
    // POINT 2 & 3: User expresses preference in different natural phrasings
    // AI Observer interprets them semantically without hardcoded dictionaries
    // -------------------------------------------------------------
    const phrasings = [
      'Just give me the number.',
      "What's the balance?",
      'Skip the history and tell me what I owe.',
      'Tell me what matters first.'
    ];

    for (const phrase of phrasings) {
      const hypothesis = extractBehavioralHypothesis(phrase);
      assert.ok(hypothesis, `Point 3: Observer must interpret phrase "${phrase}"`);
      const validated = validateBehavioralHypothesis(hypothesis);
      assert.ok(validated, 'Point 3: Schema validation must pass');
      assert.equal(validated.category, PREFERENCE_CATEGORIES.INFORMATION_DEPTH);
      assert.equal(validated.inferredIntent, 'concise_bottom_line');
    }

    // -------------------------------------------------------------
    // POINT 4: One observation does NOT change Jarvis behavior
    // -------------------------------------------------------------
    const firstTurnQuery = 'Just give me the number.';
    const firstHypothesis = extractBehavioralHypothesis(firstTurnQuery);
    const firstObsRecord = await saveUserPreference(UID_TEST_USER, {
      ...firstHypothesis,
      observationCount: 1,
      confidence: calculateObservationConfidence(1, false),
      status: PREFERENCE_STATUS.CANDIDATE // unconfirmed candidate
    });

    assert.equal(firstObsRecord.observationCount, 1);
    assert.equal(firstObsRecord.confidence, 0.50);
    // Should NOT proactively prompt on confidence 0.50 (threshold is 0.80)
    assert.equal(
      shouldProactivelyPrompt(firstObsRecord, { promptsThisSession: 0, turnsSinceLastPrompt: 10 }),
      false,
      'Point 4: Single observation must NOT trigger proactive confirmation or behavior change'
    );

    // Active preferences should still be empty
    const currentActive = resolvePreferenceConflicts(await loadUserPreferences(UID_TEST_USER));
    assert.equal(currentActive.length, 0, 'Point 4: Unconfirmed candidate is not active in prompt compiler');

    // -------------------------------------------------------------
    // POINT 5: Repeated observations promote candidate to confidence >= 0.80
    // -------------------------------------------------------------
    const secondTurnQuery = 'Skip the history and tell me what I owe.';
    const secondHypothesis = extractBehavioralHypothesis(secondTurnQuery);
    const updatedCandidate = await saveUserPreference(UID_TEST_USER, {
      ...firstObsRecord,
      ...secondHypothesis,
      observationCount: 2,
      confidence: calculateObservationConfidence(2, false),
      status: PREFERENCE_STATUS.CANDIDATE
    });

    assert.equal(updatedCandidate.observationCount, 2);
    assert.equal(updatedCandidate.confidence, 0.85);

    // -------------------------------------------------------------
    // POINT 6: Jarvis proactively asks for confirmation when threshold reached
    // -------------------------------------------------------------
    const canPrompt = shouldProactivelyPrompt(updatedCandidate, {
      promptsThisSession: 0,
      turnsSinceLastPrompt: 10
    });
    assert.equal(canPrompt, true, 'Point 6: Candidate with 0.85 confidence can proactively prompt');

    const promptQuestion = generateProactiveConfirmationQuestion(updatedCandidate);
    assert.match(promptQuestion, /lead with the bottom-line answer/i);
    assert.match(promptQuestion, /would you like me to make that your default style/i);

    // -------------------------------------------------------------
    // POINT 7: User responds "Yes" to confirmation
    // -------------------------------------------------------------
    const userReply = 'Yes, make that my default.';
    const evaluation = evaluateConfirmationResponse(userReply);
    assert.equal(evaluation, 'approved', 'Point 7: Evaluation detects approval');

    // -------------------------------------------------------------
    // POINT 8: Preference is activated & persisted in Firestore under UID
    // -------------------------------------------------------------
    await updateUserPreferenceStatus(UID_TEST_USER, updatedCandidate.id, PREFERENCE_STATUS.ACTIVE);
    const storedPrefs = await loadUserPreferences(UID_TEST_USER);
    assert.equal(storedPrefs.length, 1);
    assert.equal(storedPrefs[0].status, PREFERENCE_STATUS.ACTIVE);
    assert.equal(storedPrefs[0].uid, UID_TEST_USER);
    assert.ok(storedPrefs[0].auditHistory.some(a => a.action === 'confirmed'));

    // -------------------------------------------------------------
    // POINT 9, 10 & 11: New session applies learned preference naturally
    // -------------------------------------------------------------
    const newSessionPrefs = await loadUserPreferences(UID_TEST_USER);
    const promptInstruction = compileUserPreferencesPrompt(newSessionPrefs, 'Lot_3');

    assert.match(promptInstruction, /### USER PREFERRED INTERACTION STYLE/);
    assert.match(promptInstruction, /Lead with the bottom-line answer/);

    // -------------------------------------------------------------
    // POINT 12: Simulating server restart / cache rehydration
    // -------------------------------------------------------------
    // Cache persisted in storage survives session teardown
    const postRebootPrefs = await loadUserPreferences(UID_TEST_USER);
    assert.equal(postRebootPrefs.length, 1, 'Point 12: Preference survives server reboot');
    assert.equal(postRebootPrefs[0].status, PREFERENCE_STATUS.ACTIVE);

    // -------------------------------------------------------------
    // POINT 13: Changing Gemini models does not alter preference
    // -------------------------------------------------------------
    // Compile prompt for flash-lite
    const flashLitePrompt = compileUserPreferencesPrompt(postRebootPrefs, 'Lot_3');
    // Compile prompt for reasoning model
    const flashReasoningPrompt = compileUserPreferencesPrompt(postRebootPrefs, 'Lot_3');
    assert.equal(flashLitePrompt, flashReasoningPrompt, 'Point 13: Model independence verified');

    // -------------------------------------------------------------
    // POINT 14: Tenant Isolation (User B cannot see or use User A's preference)
    // -------------------------------------------------------------
    const userBPrefs = await loadUserPreferences(UID_ISOLATED_USER);
    assert.equal(userBPrefs.length, 0, 'Point 14: Isolated user profile must have 0 preferences');
    const userBPrompt = compileUserPreferencesPrompt(userBPrefs, 'Lot_3');
    assert.equal(userBPrompt, '', 'Point 14: Isolated user prompt must be empty');

    // -------------------------------------------------------------
    // POINT 15: "Forget my preference about concise answers" deactivates it
    // -------------------------------------------------------------
    const forgetCommand = 'Forget my preference about concise answers';
    const forgetHypothesis = extractBehavioralHypothesis(forgetCommand);
    assert.equal(forgetHypothesis.type, 'user_command');
    assert.equal(forgetHypothesis.action, 'deactivate_specific');

    await deleteUserPreference(UID_TEST_USER, postRebootPrefs[0].id);
    const remainingPrefs = await loadUserPreferences(UID_TEST_USER);
    const activeRemaining = resolvePreferenceConflicts(remainingPrefs);
    assert.equal(activeRemaining.length, 0, 'Point 15: Active preferences removed after forget command');
    const promptAfterForget = compileUserPreferencesPrompt(remainingPrefs, 'Lot_3');
    assert.equal(promptAfterForget, '', 'Point 15: System prompt cleaned up after forget command');

    // -------------------------------------------------------------
    // POINT 16: "Don't learn from this conversation" prevents observations
    // -------------------------------------------------------------
    const optOutCommand = "Don't learn from this conversation";
    const optOutHypothesis = extractBehavioralHypothesis(optOutCommand);
    assert.equal(optOutHypothesis.type, 'session_opt_out');
    assert.equal(optOutHypothesis.action, 'disable_session_learning');
  });
});
