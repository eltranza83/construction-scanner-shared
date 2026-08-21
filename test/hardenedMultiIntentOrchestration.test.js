import assert from 'node:assert/strict';
import test from 'node:test';

import {
  askGeminiBrain,
  verifyResponseGrounding,
  formatToolResultsForSynthesis,
  formatUserFriendlyToolError
} from '../src/services/builderBrainService.js';
import {
  executeClientToolCall,
  TOOL_REGISTRY,
  generateIdempotencyKey,
  checkIdempotency,
  recordIdempotency,
  clearIdempotencyCache
} from '../src/services/aiTools.js';

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
    { name: 'Planos', id: 'folder_planos' }
  ]
};

test('1. Tool Classification: All tools are explicitly categorized as READ or WRITE', () => {
  assert.equal(TOOL_REGISTRY.get_subcontractor_balance.type, 'READ');
  assert.equal(TOOL_REGISTRY.get_drive_files.type, 'READ');
  assert.equal(TOOL_REGISTRY.get_weather_for_jobsite.type, 'READ');
  assert.equal(TOOL_REGISTRY.search_memories.type, 'READ');
  assert.equal(TOOL_REGISTRY.save_memory.type, 'WRITE');
  assert.equal(TOOL_REGISTRY.update_memory.type, 'WRITE');
  assert.equal(TOOL_REGISTRY.delete_memory.type, 'WRITE');
});

test('2. Structured Tool Output Contract: All tools return success, status, data, source, and toolType', async () => {
  const readRes = await executeClientToolCall(
    'get_subcontractor_balance',
    { tradeOrContractor: 'Electrical' },
    { dashboardData: mockDashboardData }
  );

  assert.equal(readRes.success, true);
  assert.equal(readRes.status, 'ok');
  assert.equal(readRes.toolType, 'READ');
  assert.match(readRes.source, /Google Sheets/i);
  assert.ok(readRes.data);
  assert.equal(typeof readRes._executionDurationMs, 'number');
});

test('3. Idempotency Engine: Prevents duplicate records on retried WRITE tool calls', async () => {
  clearIdempotencyCache();
  const writeArgs = { text: 'Order 20 amp breakers from City Electric', category: 'electrical' };

  // First execution
  const res1 = await executeClientToolCall('save_memory', writeArgs, { projectId: 'lot_3' });
  assert.equal(res1.success, true);
  assert.equal(res1.status, 'ok');
  assert.equal(res1.isDuplicate, false);

  // Immediate retry with identical arguments
  const res2 = await executeClientToolCall('save_memory', writeArgs, { projectId: 'lot_3' });
  assert.equal(res2.success, true);
  assert.equal(res2.status, 'deduplicated');
  assert.equal(res2.isDuplicate, true);
});

test('4. Grounding Check: Fully grounded response passes verification', () => {
  const verifiedText = 'We owe Volt Masters Electric $4,000 on Lot 3 out of their $8,500 contract.';
  const toolResults = [
    {
      name: 'get_subcontractor_balance',
      data: { remainingBalance: 4000, quote: 8500, totalPaid: 4500 }
    }
  ];

  const report = verifyResponseGrounding(verifiedText, { dashboardData: mockDashboardData }, toolResults);
  assert.equal(report.status, 'fully_grounded');
  assert.equal(report.unsupportedClaims.length, 0);
  assert.ok(report.supportedClaims.includes('$4,000'));
  assert.ok(report.supportedClaims.includes('$8,500'));
  assert.ok(report.supportedClaims.includes('Volt Masters Electric'));
});

test('5. Anti-Hallucination Guard: Flags unsupported / hallucinated dollar amounts', () => {
  // $99,999 does not exist anywhere in project data or tool results
  const hallucinatedText = 'We currently owe Volt Masters Electric $99,999 for the electrical work.';
  const toolResults = [
    {
      name: 'get_subcontractor_balance',
      data: { remainingBalance: 4000, quote: 8500 }
    }
  ];

  const report = verifyResponseGrounding(hallucinatedText, { dashboardData: mockDashboardData }, toolResults);
  assert.ok(report.status === 'partially_grounded' || report.status === 'unsupported_claims_detected');
  assert.deepEqual(report.unsupportedClaims, ['$99,999']);
});

test('6. 2-Intent Request: READ + WRITE orchestrated in Two-Pass ReAct loop', async () => {
  clearIdempotencyCache();
  let passCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      passCount++;
      if (passCount === 1) {
        return Response.json({
          toolCalls: [
            { name: 'get_subcontractor_balance', args: { tradeOrContractor: 'Electrical' } },
            { name: 'save_memory', args: { text: 'Meet plumber on Tuesday 9 AM' } }
          ]
        });
      } else {
        return Response.json({
          text: 'Remaining balance for electrical rough-in is $4,000. I have saved your reminder to meet the plumber on Tuesday at 9 AM.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'Check electrical balance and remind me to meet plumber on Tuesday 9 AM',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(passCount, 2);
  assert.equal(response.telemetry.synthesisMode, 'cloud_synthesis');
  assert.equal(response.telemetry.tools.length, 2);
  assert.equal(response.telemetry.grounding.status, 'fully_grounded');
});

test('7. 3+ Intent Request: Multiple READs + WRITE in single request', async () => {
  clearIdempotencyCache();
  let passCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      passCount++;
      if (passCount === 1) {
        return Response.json({
          toolCalls: [
            { name: 'get_subcontractor_balance', args: { tradeOrContractor: 'Electrical' } },
            { name: 'get_drive_files', args: { keyword: 'FloorPlan' } },
            { name: 'save_memory', args: { text: 'Client requested brushed nickel faucets' } }
          ]
        });
      } else {
        return Response.json({
          text: 'We owe $4,000 for electrical. The architectural floor plan Lot3_Architectural_FloorPlan.pdf is available in Drive. I also recorded that the client requested brushed nickel faucets.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'How much do we owe the electrician, do we have the floor plan in Drive, and note that client requested brushed nickel faucets',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3',
    [],
    mockDriveTree
  );

  assert.equal(passCount, 2);
  assert.equal(response.telemetry.toolsRequested.length, 3);
  assert.equal(response.telemetry.toolsExecuted.length, 3);
  assert.match(response.text, /\$4,000/);
  assert.match(response.text, /floor plan/i);
  assert.match(response.text, /brushed nickel/i);
});

test('8. Multiple WRITE Actions: Two distinct memory saves execute cleanly', async () => {
  clearIdempotencyCache();
  let passCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      passCount++;
      if (passCount === 1) {
        return Response.json({
          toolCalls: [
            { name: 'save_memory', args: { text: 'Gate code is 4491', category: 'access' } },
            { name: 'save_memory', args: { text: 'Deliver lumber to rear alley', category: 'delivery' } }
          ]
        });
      } else {
        return Response.json({
          text: 'I have saved both notes: gate code 4491 and the instruction to deliver lumber to the rear alley.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'Save the gate code as 4491 and also note to deliver lumber to the rear alley',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(response.telemetry.tools.length, 2);
  assert.equal(response.telemetry.tools.every(t => t.type === 'WRITE'), true);
  assert.equal(response.telemetry.toolsExecuted.length, 2);
});

test('9. Missing / Partial Tool Results: Gracefully synthesizes not_found status', async () => {
  let passCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      passCount++;
      if (passCount === 1) {
        return Response.json({
          toolCalls: [
            { name: 'get_subcontractor_balance', args: { tradeOrContractor: 'Pool Contractor' } }
          ]
        });
      } else {
        return Response.json({
          text: 'I checked your project records, and there are currently no quotes or payment records for a pool contractor on Lot 3.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'What do we owe the pool contractor?',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.match(response.text, /no quotes or payment records/i);
});

test('10. Provenance Tracking: Accurate source identification across pipeline', async () => {
  clearIdempotencyCache();
  let passCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/ask-brain')) {
      passCount++;
      if (passCount === 1) {
        return Response.json({
          toolCalls: [
            { name: 'get_subcontractor_balance', args: { tradeOrContractor: 'Electrical' } }
          ]
        });
      } else {
        return Response.json({
          text: 'According to Google Sheets, remaining balance for electrical is $4,000.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'What is the electrical balance?',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.ok(response.telemetry.sourcesUsed.some(s => s.includes('Google Sheets')));
  assert.equal(response.telemetry.tools[0].source.includes('Google Sheets'), true);
});
