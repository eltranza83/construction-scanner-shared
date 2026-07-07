import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDashboardPhotoFileName,
  getCachedDashboardSpreadsheetId,
  getDashboardStorageKeys,
  loadCachedDashboard,
  persistDashboardCache,
  persistDashboardSpreadsheetId
} from '../src/services/dashboardDrive.js';

function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test('buildDashboardPhotoFileName includes timestamp and original file name', () => {
  assert.equal(
    buildDashboardPhotoFileName('rough-in.jpg', new Date('2026-07-06T12:34:56.789Z')),
    'Photo_2026-07-06T12-34-56-789Z_rough-in.jpg'
  );
});

test('dashboard cache helpers isolate project-specific dashboard data', () => {
  const storage = createMemoryStorage();
  const dashboardData = {
    projectInfo: { name: 'Lot 7' },
    categories: [{ name: 'Paint & Tile' }]
  };

  persistDashboardSpreadsheetId(storage, 'project-7', 'sheet-7');
  persistDashboardCache(storage, 'project-7', dashboardData);

  const keys = getDashboardStorageKeys('project-7');
  assert.equal(keys.spreadsheetId, 'jobscan_sheet_id_project-7');
  assert.equal(keys.cachedDashboard, 'jobscan_cached_dashboard_project-7');
  assert.equal(getCachedDashboardSpreadsheetId(storage, 'project-7'), 'sheet-7');
  assert.deepEqual(loadCachedDashboard(storage, 'project-7'), dashboardData);
  assert.equal(loadCachedDashboard(storage, 'project-8'), null);
});

test('loadCachedDashboard ignores malformed cached JSON', () => {
  const storage = createMemoryStorage({
    jobscan_cached_dashboard_project_bad: '{not-json'
  });

  assert.equal(loadCachedDashboard(storage, 'project_bad'), null);
});
