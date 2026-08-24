import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySemanticIntent,
  synthesizeGroundedEvidence,
  INTENT_MODALITIES
} from '../src/services/semanticIntentService.js';
import { formatToolResultsHumanReadable } from '../src/services/builderBrainService.js';

test('Semantic Intent Classification Suite', async (t) => {
  await t.test('1. Classifies Content Retrieval requests accurately without keyword rigidity', () => {
    const queries = [
      'Show me the purchasing lists',
      'give me the electrical items',
      'what do we need to buy for plumbing?',
      'List all documents in google drive',
      'Give me everything'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.RETRIEVAL, `Expected RETRIEVAL for: "${q}"`);
    }
  });

  await t.test('2. Classifies Verification / Meta / Exhaustiveness inquiries accurately', () => {
    const queries = [
      'Are there any other lists?',
      'So those are the only ones?',
      'What else do we have besides these?',
      'is that all of them?',
      'do we have anything more for electrical?',
      'are there other categories besides those three?'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.VERIFICATION_META, `Expected VERIFICATION_META for: "${q}"`);
    }
  });

  await t.test('3. Classifies Analytical and Comparative inquiries accurately', () => {
    const queries = [
      'Which list has the most items?',
      'Who is owed the highest balance?',
      'Which contractor has the biggest quote?',
      'Which trade has the least items?',
      'compare electrical and plumbing items count'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.ANALYTICAL, `Expected ANALYTICAL for: "${q}"`);
    }
  });
});

test('Multi-Domain Grounded Evidence Synthesis Suite', async (t) => {
  const projectContext = { activeProjectName: 'Lot 3' };

  await t.test('1. Purchasing Domain: Answers Verification / Meta inquiry directly rather than dumping items', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 20,
        sections: [
          { category: 'Quartz Hardware', items: [{ name: 'Sinks' }, { name: 'Caps' }] },
          { category: 'Electrical Hardware Fixtures', items: [{ name: 'Security lights' }, { name: 'Smart doorbell' }] },
          { category: 'Plumbing Hardware Fixtures', items: [{ name: 'Toilets' }] }
        ]
      }
    }];

    const metaRes = synthesizeGroundedEvidence(telemetry, 'do we have any more lists besides the three that you show me', projectContext);
    assert.match(metaRes, /Those 3 categories/i);
    assert.match(metaRes, /Quartz Hardware, Electrical Hardware Fixtures, Plumbing Hardware Fixtures/i);
    assert.match(metaRes, /all the categories listed/i);
    assert.doesNotMatch(metaRes, /• Security lights/);

    const sameIntentDifferentWording = synthesizeGroundedEvidence(telemetry, 'So those are the only ones?', projectContext);
    assert.match(sameIntentDifferentWording, /all the categories listed/i);
  });

  await t.test('2. Purchasing Domain: Answers Analytical inquiry specifically with calculation', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 20,
        sections: [
          { category: 'Quartz Hardware', items: [{ name: 'Sinks' }] },
          { category: 'Electrical Hardware Fixtures', items: [{ name: 'Item 1' }, { name: 'Item 2' }, { name: 'Item 3' }] },
          { category: 'Plumbing Hardware Fixtures', items: [{ name: 'Item A' }, { name: 'Item B' }] }
        ]
      }
    }];

    const analyticalRes = synthesizeGroundedEvidence(telemetry, 'Which list has the most items?', projectContext);
    assert.match(analyticalRes, /Electrical Hardware Fixtures has the most items/i);
    assert.match(analyticalRes, /3 items listed/i);
  });

  await t.test('3. Purchasing Domain: Presents full items on Content Retrieval requests', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 2,
        sections: [
          { category: 'Quartz Hardware', items: [{ name: 'Sinks', quantity: null, hasExplicitQuantity: false }] }
        ]
      }
    }];

    const retrievalRes = synthesizeGroundedEvidence(telemetry, 'Show me the purchasing lists', projectContext);
    assert.match(retrievalRes, /Quartz Hardware:/);
    assert.match(retrievalRes, /• Sinks/);
  });

  await t.test('4. Subcontractor & Financials Domain: Answers Meta and Analytical inquiries accurately', () => {
    const telemetry = [{
      name: 'get_subcontractor_balance',
      success: true,
      result: {
        found: true,
        results: [
          { phaseName: 'Framing', quote: 45000, totalPaid: 30000, remainingBalance: 15000 },
          { phaseName: 'Electrical Rough-in', quote: 18000, totalPaid: 10000, remainingBalance: 8000 }
        ]
      }
    }];

    const metaRes = synthesizeGroundedEvidence(telemetry, 'Are there any other contractors owed besides those?', projectContext);
    assert.match(metaRes, /Those 2 trade contracts are currently all that are recorded/i);

    const analyticalRes = synthesizeGroundedEvidence(telemetry, 'Who is owed the highest balance?', projectContext);
    assert.match(analyticalRes, /Framing has the highest remaining balance owed at \$15,000/i);
  });

  await t.test('5. Receipts & Expenses Domain: Synthesizes largest expense on comparison queries', () => {
    const telemetry = [{
      name: 'search_receipts',
      success: true,
      result: {
        receipts: [
          { vendor: 'Home Depot', amount: 1250, date: '2026-08-10' },
          { vendor: 'Ferguson Plumbing', amount: 4800, date: '2026-08-12' }
        ]
      }
    }];

    const analyticalRes = synthesizeGroundedEvidence(telemetry, 'Which was the largest receipt?', projectContext);
    assert.match(analyticalRes, /largest receipt is \$4,800 from Ferguson Plumbing/i);

    const metaRes = synthesizeGroundedEvidence(telemetry, 'Is that all the receipts we have for plumbing?', projectContext);
    assert.match(metaRes, /Those 2 receipts are currently all that are recorded/i);
  });

  await t.test('6. Google Drive Files Domain: Answers file existence questions accurately', () => {
    const telemetry = [{
      name: 'get_drive_files',
      success: true,
      result: {
        files: [
          { name: 'Lot 3 Architectural Blueprint.pdf', folderName: 'Plans' },
          { name: 'Lot 3 Engineering Specs.pdf', folderName: 'Plans' }
        ]
      }
    }];

    const metaRes = synthesizeGroundedEvidence(telemetry, 'Do we have any other blueprints besides these two?', projectContext);
    assert.match(metaRes, /Those 2 files are currently all that exist/i);
  });

  await t.test('7. Local / Fallback Integration via formatToolResultsHumanReadable works consistently', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        sections: [
          { category: 'Quartz Hardware', items: [{ name: 'Sinks' }] }
        ]
      }
    }];

    const fallbackMeta = formatToolResultsHumanReadable(telemetry, 'Are there any other lists?', projectContext);
    assert.match(fallbackMeta, /all the categories listed/i);
  });
});
