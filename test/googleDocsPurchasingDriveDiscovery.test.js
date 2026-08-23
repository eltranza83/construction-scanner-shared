import { test, describe, beforeEach } from 'node:test';
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
  discoverAndBindProjectPurchasingDoc,
  loadProjectPurchasingDoc,
  saveProjectPurchasingDoc,
  RESOURCE_TYPES
} from '../src/services/googleDocsPurchasingService.js';

import {
  executeClientToolCall,
  TOOL_REGISTRY
} from '../src/services/aiTools.js';

const MOCK_LOT_3_DRIVE_TREE = {
  directFiles: [
    { id: 'file_lot3_site_plan', name: 'Site Plan.pdf', mimeType: 'application/pdf' }
  ],
  subfolders: [
    {
      folderName: 'Google Doc Purchasing List',
      folderId: 'folder_lot3_purchasing_123',
      files: [
        {
          id: 'file_lot3_purchasing_checklist_doc_789',
          name: 'Purchasing Checklist.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ]
    },
    {
      folderName: 'Permits',
      folderId: 'folder_lot3_permits',
      files: []
    }
  ]
};

describe('Google Drive Purchasing Document Discovery & Source of Truth Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('1. Auto-Discovery: Detects Purchasing Checklist.docx in Drive tree and binds document ID', () => {
    const discovery = discoverAndBindProjectPurchasingDoc(localStorage, 'Lot 3', {
      driveTree: MOCK_LOT_3_DRIVE_TREE
    });

    assert.equal(discovery.found, true);
    assert.equal(discovery.documentId, 'file_lot3_purchasing_checklist_doc_789');
    assert.equal(discovery.fileName, 'Purchasing Checklist.docx');
    assert.equal(discovery.folderName, 'Google Doc Purchasing List');

    // Document is registered in project storage with its authoritative document ID
    const loadedDoc = loadProjectPurchasingDoc(localStorage, 'Lot 3');
    assert.ok(loadedDoc.includes('DocumentId: file_lot3_purchasing_checklist_doc_789'));
    assert.ok(loadedDoc.includes('DocumentName: Purchasing Checklist.docx'));
  });

  test('2. get_purchasing_list recognizes existing Drive document and never reports uninitialized', async () => {
    const res = await executeClientToolCall('get_purchasing_list', {
      projectId: 'Lot 3',
      trade: 'quartz'
    }, {
      projectId: 'lot_3',
      activeProjectName: 'Lot 3',
      driveTree: MOCK_LOT_3_DRIVE_TREE
    });

    assert.equal(res.hasExistingDocument, true);
    assert.equal(res.documentId, 'file_lot3_purchasing_checklist_doc_789');
    assert.equal(res.documentName, 'Purchasing Checklist.docx');
    assert.equal(res.resourceType, RESOURCE_TYPES.PROJECT_PURCHASING);
    assert.ok(res.message.includes('Purchasing Checklist.docx'));
    assert.ok(!res.message.includes('not initialized'));
  });

  test('3. Provenance Truth: Project queries attribute strictly to Project Purchasing Checklist, NOT Master', async () => {
    const res = await executeClientToolCall('get_purchasing_list', {
      projectId: 'Lot 3'
    }, {
      projectId: 'lot_3',
      activeProjectName: 'Lot 3',
      driveTree: MOCK_LOT_3_DRIVE_TREE
    });

    assert.equal(res.source, 'Google Docs (Lot 3 Purchasing Checklist)');
    assert.ok(!res.source.includes('Master Purchasing Checklist'));
  });

  test('4. No Duplicate Creation: Adding an item preserves existing Drive document binding', async () => {
    const addRes = await executeClientToolCall('add_purchasing_item', {
      projectId: 'Lot 3',
      item: 'Electrical pass-through caps',
      quantity: 4,
      category: 'quartz'
    }, {
      projectId: 'lot_3',
      activeProjectName: 'Lot 3',
      driveTree: MOCK_LOT_3_DRIVE_TREE
    });

    assert.equal(addRes.success, true);
    assert.equal(addRes.documentId, 'file_lot3_purchasing_checklist_doc_789');

    const updatedDoc = loadProjectPurchasingDoc(localStorage, 'Lot 3');
    assert.ok(updatedDoc.includes('DocumentId: file_lot3_purchasing_checklist_doc_789'));
    assert.ok(updatedDoc.includes('Electrical pass-through caps — Qty: 4'));
  });

  test('5. Truly Missing Project Document: Returns found: false and offers template initialization', () => {
    const emptyDriveTree = {
      directFiles: [],
      subfolders: [{ folderName: 'Permits', files: [] }]
    };

    const discovery = discoverAndBindProjectPurchasingDoc(localStorage, 'Lot 99', {
      driveTree: emptyDriveTree
    });

    assert.equal(discovery.found, false);
    assert.equal(discovery.documentId, null);
  });
});
