import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUserAccessRecord,
  getUserAccessDocId
} from '../src/services/inviteAccess.js';

test('getUserAccessDocId uses Firebase uid', () => {
  assert.equal(getUserAccessDocId({ firebaseUid: 'uid-123' }), 'uid-123');
  assert.equal(getUserAccessDocId({ email: 'user@example.com' }), '');
});

test('buildUserAccessRecord normalizes access metadata', () => {
  const record = buildUserAccessRecord({
    firebaseUid: 'uid-123',
    email: 'USER@EXAMPLE.COM'
  }, 'ADPC-TEST-0001');

  assert.equal(record.uid, 'uid-123');
  assert.equal(record.email, 'user@example.com');
  assert.equal(record.sourceInviteId, 'ADPC-TEST-0001');
  assert.ok(record.createdAt instanceof Date);
});
