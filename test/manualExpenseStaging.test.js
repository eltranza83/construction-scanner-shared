import assert from 'node:assert/strict';
import test from 'node:test';

// Polyfill localStorage for Node.js test environment if not present
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

test.beforeEach(() => {
  // Clear any existing staged items and reset circuit breaker & idempotency state
  persistStagedItems([]);
  if (circuitBreaker) circuitBreaker.reset();
  resetWriteIdempotencyState();
});

test('1. Manual Merchant Expense: Stages valid draft with no_receipt status and overhead category', async () => {
  const result = await executeClientToolCall(
    'stage_manual_transaction',
    {
      transactionType: 'expense',
      vendorOrPayee: 'Stripes',
      amount: 50.00,
      date: '2026-08-25',
      lotNumber: 'Lot 3',
      tradeCategory: 'Project_Overhead_&_Bills',
      tradePhase: 'Extra Costs & Misc',
      description: 'Gas / Fuel for site inspections',
      paymentMethod: 'Debit Card'
    },
    { projectName: 'Lot 3', projectId: 'lot_3' }
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'staged');
  assert.equal(result.vendorOrPayee, 'Stripes');
  assert.equal(result.amount, 50.00);
  assert.equal(result.lotNumber, 'Lot 3');
  assert.equal(result.tradeCategory, 'Project_Overhead_&_Bills');
  assert.equal(result.tradePhase, 'Extra Costs & Misc');
  assert.equal(result.receiptStatus, 'no_receipt');
  assert.equal(result.provenance, 'manual_user_entry');

  const appState = loadStoredAppState();
  assert.equal(appState.stagedItems.length, 1);
  const staged = appState.stagedItems[0];
  assert.equal(staged.metadata.vendor, 'Stripes');
  assert.equal(staged.metadata.amount, 50.00);
  assert.equal(staged.metadata.documentType, 'manual_expense');
  assert.equal(staged.metadata.receiptStatus, 'no_receipt');
  assert.equal(staged.metadata.provenance, 'manual_user_entry');
  assert.equal(staged.mainImageBase64, null);
});

test('2. Manual Contractor Payment / Check: Stages check transaction with checkNumber and labor category', async () => {
  const result = await executeClientToolCall(
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
      description: 'Rough plumbing labor draw'
    },
    { projectName: 'Lot 3', projectId: 'lot_3' }
  );

  assert.equal(result.success, true);
  assert.equal(result.status, 'staged');
  assert.equal(result.vendorOrPayee, 'Rios Plumbing');
  assert.equal(result.amount, 2500.00);
  assert.equal(result.checkNumber, '1045');
  assert.equal(result.costCategory, 'labor');

  const appState = loadStoredAppState();
  assert.equal(appState.stagedItems.length, 1);
  const staged = appState.stagedItems[0];
  assert.equal(staged.metadata.type, 'check');
  assert.equal(staged.metadata.payee, 'Rios Plumbing');
  assert.equal(staged.metadata.checkNumber, '1045');
  assert.equal(staged.metadata.costCategory, 'labor');
  assert.equal(staged.metadata.tradeCategory, 'Mechanicals_&_Utilities');
  assert.equal(staged.metadata.tradePhase, 'Plumbing Rough-In');
  assert.equal(staged.metadata.receiptStatus, 'no_receipt');
});

test('3. Ambiguous Cost Classification: Does NOT silently default to material when uncertain', async () => {
  const result = await executeClientToolCall(
    'stage_manual_transaction',
    {
      transactionType: 'expense',
      vendorOrPayee: 'Local Supply',
      amount: 45.00,
      lotNumber: 'Lot 3',
      tradeCategory: 'Project_Overhead_&_Bills',
      tradePhase: 'Extra Costs & Misc',
      paymentMethod: 'Credit Card',
      description: 'General purchase'
      // costCategory omitted
    },
    { projectName: 'Lot 3' }
  );

  assert.equal(result.success, true);
  const appState = loadStoredAppState();
  const staged = appState.stagedItems[0];
  assert.equal(staged.metadata.costCategory, '', 'Ambiguous cost category must remain unset so EditForm prompts user for resolution');
});

test('4. Duplicate Guard: Prevents accidental double-staging of identical manual transaction', async () => {
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

  const res1 = await executeClientToolCall('stage_manual_transaction', draftArgs, { projectName: 'Lot 3' });
  assert.equal(res1.success, true);
  assert.equal(res1.status, 'staged');

  const res2 = await executeClientToolCall('stage_manual_transaction', draftArgs, { projectName: 'Lot 3' });
  assert.ok(res2.isDuplicate || res2.status === 'deduplicated' || res2.status === 'duplicate_detected');

  const appState = loadStoredAppState();
  assert.equal(appState.stagedItems.length, 1, 'Drafts queue must still contain only 1 draft with duplicate prevented');
});

test('5. PDF Generation & Downstream Parity: Builds voucher and history logs without errors', async () => {
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
    description: 'Plumbing rough draw',
    checkNumber: '1045',
    documentType: 'check',
    receiptStatus: 'no_receipt',
    provenance: 'manual_user_entry',
    splits: []
  };

  const pdfBlob = await generateDocumentPDF(metadata, []);
  assert.ok(pdfBlob);
  assert.equal(pdfBlob.type, 'application/pdf');
  assert.ok(pdfBlob.size > 1000);

  const fileName = buildInvoiceFileName(metadata);
  assert.equal(fileName, 'Lot 3 - Plumbing rough draw - labor.pdf');

  const logs = buildHistoryLogs(metadata, { idPrefix: 'sync_201', link: 'https://drive.google.com/view/456' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].vendor, 'Rios Plumbing');
  assert.equal(logs[0].amount, 2500.00);
  assert.equal(logs[0].tradeCategory, 'Mechanicals_&_Utilities');
  assert.equal(logs[0].tradePhase, 'Plumbing Rough-In');
});
