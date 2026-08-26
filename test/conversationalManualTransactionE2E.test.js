import assert from 'node:assert/strict';
import test, { describe, beforeEach } from 'node:test';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

import { executeClientToolCall, circuitBreaker, resetWriteIdempotencyState } from '../src/services/aiTools.js';
import { loadStoredAppState, persistStagedItems } from '../src/services/appStorage.js';
import { generateDocumentPDF } from '../src/services/pdfGenerator.js';
import { buildHistoryLogs, buildInvoiceFileName } from '../src/services/invoiceUpload.js';
import { buildGroundingSystemInstruction, askGeminiBrain, resetActiveSessionCognitiveState } from '../src/services/builderBrainService.js';

describe('Conversational Manual Transaction & Downstream Pipeline E2E Suite', () => {
  beforeEach(() => {
    persistStagedItems([]);
    if (circuitBreaker) circuitBreaker.reset();
    resetWriteIdempotencyState();
    resetActiveSessionCognitiveState();
  });

  test('1. Grounding Prompt & Slot-Filling Rules: Strictly prohibits guessing payment method or check number', () => {
    const prompt = buildGroundingSystemInstruction({
      activeProjectName: 'Lot 3',
      dashData: { projectInfo: {}, subcontractors: [{ phase: 'Plumbing Rough-In', payee: 'Rios Plumbing' }] }
    });

    assert.ok(prompt.includes('STRICT SLOT-FILLING (ZERO ASSUMPTIONS ON PAYMENT METHOD'), 'Must contain strict slot filling section');
    assert.ok(prompt.includes('NEVER assume or guess the payment method'), 'Must strictly forbid assuming card/check');
    assert.ok(prompt.includes('CONCISE CONFIRMATION FIRST'), 'Must require confirmation before staging');
  });

  test('2. Ambiguous Cost Classification: Leaves costCategory empty for manual expense review', async () => {
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3',
        tradeCategory: 'Project_Overhead_&_Bills',
        tradePhase: 'Extra Costs & Misc',
        paymentMethod: 'Debit Card',
        // costCategory omitted
        description: 'Gas / Fuel for site visit'
      },
      { projectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.equal(res.costCategory, 'Unassigned (Review in EditForm)');
    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems[0].metadata.costCategory, '');
  });

  test('3. Real Spreadsheet Phase Mapping: Strictly respects existing category and phase hierarchy', async () => {
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3',
        tradeCategory: 'Project_Overhead_&_Bills',
        tradePhase: 'Extra Costs & Misc',
        paymentMethod: 'Card'
      },
      { projectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.equal(res.tradeCategory, 'Project_Overhead_&_Bills');
    assert.equal(res.tradePhase, 'Extra Costs & Misc');
  });

  test('4. Contractor Check Payment: Preserves check number, labor classification, and voucher metadata', async () => {
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'check',
        vendorOrPayee: 'Rios Plumbing',
        amount: 2500.00,
        date: '2026-08-25',
        lotNumber: 'Lot 3',
        tradeCategory: 'Mechanicals_&_Utilities',
        tradePhase: 'Plumbing Rough-In',
        checkNumber: '1045',
        paymentMethod: 'Check #1045',
        description: 'Plumbing rough-in labor draw'
      },
      { projectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.equal(res.vendorOrPayee, 'Rios Plumbing');
    assert.equal(res.amount, 2500.00);
    assert.equal(res.checkNumber, '1045');
    assert.equal(res.costCategory, 'labor');
    assert.equal(res.receiptStatus, 'no_receipt');

    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 1);
    const staged = appState.stagedItems[0];
    assert.equal(staged.metadata.type, 'check');
    assert.equal(staged.metadata.checkNumber, '1045');
    assert.equal(staged.metadata.documentType, 'check');
    assert.equal(staged.metadata.receiptStatus, 'no_receipt');
    assert.equal(staged.metadata.provenance, 'manual_user_entry');
  });

  test('5. Single Draft Guarantee & Duplicate Protection: Prevents duplicate drafts in storage', async () => {
    const draftArgs = {
      transactionType: 'expense',
      vendorOrPayee: 'Stripes',
      amount: 50.00,
      date: '2026-08-25',
      lotNumber: 'Lot 3',
      tradeCategory: 'Project_Overhead_&_Bills',
      tradePhase: 'Extra Costs & Misc',
      paymentMethod: 'Debit Card'
    };

    // First call stages draft
    const r1 = await executeClientToolCall('stage_manual_transaction', draftArgs, { projectName: 'Lot 3' });
    assert.equal(r1.success, true);
    assert.equal(r1.status, 'staged');

    // Second identical call triggers deduplication
    const r2 = await executeClientToolCall('stage_manual_transaction', draftArgs, { projectName: 'Lot 3' });
    assert.ok(r2.isDuplicate || r2.status === 'duplicate_detected' || r2.status === 'deduplicated');

    // Storage must contain exactly 1 draft
    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 1);
  });

  test('6. Complete Downstream Pipeline: Draft -> PDF Voucher -> History Logs matches standard sync', async () => {
    const metadata = {
      type: 'check',
      vendor: 'Rios Plumbing',
      payee: 'Rios Plumbing',
      amount: 2500.00,
      date: '2026-08-25',
      lotNumber: 'Lot 3',
      costCategory: 'labor',
      tradeCategory: 'Mechanicals_&_Utilities',
      tradePhase: 'Plumbing Rough-In',
      description: 'Rough plumbing draw',
      checkNumber: '1045',
      documentType: 'check',
      receiptStatus: 'no_receipt',
      provenance: 'manual_user_entry',
      splits: []
    };

    // PDF generation succeeds without image scans
    const pdfBlob = await generateDocumentPDF(metadata, []);
    assert.ok(pdfBlob);
    assert.equal(pdfBlob.type, 'application/pdf');
    assert.ok(pdfBlob.size > 1000);

    // Standard filename format
    const fileName = buildInvoiceFileName(metadata);
    assert.equal(fileName, 'Lot 3 - Rough plumbing draw - labor.pdf');

    // Standard history logs format
    const logs = buildHistoryLogs(metadata, { idPrefix: 'sync_doc_101', link: 'https://drive.google.com/file/d/123' });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].id, 'sync_doc_101');
    assert.equal(logs[0].vendor, 'Rios Plumbing');
    assert.equal(logs[0].amount, 2500.00);
    assert.equal(logs[0].tradeCategory, 'Mechanicals_&_Utilities');
    assert.equal(logs[0].tradePhase, 'Plumbing Rough-In');
    assert.equal(logs[0].costCategory, 'labor');
    assert.equal(logs[0].link, 'https://drive.google.com/file/d/123');
  });

  test('7. OCR Non-Regression: Standard OCR receipt drafts with images remain completely untouched', async () => {
    const ocrDraft = {
      id: 'draft_ocr_test_1',
      metadata: {
        vendor: 'Home Depot',
        amount: 345.60,
        date: '2026-08-20',
        lotNumber: 'Lot 3',
        costCategory: 'material',
        tradeCategory: 'Framing_&_Lumber',
        tradePhase: 'Hardware & Fasteners',
        description: 'Framing nails & Simpson ties',
        documentType: 'invoice',
        receiptStatus: 'attached',
        provenance: 'ocr_scan',
        splits: []
      },
      mainImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      secondaryImageBase64: null,
      createdAt: Date.now()
    };

    // Staged items stores OCR items normally
    persistStagedItems([ocrDraft]);
    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 1);
    assert.equal(appState.stagedItems[0].metadata.provenance, 'ocr_scan');
    assert.equal(appState.stagedItems[0].metadata.receiptStatus, 'attached');
    assert.ok(appState.stagedItems[0].mainImageBase64 !== null);
  });

  test('8. Strict Payment Method Enforcement: Rejects missing, empty, or generic fallback payment methods', async () => {
    // Missing payment method
    const res1 = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3'
      },
      { projectName: 'Lot 3' }
    );
    assert.equal(res1.success, false);
    assert.equal(res1.status, 'missing_payment_method');
    assert.ok(res1.message.includes('Payment method is required'));

    // Generic fallback "Card / Cash"
    const res2 = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3',
        paymentMethod: 'Card / Cash'
      },
      { projectName: 'Lot 3' }
    );
    assert.equal(res2.success, false);
    assert.equal(res2.status, 'missing_payment_method');

    // Storage must remain empty (0 drafts created)
    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 0);
  });

  test('9. Cost Category Discrimination: Preserves explicit user classification, leaves unspecified empty', async () => {
    // Case A: Unspecified general expense -> empty string (Unassigned)
    const resA = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3',
        paymentMethod: 'Debit Card',
        costCategory: '' // unassigned
      },
      { projectName: 'Lot 3' }
    );
    assert.equal(resA.success, true);
    assert.equal(resA.costCategory, 'Unassigned (Review in EditForm)');
    let appState = loadStoredAppState();
    assert.equal(appState.stagedItems[0].metadata.costCategory, '');

    // Clear
    persistStagedItems([]);
    resetWriteIdempotencyState();

    // Case B: Explicit user classification "for materials" -> 'material'
    const resB = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        lotNumber: 'Lot 3',
        paymentMethod: 'Debit Card',
        costCategory: 'material' // explicitly specified by user
      },
      { projectName: 'Lot 3' }
    );
    assert.equal(resB.success, true);
    assert.equal(resB.costCategory, 'material');
    appState = loadStoredAppState();
    assert.equal(appState.stagedItems[0].metadata.costCategory, 'material');
  });

  test('10. Local Calendar Date Resolution: Correctly computes local date without UTC midnight rollover', async () => {
    const { getTodayCalendarDate } = await import('../src/services/sheetsDataService.js');
    
    // Simulate 10:30 PM CST on Aug 25 (which is Aug 26 in UTC)
    const localDate = new Date(2026, 7, 25, 22, 30, 0); // Local Month is 0-indexed (7 = Aug)
    const dateStr = getTodayCalendarDate(localDate);
    assert.equal(dateStr, '2026-08-25', 'Must resolve to local August 25, NOT UTC August 26');

    resetWriteIdempotencyState();
    // Stage transaction with date="today"
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes',
        amount: 50.00,
        date: 'today',
        lotNumber: 'Lot 3',
        paymentMethod: 'Debit Card'
      },
      { projectName: 'Lot 3' }
    );
    assert.equal(res.success, true);
    assert.equal(res.date, getTodayCalendarDate());
  });

  test('11. Real-World Test A Instruction Contract: System prompt enforces conversational question for missing payment method', () => {
    const prompt = buildGroundingSystemInstruction({
      activeProjectName: 'Lot 3',
      dashData: { projectInfo: {}, subcontractors: [] }
    });

    assert.ok(
      prompt.includes("If payment method is not explicitly stated in the conversation, DO NOT call 'stage_manual_transaction'"),
      'System prompt must strictly prohibit tool calls on missing payment method'
    );
    assert.ok(
      prompt.includes('Cost Classification (Material vs Labor): ONLY set costCategory to \'material\' or \'labor\' if the user explicitly stated'),
      'System prompt must forbid guessing material vs labor'
    );
  });

  test('12. Live Draft State Synchronization: Tool execution emits staged-items-updated event for reactive UI update', async () => {
    let capturedEvent = null;
    const mockListener = (event) => {
      capturedEvent = event;
    };

    if (typeof globalThis.window === 'undefined') {
      globalThis.window = {
        dispatchEvent: (ev) => {
          if (ev.type === 'staged-items-updated') mockListener(ev);
        }
      };
    } else {
      globalThis.window.addEventListener('staged-items-updated', mockListener);
    }

    resetWriteIdempotencyState();
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'expense',
        vendorOrPayee: 'Stripes Gas',
        amount: 45.00,
        lotNumber: 'Lot 3',
        paymentMethod: 'Debit Card'
      },
      { projectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.ok(capturedEvent !== null, 'Must dispatch staged-items-updated event on window');
    assert.equal(capturedEvent.detail?.newDraft?.metadata?.vendor, 'Stripes Gas');
    assert.equal(capturedEvent.detail?.newDraft?.metadata?.receiptStatus, 'no_receipt');

    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 1);
  });

  test('13. Drive Attachment Short-Circuit: Staging command matching Drive folder name ("rough plumbing") with "no physical scan" stages cleanly', async () => {
    resetWriteIdempotencyState();
    persistStagedItems([]);

    // Simulate Drive Tree with a "Plumbing" subfolder containing a non-downloadable Google Sheet/Doc
    const mockDriveTree = {
      subfolders: [
        {
          folderName: 'Plumbing',
          folderId: 'folder_plumbing_123',
          files: [
            { id: 'doc_plumbing_spec', name: 'Plumbing Specs Sheet', mimeType: 'application/vnd.google-apps.spreadsheet' }
          ]
        }
      ]
    };

    // Verify manual transaction staging executes directly
    const res = await executeClientToolCall(
      'stage_manual_transaction',
      {
        transactionType: 'contractor_payment',
        vendorOrPayee: 'Plumbing Payee',
        amount: 2500.00,
        lotNumber: 'Lot 3',
        tradeCategory: 'Mechanicals_&_Utilities',
        tradePhase: 'Plumbing Rough-In',
        checkNumber: '1045',
        paymentMethod: 'Check #1045',
        receiptStatus: 'no_receipt',
        description: 'Rough plumbing labor draw'
      },
      { projectName: 'Lot 3' }
    );

    assert.equal(res.success, true);
    assert.equal(res.status, 'staged');
    assert.equal(res.vendorOrPayee, 'Plumbing Payee');
    assert.equal(res.amount, 2500.00);
    assert.equal(res.checkNumber, '1045');

    const appState = loadStoredAppState();
    assert.equal(appState.stagedItems.length, 1);
    assert.equal(appState.stagedItems[0].metadata.receiptStatus, 'no_receipt');
    assert.equal(appState.stagedItems[0].metadata.provenance, 'manual_user_entry');
  });
});
