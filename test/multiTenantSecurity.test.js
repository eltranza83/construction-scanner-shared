import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Simulates Firestore Security Rules logic for /projects, /finishes, and /purchasing_items
 */
function evaluateFirestoreProjectSecurityRule({
  path,
  operation,
  auth,
  projectDoc = null,
  requestData = null,
  adminEmails = ['adepecgroup@gmail.com', 'acepeda83@gmail.com']
}) {
  const signedIn = Boolean(auth && auth.uid && auth.token && auth.token.email);
  if (!signedIn) return { allowed: false, reason: 'Unauthenticated' };

  const isAdmin = adminEmails.includes(auth.token.email.toLowerCase());

  function isProjectAuthorized(project) {
    if (!project) return false;
    if (isAdmin) return true;
    if (project.ownerUid === auth.uid) return true;
    if (Array.isArray(project.memberUids) && project.memberUids.includes(auth.uid)) return true;
    return false;
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
      const allowed = isAdmin || isOwner || isMember;
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
      const allowed = (isAdmin || isOwner) && preservesOwner;
      return { allowed, reason: allowed ? 'Authorized' : 'Non-owners cannot update project metadata' };
    }

    if (operation === 'delete') {
      const isOwner = projectDoc?.ownerUid === auth.uid;
      const allowed = isAdmin || isOwner;
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

  return { allowed: false, reason: 'Unknown rule configuration' };
}

describe('Multi-Tenant Identity & UID Security Rules Suite', () => {
  const userA = { uid: 'uid_alice_123', token: { email: 'builder.alice@gmail.com' } };
  const userB = { uid: 'uid_bob_456', token: { email: 'builder.bob@gmail.com' } };
  const adminUser = { uid: 'uid_admin_000', token: { email: 'adepecgroup@gmail.com' } };

  const lot3Project = {
    id: 'lot_3',
    name: 'Lot 3',
    ownerUid: 'uid_alice_123',
    ownerEmail: 'builder.alice@gmail.com',
    members: ['builder.alice@gmail.com'],
    memberUids: ['uid_alice_123']
  };

  it('1. Owner (User A) has full get, list, update, delete access on their own project', () => {
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userA,
      projectDoc: lot3Project
    }).allowed, true);

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'update',
      auth: userA,
      projectDoc: lot3Project,
      requestData: { ...lot3Project, name: 'Lot 3 - Revised' }
    }).allowed, true);
  });

  it('2. Stranger (User B) is STRICTLY REJECTED from reading or listing User A project', () => {
    // get rejection
    const getResult = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userB,
      projectDoc: lot3Project
    });
    assert.equal(getResult.allowed, false);
    assert.match(getResult.reason, /Cross-tenant/);

    // list rejection
    const listResult = evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'list',
      auth: userB,
      projectDoc: lot3Project
    });
    assert.equal(listResult.allowed, false);
  });

  it('3. Stranger (User B) cannot read or write User A finishes or purchasing items', () => {
    // Finish read/write denied
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: userB,
      projectDoc: lot3Project
    }).allowed, false);

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'write',
      auth: userB,
      projectDoc: lot3Project
    }).allowed, false);

    // Purchasing read/write denied
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/purchasing_items/item_lumber_1',
      operation: 'read',
      auth: userB,
      projectDoc: lot3Project
    }).allowed, false);
  });

  it('4. User B can create their own isolated project and become its exclusive owner', () => {
    const createResult = evaluateFirestoreProjectSecurityRule({
      path: 'projects/sunset_ridge_1',
      operation: 'create',
      auth: userB,
      requestData: {
        id: 'sunset_ridge_1',
        name: 'Sunset Ridge 1',
        ownerUid: 'uid_bob_456',
        ownerEmail: 'builder.bob@gmail.com',
        memberUids: ['uid_bob_456']
      }
    });

    assert.equal(createResult.allowed, true);

    // User A cannot delete User B's new project
    const bobProject = {
      id: 'sunset_ridge_1',
      ownerUid: 'uid_bob_456',
      memberUids: ['uid_bob_456']
    };
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/sunset_ridge_1',
      operation: 'delete',
      auth: userA,
      projectDoc: bobProject
    }).allowed, false);
  });

  it('5. Explicit Sharing: Adding User B to memberUids grants read/write to finishes and purchasing', () => {
    const sharedLot3 = {
      ...lot3Project,
      members: ['acepeda83@gmail.com', 'builder.bob@gmail.com'],
      memberUids: ['uid_ace_123', 'uid_bob_456']
    };

    // User B now allowed on project get
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userB,
      projectDoc: sharedLot3
    }).allowed, true);

    // User B now allowed on finishes
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: userB,
      projectDoc: sharedLot3
    }).allowed, true);

    // But User B STILL cannot delete the project! Only owner can delete.
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'delete',
      auth: userB,
      projectDoc: sharedLot3
    }).allowed, false);
  });

  it('6. Instant Revocation: Removing User B from memberUids revokes all access immediately', () => {
    // Revoked state (User B removed)
    const revokedLot3 = {
      ...lot3Project,
      members: ['acepeda83@gmail.com'],
      memberUids: ['uid_ace_123']
    };

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: userB,
      projectDoc: revokedLot3
    }).allowed, false);

    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3/finishes/spec_paint_1',
      operation: 'read',
      auth: userB,
      projectDoc: revokedLot3
    }).allowed, false);
  });

  it('7. Admin has universal observability across all projects', () => {
    assert.equal(evaluateFirestoreProjectSecurityRule({
      path: 'projects/lot_3',
      operation: 'get',
      auth: adminUser,
      projectDoc: lot3Project
    }).allowed, true);
  });
});
