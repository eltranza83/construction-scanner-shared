import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySemanticIntent,
  synthesizeGroundedEvidence,
  getSemanticPromptGuidelines,
  validatePluginContract,
  intentRegistry,
  INTENT_MODALITIES
} from '../src/services/semanticIntentService.js';
import { formatToolResultsHumanReadable } from '../src/services/builderBrainService.js';

test('Core Semantic Intent Classification Suite', async (t) => {
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

test('Extended Semantic Modalities Classification Suite', async (t) => {
  await t.test('1. Classifies Explanation / Why inquiries accurately', () => {
    const queries = [
      'Why is the foundation delayed?',
      'What caused the inspection failure?',
      'Explain why the plumbing failed rough-in'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.EXPLANATION_WHY, `Expected EXPLANATION_WHY for "${q}"`);
    }
  });

  await t.test('2. Classifies Summarization inquiries accurately', () => {
    const queries = [
      'Summarize the project status',
      'Give me a quick recap of purchasing',
      'Overview of lot 3 financials'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.SUMMARIZATION, `Expected SUMMARIZATION for "${q}"`);
    }
  });

  await t.test('3. Classifies Instruction / How-to inquiries accurately', () => {
    const queries = [
      'How do I prep for the plumbing inspection?',
      'What steps are needed to set the water meter?',
      'Guide me through site setup'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.INSTRUCTION_HOWTO, `Expected INSTRUCTION_HOWTO for "${q}"`);
    }
  });

  await t.test('4. Classifies Recommendation inquiries accurately', () => {
    const queries = [
      'What do you suggest for exterior lighting?',
      'Recommend the best water heater option',
      'What should I buy for quartz sinks?'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.RECOMMENDATION, `Expected RECOMMENDATION for "${q}"`);
    }
  });

  await t.test('5. Classifies Planning & Scheduling inquiries accurately', () => {
    const queries = [
      'What is the schedule for framing?',
      'Plan the timeline for rough-in inspections',
      'When should we mobilize electrical?'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.PLANNING, `Expected PLANNING for "${q}"`);
    }
  });

  await t.test('6. Classifies Confirmation & Affirmation accurately', () => {
    const queries = ['yes', 'yeah', 'go ahead', 'proceed', 'approved', 'do it'];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.CONFIRMATION, `Expected CONFIRMATION for "${q}"`);
    }
  });

  await t.test('7. Classifies Action / Command mutations accurately', () => {
    const queries = [
      'Add 4 recessed lights to electrical',
      'Mark toilets as purchased',
      'Remind me to call the electrician tomorrow',
      'Delete the unused plumbing note'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.ACTION_COMMAND, `Expected ACTION_COMMAND for "${q}"`);
    }
  });

  await t.test('8. Classifies Clarification inquiries accurately', () => {
    const queries = [
      'What do you mean by rough-in?',
      'Clarify which lot we are working on',
      'Elaborate on the permit status'
    ];
    for (const q of queries) {
      const res = classifySemanticIntent(q);
      assert.equal(res.modality, INTENT_MODALITIES.CLARIFICATION, `Expected CLARIFICATION for "${q}"`);
    }
  });
});

test('Plugin Contract Validation & Conflict Resolution Suite', async (t) => {
  await t.test('1. Contract Validation rejects malformed plugin definitions with descriptive errors', () => {
    // Missing id
    assert.throws(() => validatePluginContract({ priority: 10, classifier: () => true }), /non-empty "id"/i);
    // Invalid priority
    assert.throws(() => validatePluginContract({ id: 'test', priority: 'high', classifier: () => true }), /"priority" must be a valid number/i);
    // Missing classifier function
    assert.throws(() => validatePluginContract({ id: 'test', priority: 10, classifier: 'not-a-func' }), /"classifier" must be an executable function/i);
    // Invalid isApplicable
    assert.throws(() => validatePluginContract({ id: 'test', priority: 10, classifier: () => true, isApplicable: 'bad' }), /"isApplicable" must be a function/i);
  });

  await t.test('2. Deterministic Conflict Resolution: Specificity and Confidence break overlapping matches', () => {
    const query = 'Why does Electrical have more items than Plumbing?';
    
    // Explanation matches ('why') and Analytical matches ('more than')
    // Analytical has specificity 1.2 and confidence 0.95 -> higher composite score than generic explanation
    const result = classifySemanticIntent(query);
    assert.equal(result.modality, INTENT_MODALITIES.ANALYTICAL);
    assert.ok(result.score > 0);
  });

  await t.test('3. Optional Applicability Guard rejects otherwise matching modality when context is absent', () => {
    const pluginId = 'specialized_foundation_audit';
    intentRegistry.registerPlugin({
      id: pluginId,
      name: 'Foundation Audit',
      priority: 5,
      description: 'Only applies when active project phase is foundation',
      promptGuideline: 'FOUNDATION AUDIT: Assess foundation rebar and concrete specs.',
      isApplicable: (context) => context?.currentPhase === 'Foundation',
      classifier: (query) => /\b(audit specs|rebar check)\b/i.test(query)
    });

    // 1. Without matching context -> Applicability guard skips plugin
    const skippedResult = classifySemanticIntent('audit specs for this trade', [], { currentPhase: 'Drywall' });
    assert.notEqual(skippedResult.modality, pluginId);

    // 2. With matching context -> Plugin applies
    const appliedResult = classifySemanticIntent('audit specs for this trade', [], { currentPhase: 'Foundation' });
    assert.equal(appliedResult.modality, pluginId);

    // Clean up
    intentRegistry.unregisterPlugin(pluginId);
  });

  await t.test('4. Runtime Lifecycle: Register, execute, and unregister plugin cleanly', () => {
    const lifecycleId = 'runtime_warranty_plugin';
    intentRegistry.registerPlugin({
      id: lifecycleId,
      name: 'Warranty Claims',
      priority: 15,
      description: 'Warranty service tracking',
      promptGuideline: 'WARRANTY: Track post-closing defect repair claims.',
      classifier: (query) => /\b(warranty claim|builder warranty)\b/i.test(query),
      synthesizeEvidence: () => 'Active warranty claims: 0 pending.'
    });

    assert.ok(intentRegistry.hasModality(lifecycleId));
    assert.equal(classifySemanticIntent('check the builder warranty claim').modality, lifecycleId);
    assert.match(getSemanticPromptGuidelines(), /WARRANTY: Track post-closing defect repair claims/i);

    intentRegistry.unregisterPlugin(lifecycleId);
    assert.ok(!intentRegistry.hasModality(lifecycleId));
    assert.notEqual(classifySemanticIntent('check the builder warranty claim').modality, lifecycleId);
  });

  await t.test('5. Cloud / Local Synchronization: Cloud prompt and local fallback share identical modalities', () => {
    const modalities = intentRegistry.getModalities();
    const promptGuidelines = getSemanticPromptGuidelines();

    for (const mod of modalities) {
      if (mod.promptGuideline) {
        assert.ok(promptGuidelines.includes(mod.promptGuideline), `Prompt guidelines must contain guideline for ${mod.id}`);
      }
    }
  });

  await t.test('6. Zero-Touch Core Addition: Adding a new modality requires zero core code changes', () => {
    const safetyAuditId = 'osha_safety_audit';
    const plugin = {
      id: safetyAuditId,
      name: 'OSHA Safety Compliance',
      priority: 8,
      description: 'Jobsite safety checklist auditing',
      promptGuideline: 'OSHA SAFETY: Audit hardhats, fall protection, and fire extinguisher readiness.',
      classifier: (cleanQuery) => /\b(osha compliance|fall protection audit|safety check)\b/i.test(cleanQuery),
      synthesizeEvidence: (evidenceList, query, context) => `Safety check completed for ${context.activeProjectName}: 100% compliant.`
    };

    // Registered dynamically with 0 edits to core synthesis engine
    intentRegistry.registerPlugin(plugin);

    const testQuery = 'run an osha compliance safety check on lot 3';
    const classification = classifySemanticIntent(testQuery);
    assert.equal(classification.modality, safetyAuditId);

    const synthesis = synthesizeGroundedEvidence([{ name: 'dummy_tool', success: true, result: {} }], testQuery, { activeProjectName: 'Lot 3' });
    assert.equal(synthesis, 'Safety check completed for Lot 3: 100% compliant.');

    intentRegistry.unregisterPlugin(safetyAuditId);
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

  await t.test('3. Purchasing Domain: Summarization modality produces concise executive overview', () => {
    const telemetry = [{
      name: 'get_purchasing_list',
      success: true,
      result: {
        totalItems: 15,
        sections: [
          { category: 'Quartz Hardware', items: [{ name: 'Sinks' }] },
          { category: 'Electrical Hardware Fixtures', items: [{ name: 'Fans' }] }
        ]
      }
    }];

    const summaryRes = synthesizeGroundedEvidence(telemetry, 'Summarize the purchasing checklist for Lot 3', projectContext);
    assert.match(summaryRes, /Lot 3 Purchasing Summary/i);
    assert.match(summaryRes, /2 active categories/i);
  });

  await t.test('4. Purchasing Domain: Presents full items on Content Retrieval requests', () => {
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

  await t.test('5. Subcontractor & Financials Domain: Answers Meta and Analytical inquiries accurately', () => {
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

  await t.test('6. Receipts & Expenses Domain: Synthesizes largest expense on comparison queries', () => {
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

  await t.test('7. Google Drive Files Domain: Answers file existence questions accurately', () => {
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

  await t.test('8. Local / Fallback Integration via formatToolResultsHumanReadable works consistently', () => {
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

  await t.test('9. Google Drive Subfolder Search & Empty Folder Messaging', () => {
    const emptyFolderTelemetry = [{
      name: 'get_drive_files',
      success: true,
      result: {
        found: true,
        isFolderEmpty: true,
        folderName: 'App Folders',
        count: 0,
        files: []
      }
    }];

    const emptyFolderRes = synthesizeGroundedEvidence(emptyFolderTelemetry, 'what else do we have in app folders', projectContext);
    assert.match(emptyFolderRes, /"App Folders" directory exists in Google Drive for Lot 3, but it does not currently contain any files/i);
  });
});
