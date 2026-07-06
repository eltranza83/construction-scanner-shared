import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoryLogs,
  buildInvoiceFileName,
  resolveSplitProjectFolder
} from '../src/services/invoiceUpload.js';

test('buildInvoiceFileName sanitizes unsafe file characters', () => {
  assert.equal(
    buildInvoiceFileName({
      lotNumber: 'Lot/7',
      description: 'Paint: primer * finish?',
      costCategory: 'Material'
    }),
    'Lot_7 - Paint_ primer _ finish_ - material.pdf'
  );
});

test('buildHistoryLogs creates a single log for regular invoice metadata', () => {
  const logs = buildHistoryLogs({
    date: '2026-07-05',
    lotNumber: 'Lot 1',
    description: 'Lumber purchase',
    vendor: 'Lowes',
    costCategory: 'material',
    amount: 55,
    tradeCategory: 'Framing_&_Lumber',
    tradePhase: 'Framing & Lumber'
  }, {
    idPrefix: 'file-1',
    link: 'https://drive.example/file-1'
  });

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], {
    id: 'file-1',
    dateLogged: logs[0].dateLogged,
    dateTransaction: '2026-07-05',
    description: '[Lot 1] Lumber purchase',
    vendor: 'Lowes',
    costCategory: 'material',
    amount: 55,
    link: 'https://drive.example/file-1',
    tradeCategory: 'Framing_&_Lumber',
    tradePhase: 'Framing & Lumber'
  });
});

test('buildHistoryLogs uses split overrides and defaults', () => {
  const logs = buildHistoryLogs({
    date: '2026-07-05',
    lotNumber: 'Main Lot',
    description: 'Shared receipt',
    vendor: 'Lowes',
    costCategory: 'labor',
    tradeCategory: 'Paint_Tile',
    tradePhase: 'Paint',
    splits: [
      {
        lotNumber: 'Lot A',
        description: 'Paint supplies',
        amount: 33,
        costCategory: 'material',
        tradePhase: 'Paint'
      },
      {
        amount: 12
      }
    ]
  }, {
    idPrefix: 'file-1',
    link: 'https://drive.example/file-1'
  });

  assert.equal(logs.length, 2);
  assert.equal(logs[0].id, 'file-1_split_0');
  assert.equal(logs[0].description, '[Lot A] Paint supplies');
  assert.equal(logs[0].costCategory, 'material');
  assert.equal(logs[0].tradeCategory, 'Paint_Tile');
  assert.equal(logs[0].tradePhase, 'Paint');
  assert.equal(logs[1].id, 'file-1_split_1');
  assert.equal(logs[1].description, '[Main Lot] Shared receipt');
  assert.equal(logs[1].costCategory, 'material');
});

test('resolveSplitProjectFolder matches project names case-insensitively', () => {
  const selectedFolder = { id: 'default-folder' };
  const projects = [
    { name: 'Lot 1', folderId: 'folder-1' },
    { name: 'Lot 2', folderId: 'folder-2' }
  ];

  assert.deepEqual(
    resolveSplitProjectFolder(projects, selectedFolder, { lotNumber: ' lot 2 ' }),
    { folderId: 'folder-2', lotName: 'Lot 2' }
  );
  assert.deepEqual(
    resolveSplitProjectFolder(projects, selectedFolder, { lotNumber: 'Lot 99' }),
    { folderId: 'default-folder', lotName: 'Lot 99' }
  );
});
