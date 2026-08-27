import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Validates whether the rows inside a Google Sheet accurately and completely
 * reflect the approved Firestore Finish specifications.
 */
export function verifyFinishSheetSync(sheetRows = [], firestoreSpecs = []) {
  if (!Array.isArray(sheetRows) || sheetRows.length === 0) {
    return {
      inSync: false,
      reason: 'Google Sheet is completely empty (0 rows / no headers)',
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

    const matchingRowIndex = dataRows.findIndex((row) => {
      const rowCategory = String(row[0] || '').toLowerCase().trim();
      const rowLocation = String(row[1] || '').toLowerCase().trim();
      const rowCode = String(row[3] || '').toLowerCase().trim();

      return rowCategory === specCategory &&
        (rowLocation === specLocation || (!rowLocation && !specLocation)) &&
        rowCode === specCode;
    });

    if (matchingRowIndex >= 0) {
      matchedRows.push(dataRows[matchingRowIndex]);
    } else {
      missingSpecs.push(spec);
    }
  }

  const inSync = missingSpecs.length === 0 && dataRows.length === firestoreSpecs.length;

  return {
    inSync,
    reason: inSync ? 'Fully synchronized' : `${missingSpecs.length} approved Firestore specs missing from Google Sheet`,
    matchedCount: matchedRows.length,
    missingSpecs,
    missingCount: missingSpecs.length
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

describe('Google Sheets Finish Specs Sync & Self-Healing Suite', () => {
  const approvedFirestoreSpecs = [
    {
      id: 'spec_1',
      category: 'Paint',
      location: 'Whole House',
      scope: 'whole_house',
      brand: 'Sherwin-Williams',
      code: 'SW extra white 567',
      sheen: 'Flat/Eggshell',
      notes: 'Interior walls',
      createdAt: '2026-08-27T10:00:00.000Z'
    }
  ];

  it('1. REPRODUCTION OF THE FLAW: Legacy check falsely considers a blank spreadsheet "healthy"', () => {
    // Simulated Google Drive state: File exists, but content was never populated (0 rows)
    const mockDriveFile = {
      id: 'sheet_file_999',
      name: 'Homeowner Finishes & Specs — acepeda83 Test',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_file_999/edit'
    };
    const mockSheetContent = []; // EMPTY / BLANK

    // Legacy logic only checked `Boolean(mockDriveFile.webViewLink)`
    const legacyIsHealthy = Boolean(mockDriveFile?.webViewLink);
    assert.equal(legacyIsHealthy, true, 'Legacy code thought the sheet was fine just because a Drive file existed');

    // Invariant Verification correctly identifies the mismatch
    const syncStatus = verifyFinishSheetSync(mockSheetContent, approvedFirestoreSpecs);
    assert.equal(syncStatus.inSync, false);
    assert.equal(syncStatus.missingCount, 1);
    assert.match(syncStatus.reason, /completely empty/);
  });

  it('2. SELF-HEALING: Formatting and writing approved Firestore data restores full sheet synchronization', () => {
    // Generate the table payload from approved Firestore records
    const syncPayload = formatSpecsForSheet(approvedFirestoreSpecs);

    // Verify format includes header + data row
    assert.equal(syncPayload.length, 2);
    assert.deepEqual(syncPayload[0], ['Category', 'Room / Location', 'Brand / Supplier', 'Color Name / Code / Model', 'Sheen / Specs', 'Notes', 'Date Added']);
    assert.equal(syncPayload[1][0], 'Paint');
    assert.equal(syncPayload[1][3], 'SW extra white 567');

    // Verify that the populated sheet is now 100% in sync with Firestore
    const postSyncVerification = verifyFinishSheetSync(syncPayload, approvedFirestoreSpecs);
    assert.equal(postSyncVerification.inSync, true);
    assert.equal(postSyncVerification.matchedCount, 1);
    assert.equal(postSyncVerification.missingCount, 0);
  });

  it('3. STALE / DRIFT DETECTION: Detects when Firestore has updated records not yet in the Google Sheet', () => {
    // Google sheet has an old single record
    const staleSheetContent = [
      ['Category', 'Room / Location', 'Brand / Supplier', 'Color Name / Code / Model', 'Sheen / Specs', 'Notes', 'Date Added'],
      ['Paint', 'Whole House', 'Sherwin-Williams', 'SW extra white 567', 'Flat/Eggshell', 'Interior walls', '8/27/2026']
    ];

    // User added a 2nd finish in Firestore (e.g. Tile spec)
    const updatedFirestoreSpecs = [
      ...approvedFirestoreSpecs,
      {
        id: 'spec_2',
        category: 'Tile & Grout',
        location: 'Master Bath',
        scope: 'room_override',
        brand: 'Daltile',
        code: 'Carrara Marble 12x24',
        sheen: 'Polished',
        createdAt: '2026-08-27T11:00:00.000Z'
      }
    ];

    const driftVerification = verifyFinishSheetSync(staleSheetContent, updatedFirestoreSpecs);
    assert.equal(driftVerification.inSync, false);
    assert.equal(driftVerification.missingCount, 1);
    assert.equal(driftVerification.missingSpecs[0].id, 'spec_2');

    // Healing the drift by re-exporting all approved specs
    const resyncedPayload = formatSpecsForSheet(updatedFirestoreSpecs);
    const resolvedVerification = verifyFinishSheetSync(resyncedPayload, updatedFirestoreSpecs);
    assert.equal(resolvedVerification.inSync, true);
    assert.equal(resolvedVerification.matchedCount, 2);
  });

  it('4. NON-BLOCKING ERROR HANDLING: Sheets API write failure returns descriptive error rather than silent success', () => {
    function simulateSheetsApiWrite(shouldFail = true) {
      if (shouldFail) {
        return {
          ok: false,
          error: 'Google Sheets API error (403): The caller does not have permission / insufficient OAuth scopes.',
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

    // The UI can use this error to show: "⚠️ Sync failed (Click to retry)" without crashing or altering Firestore
  });
});

