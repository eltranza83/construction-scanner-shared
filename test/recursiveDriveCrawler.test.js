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

describe('Complete Breadth-First Recursive Drive Crawler & Hierarchy Suite', () => {

  // Deeply nested mock drive tree (4+ levels)
  const mockDeepDriveTree = {
    rootFolderId: 'fld_root',
    directFiles: [
      { id: 'f_root_1', name: 'Master Project Charter.pdf', webViewLink: 'https://drive.google.com/file/d/f_root_1/view', folderPath: 'Root', folderName: 'Root' }
    ],
    foldersById: {
      'fld_root': {
        folderId: 'fld_root',
        folderName: 'Root',
        folderPath: '',
        subfolderIds: ['fld_app_folders', 'fld_floor_plans'],
        files: [{ id: 'f_root_1', name: 'Master Project Charter.pdf', webViewLink: 'https://drive.google.com/file/d/f_root_1/view' }]
      },
      'fld_app_folders': {
        folderId: 'fld_app_folders',
        folderName: 'App Folders',
        folderPath: 'App Folders',
        parentFolderId: 'fld_root',
        subfolderIds: ['fld_purchasing', 'fld_xray', 'fld_invoices', 'fld_uploads'],
        files: []
      },
      'fld_purchasing': {
        folderId: 'fld_purchasing',
        folderName: 'Google Doc Purchasing List',
        folderPath: 'App Folders / Google Doc Purchasing List',
        parentFolderId: 'fld_app_folders',
        subfolderIds: ['fld_archive_2026'],
        files: [
          { id: 'f_pur_1', name: 'Lot 3 Master Purchasing Doc', webViewLink: 'https://docs.google.com/document/d/f_pur_1/edit', mimeType: 'application/vnd.google-apps.document' },
          { id: 'f_pur_2', name: 'Plumbing Fixtures Order.pdf', webViewLink: 'https://drive.google.com/file/d/f_pur_2/view', mimeType: 'application/pdf' }
        ]
      },
      'fld_archive_2026': {
        folderId: 'fld_archive_2026',
        folderName: '2026 Archive',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive',
        parentFolderId: 'fld_purchasing',
        subfolderIds: ['fld_deep_empty'],
        files: [
          { id: 'f_arch_1', name: 'Q1 Lumber PO.pdf', webViewLink: 'https://drive.google.com/file/d/f_arch_1/view', mimeType: 'application/pdf' }
        ]
      },
      'fld_deep_empty': {
        folderId: 'fld_deep_empty',
        folderName: 'Empty Level 4 Folder',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive / Empty Level 4 Folder',
        parentFolderId: 'fld_archive_2026',
        subfolderIds: [],
        files: []
      },
      'fld_floor_plans': {
        folderId: 'fld_floor_plans',
        folderName: 'Floor Plans',
        folderPath: 'Floor Plans',
        parentFolderId: 'fld_root',
        subfolderIds: [],
        files: [
          { id: 'f_fp_1', name: 'Lot 3 Architectural Blueprints.pdf', webViewLink: 'https://drive.google.com/file/d/f_fp_1/view', mimeType: 'application/pdf' }
        ]
      }
    },
    subfolders: [
      {
        folderId: 'fld_app_folders',
        folderName: 'App Folders',
        folderPath: 'App Folders',
        parentFolderId: 'fld_root',
        subfolderNames: ['Google Doc Purchasing List', 'X-Ray Photos', 'Processed Invoices', 'Invoice Uploads'],
        files: [],
        fileCount: 0,
        subfolderCount: 4,
        webViewLink: 'https://drive.google.com/drive/folders/fld_app_folders'
      },
      {
        folderId: 'fld_purchasing',
        folderName: 'Google Doc Purchasing List',
        folderPath: 'App Folders / Google Doc Purchasing List',
        parentFolderId: 'fld_app_folders',
        subfolderNames: ['2026 Archive'],
        files: [
          { id: 'f_pur_1', name: 'Lot 3 Master Purchasing Doc', webViewLink: 'https://docs.google.com/document/d/f_pur_1/edit', mimeType: 'application/vnd.google-apps.document', folderPath: 'App Folders / Google Doc Purchasing List' },
          { id: 'f_pur_2', name: 'Plumbing Fixtures Order.pdf', webViewLink: 'https://drive.google.com/file/d/f_pur_2/view', mimeType: 'application/pdf', folderPath: 'App Folders / Google Doc Purchasing List' }
        ],
        fileCount: 2,
        subfolderCount: 1,
        webViewLink: 'https://drive.google.com/drive/folders/fld_purchasing'
      },
      {
        folderId: 'fld_archive_2026',
        folderName: '2026 Archive',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive',
        parentFolderId: 'fld_purchasing',
        subfolderNames: ['Empty Level 4 Folder'],
        files: [
          { id: 'f_arch_1', name: 'Q1 Lumber PO.pdf', webViewLink: 'https://drive.google.com/file/d/f_arch_1/view', mimeType: 'application/pdf', folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive' }
        ],
        fileCount: 1,
        subfolderCount: 1,
        webViewLink: 'https://drive.google.com/drive/folders/fld_archive_2026'
      },
      {
        folderId: 'fld_deep_empty',
        folderName: 'Empty Level 4 Folder',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive / Empty Level 4 Folder',
        parentFolderId: 'fld_archive_2026',
        subfolderNames: [],
        files: [],
        fileCount: 0,
        subfolderCount: 0,
        webViewLink: 'https://drive.google.com/drive/folders/fld_deep_empty'
      },
      {
        folderId: 'fld_floor_plans',
        folderName: 'Floor Plans',
        folderPath: 'Floor Plans',
        parentFolderId: 'fld_root',
        subfolderNames: [],
        files: [
          { id: 'f_fp_1', name: 'Lot 3 Architectural Blueprints.pdf', webViewLink: 'https://drive.google.com/file/d/f_fp_1/view', mimeType: 'application/pdf', folderPath: 'Floor Plans' }
        ],
        fileCount: 1,
        subfolderCount: 0,
        webViewLink: 'https://drive.google.com/drive/folders/fld_floor_plans'
      }
    ],
    allFiles: [
      { id: 'f_root_1', name: 'Master Project Charter.pdf', webViewLink: 'https://drive.google.com/file/d/f_root_1/view', folderPath: 'Root' },
      { id: 'f_pur_1', name: 'Lot 3 Master Purchasing Doc', webViewLink: 'https://docs.google.com/document/d/f_pur_1/edit', folderPath: 'App Folders / Google Doc Purchasing List' },
      { id: 'f_pur_2', name: 'Plumbing Fixtures Order.pdf', webViewLink: 'https://drive.google.com/file/d/f_pur_2/view', folderPath: 'App Folders / Google Doc Purchasing List' },
      { id: 'f_arch_1', name: 'Q1 Lumber PO.pdf', webViewLink: 'https://drive.google.com/file/d/f_arch_1/view', folderPath: 'App Folders / Google Doc Purchasing List / 2026 Archive' },
      { id: 'f_fp_1', name: 'Lot 3 Architectural Blueprints.pdf', webViewLink: 'https://drive.google.com/file/d/f_fp_1/view', folderPath: 'Floor Plans' }
    ]
  };

  it('1. Crawler Simulation: BFS discovers arbitrary depth without level cutoff and prevents circular loops', async () => {
    let callCount = 0;
    const mockServer = async (url) => {
      callCount++;
      const urlStr = String(url);

      if (urlStr.includes('fld_root')) {
        return Response.json({
          files: [
            { id: 'fld_app_folders', name: 'App Folders', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'f_root_1', name: 'Charter.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_root_1' }
          ]
        });
      }

      if (urlStr.includes('fld_app_folders')) {
        return Response.json({
          files: [
            { id: 'fld_purchasing', name: 'Google Doc Purchasing List', mimeType: 'application/vnd.google-apps.folder' },
            // Add a circular shortcut back to root to test loop prevention
            { id: 'fld_root', name: 'Shortcut to Root', mimeType: 'application/vnd.google-apps.folder' }
          ]
        });
      }

      if (urlStr.includes('fld_purchasing')) {
        // Return 1st page with nextPageToken to test pagination
        if (!urlStr.includes('pageToken')) {
          return Response.json({
            nextPageToken: 'token_page_2',
            files: [
              { id: 'fld_archive_2026', name: '2026 Archive', mimeType: 'application/vnd.google-apps.folder' },
              { id: 'f_pur_1', name: 'Purchasing Checklist.docx', mimeType: 'application/vnd.google-apps.document', webViewLink: 'https://drive.google.com/file/d/f_pur_1' }
            ]
          });
        } else {
          // Page 2
          return Response.json({
            files: [
              { id: 'f_pur_2', name: 'Second Page Order.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_pur_2' }
            ]
          });
        }
      }

      if (urlStr.includes('fld_archive_2026')) {
        return Response.json({
          files: [
            { id: 'f_arch_1', name: 'Deep Lumber PO.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/f_arch_1' }
          ]
        });
      }

      return Response.json({ files: [] });
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockServer;

    try {
      const tree = await fetchProjectDriveTree('mock_token', 'fld_root');

      assert.ok(tree, 'Drive tree must be returned');
      assert.equal(tree.directFiles.length, 1);
      assert.equal(tree.directFiles[0].name, 'Charter.pdf');

      // Check depth 3+ discovery
      assert.ok(tree.foldersById['fld_archive_2026'], 'Level 3 folder must be indexed in foldersById');
      assert.equal(tree.foldersById['fld_archive_2026'].folderPath, 'App Folders / Google Doc Purchasing List / 2026 Archive');

      // Check pagination
      const purchasingFolder = tree.foldersById['fld_purchasing'];
      assert.equal(purchasingFolder.files.length, 2, 'Must paginate through both page 1 and page 2');

      // Check allFiles flattened manifest
      assert.equal(tree.allFiles.length, 4, 'Must aggregate files across all nested depths');

      // Check loop prevention (did not infinite loop on circular shortcut to root)
      assert.ok(callCount <= 10, 'Total API calls (' + callCount + ') must be bounded and not infinite');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. findDriveFolder: Locates nested folder by exact name, breadcrumb path, or folder ID', () => {
    // 2.1 By Exact Name
    const byName = findDriveFolder(mockDeepDriveTree, 'Google Doc Purchasing List');
    assert.ok(byName);
    assert.equal(byName.folderId, 'fld_purchasing');
    assert.equal(byName.fileCount, 2);
    assert.equal(byName.folderPath, 'App Folders / Google Doc Purchasing List');

    // 2.2 By Full Breadcrumb Path
    const byPath = findDriveFolder(mockDeepDriveTree, 'App Folders / Google Doc Purchasing List / 2026 Archive');
    assert.ok(byPath);
    assert.equal(byPath.folderId, 'fld_archive_2026');
    assert.equal(byPath.fileCount, 1);

    // 2.3 By Folder ID
    const byId = findDriveFolder(mockDeepDriveTree, 'fld_deep_empty');
    assert.ok(byId);
    assert.equal(byId.folderName, 'Empty Level 4 Folder');
    assert.equal(byId.fileCount, 0);
  });

  it('3. findDriveFile: Locates deeply nested file across multiple folder levels', () => {
    const found = findDriveFile(mockDeepDriveTree, 'Lumber PO');
    assert.ok(found);
    assert.equal(found.file.name, 'Q1 Lumber PO.pdf');
    assert.equal(found.folderPath, 'App Folders / Google Doc Purchasing List / 2026 Archive');
  });

  it('4. get_drive_files Tool: Accurately lists contents of nested folder with files', async () => {
    const res = await executeClientToolCall('get_drive_files', {
      folderName: 'Google Doc Purchasing List'
    }, {
      driveTree: mockDeepDriveTree,
      activeProject: { name: 'Lot 3' }
    });

    assert.strictEqual(res.found, true);
    assert.strictEqual(res.folderName, 'Google Doc Purchasing List');
    assert.strictEqual(res.folderPath, 'App Folders / Google Doc Purchasing List');
    assert.strictEqual(res.count, 2);
    assert.deepEqual(res.files.map(f => f.name), [
      'Lot 3 Master Purchasing Doc',
      'Plumbing Fixtures Order.pdf'
    ]);
  });

  it('5. get_drive_files Tool: Reports empty state truthfully when nested folder has 0 files', async () => {
    const res = await executeClientToolCall('get_drive_files', {
      folderName: 'Empty Level 4 Folder'
    }, {
      driveTree: mockDeepDriveTree,
      activeProject: { name: 'Lot 3' }
    });

    assert.strictEqual(res.isFolderEmpty, true);
    assert.match(res.message, /exists in Google Drive for this project, but it does not currently contain any files/);
  });

  it('6. get_drive_files Tool: Lists subfolders when querying parent folder with child directories', async () => {
    const res = await executeClientToolCall('get_drive_files', {
      folderName: 'App Folders'
    }, {
      driveTree: mockDeepDriveTree,
      activeProject: { name: 'Lot 3' }
    });

    assert.strictEqual(res.found, true);
    assert.ok(res.subfolders.includes('Google Doc Purchasing List'));
    assert.match(res.message, /Inside "App Folders", we have the following subfolders/);
  });

  it('7. open_drive_document & open_drive_folder: Opens nested documents and folders accurately', async () => {
    // 7.1 Open nested document
    const docRes = await executeClientAction(ACTION_TYPES.OPEN_DOCUMENT, {
      fileName: 'Plumbing Fixtures Order'
    }, {
      driveTree: mockDeepDriveTree,
      activeProjectName: 'Lot 3'
    });

    assert.strictEqual(docRes.success, true);
    assert.strictEqual(docRes.fileName, 'Plumbing Fixtures Order.pdf');
    assert.strictEqual(docRes.folderName, 'App Folders / Google Doc Purchasing List');
    assert.strictEqual(docRes.webViewLink, 'https://drive.google.com/file/d/f_pur_2/view');

    // 7.2 Open nested folder
    const folderRes = await executeClientAction(ACTION_TYPES.OPEN_FOLDER, {
      folderName: 'Google Doc Purchasing List'
    }, {
      driveTree: mockDeepDriveTree,
      activeProjectName: 'Lot 3'
    });

    assert.strictEqual(folderRes.success, true);
    assert.strictEqual(folderRes.folderName, 'Google Doc Purchasing List');
    assert.strictEqual(folderRes.webViewLink, 'https://drive.google.com/drive/folders/fld_purchasing');
  });

});
