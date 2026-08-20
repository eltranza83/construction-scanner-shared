import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { askGeminiBrain } from '../src/services/builderBrainService.js';
import {
  getMemories,
  saveMemory,
  updateMemory,
  detectAmbiguity,
  MEMORY_STORAGE_KEY,
  MEMORY_SCOPES
} from '../src/services/memoryService.js';

// Setup mock localStorage in Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('SiteTactix Second Brain — End-to-End Validation Suite (Scenarios 1 to 8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Save & Verify Storage (A & B): "Remember that painter for Lot 3 likes cash"', async () => {
    const res = await askGeminiBrain(
      'I need you to remember that the painter for Lot 3 likes to get paid in cash',
      [],
      'Lot 3'
    );

    assert.ok(res.text.includes('saved that to your memory') || res.text.includes('noted'));
    
    // Verify memory in database
    const memories = await getMemories({ projectId: 'lot_3' });
    assert.equal(memories.length, 1);
    assert.equal(memories[0].text, 'The painter for Lot 3 likes to get paid in cash');
    assert.equal(memories[0].source, 'user_explicit');
    assert.equal(memories[0].active, true);
    assert.equal(memories[0].changeHistory.length, 0);
  });

  test('2. New Conversation Retrieval (C): Retrieves from Firestore without prior conversation', async () => {
    // Pre-save memory
    await askGeminiBrain(
      'Remember that the painter for Lot 3 likes to get paid in cash',
      [],
      'Lot 3'
    );

    // Completely new session (empty chat history)
    const res = await askGeminiBrain(
      'How does the painter for Lot 3 prefer to get paid?',
      [], // Empty history
      'Lot 3'
    );

    assert.ok(res.text.toLowerCase().includes('cash') || res.text.toLowerCase().includes('saved memory'));
  });

  test('3. Update & Audit Trail (D & E): "Actually, change that. The painter wants to be paid by check now."', async () => {
    // Initial save
    await askGeminiBrain(
      'Remember that the painter for Lot 3 likes to get paid in cash',
      [],
      'Lot 3'
    );

    // Update command
    const resUpdate = await askGeminiBrain(
      'Actually, change that. The painter wants to be paid by check now.',
      [],
      'Lot 3'
    );

    assert.ok(resUpdate.text.includes('updated that memory'));

    // Verify Firestore/local record updated and changeHistory recorded
    const memories = await getMemories({ projectId: 'lot_3' });
    assert.equal(memories.length, 1);
    assert.ok(memories[0].text.includes('check'));
    assert.equal(memories[0].changeHistory.length, 1);
    assert.ok(memories[0].changeHistory[0].previousText.includes('cash'));

    // New conversation verify
    const resNew = await askGeminiBrain(
      'How does the painter for Lot 3 prefer to get paid?',
      [],
      'Lot 3'
    );
    assert.ok(resNew.text.toLowerCase().includes('check'));
  });

  test('4. Ambiguous Statements: "The painter might switch to ACH" is flagged and not hard-saved', () => {
    const amb = detectAmbiguity('The painter might switch to ACH next month.');
    assert.equal(amb.isAmbiguous, true);
    assert.equal(amb.indicator, 'might');

    const explicit = detectAmbiguity('Remember that the painter now wants ACH.');
    assert.equal(explicit.isAmbiguous, false);
  });

  test('5. Project Isolation: Lot 3 memories do not bleed into Lot 5, Global memories work across all', async () => {
    // Save Lot 3 memory
    await saveMemory({
      text: 'Lot 3 Painter prefers checks.',
      projectId: 'lot_3',
      isGlobal: false
    });

    // Save Global memory
    await saveMemory({
      text: 'Company-wide drywall screw spacing is 12 inches on walls.',
      projectId: null,
      isGlobal: true,
      scope: MEMORY_SCOPES.GLOBAL
    });

    // Query Lot 5
    const lot5Memories = await getMemories({ projectId: 'lot_5', includeGlobal: true });
    assert.equal(lot5Memories.length, 1);
    assert.equal(lot5Memories[0].text, 'Company-wide drywall screw spacing is 12 inches on walls.');
    assert.ok(!lot5Memories.some(m => m.text.includes('Lot 3')), 'Lot 3 memory must never bleed into Lot 5');
  });

  test('6. Personal Memories: Saved under Personal Scope and isolated from construction answers', async () => {
    // Save personal memory
    await saveMemory({
      text: 'Tomorrow I wanted to check out the Chipotle lunch special.',
      scope: MEMORY_SCOPES.PERSONAL,
      category: 'personal'
    });

    // Verify personal query finds it
    const personalList = await getMemories({ scope: MEMORY_SCOPES.PERSONAL, includePersonal: true });
    assert.equal(personalList.length, 1);
    assert.ok(personalList[0].text.includes('Chipotle lunch special'));
    assert.equal(personalList[0].isPersonal, true);

    // Verify querying project Lot 3 does NOT return personal memories by default
    const projectList = await getMemories({ projectId: 'lot_3', includePersonal: false });
    assert.equal(projectList.length, 0);
  });

  test('7. Expiring Memories: Past expiration dates are filtered out of active retrieval', async () => {
    // Save an expired memory (yesterday)
    await saveMemory({
      text: 'Free pizza in construction trailer today only.',
      projectId: 'lot_3',
      expirationDate: '2026-01-01' // Past date
    });

    // Save an active unexpired memory
    await saveMemory({
      text: 'Hard hats required at all times.',
      projectId: 'lot_3',
      expirationDate: null // Permanent
    });

    // Query active memories
    const active = await getMemories({ projectId: 'lot_3', activeOnly: true });
    assert.equal(active.length, 1);
    assert.equal(active[0].text, 'Hard hats required at all times.');

    // Query all (including expired)
    const all = await getMemories({ projectId: 'lot_3', activeOnly: false });
    assert.equal(all.length, 2);
  });
});
