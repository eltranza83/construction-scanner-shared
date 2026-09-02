import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { askGeminiBrain } from '../src/services/builderBrainService.js';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}


describe('J.A.R.V.I.S. Assistant forceDeepReasoning ReferenceError Regression Suite', () => {
  test('1. Static source audit: GlobalAIAssistant.jsx defines forceDeepReasoning before askGeminiBrain', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/GlobalAIAssistant.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    assert.ok(
      content.includes('const forceDeepReasoning = false;'),
      'GlobalAIAssistant.jsx must explicitly define const forceDeepReasoning = false;'
    );

    const declIndex = content.indexOf('const forceDeepReasoning = false;');
    const callIndex = content.indexOf('askGeminiBrain(');
    assert.ok(declIndex > -1, 'Declaration must exist');
    assert.ok(callIndex > -1, 'Call must exist');
    assert.ok(declIndex < callIndex, 'Declaration must occur before askGeminiBrain call');
  });

  test('2. Runtime call: normal J.A.R.V.I.S. message executes without ReferenceError', async () => {
    globalThis.fetch = async (url, options = {}) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({text: 'I can hear you loud and clear, Sir.', telemetry: {modelUsed: 'gemini-2.5-flash'}})
      };
    };

    const query = 'little Jarvis can you hear me';
    const projectName = 'Lot 3';
    const apiKey = 'test-key';
    const currentDashboard = null;
    const projectId = 'lot_3';
    const messages = [];
    const currentLiveTree = null;
    const fileAttachment = null;
    const forceDeepReasoning = false;
    const googleToken = 'mock-google-token';
    const options = { onNavigateTab: () => {} };

    let caughtError = null;
    let result = null;

    try {
      result = await askGeminiBrain(
        query,
        [],
        projectName,
        apiKey,
        currentDashboard,
        projectId,
        messages,
        currentLiveTree,
        fileAttachment,
        forceDeepReasoning,
        googleToken,
        options
      );
    } catch (err) {
      caughtError = err;
    }

    assert.equal(caughtError, null, 'askGeminiBrain must not throw ReferenceError or any error');
    assert.ok(result, 'Result payload must be returned');
    assert.equal(result.text, 'I can hear you loud and clear, Sir.');
  });

  test('3. JSX Tag Integrity: All JSX components used in GlobalAIAssistant.jsx are imported or declared', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/GlobalAIAssistant.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    const tags = [...new Set([...content.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]))];
    const missing = [];

    for (const tag of tags) {
      if (['React', 'Fragment', 'Suspense'].includes(tag)) continue;
      const imported = new RegExp('\\b' + tag + '\\b').test(content.slice(0, content.indexOf('export default')));
      const declared = new RegExp('(function|class|const|let|var)\\s+' + tag + '\\b').test(content);
      if (!imported && !declared) {
        missing.push(tag);
      }
    }

    assert.deepEqual(missing, [], `GlobalAIAssistant.jsx has undefined JSX tags: ${missing.join(', ')}`);
    assert.ok(content.includes('Loader2'), 'Loader2 must be imported and present');
  });
});
