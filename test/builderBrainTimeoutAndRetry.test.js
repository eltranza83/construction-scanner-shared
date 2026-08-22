import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  askGeminiBrain,
  resetActiveSessionCognitiveState
} from '../src/services/builderBrainService.js';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('SiteTactix BuilderBrain Timeout, Automatic Retry & First-Person Phrasing Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    resetActiveSessionCognitiveState();
  });

  test('1. Automatic 1s Retry on transient timeout/network drop recovers successfully', async () => {
    let attemptCount = 0;
    globalThis.fetch = async (url, options = {}) => {
      attemptCount++;
      if (attemptCount === 1) {
        // Simulate initial network drop/timeout
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'AbortError';
        throw error;
      }
      // Attempt 2 succeeds immediately
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Sparky Electric balance on Lot 3 is $15,000.',
          telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
        })
      };
    };

    const res = await askGeminiBrain('What do we owe the electrician?', [], 'Lot 3');
    assert.equal(attemptCount, 2, 'Must have attempted retry on initial failure');
    assert.ok(res.text.includes('$15,000'), 'Must recover and return successful response');
    assert.equal(res.telemetry?.source, 'Gemini Cloud AI');
    assert.equal(res.telemetry?.latencyMetrics?.retryOccurred, true, 'latencyMetrics must flag retry');
    assert.equal(res.telemetry?.latencyMetrics?.latencyHealth, 'RECOVERED_RETRY_UX_WARNING', 'latencyMetrics must flag UX warning');
  });

  test('2. Exhausted timeout gracefully switches to local mode with accurate message', async () => {
    globalThis.fetch = async () => {
      const error = new Error('Network timeout');
      error.name = 'AbortError';
      throw error;
    };

    const res = await askGeminiBrain('What is the framing budget?', [], 'Lot 3');
    assert.ok(res.text.includes('took longer than the expected response window'), 'Must explain request took longer');
    assert.ok(res.text.includes('switched to local mode'), 'Must inform user of local mode switch');
    assert.doesNotMatch(res.text, /temporarily unable to connect to the cloud AI assistant/i, 'Must NOT use old confusing offline message');
    assert.equal(res.telemetry?.intent, 'Local Mode Switch');
    assert.equal(res.telemetry?.errorCode, 'NETWORK_TIMEOUT');
  });

  test('3. Local memory fallback uses natural first-person phrasing', async () => {
    globalThis.fetch = async () => {
      throw new Error('Connection failed');
    };

    // Save a memory in local storage with the official memory key
    localStorage.setItem('sitetactix_persistent_memories_v1', JSON.stringify([
      {
        id: 'mem_1',
        text: 'Painter prefers cash payment upon completion',
        projectId: 'lot_3',
        scope: 'project',
        active: true
      }
    ]));

    const res = await askGeminiBrain('What did the painter say?', [], 'Lot 3');
    assert.ok(res.text.includes('According to my memory:'), 'Must use natural first-person phrasing');
    assert.doesNotMatch(res.text, /According to your saved memory/i, 'Must NOT use third-person phrasing');
    assert.equal(res.telemetry?.source, 'J.A.R.V.I.S. Memory (Persistent Vault)');
  });
});
