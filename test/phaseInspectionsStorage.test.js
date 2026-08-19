import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Storage helper functions for Phase Inspection checks
export function loadProjectPhaseChecks(projectId, storage = globalThis.localStorage) {
  try {
    if (!storage) return {};
    const raw = storage.getItem(`jobscan_phase_checks_${projectId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

export function saveProjectPhaseChecks(projectId, checks, storage = globalThis.localStorage) {
  try {
    if (!storage) return;
    storage.setItem(`jobscan_phase_checks_${projectId}`, JSON.stringify(checks));
  } catch (_) {}
}

export function calculatePhaseProgress(phase, checks = {}) {
  if (!phase) return { passed: 0, total: 0, isPassed: false };
  const total = phase.hasSubcategories
    ? (phase.subcategories || []).reduce((acc, s) => acc + (s.inspectionChecklist?.length || 0), 0)
    : (phase.inspectionChecklist?.length || 0);
  const passed = phase.hasSubcategories
    ? (phase.subcategories || []).reduce((acc, s) => acc + (s.inspectionChecklist?.filter(chk => checks[`${phase.id}_${chk.id}`]).length || 0), 0)
    : ((phase.inspectionChecklist || []).filter(chk => checks[`${phase.id}_${chk.id}`]).length || 0);
  return { passed, total, isPassed: total > 0 && passed === total };
}

describe('Phase Inspections Persistent Storage & Progress Unit Tests', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  test('1. Loads empty checks when none saved', () => {
    mockStorage.clear();
    const checks = loadProjectPhaseChecks('lot_3', mockStorage);
    assert.deepEqual(checks, {});
  });

  test('2. Saves and reloads checks across sessions', () => {
    mockStorage.clear();
    const newChecks = {
      'plumbing_p1': true,
      'plumbing_p2': true,
      'plumbing_p3': true
    };
    saveProjectPhaseChecks('lot_3', newChecks, mockStorage);
    const loaded = loadProjectPhaseChecks('lot_3', mockStorage);
    assert.deepEqual(loaded, newChecks);
  });

  test('3. Calculates phase progress and marks isPassed when all items checked', () => {
    const mockPhase = {
      id: 'plumbing',
      name: 'Rough-In Plumbing',
      inspectionChecklist: [
        { id: 'p1', text: 'Water lines pressure tested' },
        { id: 'p2', text: 'Water head stack test' },
        { id: 'p3', text: 'Drain trenching verified' }
      ]
    };

    // 0 / 3
    assert.deepEqual(calculatePhaseProgress(mockPhase, {}), {
      passed: 0,
      total: 3,
      isPassed: false
    });

    // 2 / 3
    const partial = { 'plumbing_p1': true, 'plumbing_p2': true };
    assert.deepEqual(calculatePhaseProgress(mockPhase, partial), {
      passed: 2,
      total: 3,
      isPassed: false
    });

    // 3 / 3 (100% Passed)
    const complete = { 'plumbing_p1': true, 'plumbing_p2': true, 'plumbing_p3': true };
    assert.deepEqual(calculatePhaseProgress(mockPhase, complete), {
      passed: 3,
      total: 3,
      isPassed: true
    });
  });

  test('4. Correctly calculates progress for composite phases with subcategories (e.g. Framing Combo)', () => {
    const mockComboPhase = {
      id: 'framing',
      name: 'Framing Combo',
      hasSubcategories: true,
      subcategories: [
        { id: 'framing_struct', inspectionChecklist: [{ id: 'f1' }, { id: 'f2' }] },
        { id: 'framing_elec', inspectionChecklist: [{ id: 'e1' }] },
        { id: 'framing_mech', inspectionChecklist: [{ id: 'm1' }] }
      ]
    };

    const checks = {
      'framing_f1': true,
      'framing_f2': true,
      'framing_e1': true,
      'framing_m1': true
    };

    const progress = calculatePhaseProgress(mockComboPhase, checks);
    assert.equal(progress.total, 4);
    assert.equal(progress.passed, 4);
    assert.equal(progress.isPassed, true);
  });
});
