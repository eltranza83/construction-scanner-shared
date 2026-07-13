import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { TRADE_SECTIONS_CONFIG } from '../src/services/editFormHelpers.js';

function loadAppsScriptContext() {
  const script = readFileSync(new URL('../extracted_apps_script.js', import.meta.url), 'utf8');
  const context = {
    console,
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty() {
            return '';
          }
        };
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

function createMockSheet({ title, phase }) {
  const values = [
    [title.toUpperCase(), '', '', '', '', '', '', '', '', '', ''],
    ['Task Description', 'Contractor / Vendor', 'Material Cost', 'Labor Cost', 'Payment Date', 'Check or Trans', '', '', '', '', ''],
    [`\u2192 ${phase}`, '', '', '', '', '', 'Phase Payee', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '']
  ];
  const writes = [];

  return {
    writes,
    getDataRange() {
      return {
        getValues() {
          return values;
        }
      };
    },
    getRange(row, col) {
      return {
        setValue(value) {
          writes.push({ row, col, value });
          values[row - 1][col - 1] = value;
          return this;
        },
        setNumberFormat() {
          return this;
        },
        setFontColor() {
          return this;
        },
        setFontLine() {
          return this;
        }
      };
    },
    insertRowBefore() {
      throw new Error('Unexpected insertRowBefore for first empty row test.');
    }
  };
}

test('Apps Script direct category routing writes below each configured phase header', () => {
  const { logTransactionToCategorySheet } = loadAppsScriptContext();
  const rowData = ['Test material', 'Home Depot', '=HYPERLINK("https://example.com", 12)', '', '2026-07-13', 0];

  for (const [sheetName, config] of Object.entries(TRADE_SECTIONS_CONFIG)) {
    for (const phase of config.phases) {
      const sheet = createMockSheet({ title: config.label, phase });
      const ss = {
        getSheetByName(name) {
          return name === sheetName ? sheet : null;
        }
      };

      logTransactionToCategorySheet(ss, sheetName, phase, rowData, 'material');

      assert.equal(sheet.writes[0]?.row, 4, `${sheetName} / ${phase} should write to first row below phase header`);
      assert.equal(sheet.writes[0]?.col, 1);
      assert.equal(sheet.writes[0]?.value, 'Test material');
    }
  }
});

test('Apps Script framing alias does not match the sheet title row', () => {
  const { logTransactionToCategorySheet } = loadAppsScriptContext();
  const sheet = createMockSheet({
    title: 'Framing Lumber & Truss',
    phase: 'Framing Lumber & Truss'
  });
  const ss = {
    getSheetByName(name) {
      return name === 'Framing_&_Lumber' ? sheet : null;
    }
  };

  logTransactionToCategorySheet(
    ss,
    'Framing_&_Lumber',
    'Framing & Lumber',
    ['Deck screws', 'Home Depot', '=HYPERLINK("https://example.com", 29)', '', '2026-07-13', 0],
    'material'
  );

  assert.equal(sheet.writes[0]?.row, 4);
  assert.equal(sheet.writes[0]?.value, 'Deck screws');
});
