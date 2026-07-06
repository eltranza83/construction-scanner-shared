import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_EXPIRED_MESSAGE,
  getDriveErrorMessage,
  getUploadErrorMessage,
  isAuthError
} from '../src/services/appErrors.js';

test('isAuthError detects auth failures by status and message', () => {
  assert.equal(isAuthError({ status: 401 }), true);
  assert.equal(isAuthError({ code: 403 }), true);
  assert.equal(isAuthError(new Error('Invalid token returned by Google')), true);
  assert.equal(isAuthError(new Error('network failed')), false);
  assert.equal(isAuthError(null), false);
});

test('Drive error messages use session-expired copy for auth failures', () => {
  assert.equal(
    getDriveErrorMessage({ status: 401 }, 'load dashboard data'),
    SESSION_EXPIRED_MESSAGE
  );
  assert.equal(
    getUploadErrorMessage(new Error('session expired'), 'photo'),
    SESSION_EXPIRED_MESSAGE
  );
});

test('Drive error messages include action context for non-auth failures', () => {
  assert.equal(
    getDriveErrorMessage(new Error('Folder not found'), 'load dashboard data'),
    'Could not load dashboard data. Folder not found'
  );
  assert.equal(
    getUploadErrorMessage(null, 'blueprint'),
    'Could not upload blueprint. Please try again.'
  );
});
