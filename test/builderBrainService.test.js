import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNaturalDate,
  DEFAULT_SITE_SETUP_PROTOCOL,
  loadGlobalSiteSetupProtocol,
  saveGlobalSiteSetupProtocol,
  resetGlobalSiteSetupProtocol,
  loadGlobalPhases,
  saveGlobalPhases,
  resetGlobalPhases
} from '../src/services/builderBrainService.js';

// Polyfill localStorage for Node.js test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

describe('Builder Brain Service & Data Formatting Unit Tests', () => {
  test('1. formatNaturalDate formats YYYY-MM-DD into natural conversational date strings', () => {
    assert.equal(formatNaturalDate('2026-08-01'), 'August 1st, 2026');
    assert.equal(formatNaturalDate('2026-07-22'), 'July 22nd, 2026');
    assert.equal(formatNaturalDate('2026-03-03'), 'March 3rd, 2026');
    assert.equal(formatNaturalDate('2026-12-25'), 'December 25th, 2026');
    assert.equal(formatNaturalDate('2026-02-28'), 'February 28th, 2026');
  });

  test('2. formatNaturalDate safely handles non-date or malformed strings', () => {
    assert.equal(formatNaturalDate(''), 'N/A');
    assert.equal(formatNaturalDate(null), 'N/A');
    assert.equal(formatNaturalDate(undefined), 'N/A');
    assert.equal(formatNaturalDate('Pending'), 'Pending');
    assert.equal(formatNaturalDate('Paid in Full'), 'Paid in Full');
  });

  test('3. Site setup protocol falls back to default safely', () => {
    localStorage.clear();
    const protocol = loadGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
    assert.equal(protocol.id, 'site_setup');
    assert.equal(protocol.inspectionChecklist.length, 5);
    assert.equal(protocol.preTradeNotes.length, 5);
  });

  test('4. Site setup protocol saves and resets cleanly', () => {
    localStorage.clear();
    const custom = { ...DEFAULT_SITE_SETUP_PROTOCOL, name: 'Custom Lot Mobilization' };
    saveGlobalSiteSetupProtocol(custom);
    const loaded = loadGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
    assert.equal(loaded.name, 'Custom Lot Mobilization');

    resetGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
    const afterReset = loadGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
    assert.equal(afterReset.name, 'Site Setup & Lot Mobilization');
  });

  test('5. Global phases load, save, and reset cleanly', () => {
    localStorage.clear();
    const defaultPhases = [{ id: 'framing', name: 'Framing & Lumber' }];
    assert.deepEqual(loadGlobalPhases(defaultPhases), defaultPhases);

    const updated = [{ id: 'framing', name: 'Framing' }, { id: 'roofing', name: 'Roofing' }];
    saveGlobalPhases(updated);
    assert.equal(loadGlobalPhases(defaultPhases).length, 2);

    resetGlobalPhases(defaultPhases);
    assert.equal(loadGlobalPhases(defaultPhases).length, 1);
  });
});
