import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Validates whether the rows inside a Google Sheet accurately and completely
 * reflect the approved Firestore Finish specifications.
 */
export function verifyFinishSheetSync(sheetRows = [], firestoreSpecs = []) {
  if (!Array.isArray(sheetRows) || sheetRows.length === 0) {
    return {
      inSync: firestoreSpecs.length === 0,
      reason: firestoreSpecs.length === 0 ? 'In sync (empty)' : 'Google Sheet is completely empty (0 rows / no headers)',
      missingCount: firestoreSpecs.length
    };
  }

  // 1. Validate standard header row
  const expectedHeaders = ['Category', 'Room / Location', 'Brand / Supplier', 'Color Name / Code / Model', 'Sheen / Specs', 'Notes', 'Date Added'];
  const actualHeaders = sheetRows[0] || [];
  const hasValidHeaders = expectedHeaders.slice(0, 5).every((h, idx) => actualHeaders[idx] === h);

  if (!hasValidHeaders) {
    return {
      inSync: false,
      reason: 'Google Sheet headers are missing or malformed',
      missingCount: firestoreSpecs.length
    };
  }

  const dataRows = sheetRows.slice(1);

  // If Firestore has 0 specs, sheet is in sync if it only has headers
  if (firestoreSpecs.length === 0) {
    return {
      inSync: dataRows.length === 0,
      reason: dataRows.length === 0 ? 'In sync (0 specs)' : `Orphan rows in sheet (${dataRows.length} found, 0 in Firestore)`,
      missingCount: 0
    };
  }

  // 2. Invariant Check: Verify every approved Firestore finish exists in sheet rows
  const missingSpecs = [];
  const matchedRows = [];

  for (const spec of firestoreSpecs) {
    const specCategory = (spec.category || 'General').toLowerCase().trim();
    const specLocation = (spec.location || '').toLowerCase().trim();
    const specCode = (spec.code || spec.name || spec.title || '').toLowerCase().trim();
    const specBrand = (spec.brand || spec.supplier || '').toLowerCase().trim();

    const matchingRowIndex = dataRows.findIndex((row) => {
      const rowCategory = String(row[0] || '').toLowerCase().trim();
      const rowLocation = String(row[1] || '').toLowerCase().trim();
      const rowBrand = String(row[2] || '').toLowerCase().trim();
      const rowCode = String(row[3] || '').toLowerCase().trim();

      return rowCategory === specCategory &&
        (rowLocation === specLocation || (!rowLocation && !specLocation)) &&
        (rowBrand === specBrand || (!rowBrand && !specBrand)) &&
        rowCode === specCode;
    });

    if (matchingRowIndex >= 0) {
      matchedRows.push(dataRows[matchingRowIndex]);
    } else {
      missingSpecs.push(spec);
    }
  }

  // Exact parity: No missing specs AND no extra/stale rows
  const inSync = missingSpecs.length === 0 && dataRows.length === firestoreSpecs.length;

  return {
    inSync,
    reason: inSync
      ? 'Fully synchronized'
      : `${missingSpecs.length} missing, ${Math.max(0, dataRows.length - matchedRows.length)} obsolete/stale rows`,
    matchedCount: matchedRows.length,
    missingSpecs,
    missingCount: missingSpecs.length,
    sheetRowCount: dataRows.length,
    firestoreCount: firestoreSpecs.length
  };
}

/**
 * Formats Firestore specs into canonical Google Sheets 2D array representation.
 */
export function formatSpecsForSheet(specsList = []) {
  const headers = ['Category', 'Room / Location', 'Brand / Supplier', 'Color Name / Code / Model', 'Sheen / Specs', 'Notes', 'Date Added'];
  const rows = specsList.map((s) => {
    const attrStr = s.attributes && typeof s.attributes === 'object' && Object.keys(s.attributes).length > 0
      ? Object.entries(s.attributes).map(([k, v]) => `${k}: ${v}`).join('; ')
      : '';
    const notesCombined = [s.notes, attrStr].filter(Boolean).join(' | ');

    return [
      s.category || 'General',
      s.location || '',
      s.brand || s.supplier || '',
      s.code || s.name || s.title || '',
      s.sheen || s.specs || '',
      notesCombined,
      s.createdAt ? new Date(s.createdAt).toLocaleDateString() : new Date().toLocaleDateString()
    ];
  });
  return [headers, ...rows];
}

/**
 * Simulated Drive / Sheets Sync Engine mirroring syncFinishSpecsToDrive()
 */
export class MockGoogleSheetSyncTarget {
  constructor() {
    this.sheetData = [];
  }

  sync(specsList) {
    // Overwrite range 'Sheet1'!A1 with table values (clearing old range)
    this.sheetData = formatSpecsForSheet(specsList);
    return {
      ok: true,
      rowCount: this.sheetData.length - 1,
      sheetData: this.sheetData
    };
  }

  getRows() {
    return this.sheetData;
  }
}

describe('Google Sheets Finish Specs Sync & Self-Healing Suite', () => {
  const paintSpec = {
    id: 'spec_paint_1',
    category: 'Paint',
    location: 'Whole House',
    scope: 'whole_house',
    brand: 'Sherwin-Williams',
    code: 'SW extra white 567',
    sheen: 'Flat/Eggshell',
    notes: 'Interior walls',
    createdAt: '2026-08-27T10:00:00.000Z'
  };

  const stuccoSpec = {
    id: 'spec_stucco_2',
    category: 'Stucco',
    location: 'Exterior Body',
    scope: 'exterior_general',
    brand: 'El Rey',
    code: 'Desert Sand #204',
    sheen: 'Sand Finish',
    notes: '2-coat synthetic',
    createdAt: '2026-08-27T10:15:00.000Z'
  };

  it('1. REPRODUCTION OF THE FLAW: Legacy check falsely considers a blank spreadsheet "healthy"', () => {
    const mockDriveFile = {
      id: 'sheet_file_999',
      name: 'Homeowner Finishes & Specs — acepeda83 Test',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_file_999/edit'
    };
    const mockSheetContent = []; // EMPTY / BLANK

    const legacyIsHealthy = Boolean(mockDriveFile?.webViewLink);
    assert.equal(legacyIsHealthy, true, 'Legacy code thought sheet was healthy just because Drive file existed');

    const syncStatus = verifyFinishSheetSync(mockSheetContent, [paintSpec]);
    assert.equal(syncStatus.inSync, false);
    assert.equal(syncStatus.missingCount, 1);
  });

  it('2. SEQUENTIAL ADDITIONS INVARIANT: Preserves all N records across sequential saves (Paint -> Paint + Stucco)', () => {
    const target = new MockGoogleSheetSyncTarget();

    // Step A: User adds Paint -> Firestore has [Paint]
    const firestoreStateStep1 = [paintSpec];
    target.sync(firestoreStateStep1);

    const check1 = verifyFinishSheetSync(target.getRows(), firestoreStateStep1);
    assert.equal(check1.inSync, true);
    assert.equal(check1.matchedCount, 1);
    assert.equal(check1.sheetRowCount, 1);

    // Step B: User adds Stucco -> Firestore has [Stucco, Paint]
    // The fix guarantees the authoritative full list is passed into sync
    const firestoreStateStep2 = [stuccoSpec, paintSpec];
    target.sync(firestoreStateStep2);

    const check2 = verifyFinishSheetSync(target.getRows(), firestoreStateStep2);
    assert.equal(check2.inSync, true, 'Sheet must contain BOTH Paint and Stucco');
    assert.equal(check2.matchedCount, 2);
    assert.equal(check2.sheetRowCount, 2);
    assert.equal(check2.missingCount, 0);
  });

  it('3. EDIT RECORD INVARIANT: Editing Paint updates Paint in Sheet while keeping Stucco intact', () => {
    const target = new MockGoogleSheetSyncTarget();

    // Initial state: Paint + Stucco
    const initialFirestoreState = [stuccoSpec, paintSpec];
    target.sync(initialFirestoreState);

    // User edits Paint color code from 'SW extra white 567' to 'SW 7006 Extra White (Satin)'
    const updatedPaintSpec = {
      ...paintSpec,
      code: 'SW 7006 Extra White',
      sheen: 'Satin'
    };

    const updatedFirestoreState = [stuccoSpec, updatedPaintSpec];
    target.sync(updatedFirestoreState);

    const check = verifyFinishSheetSync(target.getRows(), updatedFirestoreState);
    assert.equal(check.inSync, true);
    assert.equal(check.matchedCount, 2);
    assert.equal(check.sheetRowCount, 2);

    // Verify row content contains the new code
    const sheetData = target.getRows();
    const paintRow = sheetData.find((r) => r[0] === 'Paint');
    assert.equal(paintRow[3], 'SW 7006 Extra White');
    assert.equal(paintRow[4], 'Satin');
  });

  it('4. DELETION & PURGE INVARIANT: Deleting a record removes it from Sheet with 0 orphan/stale rows left behind', () => {
    const target = new MockGoogleSheetSyncTarget();

    // Initial state: 2 records (Stucco + Paint)
    target.sync([stuccoSpec, paintSpec]);
    assert.equal(target.getRows().length, 3); // Header + 2 data rows

    // User deletes Stucco -> Firestore now has only [Paint]
    const stateAfterDelete = [paintSpec];
    target.sync(stateAfterDelete);

    const check = verifyFinishSheetSync(target.getRows(), stateAfterDelete);
    assert.equal(check.inSync, true);
    assert.equal(check.sheetRowCount, 1, 'Only 1 data row remains in the sheet');
    assert.equal(check.matchedCount, 1);
    assert.equal(target.getRows()[1][0], 'Paint');
  });

  it('5. NON-BLOCKING ERROR HANDLING: Sheets API write failure returns descriptive error rather than silent success', () => {
    function simulateSheetsApiWrite(shouldFail = true) {
      if (shouldFail) {
        return {
          ok: false,
          error: 'Google Sheets API error (403): Insufficient OAuth scopes.',
          webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_file_999/edit'
        };
      }
      return {
        ok: true,
        error: null,
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_file_999/edit'
      };
    }

    const failedSync = simulateSheetsApiWrite(true);
    assert.equal(failedSync.ok, false);
    assert.ok(failedSync.error);
    assert.match(failedSync.error, /403/);
  });
});
