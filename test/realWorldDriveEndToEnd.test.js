import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchProjectDriveTree
} from '../src/services/googleDrive.js';

import {
  findDriveFile,
  findDriveFolder,
  executeClientAction,
  ACTION_TYPES
} from '../src/services/clientActionService.js';

import {
  executeClientToolCall
} from '../src/services/aiTools.js';

import {
  synthesizeGroundedEvidence
} from '../src/services/semanticIntentService.js';

describe('Real-World Google Drive End-to-End Deep Verification Suite', () => {

  /**
   * Realistic Multi-Depth Construction Project Hierarchy:
   * Level 0 (Root): Lot 3 - Modern Farmhouse
   *   Level 1: App Folders
   *     Level 2: Google Doc Purchasing List
   *       Level 3: 2026 Material Orders & Invoices
   *         Level 4: January 2026 Framing POs
   *           Level 5: Archival Vault (Empty)
   *   Level 1: Architectural Plans & Engineering
   *     Level 2: Structural Calcs (Paginated - 120 files)
   */
  const createMockDriveEnvironment = () => {
    return async (url) => {
      const u = String(url);

      // Root Folder
      if (u.includes('fld_lot3_root')) {
        return Response.json({
          files: [
            { id: 'fld_app_folders', name: 'App Folders', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'fld_arch_plans', name: 'Architectural Plans & Engineering', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'f_root_contract', name: 'Lot 3 General Contractor Agreement.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_root_contract/view' }
          ]
        });
      }

      // Level 1: App Folders
      if (u.includes('fld_app_folders')) {
        return Response.json({
          files: [
            { id: 'fld_gdoc_purchasing', name: 'Google Doc Purchasing List', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'fld_xray_photos', name: 'X-Ray Photos', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      // Level 2: Google Doc Purchasing List
      if (u.includes('fld_gdoc_purchasing')) {
        return Response.json({
          files: [
            { id: 'f_pur_doc_master', name: 'Lot 3 Master Purchasing Document.docx', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://docs.google.com/document/d/f_pur_doc_master/edit' },
            { id: 'f_pur_fixtures_pdf', name: 'Kohler Plumbing Fixtures Spec.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_pur_fixtures_pdf/view' },
            { id: 'fld_2026_orders', name: '2026 Material Orders & Invoices', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      // Level 3: 2026 Material Orders & Invoices
      if (u.includes('fld_2026_orders')) {
        return Response.json({
          files: [
            { id: 'f_order_lumber', name: 'Truss & Engineered Lumber PO-1042.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_order_lumber/view' },
            { id: 'fld_jan_framing', name: 'January 2026 Framing POs', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      // Level 4: January 2026 Framing POs
      if (u.includes('fld_jan_framing')) {
        return Response.json({
          files: [
            { id: 'f_deep_sub_receipt', name: 'Apex Framing Draw 1 Receipt.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_deep_sub_receipt/view' },
            { id: 'fld_archival_vault', name: 'Archival Vault', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      // Level 5: Archival Vault (Empty Nested Folder)
      if (u.includes('fld_archival_vault')) {
        return Response.json({ files: [] });
      }

      // Level 1: Architectural Plans & Engineering
      if (u.includes('fld_arch_plans')) {
        return Response.json({
          files: [
            { id: 'fld_structural_calcs', name: 'Structural Calcs', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      // Level 2: Structural Calcs (Multi-Page Paginated Folder)
      if (u.includes('fld_structural_calcs')) {
        if (!u.includes('pageToken')) {
          // Page 1: 5 files + nextPageToken
          return Response.json({
            nextPageToken: 'page_2_calcs_token',
            files: Array.from({ length: 5 }, (_, i) => ({
              id: `f_calc_p1_${i + 1}`,
              name: `Foundation Beam Calculation Sheet Part ${i + 1}.pdf`,
              mimeType: 'application/pdf',
              webViewLink: `https://drive.google.com/file/d/f_calc_p1_${i + 1}/view`
            }))
          });
        } else if (u.includes('page_2_calcs_token')) {
          // Page 2: 5 files (Total 10 files across 2 pages)
          return Response.json({
            files: Array.from({ length: 5 }, (_, i) => ({
              id: `f_calc_p2_${i + 6}`,
              name: `Foundation Beam Calculation Sheet Part ${i + 6}.pdf`,
              mimeType: 'application/pdf',
              webViewLink: `https://drive.google.com/file/d/f_calc_p2_${i + 6}/view`
            }))
          });
        }
      }

      // Other folders
      return Response.json({ files: [] });
    };
  };

  it('Check 1: Crawls and discovers a folder 5 levels deep dynamically', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');
      assert.ok(driveTree, 'Drive tree must be initialized');

      // Verify Level 5 folder exists in foldersById index
      const level5Node = driveTree.foldersById['fld_archival_vault'];
      assert.ok(level5Node, 'Level 5 folder "Archival Vault" must be discovered');
      assert.equal(level5Node.depth, 5);
      assert.equal(
        level5Node.folderPath,
        'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs / Archival Vault'
      );

      // Verify deeply nested file at Level 4 exists
      const deepFile = driveTree.allFiles.find(f => f.id === 'f_deep_sub_receipt');
      assert.ok(deepFile, 'Deep file at Level 4 must be in allFiles manifest');
      assert.equal(deepFile.name, 'Apex Framing Draw 1 Receipt.pdf');
      assert.equal(
        deepFile.folderPath,
        'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Check 2: "What\'s inside the Google Doc Purchasing List folder?" returns files and subfolders', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');

      // Execute AI Tool Call
      const toolRes = await executeClientToolCall('get_drive_files', {
        folderName: 'Google Doc Purchasing List'
      }, {
        driveTree,
        activeProject: { name: 'Lot 3' }
      });

      assert.strictEqual(toolRes.found, true);
      assert.strictEqual(toolRes.count, 2);
      assert.deepEqual(toolRes.subfolders, ['2026 Material Orders & Invoices']);
      assert.deepEqual(toolRes.files.map(f => f.name), [
        'Lot 3 Master Purchasing Document.docx',
        'Kohler Plumbing Fixtures Spec.pdf'
      ]);

      // Synthesize Jarvis response
      const answer = synthesizeGroundedEvidence([
        {
          success: true,
          tool: { name: 'get_drive_files', args: { folderName: 'Google Doc Purchasing List' } },
          result: toolRes
        }
      ], "What's inside the Google Doc Purchasing List folder?", {
        activeProjectName: 'Lot 3',
        driveTree
      });

      assert.ok(answer);
      assert.match(answer, /Lot 3 Master Purchasing Document\.docx/);
      assert.match(answer, /Kohler Plumbing Fixtures Spec\.pdf/);
      assert.match(answer, /App Folders \/ Google Doc Purchasing List/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Check 3: Opens document nested 4 levels deep accurately via OPEN_DOCUMENT action', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');

      const actionRes = await executeClientAction(ACTION_TYPES.OPEN_DOCUMENT, {
        fileName: 'Apex Framing Draw 1 Receipt'
      }, {
        driveTree,
        activeProjectName: 'Lot 3'
      });

      assert.strictEqual(actionRes.success, true);
      assert.strictEqual(actionRes.fileName, 'Apex Framing Draw 1 Receipt.pdf');
      assert.strictEqual(
        actionRes.folderName,
        'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs'
      );
      assert.strictEqual(actionRes.webViewLink, 'https://drive.google.com/file/d/f_deep_sub_receipt/view');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Check 4: Searches for same folder by exact name AND by full breadcrumb path', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');

      // 4.1 Search by folder name
      const byName = findDriveFolder(driveTree, 'January 2026 Framing POs');
      assert.ok(byName, 'Must find folder by simple name');
      assert.equal(byName.folderId, 'fld_jan_framing');
      assert.equal(byName.fileCount, 1);

      // 4.2 Search by full breadcrumb path
      const byPath = findDriveFolder(
        driveTree,
        'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs'
      );
      assert.ok(byPath, 'Must find folder by full breadcrumb path');
      assert.equal(byPath.folderId, 'fld_jan_framing');
      assert.equal(byPath.fileCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Check 5: Empty nested folder reports truthful empty status', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');

      const toolRes = await executeClientToolCall('get_drive_files', {
        folderName: 'Archival Vault'
      }, {
        driveTree,
        activeProject: { name: 'Lot 3' }
      });

      assert.strictEqual(toolRes.found, true);
      assert.strictEqual(toolRes.isFolderEmpty, true);
      assert.strictEqual(toolRes.count, 0);
      assert.match(toolRes.message, /exists in Google Drive for this project, but it does not currently contain any files/);

      const answer = synthesizeGroundedEvidence([
        {
          success: true,
          tool: { name: 'get_drive_files', args: { folderName: 'Archival Vault' } },
          result: toolRes
        }
      ], "What is inside the Archival Vault folder?", {
        activeProjectName: 'Lot 3',
        driveTree
      });

      assert.ok(answer);
      assert.match(answer, /Archival Vault/);
      assert.match(answer, /does not currently contain any files/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Check 6: Pagination collects all files across multiple Google Drive API pages without omitting any', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createMockDriveEnvironment();

    try {
      const driveTree = await fetchProjectDriveTree('mock_access_token', 'fld_lot3_root');

      const calcsFolder = driveTree.foldersById['fld_structural_calcs'];
      assert.ok(calcsFolder, 'Structural Calcs folder must be indexed');
      assert.equal(calcsFolder.files.length, 10, 'Must collect all 10 files from both page 1 and page 2');

      // Verify files from page 1 and page 2 are present
      assert.ok(calcsFolder.files.some(f => f.name === 'Foundation Beam Calculation Sheet Part 1.pdf'));
      assert.ok(calcsFolder.files.some(f => f.name === 'Foundation Beam Calculation Sheet Part 10.pdf'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
