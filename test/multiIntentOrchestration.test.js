import assert from 'node:assert/strict';
import test from 'node:test';

import {
  askGeminiBrain,
  formatToolResultsForSynthesis,
  formatUserFriendlyToolError,
  formatToolResultsHumanReadable
} from '../src/services/builderBrainService.js';
import { determineTaskModel } from '../src/config/aiConfig.js';
import { executeClientToolCall } from '../src/services/aiTools.js';

// Mock Project Context with live dashboard and specs
const mockDashboardData = {
  projectInfo: {
    name: 'Lot 3',
    budgetGross: 250000,
    totalSpent: 45000,
    remainingBudget: 205000
  },
  subcontractors: [
    {
      phase: 'Electrical Rough-In',
      payee: 'Volt Masters Electric',
      contractAmount: 8500,
      totalPaid: 4500,
      remainingBalance: 4000,
      payments: [
        { date: '2026-07-15', amount: 4500, payee: 'Volt Masters Electric', description: 'Deposit 50%' }
      ]
    },
    {
      phase: 'Framing & Lumber',
      payee: 'Valley Framing Pros',
      contractAmount: 32000,
      totalPaid: 32000,
      remainingBalance: 0,
      payments: [
        { date: '2026-06-10', amount: 32000, payee: 'Valley Framing Pros', description: 'Complete framing payment' }
      ]
    }
  ]
};

const mockDriveTree = {
  directFiles: [
    { name: 'Lot3_Electrical_Plan.pdf', mimeType: 'application/pdf', id: 'file_elec_123' },
    { name: 'Lot3_Architectural_FloorPlan.pdf', mimeType: 'application/pdf', id: 'file_arch_456' }
  ],
  subfolders: [
    { name: 'Planos', id: 'folder_planos' },
    { name: 'Invoices', id: 'folder_invoices' }
  ]
};

test('Intent Classification: Compound queries automatically trigger Deep Reasoning model', () => {
  const query1 = 'How much do we owe the electrician and before I forget remind me to get lunch at Chipotle';
  const query2 = 'What did the plumber quote and also check the weather for tomorrow';
  
  assert.equal(determineTaskModel(query1), 'gemini-3.5-flash');
  assert.equal(determineTaskModel(query2), 'gemini-3.5-flash');
});

test('Tool Result Synthesis Formatter: Formats successes and failures cleanly', () => {
  const telemetry = [
    {
      name: 'save_memory',
      success: true,
      result: { saved: true, message: 'Got it. I\'ve saved that to your memory.' }
    },
    {
      name: 'get_weather_for_jobsite',
      success: false,
      error: 'The jobsite weather forecast service was temporarily unavailable.'
    }
  ];

  const synthesisText = formatToolResultsForSynthesis(telemetry);
  assert.match(synthesisText, /Tool 1 \[save_memory\].*SUCCESS/);
  assert.match(synthesisText, /Tool 2 \[get_weather_for_jobsite\].*FAILED/);
  assert.match(synthesisText, /weather forecast service was temporarily unavailable/);
});

test('User-Friendly Tool Errors: Never exposes stack traces or API details', () => {
  const weatherErr = formatUserFriendlyToolError('get_weather_for_jobsite');
  const driveErr = formatUserFriendlyToolError('get_drive_files');
  const memoryErr = formatUserFriendlyToolError('save_memory');

  assert.equal(weatherErr, 'The jobsite weather forecast service was temporarily unavailable.');
  assert.equal(driveErr, 'Google Drive document search was temporarily unreachable.');
  assert.equal(memoryErr, 'Memory database sync was temporarily unavailable.');

  // Verify none contain sensitive tokens
  assert.equal(weatherErr.includes('http'), false);
  assert.equal(weatherErr.includes('token'), false);
  assert.equal(weatherErr.includes('key'), false);
});

test('Scenario 1: Financial Question + Reminder Save (Two-Pass Synthesis)', async () => {
  let pass1Called = false;
  let pass2Called = false;
  let pass2SystemInstruction = '';
  let pass2Body = null;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      const body = JSON.parse(options.body || '{}');

      if (!pass1Called) {
        pass1Called = true;
        // First pass returns tool call to save memory
        return Response.json({
          toolCalls: [
            {
              name: 'save_memory',
              args: {
                text: 'Get lunch at Chipotle tomorrow after 3:00 p.m.',
                category: 'personal',
                importance: 'important',
                isGlobal: true,
                effectiveDate: '2026-08-21'
              }
            }
          ]
        });
      } else {
        pass2Called = true;
        pass2SystemInstruction = body.systemInstruction;
        pass2Body = body;

        // Second pass synthesizes the full multi-intent answer
        return Response.json({
          text: 'We currently owe Volt Masters Electric a remaining balance of $4,000 on the Electrical Rough-In phase ($4,500 paid of $8,500 contract). I have also saved your reminder to get lunch at Chipotle tomorrow after 3:00 p.m.'
        });
      }
    }

    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'can you tell me then how much we owe the electrician and before I forget remind me to get lunch tomorrow at Chipotle after 3:00 p.m.',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3',
    [],
    mockDriveTree
  );

  assert.equal(pass1Called, true);
  assert.equal(pass2Called, true);
  assert.equal(pass2Body.forceNoTools, true, 'Second pass MUST enforce forceNoTools: true to prevent infinite loops');
  assert.match(pass2SystemInstruction, /MULTI-INTENT TOOL EXECUTION OUTCOMES/);

  // Response must address BOTH the financial question and the reminder
  assert.match(response.text, /Volt Masters Electric|electrician|\$4,000/i);
  assert.match(response.text, /Chipotle/i);
  assert.equal(response.telemetry.synthesisMode, 'cloud_synthesis');
  assert.deepEqual(response.telemetry.toolsExecuted, ['save_memory']);
});

test('Scenario 2: Financial Question + Subcontractor Preference Memory Save', async () => {
  let pass1Called = false;
  let pass2Called = false;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      if (!pass1Called) {
        pass1Called = true;
        return Response.json({
          toolCalls: [
            {
              name: 'save_memory',
              args: {
                text: 'Volt Masters prefers draw payments on Thursdays via ACH.',
                category: 'subcontractor',
                importance: 'important',
                isGlobal: true
              }
            }
          ]
        });
      } else {
        pass2Called = true;
        return Response.json({
          text: 'Our total framing contract is fully paid ($32,000 paid to Valley Framing Pros). I have saved the note that Volt Masters prefers ACH draw payments on Thursdays.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'What is our total spent on Framing, and remember that Volt Masters prefers ACH draw payments on Thursdays',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(pass1Called, true);
  assert.equal(pass2Called, true);
  assert.match(response.text, /Framing/i);
  assert.match(response.text, /Volt Masters/i);
});

test('Scenario 3: Project Question + Document Lookup', async () => {
  const toolResult = await executeClientToolCall('get_drive_files', { keyword: 'Electrical' }, { driveTree: mockDriveTree });
  assert.equal(toolResult.found, true);
  assert.equal(toolResult.files.length, 1);
  assert.equal(toolResult.files[0].name, 'Lot3_Electrical_Plan.pdf');
});

test('Scenario 4: Two Separate Factual Questions in Single Request', async () => {
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      return Response.json({
        text: 'Total budget for Lot 3 is $250,000 with $45,000 spent so far ($205,000 remaining). We paid $4,500 to Volt Masters Electric on July 15, 2026.'
      });
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'What is our overall budget for Lot 3, and how much did we pay the electrician so far?',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.match(response.text, /\$250,000/);
  assert.match(response.text, /\$4,500/);
});

test('Scenario 5: Multiple Tool Calls Executed in Parallel/Sequence', async () => {
  let executedCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      if (executedCount === 0) {
        executedCount++;
        return Response.json({
          toolCalls: [
            {
              name: 'save_memory',
              args: { text: 'Site contact is Juan at 956-555-0199', category: 'general', importance: 'important' }
            },
            {
              name: 'get_subcontractor_balance',
              args: { tradeOrContractor: 'Electrical' }
            }
          ]
        });
      } else {
        return Response.json({
          text: 'Saved Juan as the site contact. For Electrical Rough-In, the quote is $8,500, $4,500 has been paid, and $4,000 is currently owed.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'Save Juan as the site contact (956-555-0199) and tell me the electrical balance',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(response.telemetry.toolsRequested.length, 2);
  assert.equal(response.telemetry.toolsExecuted.length, 2);
  assert.match(response.text, /Juan/);
  assert.match(response.text, /\$4,000/);
});

test('Scenario 6: Partial Tool Failure Resilience (Tool A succeeds, Tool B fails)', async () => {
  let callCount = 0;
  let receivedOutcomes = '';

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      if (callCount === 0) {
        callCount++;
        return Response.json({
          toolCalls: [
            {
              name: 'save_memory',
              args: { text: 'Meet painter on site Monday 8 AM', category: 'instruction', importance: 'important' }
            },
            {
              name: 'non_existent_or_failing_tool',
              args: {}
            }
          ]
        });
      } else {
        const body = JSON.parse(options.body || '{}');
        receivedOutcomes = body.systemInstruction;
        return Response.json({
          text: 'I have saved your note to meet the painter on site Monday at 8 AM. Note: The secondary service was temporarily unavailable.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'Meet painter on site Monday 8 AM and run diagnostics',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(response.telemetry.toolsRequested.length, 2);
  assert.equal(response.telemetry.toolsExecuted.length, 1);
  assert.equal(response.telemetry.toolsFailed.length, 1);
  assert.match(receivedOutcomes, /Tool 1 \[save_memory\].*SUCCESS/);
  assert.match(receivedOutcomes, /Tool 2 \[non_existent_or_failing_tool\].*FAILED/);
  assert.match(response.text, /painter on site/);
});

test('Scenario 7: Compound request where some parts require tools and others rely on data manifest', async () => {
  let callCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      if (callCount === 0) {
        callCount++;
        // Tool called for memory only
        return Response.json({
          toolCalls: [
            {
              name: 'save_memory',
              args: { text: 'Order inspection stickers tomorrow', category: 'general', importance: 'important' }
            }
          ]
        });
      } else {
        // Synthesis answers both manifest data and confirms memory
        return Response.json({
          text: 'Lot 3 has $205,000 remaining in gross budget ($45,000 spent). I have saved your reminder to order inspection stickers tomorrow.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'How much gross budget is left on Lot 3 and remind me to order inspection stickers tomorrow',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.match(response.text, /\$205,000/);
  assert.match(response.text, /inspection stickers/);
});
