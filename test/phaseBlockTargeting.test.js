import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTargetPhaseRow } from '../src/services/directSyncService.js';

describe('Phase Block Row Targeting & Boundary Protection Suite', () => {

  it('1. First invoice in an empty phase block targets the first pre-allocated slot', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans', 'Contractor Payee', 'Total Paid', 'Original Quote'],
      ...Array(25).fill([]),
      ['→ Landscaping & Irrigation', '', '', '', '', '', 'Landscaping & Irrigation Payee', '', '.00'],
      ['', '', '', '', '', '', '', '', '.00'],
      ['', '', '', '', '', '', '', '', '.00']
    ];

    const result = findTargetPhaseRow(rows, 'Landscaping & Irrigation');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 29, 'Invoice 1 must target Row 29');
    assert.equal(result.needsRowInsertion, false);
    assert.equal(result.insertAtIndex, null);
  });

  it('2. Second invoice when Row 29 is occupied targets Row 30 (Original Bug Repro & Fix)', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans', 'Contractor Payee', 'Total Paid', 'Original Quote'],
      ...Array(25).fill([]),
      ['→ Landscaping & Irrigation', '', '', '', '', '', 'Landscaping & Irrigation Payee', '', '.00'],
      ['Landscaping and sprinkler system', 'L. Herrera Landscaping & Sprinklers', '', '6825.00', '2026-05-16', '']
    ];

    const result = findTargetPhaseRow(rows, 'Landscaping & Irrigation');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 30, 'Invoice 2 must target Row 30 explicitly (never generic :append)');
    assert.equal(result.needsRowInsertion, false);
    assert.equal(result.insertAtIndex, null);
  });

  it('3. Third invoice when Row 29 and Row 30 are occupied targets Row 31', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans'],
      ...Array(25).fill([]),
      ['→ Landscaping & Irrigation'],
      ['Landscaping invoice 1', 'L. Herrera', '', '6825.00', '2026-05-16', ''],
      ['Irrigation invoice 2', 'L. Herrera', '', '1200.00', '2026-02-27', '7280']
    ];

    const result = findTargetPhaseRow(rows, 'Landscaping & Irrigation');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 31, 'Invoice 3 must target Row 31');
    assert.equal(result.needsRowInsertion, false);
  });

  it('4. Bounded phase block with available pre-allocated slot does not cross into next phase', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans'],
      ...Array(10).fill([]),
      ['→ Driveway & Sidewalks'],
      ['Pour driveway', 'Concrete Co', '2500', '', '2026-04-10', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['→ Cantera Stone Detail']
    ];

    const result = findTargetPhaseRow(rows, 'Driveway & Sidewalks');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 15, 'Targets empty pre-allocated slot at Row 15');
    assert.equal(result.needsRowInsertion, false, 'Does not need insertion because slot 15 is free');
  });

  it('5. Bounded phase block that is COMPLETELY FULL requires safe row insertion without overwriting next phase header', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans'],
      ...Array(10).fill([]),
      ['→ Driveway & Sidewalks'],
      ['Tx 1', 'Vendor A', '100', '', '2026-04-01', ''],
      ['Tx 2', 'Vendor B', '200', '', '2026-04-02', ''],
      ['Tx 3', 'Vendor C', '300', '', '2026-04-03', ''],
      ['Tx 4', 'Vendor D', '400', '', '2026-04-04', ''],
      ['→ Cantera Stone Detail']
    ];

    const result = findTargetPhaseRow(rows, 'Driveway & Sidewalks');
    assert.ok(result);
    assert.equal(result.needsRowInsertion, true, 'Flags that insertDimension is required');
    assert.equal(result.insertAtIndex, 17, 'Inserts at index 17 (immediately before Cantera Stone Detail)');
    assert.equal(result.targetRowNumber, 18, 'Targets row 18 (the newly inserted row)');
  });

  it('6. Phase alias matching resolves variations seamlessly', () => {
    const rows = [
      ['FRAMING & LUMBER'],
      ['Task Description'],
      ['→ Framing Lumber & Truss'],
      ['', '']
    ];

    const result = findTargetPhaseRow(rows, 'Framing Lumber');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 4);
  });

  it('7. Summary/formula columns (G..K) with formulas do NOT count as transaction data in A..F', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans', 'Contractor Payee', 'Total Paid', 'Original Quote'],
      ...Array(25).fill([]),
      ['→ Landscaping & Irrigation', '', '', '', '', '', 'Landscaping & Irrigation Payee', '', '.00'],
      ['', '', '', '', '', '', 'Landscaping & Irrigation Payee', '.00', '.00']
    ];

    const result = findTargetPhaseRow(rows, 'Landscaping & Irrigation');
    assert.ok(result);
    assert.equal(result.targetRowNumber, 29, 'Recognizes row 29 as an available transaction slot');
    assert.equal(result.needsRowInsertion, false);
  });

  it('8. Returns null when phase is not found in the sheet', () => {
    const rows = [
      ['HOUSE EXTERIOR & YARD'],
      ['Task Description'],
      ['→ Driveway & Sidewalks']
    ];

    const result = findTargetPhaseRow(rows, 'Nonexistent Phase');
    assert.equal(result, null, 'Returns null safely when phase is not present');
  });
});
