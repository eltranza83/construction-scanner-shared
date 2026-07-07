import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardPhotoFileName } from '../src/services/dashboardDrive.js';

test('buildDashboardPhotoFileName includes timestamp and original file name', () => {
  assert.equal(
    buildDashboardPhotoFileName('rough-in.jpg', new Date('2026-07-06T12:34:56.789Z')),
    'Photo_2026-07-06T12-34-56-789Z_rough-in.jpg'
  );
});
