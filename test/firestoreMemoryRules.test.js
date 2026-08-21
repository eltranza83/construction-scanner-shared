import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Simulates Firestore Security Rules logic for /memories/{memoryId}
 * Rule specification:
 *   match /memories/{memoryId} {
 *     allow get, list: if signedIn() && (isAdmin() || resource.data.uid == request.auth.uid);
 *     allow create: if signedIn() && request.resource.data.uid == request.auth.uid;
 *     allow update: if signedIn() && (isAdmin() || resource.data.uid == request.auth.uid) && request.resource.data.uid == resource.data.uid;
 *     allow delete: if signedIn() && (isAdmin() || resource.data.uid == request.auth.uid);
 *   }
 */
function evaluateFirestoreMemoryRule({
  operation,
  auth,
  adminEmails = ['adepecgroup@gmail.com', 'acepeda83@gmail.com', 'eltranza83@gmail.com'],
  resource = null,
  requestResource = null
}) {
  const signedIn = Boolean(auth && auth.uid && auth.token && auth.token.email);
  if (!signedIn) return { allowed: false, reason: 'Unauthenticated' };

  const isAdmin = adminEmails.includes(auth.token.email.toLowerCase());

  if (operation === 'get' || operation === 'list') {
    const isOwner = resource?.uid === auth.uid;
    const allowed = isAdmin || isOwner;
    return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant access denied' };
  }

  if (operation === 'create') {
    const isOwner = requestResource?.uid === auth.uid;
    const allowed = isOwner;
    return { allowed, reason: allowed ? 'Authorized' : 'Cannot create memory for another user' };
  }

  if (operation === 'update') {
    const isOwner = resource?.uid === auth.uid;
    const preservesOwner = requestResource?.uid === resource?.uid;
    const allowed = (isAdmin || isOwner) && preservesOwner;
    return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant modification denied' };
  }

  if (operation === 'delete') {
    const isOwner = resource?.uid === auth.uid;
    const allowed = isAdmin || isOwner;
    return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant deletion denied' };
  }

  return { allowed: false, reason: 'Unknown operation' };
}

test('Firestore Rules: Unauthenticated user is rejected for all memory operations', () => {
  const ops = ['get', 'list', 'create', 'update', 'delete'];
  for (const op of ops) {
    const result = evaluateFirestoreMemoryRule({
      operation: op,
      auth: null,
      resource: { uid: 'user-1', text: 'Secret note' },
      requestResource: { uid: 'user-1', text: 'New note' }
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'Unauthenticated');
  }
});

test('Firestore Rules: User A can create and read their own memory', () => {
  const authUserA = { uid: 'user-a', token: { email: 'builder.a@example.com' } };

  const createResult = evaluateFirestoreMemoryRule({
    operation: 'create',
    auth: authUserA,
    requestResource: { uid: 'user-a', text: 'My trade preference' }
  });
  assert.equal(createResult.allowed, true);

  const readResult = evaluateFirestoreMemoryRule({
    operation: 'get',
    auth: authUserA,
    resource: { uid: 'user-a', text: 'My trade preference' }
  });
  assert.equal(readResult.allowed, true);
});

test('Firestore Rules: User B is strictly blocked from reading User A memory', () => {
  const authUserB = { uid: 'user-b', token: { email: 'builder.b@example.com' } };

  const readResult = evaluateFirestoreMemoryRule({
    operation: 'get',
    auth: authUserB,
    resource: { uid: 'user-a', text: 'User A confidential trade secret' }
  });

  assert.equal(readResult.allowed, false);
  assert.equal(readResult.reason, 'Cross-tenant access denied');
});

test('Firestore Rules: User B cannot modify or delete User A memory', () => {
  const authUserB = { uid: 'user-b', token: { email: 'builder.b@example.com' } };

  const updateResult = evaluateFirestoreMemoryRule({
    operation: 'update',
    auth: authUserB,
    resource: { uid: 'user-a', text: 'Original text' },
    requestResource: { uid: 'user-a', text: 'Tampered text' }
  });
  assert.equal(updateResult.allowed, false);

  const deleteResult = evaluateFirestoreMemoryRule({
    operation: 'delete',
    auth: authUserB,
    resource: { uid: 'user-a', text: 'Original text' }
  });
  assert.equal(deleteResult.allowed, false);
});

test('Firestore Rules: User B cannot spoof UID on memory creation', () => {
  const authUserB = { uid: 'user-b', token: { email: 'builder.b@example.com' } };

  const createResult = evaluateFirestoreMemoryRule({
    operation: 'create',
    auth: authUserB,
    requestResource: { uid: 'user-a', text: 'Spoofed memory for user A' }
  });

  assert.equal(createResult.allowed, false);
  assert.equal(createResult.reason, 'Cannot create memory for another user');
});

test('Firestore Rules: Admin can inspect and manage user memories', () => {
  const authAdmin = { uid: 'admin-1', token: { email: 'adepecgroup@gmail.com' } };

  const readResult = evaluateFirestoreMemoryRule({
    operation: 'get',
    auth: authAdmin,
    resource: { uid: 'user-a', text: 'User A memory' }
  });
  assert.equal(readResult.allowed, true);
});
