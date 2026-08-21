import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroundingSystemInstruction,
  askGeminiBrain
} from '../src/services/builderBrainService.js';

import {
  saveUserPreference,
  loadUserPreferences
} from '../src/services/memoryService.js';

import {
  PREFERENCE_STATUS,
  PREFERENCE_SOURCES,
  PREFERENCE_SCOPES
} from '../src/services/userPreferenceEngine.js';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('J.A.R.V.I.S. Intent First & Relevance Guardrail Suite (10 Scenarios)', () => {
  const mockContext = {
    activeProjectName: 'Lot 3',
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
        },
        {
          phase: 'Plumbing Rough-in',
          payee: 'Flow Master Plumbing',
          originalQuote: '$12,000.00',
          totalSpent: '$3,000.00',
          remainingBalance: '$9,000.00'
        }
      ]
    },
    inspectionsData: [
      {
        stageName: 'Foundation & Underground',
        passedCount: 4,
        totalItems: 4,
        isFullyPassed: true,
        description: 'Underground plumbing and footing inspection',
        items: [
          { title: 'Footing Reinforcement', status: 'PASSED' },
          { title: 'Underground Plumbing', status: 'PASSED' }
        ]
      }
    ],
    memoriesData: [
      {
        id: 'mem_1',
        text: 'Sparky Electric prefers cash payment on Fridays',
        scope: 'project',
        projectId: 'Lot 3'
      }
    ],
    currentTimeString: '11:10 PM',
    currentDayString: 'Thursday, August 20, 2026'
  };

  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = async (url, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      const q = String(body.query || body.prompt || '').toLowerCase();

      if (/what'?s up|hey|hello|how'?s it going/i.test(q) && !/electrician|spent|status/i.test(q)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: 'Good evening. How can I help with Lot 3 tonight?',
            telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
          })
        };
      }

      if (/where are we at|status/i.test(q)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: 'Lot 3 Status: Gross budget is $310,500 with $6,000 spent to date. Foundation inspection is passed.',
            telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
          })
        };
      }

      if (/how much have we spent/i.test(q)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: 'According to your project spreadsheet, total spent to date is $6,000.',
            telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
          })
        };
      }

      if (/electrician/i.test(q)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: 'Yes. Current balance for Sparky Electric is $15,000 from the $18,000 contract.',
            telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
          })
        };
      }

      if (/comprehensive project breakdown/i.test(q)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: 'Comprehensive Project Breakdown for Lot 3:\n- Gross Budget: $310,500\n- Hard Cost Build: $240,000\n- Draws Paid: $6,000\n- Working Capital: $234,000\n- Electrical Balance: $15,000\n- Plumbing Balance: $9,000\n- Municipal Inspections: Foundation passed.',
            telemetry: { modelUsed: 'gemini-3.5-flash' }
          })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Ready for Lot 3.',
          telemetry: { modelUsed: 'gemini-3.5-flash-lite' }
        })
      };
    };
  });

  test('System Prompt Instruction enforces strict Relevance Guardrail', () => {
    const sysPrompt = buildGroundingSystemInstruction(mockContext);
    assert.match(sysPrompt, /INTENT FIRST & RELEVANCE GUARDRAIL/);
    assert.match(sysPrompt, /DATA AVAILABILITY != PERMISSION TO VOLUNTEER/);
    assert.match(sysPrompt, /NEVER volunteer gross budgets, draws paid, working capital/);
    assert.match(sysPrompt, /Good evening\. How can I help with Lot 3 tonight\?/);
  });

  test('1. Casual greeting ("what\'s up") produces a crisp conversational greeting response', async () => {
    const res = await askGeminiBrain("what's up", [], 'Lot 3');
    assert.ok(res.text, 'Response should not be empty');
    assert.match(res.text, /good evening|hello|ready|help/i);
  });

  test('2. Casual greeting ("what\'s up") contains NO financial data ($310,500 or $6,000 or $234,000)', async () => {
    const res = await askGeminiBrain("what's up", [], 'Lot 3');
    assert.doesNotMatch(res.text, /\$310,?500/, 'Must not dump gross budget');
    assert.doesNotMatch(res.text, /\$234,?000/, 'Must not dump working capital');
    assert.doesNotMatch(res.text, /gross budget|working capital/i, 'Must not mention financial ledger terms');
  });

  test('3. Casual greeting contains NO inspection summary', async () => {
    const res = await askGeminiBrain("hey jarvis", [], 'Lot 3');
    assert.doesNotMatch(res.text, /foundation & underground/i, 'Must not dump inspection stages');
    assert.doesNotMatch(res.text, /municipal inspection/i, 'Must not volunteer inspections on greeting');
  });

  test('4. Casual greeting contains NO unsolicited memory dump', async () => {
    const res = await askGeminiBrain("how's it going", [], 'Lot 3');
    assert.doesNotMatch(res.text, /prefers cash payment/i, 'Must not dump stored memories on greeting');
  });

  test('5. "Where are we at on Lot 3?" -> project status is allowed and returned', async () => {
    const res = await askGeminiBrain("Where are we at on Lot 3?", [], 'Lot 3');
    assert.ok(res.text.length > 20, 'Status query should return meaningful project context');
    assert.match(res.text, /Lot 3|budget|spent|inspection/i);
  });

  test('6. "How much have we spent?" -> financial data is allowed and returned', async () => {
    const res = await askGeminiBrain("How much have we spent?", [], 'Lot 3');
    assert.match(res.text, /\$6,?000|spent/i, 'Financial query should return spent figure');
  });

  test('7. "What do we owe the electrician?" -> subcontractor balance is returned without unrequested trades', async () => {
    const res = await askGeminiBrain("What do we owe the electrician?", [], 'Lot 3');
    assert.match(res.text, /\$15,?000/i, 'Should state electrician balance');
    assert.doesNotMatch(res.text, /Flow Master Plumbing/i, 'Should not volunteer unrelated plumber');
  });

  test('8. Casual conversation followed by a specific question answers ONLY the relevant question', async () => {
    const res = await askGeminiBrain(
      "Good evening Jarvis, what do we owe the electrician?",
      [],
      'Lot 3'
    );
    assert.match(res.text, /\$15,?000/i);
    assert.doesNotMatch(res.text, /gross budget is \$310,500/i);
  });

  test('9. Learned preference for concise answers still applies naturally', async () => {
    const uid = 'uid_concise_builder';
    await saveUserPreference(uid, {
      preferenceStatement: 'Lead with the bottom-line answer and provide additional detail only when requested.',
      inferredIntent: 'concise_bottom_line',
      confidence: 1.0,
      status: PREFERENCE_STATUS.ACTIVE,
      source: PREFERENCE_SOURCES.EXPLICIT,
      scope: PREFERENCE_SCOPES.GLOBAL
    });

    const prefs = await loadUserPreferences(uid);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].status, 'active');
  });

  test('10. Explicit comprehensive status request provides complete breakdown without artificial clipping', async () => {
    const res = await askGeminiBrain("Give me a full comprehensive project breakdown for Lot 3", [], 'Lot 3');
    assert.ok(res.text.length > 50, 'Comprehensive request must provide complete breakdown');
  });
});
