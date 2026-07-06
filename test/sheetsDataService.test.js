import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSummaryPhaseMeta,
  findSummarySectionForSheet,
  finalizeBlock,
  getValByLabel,
  isSummarySectionHeader,
  normalizeKey,
  parseCategorySheet,
  parseCurrency,
  parseSummaryDashboard
} from '../src/services/sheetsDataService.js';

test('basic spreadsheet helpers normalize labels and currency', () => {
  assert.equal(normalizeKey(' Paint & Tile '), 'painttile');
  assert.equal(parseCurrency('$1,255.50'), 1255.5);
  assert.equal(parseCurrency(''), 0);
  assert.equal(getValByLabel([['Project Name:', 'Lot 1']], 'project name'), 'Lot 1');
});

test('summary dashboard parser reads project labels despite row shifts', () => {
  const projectInfo = parseSummaryDashboard([
    [''],
    ['Project Name:', 'Lot 7'],
    ['Street Address:', '123 Main'],
    ['City, State, Zip:', 'Austin, TX'],
    ['Gross Projected Project Cost', '$400,000'],
    ['Net Working Capital Balance', '$9,600']
  ]);

  assert.equal(projectInfo.name, 'Lot 7');
  assert.equal(projectInfo.address, '123 Main');
  assert.equal(projectInfo.cityStateZip, 'Austin, TX');
  assert.equal(projectInfo.budgetGross, '$400,000');
  assert.equal(projectInfo.capitalBalance, '$9,600');
});

test('summary section matching handles sheet underscores and ampersands', () => {
  const paintSection = {
    name: 'PAINT & TILE',
    phases: [
      { phase: 'Tile', materialCost: '$35.00', laborCost: '$0.00', combinedSpent: '$35.00' },
      { phase: 'Paint', materialCost: '$5,600.00', laborCost: '$0.00', combinedSpent: '$5,600.00' }
    ]
  };
  const framingSection = { name: 'FRAMING LUMBER & TRUSS', phases: [] };

  assert.equal(findSummarySectionForSheet('Paint_Tile', [framingSection, paintSection]), paintSection);
  assert.equal(findSummarySectionForSheet('Framing_&_Lumber', [framingSection, paintSection]), framingSection);
});

test('summary section and phase metadata detection ignores total rows', () => {
  assert.equal(isSummarySectionHeader(['PAINT & TILE', '', '', '', '']), true);
  assert.equal(isSummarySectionHeader(['Paint', '$5.00', '$0.00', '$5.00', 'In Progress']), false);
  assert.deepEqual(createSummaryPhaseMeta(['Paint', '$5.00', '$2.00', '$7.00', 'In Progress']), {
    phase: 'Paint',
    status: 'In Progress',
    materialCost: '$5.00',
    laborCost: '$2.00',
    combinedSpent: '$7.00'
  });
});

test('category parser uses Summary_Dashboard totals while keeping payee and balance from category sheet', () => {
  const summaryMeta = {
    phase: 'Paint',
    status: 'In Progress',
    materialCost: '$33.00',
    laborCost: '$120.00',
    combinedSpent: '$153.00'
  };

  const contractors = parseCategorySheet(
    'Paint_Tile',
    [
      ['Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans', 'Contractor Payee', 'Total Paid', 'Original Quote', 'Remaining Balance', 'Notes / Status'],
      ['- Paint', '', '$0.00', '$0.00', '', '', 'Painter Payee', '$0.00', '$1,000.00', '$847.00', 'Not Started'],
      ['primer', 'lowes', '$999.00', '', '', '', '', '', '', '', '']
    ],
    { [normalizeKey('Paint')]: summaryMeta },
    { name: 'PAINT & TILE', phases: [summaryMeta] }
  );

  assert.equal(contractors.length, 1);
  assert.equal(contractors[0].phase, 'Paint');
  assert.equal(contractors[0].payee, 'Painter Payee');
  assert.equal(contractors[0].remainingBalance, '$847.00');
  assert.equal(contractors[0].status, 'In Progress');
  assert.equal(contractors[0].totalMaterial, '$33.00');
  assert.equal(contractors[0].totalLabor, '$120.00');
  assert.equal(contractors[0].totalSpent, '$153.00');
  assert.equal(contractors[0].totalPaid, '$153.00');
  assert.equal(contractors[0].payments[0].materialCost, '$999.00');
});

test('finalizeBlock uses fallback summary phase metadata by position when phase names differ', () => {
  const contractor = finalizeBlock(
    {
      category: 'Framing & Lumber',
      phase: 'Framing Lumber & Truss',
      rows: [
        ['- Framing Lumber & Truss', '', '', '', '', '', 'Pedo Cedillo', '$1,200.00', '$15,400.00', '$14,200.00', 'Not Started']
      ]
    },
    {},
    {
      phase: 'Framing & Lumber',
      status: 'In Progress',
      materialCost: '$55.00',
      laborCost: '$1,200.00',
      combinedSpent: '$1,255.00'
    }
  );

  assert.equal(contractor.payee, 'Pedo Cedillo');
  assert.equal(contractor.status, 'In Progress');
  assert.equal(contractor.totalMaterial, '$55.00');
  assert.equal(contractor.totalLabor, '$1,200.00');
  assert.equal(contractor.totalPaid, '$1,255.00');
});
