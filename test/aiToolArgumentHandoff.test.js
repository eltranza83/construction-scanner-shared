import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  askGeminiBrain,
  buildGroundingSystemInstruction
} from '../src/services/builderBrainService.js';

import {
  executeClientToolCall
} from '../src/services/aiTools.js';

import {
  synthesizeGroundedEvidence
} from '../src/services/semanticIntentService.js';

describe('AI-to-Tool Function Call Argument Handoff & Telemetry Regression Suite', () => {

  const mockDriveTree = {
    rootFolderId: 'fld_root',
    rootFolderName: 'Lot 3',
    directFiles: [],
    allFiles: [
      {
        id: 'doc_purchasing_master',
        name: 'Lot 3 Master Purchasing Document.docx',
        folderName: 'Google Doc Purchasing List',
        folderPath: 'App Folders / Google Doc Purchasing List',
        mimeType: 'application/vnd.google-apps.document',
        webViewLink: 'https://docs.google.com/document/d/doc_purchasing_master/edit'
      },
      {
        id: 'pdf_kohler_fixtures',
        name: 'Kohler Plumbing Fixtures Spec.pdf',
        folderName: 'Google Doc Purchasing List',
        folderPath: 'App Folders / Google Doc Purchasing List',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/pdf_kohler_fixtures/view'
      },
      {
        id: 'pdf_framing_draw1',
        name: 'Apex Framing Draw 1 Receipt.pdf',
        folderName: 'January 2026 Framing POs',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/pdf_framing_draw1/view'
      }
    ],
    subfolders: [
      {
        folderId: 'fld_app_folders',
        folderName: 'App Folders',
        folderPath: 'App Folders',
        fileCount: 0,
        subfolderNames: ['Google Doc Purchasing List', 'X-Ray Photos']
      },
      {
        folderId: 'fld_gdoc_purchasing',
        folderName: 'Google Doc Purchasing List',
        folderPath: 'App Folders / Google Doc Purchasing List',
        fileCount: 2,
        files: [
          {
            id: 'doc_purchasing_master',
            name: 'Lot 3 Master Purchasing Document.docx',
            mimeType: 'application/vnd.google-apps.document',
            webViewLink: 'https://docs.google.com/document/d/doc_purchasing_master/edit'
          },
          {
            id: 'pdf_kohler_fixtures',
            name: 'Kohler Plumbing Fixtures Spec.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'https://drive.google.com/file/d/pdf_kohler_fixtures/view'
          }
        ],
        subfolderNames: ['2026 Material Orders & Invoices']
      },
      {
        folderId: 'fld_jan_framing',
        folderName: 'January 2026 Framing POs',
        folderPath: 'App Folders / Google Doc Purchasing List / 2026 Material Orders & Invoices / January 2026 Framing POs',
        fileCount: 1,
        files: [
          {
            id: 'pdf_framing_draw1',
            name: 'Apex Framing Draw 1 Receipt.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'https://drive.google.com/file/d/pdf_framing_draw1/view'
          }
        ],
        subfolderNames: []
      }
    ],
    foldersById: {}
  };

  it('1. Broad Hierarchy Query ("What folders do we have?") -> Calls get_drive_files with {} and preserves args in telemetry', async () => {
    const originalFetch = globalThis.fetch;
    let toolCallReceived = null;

    globalThis.fetch = async (url, options) => {
      const u = String(url);
      if (u.includes('/api/ask-brain')) {
        const body = JSON.parse(options.body);
        if (!body.forceNoTools) {
          // Pass 1: Gemini decides to call get_drive_files with {} for broad overview
          return Response.json({
            text: '',
            toolCalls: [{ name: 'get_drive_files', args: {} }],
            telemetry: { modelUsed: 'gemini-2.5-flash-lite' }
          });
        } else {
          // Pass 2: Gemini synthesizes final response from tool execution outcomes
          return Response.json({
            text: 'In Google Drive for Lot 3, we have the following folders: App Folders, Google Doc Purchasing List, and January 2026 Framing POs.'
          });
        }
      }
      return Response.json({});
    };

    try {
      const res = await askGeminiBrain(
        'What folders do we have?',
        [],
        'Lot 3',
        'mock-api-key',
        null,
        'lot-3',
        [],
        mockDriveTree
      );

      assert.ok(res, 'Response must be returned');
      assert.match(res.text, /Google Doc Purchasing List|App Folders/);

      // Verify UI Telemetry preserved full tool execution object with args
      assert.ok(res.telemetry, 'Telemetry must be present');
      assert.ok(Array.isArray(res.telemetry.toolsExecuted), 'toolsExecuted must be an array');
      assert.equal(res.telemetry.toolsExecuted.length, 1);

      const executedTool = res.telemetry.toolsExecuted[0];
      assert.equal(executedTool.name, 'get_drive_files');
      assert.deepEqual(executedTool.args, {}, 'Args must be {} and preserved as an object');
      assert.ok(executedTool.result, 'Result must be populated');
      assert.ok(executedTool.result.folders.length > 0, 'Result must contain folder tree');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. Specific Folder Query ("What is in the Purchasing List folder?") -> Gemini passes non-empty folderName', async () => {
    const originalFetch = globalThis.fetch;
    let toolCallReceived = null;

    globalThis.fetch = async (url, options) => {
      const u = String(url);
      if (u.includes('/api/ask-brain')) {
        const body = JSON.parse(options.body);
        if (!body.forceNoTools) {
          // Pass 1: Gemini function call with non-empty folderName
          return Response.json({
            text: '',
            toolCalls: [{ name: 'get_drive_files', args: { folderName: 'Purchasing List' } }],
            telemetry: { modelUsed: 'gemini-2.5-flash-lite' }
          });
        } else {
          // Pass 2: Synthesis
          return Response.json({
            text: 'Inside the Google Doc Purchasing List folder, we have Lot 3 Master Purchasing Document.docx and Kohler Plumbing Fixtures Spec.pdf.'
          });
        }
      }
      return Response.json({});
    };

    try {
      const res = await askGeminiBrain(
        'What is in the Purchasing List folder?',
        [],
        'Lot 3',
        'mock-api-key',
        null,
        'lot-3',
        [],
        mockDriveTree
      );

      assert.ok(res);
      assert.match(res.text, /Master Purchasing Document|Kohler Plumbing Fixtures/);

      const executedTool = res.telemetry.toolsExecuted[0];
      assert.equal(executedTool.name, 'get_drive_files');
      assert.equal(executedTool.args.folderName, 'Purchasing List');
      assert.equal(executedTool.result.found, true);
      assert.equal(executedTool.result.count, 2);
      assert.equal(executedTool.result.folderName, 'Google Doc Purchasing List');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('3. Explicit Folder Name Query ("What is in Google Doc Purchasing List?") -> Gemini passes non-empty folderName', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      const u = String(url);
      if (u.includes('/api/ask-brain')) {
        const body = JSON.parse(options.body);
        if (!body.forceNoTools) {
          return Response.json({
            text: '',
            toolCalls: [{ name: 'get_drive_files', args: { folderName: 'Google Doc Purchasing List' } }],
            telemetry: { modelUsed: 'gemini-2.5-flash-lite' }
          });
        } else {
          return Response.json({
            text: 'Inside Google Doc Purchasing List, we have Lot 3 Master Purchasing Document.docx and Kohler Plumbing Fixtures Spec.pdf.'
          });
        }
      }
      return Response.json({});
    };

    try {
      const res = await askGeminiBrain(
        'What is in Google Doc Purchasing List?',
        [],
        'Lot 3',
        'mock-api-key',
        null,
        'lot-3',
        [],
        mockDriveTree
      );

      assert.ok(res);
      assert.match(res.text, /Master Purchasing Document/);

      const executedTool = res.telemetry.toolsExecuted[0];
      assert.equal(executedTool.name, 'get_drive_files');
      assert.equal(executedTool.args.folderName, 'Google Doc Purchasing List');
      assert.equal(executedTool.result.found, true);
      assert.equal(executedTool.result.count, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('4. Full Breadcrumb Path Query ("What is in App Folders / Google Doc Purchasing List?") -> Passes full path', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      const u = String(url);
      if (u.includes('/api/ask-brain')) {
        const body = JSON.parse(options.body);
        if (!body.forceNoTools) {
          return Response.json({
            text: '',
            toolCalls: [{ name: 'get_drive_files', args: { folderName: 'App Folders / Google Doc Purchasing List' } }],
            telemetry: { modelUsed: 'gemini-2.5-flash-lite' }
          });
        } else {
          return Response.json({
            text: 'Inside App Folders / Google Doc Purchasing List, we have 2 files: Lot 3 Master Purchasing Document.docx and Kohler Plumbing Fixtures Spec.pdf.'
          });
        }
      }
      return Response.json({});
    };

    try {
      const res = await askGeminiBrain(
        'What is in App Folders / Google Doc Purchasing List?',
        [],
        'Lot 3',
        'mock-api-key',
        null,
        'lot-3',
        [],
        mockDriveTree
      );

      assert.ok(res);
      assert.match(res.text, /Master Purchasing Document/);

      const executedTool = res.telemetry.toolsExecuted[0];
      assert.equal(executedTool.name, 'get_drive_files');
      assert.equal(executedTool.args.folderName, 'App Folders / Google Doc Purchasing List');
      assert.equal(executedTool.result.found, true);
      assert.equal(executedTool.result.folderPath, 'App Folders / Google Doc Purchasing List');
      assert.equal(executedTool.result.count, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. End-to-End Regression Guard: Telemetry renders actual non-empty Args object in UI', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      const u = String(url);
      if (u.includes('/api/ask-brain')) {
        const body = JSON.parse(options.body);
        if (!body.forceNoTools) {
          return Response.json({
            text: '',
            toolCalls: [{ name: 'get_drive_files', args: { folderName: 'January 2026 Framing POs' } }],
            telemetry: { modelUsed: 'gemini-2.5-flash-lite' }
          });
        } else {
          return Response.json({
            text: 'Inside January 2026 Framing POs, we have Apex Framing Draw 1 Receipt.pdf.'
          });
        }
      }
      return Response.json({});
    };

    try {
      const res = await askGeminiBrain(
        'Show me files in January 2026 Framing POs',
        [],
        'Lot 3',
        'mock-api-key',
        null,
        'lot-3',
        [],
        mockDriveTree
      );

      assert.ok(res.telemetry);
      const executed = res.telemetry.toolsExecuted[0];
      assert.ok(typeof executed === 'object', 'toolsExecuted entry must be an object with name, args, and result');
      assert.equal(executed.name, 'get_drive_files');
      assert.deepEqual(executed.args, { folderName: 'January 2026 Framing POs' });

      // Simulate UI render string
      const uiArgsRender = JSON.stringify(executed.args || {});
      assert.equal(uiArgsRender, '{"folderName":"January 2026 Framing POs"}');
      assert.notEqual(uiArgsRender, '{}', 'UI must not render empty {} when folderName was provided');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
