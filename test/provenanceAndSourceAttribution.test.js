import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_REGISTRY,
  executeClientToolCall
} from '../src/services/aiTools.js';

import {
  buildGroundingSystemInstruction,
  detectGroundedSourcesUsed,
  askGeminiBrain
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

describe('SiteTactix Granular & Truthful Provenance Pipeline Suite', () => {
  const mockContext = {
    activeProjectName: 'Lot 3',
    projectId: 'lot_3',
    userId: 'test_builder',
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
        id: 'rem_1',
        title: 'Check window silicone caulking',
        category: 'reminder',
        status: 'pending',
        targetDate: '2026-08-23'
      }
    ],
    memoriesData: [
      {
        id: 'mem_painter_1',
        text: 'Tell the painters to paint the piece of wood on the north side of the house outside for house number one',
        scope: 'project',
        projectId: 'Lot 3'
      }
    ],
    currentTimeString: '12:10 PM',
    currentDayString: 'Saturday, August 22, 2026'
  };

  beforeEach(() => {
    localStorage.clear();
  });

  test('1. TOOL_REGISTRY: All tools have exact, truthful provenance labels', () => {
    assert.equal(TOOL_REGISTRY.get_project_schedule.source, 'Field Reminders (SiteTactix App)');
    assert.notEqual(TOOL_REGISTRY.get_project_schedule.source, 'Google Sheets: Summary_Dashboard Schedule & Reminders');
    assert.equal(TOOL_REGISTRY.get_project_budget.source, 'Google Sheets (Project Financials)');
    assert.equal(TOOL_REGISTRY.get_subcontractor_balance.source, 'Google Sheets (Subcontractor Ledger)');
    assert.equal(TOOL_REGISTRY.search_memories.source, 'J.A.R.V.I.S. Memory (Persistent Vault)');
    assert.equal(TOOL_REGISTRY.save_memory.source, 'J.A.R.V.I.S. Memory (Persistent Vault)');
    assert.equal(TOOL_REGISTRY.get_weather_for_jobsite.source, 'Weather API');
    assert.equal(TOOL_REGISTRY.get_drive_files.source, 'Google Drive');
  });

  test('2. Tool Execution Provenance: get_project_schedule attaches Field Reminders source', async () => {
    const res = await executeClientToolCall(
      'get_project_schedule',
      { category: 'all' },
      mockContext,
      'corr_sched_test'
    );
    assert.equal(res.source, 'Field Reminders (SiteTactix App)');
    assert.equal(res.success, true);
    assert.doesNotMatch(res.source, /Google Sheets/i);
  });

  test('3. Tool Execution Provenance: get_subcontractor_balance attaches Subcontractor Ledger source', async () => {
    const res = await executeClientToolCall(
      'get_subcontractor_balance',
      { tradeOrContractor: 'electrician' },
      mockContext,
      'corr_sub_test'
    );
    assert.equal(res.source, 'Google Sheets (Subcontractor Ledger)');
    assert.equal(res.success, true);
  });

  test('4. System Prompt Instruction: Rule 12 strictly forbids attributing reminders to Google Sheets', () => {
    const prompt = buildGroundingSystemInstruction(mockContext);
    assert.match(prompt, /STRICT TRUTHFUL DATA PROVENANCE & ATTRIBUTION/);
    assert.match(prompt, /Contains ONLY financial numbers, budgets, payments, and trade balances/);
    assert.match(prompt, /STRICTLY FORBIDDEN from stating or implying that Google Sheets contains calendar reminders/);
  });

  test('5. Grounded Source Detection: Financial query attributes strictly to Google Sheets', () => {
    const sources = detectGroundedSourcesUsed(
      'What is our total spent and gross budget?',
      'Gross budget is $310,500 with $6,000 draws paid.',
      mockContext
    );
    assert.deepEqual(sources, ['Google Sheets (Project Financials)']);
  });

  test('6. Grounded Source Detection: App reminder query attributes to Field Reminders', () => {
    const sources = detectGroundedSourcesUsed(
      'What field reminders do we have in our task list for tomorrow?',
      'According to your pending reminders, you have: Check window silicone caulking.',
      mockContext
    );
    assert.deepEqual(sources, ['Field Reminders (SiteTactix App)']);
  });

  test('7. Grounded Source Detection: Memory query attributes strictly to J.A.R.V.I.S. Memory', () => {
    const sources = detectGroundedSourcesUsed(
      'What did you remember about the painter for Lot 3?',
      'According to your saved memory: Tell the painters to paint the piece of wood on the north side.',
      mockContext
    );
    assert.deepEqual(sources, ['J.A.R.V.I.S. Memory (Persistent Vault)']);
  });

  test('8. Grounded Source Detection: Casual greeting uses NO data sources', () => {
    const sources = detectGroundedSourcesUsed(
      'what is up jarvis',
      'Good morning. How can I help with Lot 3 today?',
      mockContext
    );
    assert.deepEqual(sources, []);
  });

  test('9. Real End-to-End Multi-Source Scenario: Electrician balance (Google Sheets) + Painter note (J.A.R.V.I.S. Memory)', async () => {
    let callCount = 0;
    globalThis.fetch = async (url, options = {}) => {
      callCount++;
      const body = JSON.parse(options.body || '{}');

      // Pass 1: Gemini emits toolCalls for subcontractor balance and memory search
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            toolCalls: [
              { name: 'get_subcontractor_balance', args: { tradeOrContractor: 'electrician' } },
              { name: 'search_memories', args: { query: 'painter' } }
            ]
          })
        };
      }

      // Pass 2: Gemini synthesizes the final grounded answer
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Sparky Electric has a remaining balance of $15,000 on Lot 3. For the painters, your saved memory notes to tell them to paint the piece of wood on the north side of the house for house number one.',
          telemetry: {
            modelUsed: 'gemini-3.5-flash-lite'
          }
        })
      };
    };

    const res = await askGeminiBrain(
      'What do we owe the electrician and what reminders do we have for the painters?',
      [],
      'Lot 3'
    );

    assert.ok(res.text.includes('$15,000'), 'Must contain electrician balance');
    assert.ok(res.text.includes('painters'), 'Must contain painter reminder');
    
    // Check telemetry sourcesUsed
    const sources = res.telemetry?.sourcesUsed || [];
    assert.ok(sources.includes('Google Sheets (Subcontractor Ledger)'), 'Must include Google Sheets Subcontractor Ledger');
    assert.ok(sources.includes('J.A.R.V.I.S. Memory (Persistent Vault)'), 'Must include J.A.R.V.I.S. Memory');
    assert.equal(sources.length, 2, 'Must have exactly 2 distinct sources');
    assert.doesNotMatch(JSON.stringify(sources), /Google Sheets: Summary_Dashboard Schedule & Reminders/, 'Must NEVER contain old fused string');
  });

  test('10. Real End-to-End Multi-Source Scenario: Financials (Google Sheets) + App Field Reminder (Field Reminders)', async () => {
    let callCount = 0;
    globalThis.fetch = async (url, options = {}) => {
      callCount++;
      const body = JSON.parse(options.body || '{}');

      // Pass 1: Tool execution
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            toolCalls: [
              { name: 'get_project_budget', args: {} },
              { name: 'get_project_schedule', args: { category: 'reminder' } }
            ]
          })
        };
      }

      // Pass 2: Synthesis
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Total spent to date is $6,000 from Google Sheets. Your in-app field reminders list 1 item: Check window silicone caulking.',
          telemetry: {
            modelUsed: 'gemini-3.5-flash-lite'
          }
        })
      };
    };

    const res = await askGeminiBrain(
      'How much have we spent and what field reminders are on the app list?',
      [],
      'Lot 3'
    );

    const sources = res.telemetry?.sourcesUsed || [];
    assert.ok(sources.includes('Google Sheets (Project Financials)'), 'Must include Google Sheets');
    assert.ok(sources.includes('Field Reminders (SiteTactix App)'), 'Must include Field Reminders');
    assert.equal(sources.length, 2, 'Must separate both sources');
  });
});
