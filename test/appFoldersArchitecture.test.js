import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mock Google Drive Virtual File System
 * Accurately models multi-level folder creation, hierarchy traversal, and file moves.
 */
export class MockDriveFileSystem {
  constructor() {
    this.folders = new Map(); // id -> { id, name, parentId }
    this.files = new Map();   // id -> { id, name, parentId, mimeType, content }
    this.idCounter = 1;
  }

  createFolder(name, parentId = null) {
    const id = `folder_${this.idCounter++}`;
    const folder = { id, name, parentId };
    this.folders.set(id, folder);
    return folder;
  }

  createFile(name, parentId, mimeType = 'application/octet-stream', content = '') {
    const id = `file_${this.idCounter++}`;
    const file = { id, name, parentId, mimeType, content };
    this.files.set(id, file);
    return file;
  }

  findFolder(name, parentId) {
    for (const folder of this.folders.values()) {
      if (folder.name.toLowerCase() === name.toLowerCase() && folder.parentId === parentId) {
        return folder;
      }
    }
    return null;
  }

  findOrCreateFolder(name, parentId) {
    const existing = this.findFolder(name, parentId);
    if (existing) return existing.id;
    const created = this.createFolder(name, parentId);
    return created.id;
  }

  ensureAppSubfolder(projectFolderId, subfolderName) {
    const appFoldersId = this.findOrCreateFolder('App Folders', projectFolderId);
    return this.findOrCreateFolder(subfolderName, appFoldersId);
  }

  ensureVendorFolder(projectFolderId, vendorName) {
    const vendorsStoresId = this.ensureAppSubfolder(projectFolderId, 'Vendors / Stores');
    const cleanVendor = String(vendorName).trim().replace(/[/\\?%*:|"<>]/g, ' ').replace(/\s+/g, ' ');
    return this.findOrCreateFolder(cleanVendor, vendorsStoresId);
  }

  findSpreadsheet(projectFolderId, preferredName = 'JobScan_Expense_Log') {
    // 1. Check direct files under projectFolderId
    for (const f of this.files.values()) {
      if (f.parentId === projectFolderId && f.mimeType === 'application/vnd.google-apps.spreadsheet') {
        if (!f.name.toLowerCase().includes('finish')) return f;
      }
    }

    // 2. Check inside App Folders and App Folders > Master Budget Sheet
    const appFolder = this.findFolder('App Folders', projectFolderId);
    if (appFolder) {
      for (const f of this.files.values()) {
        if (f.parentId === appFolder.id && f.mimeType === 'application/vnd.google-apps.spreadsheet') {
          if (!f.name.toLowerCase().includes('finish')) return f;
        }
      }

      const budgetFolder = this.findFolder('Master Budget Sheet', appFolder.id);
      if (budgetFolder) {
        for (const f of this.files.values()) {
          if (f.parentId === budgetFolder.id && f.mimeType === 'application/vnd.google-apps.spreadsheet') {
            return f;
          }
        }
      }
    }

    return null;
  }

  moveFile(fileId, fromFolderId, toFolderId) {
    const file = this.files.get(fileId);
    if (!file) throw new Error('File not found');
    file.parentId = toFolderId;
    return file;
  }

  getRootChildren(projectFolderId) {
    const directFolders = Array.from(this.folders.values()).filter(f => f.parentId === projectFolderId);
    const directFiles = Array.from(this.files.values()).filter(f => f.parentId === projectFolderId);
    return { folders: directFolders, files: directFiles };
  }

  getAppFolderChildren(projectFolderId) {
    const appFolder = this.findFolder('App Folders', projectFolderId);
    if (!appFolder) return [];
    return Array.from(this.folders.values()).filter(f => f.parentId === appFolder.id);
  }
}

describe('Canonical Google Drive App Folders Architecture Suite', () => {
  it('1. App Folders Container: Creates App Folders under Lot root on first operational access', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    // Access Invoice Uploads via ensureAppSubfolder
    const uploadsId = drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');
    assert.ok(uploadsId);

    // Verify 'App Folders' exists directly under Lot 3
    const appFolder = drive.findFolder('App Folders', lot3.id);
    assert.ok(appFolder, 'App Folders must exist under Lot 3');

    // Verify Invoice Uploads is inside App Folders, NOT directly under Lot 3
    const uploadsFolder = drive.folders.get(uploadsId);
    assert.equal(uploadsFolder.parentId, appFolder.id);
    assert.notEqual(uploadsFolder.parentId, lot3.id);
  });

  it('2. Zero Root Duplication: Operational folders are never created at the Lot root', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    // Client facing folders at root
    drive.findOrCreateFolder('Floor Plans', lot3.id);
    drive.findOrCreateFolder('Finish Specs & Buyer Handover', lot3.id);
    drive.findOrCreateFolder('Closing Settlement', lot3.id);

    // Operational folders via ensureAppSubfolder
    drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');
    drive.ensureAppSubfolder(lot3.id, 'Processed Invoices');
    drive.ensureAppSubfolder(lot3.id, 'X-Ray Photos');
    drive.ensureAppSubfolder(lot3.id, 'Vendors / Stores');
    drive.ensureAppSubfolder(lot3.id, 'Master Budget Sheet');
    drive.ensureAppSubfolder(lot3.id, 'Purchasing List Doc');

    const rootChildren = drive.getRootChildren(lot3.id);
    const rootFolderNames = rootChildren.folders.map(f => f.name);

    // Exact allowable folders at Lot root: Floor Plans, Finish Specs, Closing Settlement, App Folders
    assert.equal(rootFolderNames.length, 4);
    assert.ok(rootFolderNames.includes('Floor Plans'));
    assert.ok(rootFolderNames.includes('Finish Specs & Buyer Handover'));
    assert.ok(rootFolderNames.includes('Closing Settlement'));
    assert.ok(rootFolderNames.includes('App Folders'));

    // Verify none of the operational folders leaked to the root
    assert.equal(rootFolderNames.includes('Invoice Uploads'), false);
    assert.equal(rootFolderNames.includes('Processed Invoices'), false);
    assert.equal(rootFolderNames.includes('X-Ray Photos'), false);
    assert.equal(rootFolderNames.includes('Vendors / Stores'), false);
    assert.equal(rootFolderNames.includes('Master Budget Sheet'), false);
    assert.equal(rootFolderNames.includes('Purchasing List Doc'), false);
  });

  it('3. Re-use & Idempotency: Multiple calls to ensureAppSubfolder reuse existing folders without duplication', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    const id1 = drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');
    const id2 = drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');
    const id3 = drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');

    assert.equal(id1, id2);
    assert.equal(id2, id3);

    const appFolderChildren = drive.getAppFolderChildren(lot3.id);
    const invoiceUploadsMatches = appFolderChildren.filter(f => f.name === 'Invoice Uploads');
    assert.equal(invoiceUploadsMatches.length, 1, 'Exactly 1 Invoice Uploads folder should exist');
  });

  it('4. Vendor Hierarchy: ensureVendorFolder creates vendors inside App Folders > Vendors / Stores', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    const homeDepotId = drive.ensureVendorFolder(lot3.id, 'Home Depot');
    const lowesId = drive.ensureVendorFolder(lot3.id, 'Lowes');
    const tileId = drive.ensureVendorFolder(lot3.id, 'Rodriguez Tile');

    const appFolder = drive.findFolder('App Folders', lot3.id);
    const vendorsStores = drive.findFolder('Vendors / Stores', appFolder.id);
    assert.ok(vendorsStores, 'Vendors / Stores must exist inside App Folders');

    const homeDepotFolder = drive.folders.get(homeDepotId);
    const lowesFolder = drive.folders.get(lowesId);
    const tileFolder = drive.folders.get(tileId);

    assert.equal(homeDepotFolder.parentId, vendorsStores.id);
    assert.equal(lowesFolder.parentId, vendorsStores.id);
    assert.equal(tileFolder.parentId, vendorsStores.id);
  });

  it('5. X-Ray Photos Hierarchy: Project_Photos and Issue Photos nest inside App Folders / X-Ray Photos', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    const xRayFolderId = drive.ensureAppSubfolder(lot3.id, 'X-Ray Photos');
    const issuePhotosId = drive.findOrCreateFolder('Issue Photos', xRayFolderId);
    const projectPhotosId = drive.findOrCreateFolder('Project_Photos', xRayFolderId);
    const framingId = drive.findOrCreateFolder('Framing', projectPhotosId);

    const appFolder = drive.findFolder('App Folders', lot3.id);
    const xRayFolder = drive.folders.get(xRayFolderId);
    const issuePhotos = drive.folders.get(issuePhotosId);
    const projectPhotos = drive.folders.get(projectPhotosId);
    const framingFolder = drive.folders.get(framingId);

    assert.equal(xRayFolder.parentId, appFolder.id);
    assert.equal(issuePhotos.parentId, xRayFolder.id);
    assert.equal(projectPhotos.parentId, xRayFolder.id);
    assert.equal(framingFolder.parentId, projectPhotos.id);
  });

  it('6. Full Pipeline Simulation: Invoice Uploads -> Processing -> Processed Invoices + Budget Discovery', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    // 1. Provision Master Budget Sheet inside App Folders / Master Budget Sheet
    const budgetFolderId = drive.ensureAppSubfolder(lot3.id, 'Master Budget Sheet');
    const budgetSheet = drive.createFile('Lot 3 — Master Budget Sheet', budgetFolderId, 'application/vnd.google-apps.spreadsheet');

    // 2. Discover Budget Sheet
    const discoveredSheet = drive.findSpreadsheet(lot3.id);
    assert.ok(discoveredSheet, 'Budget spreadsheet must be discovered inside Master Budget Sheet folder');
    assert.equal(discoveredSheet.id, budgetSheet.id);

    // 3. User uploads invoice into App Folders / Invoice Uploads
    const uploadsId = drive.ensureAppSubfolder(lot3.id, 'Invoice Uploads');
    const archiveId = drive.ensureAppSubfolder(lot3.id, 'Processed Invoices');
    const uploadedInvoice = drive.createFile('Lot 3 - Lumber - Material.pdf', uploadsId, 'application/pdf', 'INVOICE_BYTES');

    assert.equal(uploadedInvoice.parentId, uploadsId);

    // 4. Process invoice: Move file from Invoice Uploads to Processed Invoices
    drive.moveFile(uploadedInvoice.id, uploadsId, archiveId);

    const movedInvoice = drive.files.get(uploadedInvoice.id);
    assert.equal(movedInvoice.parentId, archiveId, 'Invoice must now reside in Processed Invoices inside App Folders');
  });

  it('7. Purchasing List Doc: Resolves under App Folders / Purchasing List Doc', () => {
    const drive = new MockDriveFileSystem();
    const lot3 = drive.createFolder('Lot 3');

    const purchasingFolderId = drive.ensureAppSubfolder(lot3.id, 'Purchasing List Doc');
    const purchasingDoc = drive.createFile('Purchasing Checklist — Lot 3', purchasingFolderId, 'application/vnd.google-apps.document');

    const appFolder = drive.findFolder('App Folders', lot3.id);
    const purchasingFolder = drive.folders.get(purchasingFolderId);

    assert.equal(purchasingFolder.parentId, appFolder.id);
    assert.equal(purchasingDoc.parentId, purchasingFolderId);
  });
});

