import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPanDelta, normalizeZoomScale } from '../src/services/blueprintViewport.js';

test('normalizeZoomScale clamps floor plan zoom to supported bounds', () => {
  assert.equal(normalizeZoomScale(0.1), 1);
  assert.equal(normalizeZoomScale(1.5), 1.5);
  assert.equal(normalizeZoomScale(5), 3);
});

test('normalizeZoomScale falls back to default zoom for invalid values', () => {
  assert.equal(normalizeZoomScale('not-a-number'), 1);
  assert.equal(normalizeZoomScale(Number.NaN), 1);
});

test('applyPanDelta applies movement from a safe origin', () => {
  assert.deepEqual(applyPanDelta(null, 40, -20), { x: 40, y: -20 });
  assert.deepEqual(applyPanDelta({ x: 10, y: 15 }, -5, 25), { x: 5, y: 40 });
  assert.deepEqual(applyPanDelta({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 12, 8), { x: 12, y: 8 });
});
