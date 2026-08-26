import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  let store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

import {
  setCustomContentProvider,
  resetContentProvider,
  DOCUMENT_STATES,
  fetchDocumentContent,
  writeDocumentContent,
  clearDocumentContentCache
} from '../src/services/documentContentProvider.js';

import { executeClientToolCall } from '../src/services/aiTools.js';
import { purchasingService } from '../src/services/purchasingService.js';
import { parseGoogleDocPurchasingStructure } from '../src/services/googleDocsPurchasingService.js';

const SAMPLE_LOT3_DOCX_CONTENT = `Applicable to all lots and standard builds.

## 1. Quartz Hardware
- [ ] Electrical pass-through caps
- [ ] Sinks

## 2. Electrical Hardware Fixtures
- [ ] Security lights
- [ ] Contractor's doorbell chime kit
- [ ] Smart doorbell
- [ ] Front porch hanging light
- [ ] Exterior column lights
- [ ] Garage ceiling lights with the cap to install it
- [ ] Vanity lights
- [ ] Smart switches
- [ ] Extension rods
- [ ] Ceiling fans

## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser
- [ ] Garbage disposal power button
- [ ] Garbage disposal
- [ ] Water heater with the water heater stand and tray
- [ ] Shower kits
- [ ] Toilets
- [ ] Rough-in shower valves
- [ ] Faucets
`;

const SAMPLE_EMPTY_DOC_CONTENT = `Applicable to all lots.

## 1. Quartz Hardware

## 2. Electrical Hardware Fixtures

## 3. Plumbing Hardware Fixtures
`;

describe('Google Drive Live Content Reader & Safe Write-Back Suite', () => {
  let driveStore = {};

  beforeEach(() => {
    localStorage.clear();
    resetContentProvider();
    if (purchasingService?.storage?.memoryStore?.clear) {
      purchasingService.storage.memoryStore.clear();
    }
    driveStore = {
      'file_lot3_docx': {
        content: SAMPLE_LOT3_DOCX_CONTENT,
        fileName: 'Purchasing Checklist.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        modifiedTime: '2026-08-23T12:00:00Z',
        shouldFailRead: false,
        shouldFailWrite: false
      },
      'file_lot3_gdoc': {
        content: SAMPLE_LOT3_DOCX_CONTENT,
        fileName: 'Purchasing Checklist',
        mimeType: 'application/vnd.google-apps.document',
        modifiedTime: '2026-08-23T12:00:00Z',
        shouldFailRead: false,
        shouldFailWrite: false
      },
      'file_empty_doc': {
        content: SAMPLE_EMPTY_DOC_CONTENT,
        fileName: 'Purchasing Checklist.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        modifiedTime: '2026-08-23T12:00:00Z',
        shouldFailRead: false,
        shouldFailWrite: false
      }
    };

    setCustomContentProvider({
      fetchDocumentContent: async ({ documentId, forceRefresh }) => {
        const file = driveStore[documentId];
        if (!file) {
          return { success: false, state: DOCUMENT_STATES.DOCUMENT_MISSING, error: 'File not found in Drive.' };
        }
        if (file.shouldFailRead) {
          return { success: false, state: DOCUMENT_STATES.DOCUMENT_READ_ERROR, error: 'Google Drive 503 Service Unavailable' };
        }
        return {
          success: true,
          state: DOCUMENT_STATES.DOCUMENT_READ_SUCCESS,
          content: file.content,
          modifiedTime: file.modifiedTime,
          format: file.fileName.endsWith('.docx') ? 'docx' : 'google_doc',
          error: null
        };
      },
      writeDocumentContent: async ({ documentId, content }) => {
        const file = driveStore[documentId];
        if (!file) {
          return { success: false, state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR, error: 'File not found in Drive.' };
        }
        if (file.shouldFailWrite) {
          return { success: false, state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR, error: 'Drive write quota exceeded / 403 Forbidden' };
        }
        file.content = content;
        file.modifiedTime = new Date().toISOString();
        return {
          success: true,
          state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
          updatedTime: file.modifiedTime,
          error: null
        };
      }
    });
  });

  afterEach(() => {
    resetContentProvider();
  });

  test('1. Populated .docx File: Fetches content successfully from provider', async () => {
    const res = await fetchDocumentContent({ documentId: 'file_lot3_docx', googleToken: 'mock' });
    assert.equal(res.success, true);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_READ_SUCCESS);
    assert.equal(res.format, 'docx');
    assert.ok(res.content.includes('Electrical pass-through caps'));
    
    // Parse content structure
    const parsed = parseGoogleDocPurchasingStructure(res.content);
    const totalItems = parsed.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems >= 20, 'Should parse 20 items');
    assert.ok(parsed.sections.some(s => s.categoryId === 'quartz'));
    assert.ok(parsed.sections.some(s => s.categoryId === 'electrical'));
    assert.ok(parsed.sections.some(s => s.categoryId === 'plumbing'));
  });

  test('2. Native Google Doc Read: Seamlessly extracts live items from Google Doc format', async () => {
    const res = await fetchDocumentContent({ documentId: 'file_lot3_gdoc', googleToken: 'mock' });
    assert.equal(res.success, true);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_READ_SUCCESS);
    assert.equal(res.format, 'google_doc');
    assert.ok(res.content.includes('Security lights'));
  });

  test('3. Empty Drive Document: Truthfully reports zero items without error', async () => {
    const res = await fetchDocumentContent({ documentId: 'file_empty_doc', googleToken: 'mock' });
    assert.equal(res.success, true);
    const parsed = parseGoogleDocPurchasingStructure(res.content);
    const totalItems = parsed.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.equal(totalItems, 0);
  });

  test('4. Read Failure State: Reports read error state truthfully', async () => {
    driveStore['file_lot3_docx'].shouldFailRead = true;
    const res = await fetchDocumentContent({ documentId: 'file_lot3_docx', googleToken: 'mock', forceRefresh: true });
    assert.equal(res.success, false);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_READ_ERROR);
    assert.ok(res.error.includes('503'));
  });

  test('5. Safe Write-Back: Confirms write to Drive and updates store', async () => {
    const newContent = `${SAMPLE_LOT3_DOCX_CONTENT}\n- [ ] 4 recessed lights`;
    const res = await writeDocumentContent({ documentId: 'file_lot3_docx', content: newContent, googleToken: 'mock' });
    assert.equal(res.success, true);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS);
    assert.ok(driveStore['file_lot3_docx'].content.includes('4 recessed lights'));
  });

  test('6. Write Failure Rollback: Rejects operation if Drive write fails', async () => {
    driveStore['file_lot3_docx'].shouldFailWrite = true;
    const res = await writeDocumentContent({ documentId: 'file_lot3_docx', content: 'new content', googleToken: 'mock' });
    assert.equal(res.success, false);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_WRITE_ERROR);
    assert.ok(res.error.includes('quota exceeded'));
  });

  test('7. Missing File State: Returns DOCUMENT_MISSING on non-existent ID', async () => {
    const res = await fetchDocumentContent({ documentId: 'non_existent_id', googleToken: 'mock' });
    assert.equal(res.success, false);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_MISSING);
  });

  test('8. Native Google Docs Export Format: Successfully extracts items from unicode checkboxes (☐/☑)', () => {
    const unicodeDoc = `Applicable to all lots.

1. Quartz Hardware
☐ Electrical pass-through caps
☑ Sinks

2. Electrical Hardware Fixtures
☐ Security lights
☑ Smart doorbell
`;
    const parsed = parseGoogleDocPurchasingStructure(unicodeDoc);
    const totalItems = parsed.sections.reduce((sum, s) => sum + s.items.length, 0);
    const totalPurchased = parsed.sections.reduce((sum, s) => sum + s.items.filter(i => i.isPurchased).length, 0);
    const totalNeeded = totalItems - totalPurchased;
    assert.equal(totalItems, 4);
    assert.equal(totalPurchased, 2);
    assert.equal(totalNeeded, 2);
  });
});
