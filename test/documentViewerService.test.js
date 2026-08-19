import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBrowserCapabilities,
  inferFileCategory,
  FILE_CATEGORIES,
  RENDER_MODES,
  GoogleDrivePreviewStrategy,
  DirectImageStrategy,
  BlobEmbedStrategy,
  getStrategyChainForFile,
  resolveDocumentViewPlan
} from '../src/services/documentViewerService.js';

describe('Document Viewer Abstraction & Capability Decision Layer', () => {
  test('inferFileCategory identifies common construction file types accurately', () => {
    assert.equal(inferFileCategory('Lot_3_Closing_Statement.pdf'), FILE_CATEGORIES.PDF);
    assert.equal(inferFileCategory('foundation_pour.JPG'), FILE_CATEGORIES.IMAGE);
    assert.equal(inferFileCategory('blueprint_plumbing.PNG'), FILE_CATEGORIES.IMAGE);
    assert.equal(inferFileCategory('notes.txt'), FILE_CATEGORIES.TEXT);
    assert.equal(inferFileCategory('Lot_3_Budget.xlsx'), FILE_CATEGORIES.SPREADSHEET);
  });

  test('GoogleDrivePreviewStrategy generates official preview iframe URL', () => {
    const fileMeta = { fileId: '12345XYZ', fileName: 'contract.pdf' };
    assert.equal(GoogleDrivePreviewStrategy.isSupported({}, fileMeta), true);
    assert.equal(
      GoogleDrivePreviewStrategy.resolveUrl(fileMeta),
      'https://drive.google.com/file/d/12345XYZ/preview'
    );
  });

  test('BlobEmbedStrategy strictly disallows mobile platforms to prevent grey Android blob box', () => {
    const mobileCaps = { isMobile: true, isAndroid: true, pdfViewerEnabled: false };
    const desktopCaps = { isMobile: false, isAndroid: false, pdfViewerEnabled: true };
    const pdfMeta = { fileId: '123', fileName: 'plan.pdf' };

    assert.equal(BlobEmbedStrategy.isSupported(mobileCaps, pdfMeta), false);
    assert.equal(BlobEmbedStrategy.isSupported(desktopCaps, pdfMeta), true);
  });

  test('getStrategyChainForFile on Mobile prioritizes Drive Preview Embed and omits Blob Embed', () => {
    const mobileCaps = { isMobile: true, isAndroid: true, pdfViewerEnabled: false };
    const pdfMeta = { fileId: 'ABC999', fileName: 'inspection.pdf' };

    const chain = getStrategyChainForFile(pdfMeta, mobileCaps);
    const strategyIds = chain.map(s => s.id);

    assert.equal(strategyIds[0], 'drive_preview_embed');
    assert.equal(strategyIds.includes('blob_embed'), false);
    assert.equal(strategyIds.includes('external_provider'), true);
    assert.equal(strategyIds.includes('download_fallback'), true);
  });

  test('resolveDocumentViewPlan resolves clean iframe embed plan for Google Drive PDF on mobile', async () => {
    const mobileCaps = { isMobile: true, isAndroid: true, pdfViewerEnabled: false };
    const fileMeta = { fileId: 'TEST_FILE_ID_101', fileName: 'Lot_3_Permit.pdf', folderName: 'Permits' };

    const plan = await resolveDocumentViewPlan(fileMeta, 'fake_token', mobileCaps);

    assert.equal(plan.success, true);
    assert.equal(plan.strategyId, 'drive_preview_embed');
    assert.equal(plan.renderMode, RENDER_MODES.IFRAME_EMBED);
    assert.equal(plan.srcUrl, 'https://drive.google.com/file/d/TEST_FILE_ID_101/preview');
    assert.equal(plan.externalUrl, 'https://drive.google.com/file/d/TEST_FILE_ID_101/view');
  });

  test('resolveDocumentViewPlan generates direct image render for images', async () => {
    const caps = { isMobile: false, isAndroid: false, pdfViewerEnabled: true };
    const fileMeta = { fileId: 'IMG_88', fileName: 'foundation.jpg', directUrl: 'https://example.com/photo.jpg' };

    const plan = await resolveDocumentViewPlan(fileMeta, null, caps);

    assert.equal(plan.success, true);
    assert.equal(plan.strategyId, 'image_direct');
    assert.equal(plan.renderMode, RENDER_MODES.IMAGE_DIRECT);
    assert.equal(plan.srcUrl, 'https://example.com/photo.jpg');
  });
});
