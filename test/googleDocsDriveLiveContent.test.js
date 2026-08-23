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

  test('1. Populated .docx File: Reads real items directly from Drive without empty placeholder', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const res = await executeClientToolCall('get_purchasing_list', {}, projectContext);
    assert.equal(res.found, true);
    assert.equal(res.documentId, 'file_lot3_docx');
    assert.equal(res.documentName, 'Purchasing Checklist.docx');
    assert.ok(res.totalItems >= 20, 'Should read all 20 items from .docx file');
    
    // Check specific items from screenshot
    const quartzSection = res.sections.find(s => s.categoryId === 'quartz');
    assert.ok(quartzSection, 'Quartz section exists');
    assert.ok(quartzSection.items.some(i => i.name.includes('Electrical pass-through caps')));
    assert.ok(quartzSection.items.some(i => i.name.includes('Sinks')));

    const electricalSection = res.sections.find(s => s.categoryId === 'electrical');
    assert.ok(electricalSection.items.some(i => i.name.includes('Security lights')));
    assert.ok(electricalSection.items.some(i => i.name.includes('Ceiling fans')));
  });

  test('2. Native Google Doc Read: Seamlessly extracts live items from Google Doc format', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_gdoc', name: 'Purchasing Checklist' }]
        }]
      }
    };

    const res = await executeClientToolCall('get_purchasing_list', {}, projectContext);
    assert.equal(res.found, true);
    assert.equal(res.documentId, 'file_lot3_gdoc');
    assert.ok(res.totalItems >= 20);
  });

  test('3. Empty Drive Document: Truthfully reports zero items without error', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_empty_doc', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const res = await executeClientToolCall('get_purchasing_list', {}, projectContext);
    assert.equal(res.hasExistingDocument, true);
    assert.equal(res.totalItems, 0);
    assert.ok(res.message.includes('currently has no pending items listed'));
  });

  test('4. Read Failure State: Reports read error truthfully without collapsing to "empty"', async () => {
    driveStore['file_lot3_docx'].shouldFailRead = true;

    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const res = await executeClientToolCall('get_purchasing_list', {}, projectContext);
    assert.equal(res.readError, true);
    assert.equal(res.state, DOCUMENT_STATES.DOCUMENT_READ_ERROR);
    assert.ok(res.message.includes('unable to read its current contents'));
    assert.ok(!res.message.includes('has no pending items listed'), 'Must never claim list is empty on read error');
  });

  test('5. Safe Write-Back: Confirms write to Drive before updating local cache', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const addRes = await executeClientToolCall('add_purchasing_item', {
      item: '4 recessed lights',
      category: 'electrical'
    }, projectContext);

    assert.equal(addRes.success, true);
    assert.equal(addRes.state, DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS);
    assert.ok(driveStore['file_lot3_docx'].content.includes('recessed lights'));
    assert.ok(driveStore['file_lot3_docx'].content.includes('Qty: 4'));

    // Verify subsequent read returns the new item from Drive
    const queryRes = await executeClientToolCall('get_purchasing_list', { trade: 'electrical' }, projectContext);
    const elec = queryRes.sections.find(s => s.categoryId === 'electrical');
    assert.ok(elec.items.some(i => i.name.includes('recessed lights')));
  });

  test('6. Write Failure Rollback: Rejects operation if Drive write fails', async () => {
    driveStore['file_lot3_docx'].shouldFailWrite = true;

    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const addRes = await executeClientToolCall('add_purchasing_item', {
      item: '10 smoke detectors',
      category: 'electrical'
    }, projectContext);

    assert.equal(addRes.success, false);
    assert.equal(addRes.writeError, true);
    assert.equal(addRes.state, DOCUMENT_STATES.DOCUMENT_WRITE_ERROR);
    assert.ok(addRes.message.includes('Failed to write item to Google Drive document'));
    assert.ok(!driveStore['file_lot3_docx'].content.includes('smoke detectors'));
  });

  test('7. Duplicate / Retry Protection: Idempotent quantity merge', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    // First add
    await executeClientToolCall('add_purchasing_item', { item: 'Ceiling fans', quantity: 2 }, projectContext);
    // Second add of same item merges quantity
    const addRes2 = await executeClientToolCall('add_purchasing_item', { item: 'Ceiling fans', quantity: 3 }, projectContext);
    
    assert.equal(addRes2.isDuplicate, true);
    assert.ok(driveStore['file_lot3_docx'].content.includes('Qty: 6'));
  });

  test('8. Provenance Isolation: Project queries attribute strictly to Project Purchasing Checklist', async () => {
    const projectContext = {
      activeProjectName: 'Lot 3',
      projectId: 'lot_3',
      driveTree: {
        subfolders: [{
          folderName: 'Google Doc Purchasing List',
          files: [{ id: 'file_lot3_docx', name: 'Purchasing Checklist.docx' }]
        }]
      }
    };

    const res = await executeClientToolCall('get_purchasing_list', {}, projectContext);
    assert.equal(res.source, 'Google Docs (Lot 3 Purchasing Checklist)');
  });
});
