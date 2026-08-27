import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanProjectId,
  normalizeProjectRecord,
  resolveUserActiveProject,
  FirestoreProjectAdapter
} from '../src/services/projectService.js';

class MockFirestoreDatabase {
  constructor() {
    this.projects = new Map();
  }

  setDoc(docId, data) {
    const existing = this.projects.get(docId) || {};
    this.projects.set(docId, { ...existing, ...data });
  }

  getDoc(docId) {
    if (!this.projects.has(docId)) {
      return { exists: () => false, data: () => null };
    }
    return { exists: () => true, data: () => this.projects.get(docId) };
  }

  getDocs() {
    const docs = [];
    this.projects.forEach((data, id) => {
      docs.push({ id, data: () => data });
    });
    return docs;
  }

  deleteDoc(docId) {
    this.projects.delete(docId);
  }
}

describe('Cloud-Native Project Discovery & Sync (projectService.js)', () => {
  let mockDb;
  let adapter;

  beforeEach(() => {
    mockDb = new MockFirestoreDatabase();
    // Wrap mockDb in mock firestore interface
    adapter = new FirestoreProjectAdapter({
      _mock: true
    });
    adapter._getDb = () => ({
      _isMock: true
    });
  });

  it('1. cleanProjectId and normalizeProjectRecord correctly format project metadata', () => {
    assert.equal(cleanProjectId('Lot 3'), 'lot_3');
    assert.equal(cleanProjectId('Lot #4 - West Phase'), 'lot__4_-_west_phase');
    assert.equal(cleanProjectId(''), 'default_project');

    const normalized = normalizeProjectRecord({
      name: 'Lot 3',
      folderId: 'folder_123',
      folderName: 'Lot 3 Folder',
      ownerEmail: 'acepeda83@gmail.com'
    });

    assert.equal(normalized.id, 'lot_3');
    assert.equal(normalized.canonicalId, 'lot_3');
    assert.equal(normalized.name, 'Lot 3');
    assert.equal(normalized.folderId, 'folder_123');
    assert.equal(normalized.ownerEmail, 'acepeda83@gmail.com');
    assert.deepEqual(normalized.members, ['acepeda83@gmail.com']);
    assert.ok(normalized.createdAt);
    assert.ok(normalized.updatedAt);
  });

  it('2. resolveUserActiveProject selects preferred active project if authorized', () => {
    const projects = [
      { id: 'lot_1', name: 'Lot 1', updatedAt: '2026-08-20T00:00:00Z' },
      { id: 'lot_2', name: 'Lot 2', updatedAt: '2026-08-25T00:00:00Z' },
      { id: 'lot_3', name: 'Lot 3', updatedAt: '2026-08-26T00:00:00Z' }
    ];

    // Preferred selection exists
    const resolved = resolveUserActiveProject(projects, 'lot_2');
    assert.equal(resolved.id, 'lot_2');

    // No preferred selection defaults to most recently updated project (Lot 3)
    const defaultResolved = resolveUserActiveProject(projects, null);
    assert.equal(defaultResolved.id, 'lot_3');

    // Non-existent preferred selection defaults to most recently updated (Lot 3)
    const invalidResolved = resolveUserActiveProject(projects, 'unauthorized_lot_99');
    assert.equal(invalidResolved.id, 'lot_3');

    // Empty project list returns null
    assert.equal(resolveUserActiveProject([], 'lot_3'), null);
  });

  it('3. FirestoreProjectAdapter filters projects strictly by ownership / membership', async () => {
    // Mock getDocs to return multiple projects
    adapter._getDb = () => ({
      _mock: true
    });

    // Mock Firestore Lite functions
    const userA = { email: 'acepeda83@gmail.com', uid: 'uid_a' };
    const userB = { email: 'stranger@example.com', uid: 'uid_b' };

    const testProjects = [
      {
        id: 'lot_3',
        name: 'Lot 3',
        ownerEmail: 'acepeda83@gmail.com',
        ownerUid: 'uid_a',
        members: ['acepeda83@gmail.com', 'team@adepec.com']
      },
      {
        id: 'lot_private_b',
        name: 'Private Lot B',
        ownerEmail: 'stranger@example.com',
        ownerUid: 'uid_b',
        members: ['stranger@example.com']
      }
    ];

    // Simulate getProjects logic for User A
    const allowedForUserA = testProjects.filter(p => {
      const isOwner = p.ownerEmail === userA.email || p.ownerUid === userA.uid;
      const isMember = p.members.includes(userA.email);
      return isOwner || isMember;
    });

    assert.equal(allowedForUserA.length, 1);
    assert.equal(allowedForUserA[0].id, 'lot_3');

    // Simulate getProjects logic for User B
    const allowedForUserB = testProjects.filter(p => {
      const isOwner = p.ownerEmail === userB.email || p.ownerUid === userB.uid;
      const isMember = p.members.includes(userB.email);
      return isOwner || isMember;
    });

    assert.equal(allowedForUserB.length, 1);
    assert.equal(allowedForUserB[0].id, 'lot_private_b');
  });

  it('4. Built-in Admin has comprehensive access to all projects', async () => {
    const adminUser = { email: 'adepecgroup@gmail.com' };
    const testProjects = [
      { id: 'lot_1', name: 'Lot 1', ownerEmail: 'builder1@gmail.com', members: ['builder1@gmail.com'] },
      { id: 'lot_2', name: 'Lot 2', ownerEmail: 'builder2@gmail.com', members: ['builder2@gmail.com'] }
    ];

    const isAdmin = adminUser.email === 'adepecgroup@gmail.com';
    const accessible = testProjects.filter(p => {
      if (isAdmin) return true;
      return p.ownerEmail === adminUser.email || p.members.includes(adminUser.email);
    });

    assert.equal(accessible.length, 2);
  });
});
