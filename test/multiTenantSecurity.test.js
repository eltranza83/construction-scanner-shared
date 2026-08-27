import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Simulates Pure Zero-Knowledge Firestore Security Rules logic:
 * Admins have administrative power over invites and templates,
 * but ZERO uninvited eavesdropping into any tenant's private projects, finishes, purchasing, or AI memories.
 */
function evaluateFirestoreProjectSecurityRule({
  path,
  operation,
  auth,
  projectDoc = null,
  memoryDoc = null,
  requestData = null,
  adminEmails = ['adepecgroup@gmail.com']
}) {
  const signedIn = Boolean(auth && auth.uid && auth.token && auth.token.email);
  if (!signedIn) return { allowed: false, reason: 'Unauthenticated' };

  const isAdmin = adminEmails.includes(auth.token.email.toLowerCase());

  function isProjectAuthorized(project) {
    if (!project) return false;
    if (project.ownerUid === auth.uid) return true;
    if (Array.isArray(project.memberUids) && project.memberUids.includes(auth.uid)) return true;
    return false;
  }

  // Path: memories/{memoryId}
  if (path.startsWith('memories/')) {
    if (operation === 'get' || operation === 'list') {
      const allowed = memoryDoc?.uid === auth.uid;
      return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant memory access denied (Zero-Knowledge)' };
    }
    if (operation === 'create') {
      const allowed = requestData?.uid === auth.uid;
      return { allowed, reason: allowed ? 'Authorized' : 'Cannot create memory for another UID' };
    }
    if (operation === 'update' || operation === 'delete') {
      const allowed = memoryDoc?.uid === auth.uid;
      return { allowed, reason: allowed ? 'Authorized' : 'Cannot modify memory for another UID' };
    }
  }

  // Path: projects/{projectId}
  if (path.startsWith('projects/') && !path.includes('/finishes/') && !path.includes('/purchasing_items/')) {
    const projectId = path.split('/')[1];

    if (operation === 'get') {
      const allowed = isProjectAuthorized(projectDoc);
      return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant project get denied' };
    }

    if (operation === 'list') {
      const isOwner = projectDoc?.ownerUid === auth.uid;
      const isMember = Array.isArray(projectDoc?.memberUids) && projectDoc.memberUids.includes(auth.uid);
      const allowed = isOwner || isMember;
      return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant project list denied' };
    }

    if (operation === 'create') {
      const setsSelfAsOwner = requestData?.ownerUid === auth.uid && requestData?.id === projectId;
      const allowed = setsSelfAsOwner;
      return { allowed, reason: allowed ? 'Authorized' : 'Cannot create project under another owner UID' };
    }

    if (operation === 'update') {
      const isOwner = projectDoc?.ownerUid === auth.uid;
      const preservesOwner = requestData?.ownerUid === projectDoc?.ownerUid;
      const allowed = isOwner && preservesOwner;
      return { allowed, reason: allowed ? 'Authorized' : 'Non-owners cannot update project metadata' };
    }

    if (operation === 'delete') {
      const isOwner = projectDoc?.ownerUid === auth.uid;
      const allowed = isOwner;
      return { allowed, reason: allowed ? 'Authorized' : 'Non-owners cannot delete project' };
    }
  }

  // Path: projects/{projectId}/finishes/{finishId}
  if (path.includes('/finishes/')) {
    if (operation === 'read' || operation === 'write') {
      const allowed = isProjectAuthorized(projectDoc);
      return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant finish access denied' };
    }
  }

  // Path: projects/{projectId}/purchasing_items/{itemId}
  if (path.includes('/purchasing_items/')) {
    if (operation === 'read' || operation === 'write') {
      const allowed = isProjectAuthorized(projectDoc);
      return { allowed, reason: allowed ? 'Authorized' : 'Cross-tenant purchasing access denied' };
    }
  }

  // Path: purchasing_templates
  if (path.startsWith('purchasing_templates/')) {
    if (operation === 'read') return { allowed: true, reason: 'Templates readable by authenticated users' };
    if (operation === 'write') return { allowed: isAdmin, reason: isAdmin ? 'Admin write permitted' : 'Templates write protected' };
  }

  return { allowed: false, reason: 'Unknown rule configuration' };
}

describe('Zero-Knowledge Multi-Tenant Identity & UID Security Rules Suite', () => {
  const userAlice = { uid: 'uid_alice_123', token: { email: 'builder.alice@gmail.com' } };
  const userBob = { uid: 'uid_bob_456', token: { email: 'builder.bob@gmail.com' } };
  const rootAdmin = { uid: 'uid_admin_000', token: { email: 'adepecgroup@gmail.com' } };

  const aliceLot3 = {
    id: 'lot_3',
    name: 'Lot 3',
    ownerUid: 'uid_alice_123',
    ownerEmail: 'builder.alice@gmail.com',
    members: ['builder.alice@gmail.com'],
    memberUids: ['uid_alice_123']
  };

  const aliceMemory = {
    id: 'mem_123',
    uid: 'uid_alice_123',
    fact: 'Builder prefers Sherwin Williams Pure White for all master bedrooms'
  };

  it('1. Owner (Alice) has full get, list, update, delete access on her own project', () => {
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userAlice,
      projectDoc: aliceLot3
    }).allowed, true);

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'update',
      auth: userAlice,
      projectDoc: aliceLot3,
      requestData: { ...aliceLot3, name: 'Lot 3 - Revised' }
    }).allowed, true);
  });

  it('2. Stranger (Bob) is STRICTLY REJECTED from reading or listing Alice project', () => {
    const getResult = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userBob,
      projectDoc: aliceLot3
    });
    assert.equal(getResult.allowed, false);
    assert.match(getResult.reason, /Cross-tenant/);

    const listResult = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'list',
      auth: userBob,
      projectDoc: aliceLot3
    });
    assert.equal(listResult.allowed, false);
  });

  it('3. Stranger (Bob) cannot read or write Alice finishes or purchasing items', () => {
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: userBob,
      projectDoc: aliceLot3
    }).allowed, false);

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/purchasing_items/item_lumber_1',
      operation: 'read',
      auth: userBob,
      projectDoc: aliceLot3
    }).allowed, false);
  });

  it('4. Zero-Knowledge Admin Isolation: Root Admin is STRICTLY DENIED from reading uninvited tenant project', () => {
    // Admin CANNOT get Alice's project
    const adminGet = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: rootAdmin,
      projectDoc: aliceLot3
    });
    assert.equal(adminGet.allowed, false);
    assert.match(adminGet.reason, /Cross-tenant project get denied/);

    // Admin CANNOT list Alice's project
    const adminList = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'list',
      auth: rootAdmin,
      projectDoc: aliceLot3
    });
    assert.equal(adminList.allowed, false);

    // Admin CANNOT delete Alice's project
    const adminDelete = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'delete',
      auth: rootAdmin,
      projectDoc: aliceLot3
    });
    assert.equal(adminDelete.allowed, false);
  });

  it('5. Zero-Knowledge Admin Isolation: Root Admin cannot read uninvited finishes, purchasing, or AI memories', () => {
    // Finishes blocked
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: rootAdmin,
      projectDoc: aliceLot3
    }).allowed, false);

    // Purchasing blocked
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/purchasing_items/item_1',
      operation: 'read',
      auth: rootAdmin,
      projectDoc: aliceLot3
    }).allowed, false);

    // Private AI memory blocked (even from root admin)
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'memories/mem_123',
      operation: 'get',
      auth: rootAdmin,
      memoryDoc: aliceMemory
    }).allowed, false);
  });

  it('6. Explicit Collaboration: Alice explicitly inviting Root Admin grants access', () => {
    const sharedWithAdmin = {
      ...aliceLot3,
      members: ['builder.alice@gmail.com', 'adepecgroup@gmail.com'],
      memberUids: ['uid_alice_123', 'uid_admin_000']
    };

    // Root Admin now allowed to get project
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: rootAdmin,
      projectDoc: sharedWithAdmin
    }).allowed, true);

    // Root Admin now allowed to view finishes
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: rootAdmin,
      projectDoc: sharedWithAdmin
    }).allowed, true);
  });

  it('7. Instant Revocation: Alice removing Root Admin from memberUids revokes all access', () => {
    const revokedFromAdmin = {
      ...aliceLot3,
      members: ['builder.alice@gmail.com'],
      memberUids: ['uid_alice_123']
    };

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: rootAdmin,
      projectDoc: revokedFromAdmin
    }).allowed, false);
  });

  it('8. Root Admin maintains exclusive administrative rights over master purchasing templates', () => {
    // Regular user cannot edit master template
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'purchasing_templates/master/items/drywall',
      operation: 'write',
      auth: userAlice
    }).allowed, false);

    // Root Admin CAN edit master template
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'purchasing_templates/master/items/drywall',
      operation: 'write',
      auth: rootAdmin
    }).allowed, true);
  });
});
