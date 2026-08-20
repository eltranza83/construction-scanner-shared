import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { executeClientToolCall, AI_TOOL_DECLARATIONS } from '../src/services/aiTools.js';
import { MEMORY_STORAGE_KEY } from '../src/services/memoryService.js';

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

describe('SiteTactix Second Brain — Gemini Function Calling Memory Tools Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('Tool Declarations: All 5 memory tools are properly registered in AI_TOOL_DECLARATIONS', () => {
    const toolNames = AI_TOOL_DECLARATIONS.map(t => t.name);
    assert.ok(toolNames.includes('save_memory'), 'Must declare save_memory');
    assert.ok(toolNames.includes('search_memories'), 'Must declare search_memories');
    assert.ok(toolNames.includes('list_memories'), 'Must declare list_memories');
    assert.ok(toolNames.includes('update_memory'), 'Must declare update_memory');
    assert.ok(toolNames.includes('delete_memory'), 'Must declare delete_memory');
  });

  test('Execution: save_memory saves a memory and returns confirmation', async () => {
    const res = await executeClientToolCall(
      'save_memory',
      {
        text: 'The painter on Lot 12 prefers ACH payments.',
        projectId: 'Lot 12',
        category: 'subcontractor',
        importance: 'important'
      },
      { projectId: 'Lot 12' }
    );

    assert.equal(res.saved, true);
    assert.ok(res.memoryId);
    assert.equal(res.message, "Got it. I've saved that to your memory.");
  });

  test('Execution: save_memory rejects ambiguous statements without confirmation', async () => {
    const res = await executeClientToolCall(
      'save_memory',
      {
        text: 'The painter might switch to ACH next month.',
        projectId: 'Lot 12'
      },
      { projectId: 'Lot 12' }
    );

    assert.equal(res.saved, false);
    assert.equal(res.isAmbiguous, true);
    assert.ok(res.message.includes('speculative language'));
  });

  test('Execution: search_memories finds relevant memories', async () => {
    // 1. Save memory
    await executeClientToolCall(
      'save_memory',
      {
        text: 'John electrician quoted $8,500 for rough-in.',
        projectId: 'Lot 12',
        category: 'quote'
      },
      { projectId: 'Lot 12' }
    );

    // 2. Search
    const searchRes = await executeClientToolCall(
      'search_memories',
      { query: 'electrician quote' },
      { projectId: 'Lot 12' }
    );

    assert.equal(searchRes.found, true);
    assert.ok(searchRes.memories.length > 0);
    assert.equal(searchRes.memories[0].text, 'John electrician quoted $8,500 for rough-in.');
  });

  test('Execution: update_memory updates an existing memory and keeps audit trail', async () => {
    // 1. Save
    const saveRes = await executeClientToolCall(
      'save_memory',
      {
        text: 'Painter prefers checks.',
        projectId: 'Lot 12'
      },
      { projectId: 'Lot 12' }
    );

    // 2. Update
    const updateRes = await executeClientToolCall(
      'update_memory',
      {
        memoryId: saveRes.memoryId,
        updatedText: 'Painter prefers ACH wire transfer.',
        reason: 'Switched payment method'
      },
      { projectId: 'Lot 12' }
    );

    assert.equal(updateRes.updated, true);
    assert.equal(updateRes.memory.text, 'Painter prefers ACH wire transfer.');
    assert.equal(updateRes.memory.changeHistory.length, 1);
    assert.equal(updateRes.memory.changeHistory[0].previousText, 'Painter prefers checks.');
  });

  test('Execution: delete_memory deactivates a memory', async () => {
    // 1. Save
    const saveRes = await executeClientToolCall(
      'save_memory',
      {
        text: 'Temporary dumpster placed on north side of Lot 12.',
        projectId: 'Lot 12'
      },
      { projectId: 'Lot 12' }
    );

    // 2. Delete / Deactivate
    const deleteRes = await executeClientToolCall(
      'delete_memory',
      {
        memoryId: saveRes.memoryId,
        searchQuery: 'dumpster'
      },
      { projectId: 'Lot 12' }
    );

    assert.equal(deleteRes.deleted, true);

    // 3. Search should not return deactivated memory
    const searchRes = await executeClientToolCall(
      'search_memories',
      { query: 'dumpster' },
      { projectId: 'Lot 12' }
    );
    assert.equal(searchRes.found, false);
  });
});
