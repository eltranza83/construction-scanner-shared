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
  TOOL_TIMEOUT_MS,
  generateIdempotencyKey,
  checkIdempotency,
  recordIdempotency,
  clearIdempotencyCache,
  circuitBreaker,
  sanitizeToolArgs,
  validateToolResultContract,
  withToolTimeout
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
    }
  ]
};

const mockDriveTree = {
  directFiles: [
    { name: 'Lot3_Electrical_Plan.pdf', mimeType: 'application/pdf', id: 'file_elec_123' }
  ],
  subfolders: []
};

test('1. Concurrent Duplicate WRITE Race: In-flight mutex prevents race-condition duplicates', async () => {
  clearIdempotencyCache();
  const writeArgs = { text: 'Install GFCI outlet on rear patio', category: 'electrical' };
  const projectContext = { projectId: 'lot_3' };
  const correlationId = 'corr_test_race_123';

  // Fire 5 concurrent write requests simultaneously at the exact same tick
  const promises = [
    executeClientToolCall('save_memory', writeArgs, projectContext, correlationId),
    executeClientToolCall('save_memory', writeArgs, projectContext, correlationId),
    executeClientToolCall('save_memory', writeArgs, projectContext, correlationId),
    executeClientToolCall('save_memory', writeArgs, projectContext, correlationId),
    executeClientToolCall('save_memory', writeArgs, projectContext, correlationId)
  ];

  const results = await Promise.all(promises);

  // All 5 must succeed
  assert.equal(results.length, 5);
  results.forEach(res => {
    assert.equal(res.success, true);
    assert.equal(res.schemaVersion, '1.0');
    assert.equal(res.correlationId, correlationId);
  });

  // Exactly 1 is original execution (isDuplicate: false), the other 4 are deduplicated (isDuplicate: true)
  const initialWrites = results.filter(r => r.isDuplicate === false);
  const deduplicatedWrites = results.filter(r => r.isDuplicate === true);

  assert.equal(initialWrites.length, 1);
  assert.equal(deduplicatedWrites.length, 4);
});

test('2. Tool Timeout Containment: Hung tool execution is aborted at timeout threshold without crashing process', async () => {
  const slowFn = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10000));
  
  // withToolTimeout with 50ms test threshold
  await assert.rejects(
    async () => {
      await withToolTimeout(slowFn, 'slow_mock_tool', 50);
    },
    /timed out after 50ms/
  );
});

test('3. Circuit Breaker: Trips after 3 failures and protects service from repeated hits', () => {
  circuitBreaker.reset();
  const testService = 'mock_external_weather';

  assert.equal(circuitBreaker.isOpen(testService), false);
  assert.equal(circuitBreaker.getStatus(testService), 'CLOSED');

  // Record 2 failures
  circuitBreaker.recordFailure(testService);
  circuitBreaker.recordFailure(testService);
  assert.equal(circuitBreaker.isOpen(testService), false);

  // 3rd failure trips the breaker to OPEN
  circuitBreaker.recordFailure(testService);
  assert.equal(circuitBreaker.isOpen(testService), true);
  assert.equal(circuitBreaker.getStatus(testService), 'OPEN');

  // Reset restores CLOSED state
  circuitBreaker.reset();
  assert.equal(circuitBreaker.isOpen(testService), false);
});

test('4. Tool Result Schema Validator: Normalizes and validates contract with schemaVersion 1.0', () => {
  const rawMalformed = {
    someRandomKey: 'unstructured data',
    numbers: [1, 2, 3]
  };

  const validated = validateToolResultContract(rawMalformed, 'get_subcontractor_balance', 'corr_val_456');

  assert.equal(validated.schemaVersion, '1.0');
  assert.equal(validated.correlationId, 'corr_val_456');
  assert.equal(validated.toolName, 'get_subcontractor_balance');
  assert.equal(validated.toolType, 'READ');
  assert.equal(validated.success, true);
  assert.equal(validated.status, 'ok');
  assert.equal(typeof validated._executionDurationMs, 'number');
});

test('5. Argument Sanitizer: Strips control characters and script injection attacks', () => {
  const maliciousArgs = {
    text: 'Meeting at 3 PM\x00\x1F<script>alert("hacked")</script>',
    category: '  electrical  ',
    tags: ['safe', 'note\x08<script>evil()</script>']
  };

  const sanitized = sanitizeToolArgs(maliciousArgs);
  assert.equal(sanitized.text, 'Meeting at 3 PM');
  assert.equal(sanitized.category, 'electrical');
  assert.deepEqual(sanitized.tags, ['safe', 'note']);
});

test('6. Multi-Domain Grounding Guard: Detects non-numeric hallucinations (contractor entities & files)', () => {
  const toolResults = [
    {
      name: 'get_subcontractor_balance',
      data: { payee: 'Volt Masters Electric', remainingBalance: 4000 }
    },
    {
      name: 'get_drive_files',
      files: [{ name: 'Lot3_Electrical_Plan.pdf' }]
    }
  ];

  // A. Fully Grounded Claim (Contractor + File + Amount all exist)
  const groundedText = 'We owe Volt Masters Electric $4,000 as referenced in Lot3_Electrical_Plan.pdf.';
  const reportA = verifyResponseGrounding(groundedText, { dashboardData: mockDashboardData, driveTree: mockDriveTree }, toolResults);
  assert.equal(reportA.status, 'fully_grounded');
  assert.equal(reportA.unsupportedClaims.length, 0);

  // B. Hallucinated Contractor Entity (Phantom Concrete LLC does not exist)
  const hallucinatedVendor = 'We owe Phantom Concrete LLC $4,000 for foundation repair.';
  const reportB = verifyResponseGrounding(hallucinatedVendor, { dashboardData: mockDashboardData }, toolResults);
  assert.equal(reportB.status, 'partially_grounded');
  assert.ok(reportB.unsupportedEntities.includes('Phantom Concrete LLC'));

  // C. Hallucinated File Claim (Secret_Underground_Bunker.dwg does not exist)
  const hallucinatedFile = 'Please review Secret_Underground_Bunker.dwg before inspection.';
  const reportC = verifyResponseGrounding(hallucinatedFile, { dashboardData: mockDashboardData }, toolResults);
  assert.equal(reportC.status, 'unsupported_claims_detected');
  assert.ok(reportC.unsupportedFiles.includes('Secret_Underground_Bunker.dwg'));
});

test('7. End-to-End Correlation ID: Propagates across two-pass synthesis and tool telemetry', async () => {
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
          text: 'Remaining balance for Volt Masters Electric is $4,000.'
        });
      }
    }
    return new Response('', { status: 404 });
  };

  const response = await askGeminiBrain(
    'How much do we owe the electrician?',
    [],
    'Lot 3',
    'test-key',
    mockDashboardData,
    'lot_3'
  );

  assert.equal(passCount, 2);
  assert.ok(response.telemetry.correlationId.startsWith('corr_'));
  assert.equal(response.telemetry.schemaVersion, '1.0');
  assert.equal(response.telemetry.tools[0].correlationId, response.telemetry.correlationId);
  assert.equal(response.telemetry.tools[0].schemaVersion, '1.0');
});

test('8. Mixed Concurrent READ + WRITE: Simultaneous read and write tools execute safely without deadlock', async () => {
  clearIdempotencyCache();
  const projectContext = { projectId: 'lot_3', dashboardData: mockDashboardData };
  const correlationId = 'corr_mixed_789';

  const [readRes, writeRes] = await Promise.all([
    executeClientToolCall('get_subcontractor_balance', { tradeOrContractor: 'Electrical' }, projectContext, correlationId),
    executeClientToolCall('save_memory', { text: 'Deliver roofing shingles Thursday 8 AM' }, projectContext, correlationId)
  ]);

  assert.equal(readRes.success, true);
  assert.equal(readRes.toolType, 'READ');
  assert.equal(readRes.correlationId, correlationId);

  assert.equal(writeRes.success, true);
  assert.equal(writeRes.toolType, 'WRITE');
  assert.equal(writeRes.correlationId, correlationId);
});
