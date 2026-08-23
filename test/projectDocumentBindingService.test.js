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
  discoverAndBindProjectDocument,
  resolveCandidateDriveFiles,
  buildDocumentProvenance,
  extractBoundDocumentMetadata
} from '../src/services/projectDocumentBindingService.js';

import { PROJECT_DOC_REGISTRY, getDocumentDefinition } from '../src/services/projectDocumentRegistry.js';

const MOCK_COMPREHENSIVE_DRIVE_TREE = {
  directFiles: [
    { id: 'file_lot3_plans', name: 'Architectural Plans Rev 3.pdf', modifiedTime: '2026-08-01T10:00:00Z' }
  ],
  subfolders: [
    {
      folderName: 'Google Doc Purchasing List',
      folderId: 'fld_purchasing',
      files: [
        { id: 'file_purchasing_canonical', name: 'Purchasing Checklist.docx', modifiedTime: '2026-08-10T12:00:00Z' },
        { id: 'file_purchasing_backup', name: 'Purchasing Checklist - Copy.docx', modifiedTime: '2026-08-20T12:00:00Z' },
        { id: 'file_purchasing_old', name: 'Purchasing Checklist_old.docx', modifiedTime: '2026-08-05T12:00:00Z' }
      ]
    },
    {
      folderName: 'Municipal Inspections',
      folderId: 'fld_inspections',
      files: [
        { id: 'file_inspections_canonical', name: 'Municipal Inspection Log.docx', modifiedTime: '2026-08-12T10:00:00Z' }
      ]
    },
    {
      folderName: 'Change Orders',
      folderId: 'fld_change_orders',
      files: [
        { id: 'file_change_orders_canonical', name: 'Change Orders Log.docx', modifiedTime: '2026-08-15T09:00:00Z' }
      ]
    }
  ]
};

describe('Generic Project Document Discovery & Binding Platform Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Document Type Coverage (Purchasing, Inspections, Change Orders)', () => {
    test('1.1 Purchasing Checklist auto-discovery and binding', () => {
      const res = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'purchasing_checklist', {
        activeProjectName: 'Lot 3',
        driveTree: MOCK_COMPREHENSIVE_DRIVE_TREE
      });

      assert.equal(res.found, true);
      assert.equal(res.documentId, 'file_purchasing_canonical');
      assert.equal(res.fileName, 'Purchasing Checklist.docx');
      assert.equal(res.sourceLabel, 'Google Docs (Lot 3 Purchasing Checklist)');
      assert.equal(res.resourceType, 'project_purchasing');
      assert.ok(res.content.includes('DocumentId: file_purchasing_canonical'));
    });

    test('1.2 Municipal Inspections auto-discovery and binding', () => {
      const res = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'municipal_inspections', {
        activeProjectName: 'Lot 3',
        driveTree: MOCK_COMPREHENSIVE_DRIVE_TREE
      });

      assert.equal(res.found, true);
      assert.equal(res.documentId, 'file_inspections_canonical');
      assert.equal(res.fileName, 'Municipal Inspection Log.docx');
      assert.equal(res.sourceLabel, 'Google Docs (Lot 3 Municipal Inspection Log)');
      assert.equal(res.resourceType, 'project_inspections');
      assert.ok(res.content.includes('DocumentId: file_inspections_canonical'));
      assert.ok(res.content.includes('## 1. Foundation & Plumbing Underground'));
    });

    test('1.3 Change Orders auto-discovery and binding', () => {
      const res = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'change_orders', {
        activeProjectName: 'Lot 3',
        driveTree: MOCK_COMPREHENSIVE_DRIVE_TREE
      });

      assert.equal(res.found, true);
      assert.equal(res.documentId, 'file_change_orders_canonical');
      assert.equal(res.fileName, 'Change Orders Log.docx');
      assert.equal(res.sourceLabel, 'Google Docs (Lot 3 Change Orders Log)');
      assert.equal(res.resourceType, 'project_change_orders');
      assert.ok(res.content.includes('DocumentId: file_change_orders_canonical'));
      assert.ok(res.content.includes('## 1. Approved Change Orders'));
    });
  });

  describe('2. Deterministic Candidate Scoring & Ambiguity Surfacing', () => {
    test('2.1 Exact canonical name match beats newer copy/backup file', () => {
      const resolution = resolveCandidateDriveFiles(MOCK_COMPREHENSIVE_DRIVE_TREE, 'purchasing_checklist');
      assert.equal(resolution.isAmbiguous, false);
      assert.equal(resolution.bestMatch.documentId, 'file_purchasing_canonical');
      assert.equal(resolution.bestMatch.fileName, 'Purchasing Checklist.docx');
      assert.ok(resolution.bestMatch.baseScore > 140, 'Canonical + folder match score should be high');

      const copyCandidate = resolution.candidates.find(c => c.documentId === 'file_purchasing_backup');
      assert.ok(copyCandidate.isCopyOrBackup);
      assert.ok(resolution.bestMatch.totalScore > copyCandidate.totalScore);
    });

    test('2.2 Ambiguous candidates: Surfaces ambiguity when two non-canonical files have equal confidence', () => {
      const ambiguousTree = {
        directFiles: [],
        subfolders: [
          {
            folderName: 'Change Orders',
            files: [
              { id: 'file_co_variant_a', name: 'Lot 3 Client Extras Option A.docx' },
              { id: 'file_co_variant_b', name: 'Lot 3 Client Extras Option B.docx' }
            ]
          }
        ]
      };

      const res = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'change_orders', {
        driveTree: ambiguousTree
      });

      assert.equal(res.found, false);
      assert.equal(res.isAmbiguous, true);
      assert.equal(res.documentId, null, 'Must NOT silently bind when ambiguous');
      assert.ok(res.ambiguityReason.includes('equal match confidence'));
      assert.equal(res.candidates.length, 2);
    });
  });

  describe('3. Dual-Persistence & Binding Reuse', () => {
    test('3.1 Reuses persistent adapter binding without rescanning Drive', () => {
      const firstRes = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'purchasing_checklist', {
        driveTree: MOCK_COMPREHENSIVE_DRIVE_TREE
      });
      assert.equal(firstRes.documentId, 'file_purchasing_canonical');

      const secondRes = discoverAndBindProjectDocument(localStorage, 'Lot 3', 'purchasing_checklist', {
        driveTree: { directFiles: [], subfolders: [] }
      });
      assert.equal(secondRes.found, true);
      assert.equal(secondRes.documentId, 'file_purchasing_canonical');
      assert.equal(secondRes.isBoundDurable, true);
    });
  });

  describe('4. Missing Document & Master Template Scaffolding', () => {
    test('4.1 Missing document returns found: false with master template available', () => {
      const emptyTree = { directFiles: [], subfolders: [{ folderName: 'Permits', files: [] }] };
      const res = discoverAndBindProjectDocument(localStorage, 'Lot 99', 'municipal_inspections', {
        driveTree: emptyTree
      });

      assert.equal(res.found, false);
      assert.equal(res.documentId, null);
      assert.equal(res.masterTemplateAvailable, true);
    });
  });

  describe('5. Project vs. Master Provenance Isolation', () => {
    test('5.1 Master queries attribute strictly to Master, project queries to Project', () => {
      const masterPurchasing = buildDocumentProvenance('Master', 'purchasing_checklist', true);
      const projectPurchasing = buildDocumentProvenance('Lot 37', 'purchasing_checklist', false);

      const masterInspections = buildDocumentProvenance('Master', 'municipal_inspections', true);
      const projectInspections = buildDocumentProvenance('Lot 37', 'municipal_inspections', false);

      const masterCO = buildDocumentProvenance('Master', 'change_orders', true);
      const projectCO = buildDocumentProvenance('Lot 37', 'change_orders', false);

      assert.equal(masterPurchasing, 'Google Docs (Master Purchasing Checklist)');
      assert.equal(projectPurchasing, 'Google Docs (Lot 37 Purchasing Checklist)');

      assert.equal(masterInspections, 'Google Docs (Master Municipal Inspection Log)');
      assert.equal(projectInspections, 'Google Docs (Lot 37 Municipal Inspection Log)');

      assert.equal(masterCO, 'Google Docs (Master Change Orders Log)');
      assert.equal(projectCO, 'Google Docs (Lot 37 Change Orders Log)');
    });
  });
});
