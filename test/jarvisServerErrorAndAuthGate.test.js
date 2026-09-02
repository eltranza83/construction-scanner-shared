import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { askGeminiBrain, resetActiveSessionCognitiveState } from '../src/services/builderBrainService.js';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('J.A.R.V.I.S. Server Error Surfaces, Auth Hydration & Selective Retry Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    resetActiveSessionCognitiveState();
  });

  test('1. 401 Unauthorized returns safe server error and never retries', async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Sign is is required.' })
      };
    };

    const res = await askGeminiBrain('Are you there?', [], 'Lot 3');
    assert.equal(callCount, 1, '401 must NEVER be retried');
    assert.equal(res.text, 'Sign is is required.');
    assert.equal(res.telemetry?.errorCode, 401);
  });

  test('2. 403 Forbidden returns safe server error and never retries', async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      return {
        ok: false,
        status: 403,
        json: async () => ({ error: 'Scanner access is not authorized for this account.' })
      };
    };

    const res = await askGeminiBrain('Are you there?', [], 'Lot 3');
    assert.equal(callCount, 1, '403 must NEVER be retried');
    assert.equal(res.text, 'Scanner access is not authorized for this account.');
    assert.equal(res.telemetry?.errorCode, 403);
  });

  test('3. 429 Too Many Requests returns rate-limit message and never retries', async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too many requests. Please slow down and try again in a few moments.' })
      };
    };

    const res = await askGeminiBrain('Are you there?', [], 'Lot 3');
    assert.equal(callCount, 1, '429 must NEVER be retried');
    assert.equal(res.text, 'Too many requests. Please slow down and try again in a few moments.');
    assert.equal(res.telemetry?.errorCode, 429);
  });

  test('4. 503 Service Unavailable returns user-friendly administrator message and never retries', async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: 'AI Service is not configured on the server. Please configure GEMINI_API_KEY.' })
      };
    };

    const res = await askGeminiBrain('Are you there?', [], 'Lot 3');
    assert.equal(callCount, 1, '503 configuration error must NEVER be retried');
    assert.equal(res.text, 'AI service is temporarily unavailable; contact the administrator.');
    assert.equal(res.telemetry?.errorCode, 503);
    assert.ok(res.telemetry?.rawServerError.includes('GEMINI_API_KEY'), 'Raw server error captured in telemetry');
  });

  test('5. Genuine AbortError (timeout) triggers retry and falls back to local timeout phrasing', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const res = await askGeminiBrain('Check plumbing details', [], 'Lot 3');
    assert.equal(callCount, 2, 'Timeouts must attempt exactly 1 retry');
    assert.ok(res.text.includes('took longer than the expected response window'), 'Timeout phrasing must be used');
    assert.equal(res.telemetry?.errorCode, 'NETWORK_TIMEOUT');
  });

  test('6. Browser Auth Guard: unauthenticated session returns clean sign-in message without calling network', async () => {
    globalThis.window = {};
    let askBrainCalled = false;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/ask-brain')) {
        askBrainCalled = true;
      }
      return { ok: true, json: async () => ({}) };
    };

    try {
      const res = await askGeminiBrain('Are you there?', [], 'Lot 3');
      assert.equal(askBrainCalled, false, 'Ask brain must not be called when unauthenticated in browser');
      assert.equal(res.text, 'Sign in is required. Please sign in to your account to use J.A.R.V.I.S.');
      assert.equal(res.telemetry?.errorCode, 401);
    } finally {
      delete globalThis.window;
    }
  });

  test('7. Browser Auth Guard: authenticated mock user with valid token calls /api/ask-brain with Bearer header', async () => {
    globalThis.window = {};
    let capturedHeaders = null;
    globalThis.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({text: 'Yes Sir, I am right here.'})
      };
    };

    try {
      const mockUser = {
        getIdToken: async () => 'mock-valid-jwt-token'
      };

      const res = await askGeminiBrain('Are you there?', [], 'Lot 3', '', null, '', [], null, null, false, null, { mockUser });
      assert.equal(capturedHeaders?.Authorization, 'Bearer mock-valid-jwt-token');
      assert.equal(res.text, 'Yes Sir, I am right here.');
    } finally {
      delete globalThis.window;
    }
  });
});
