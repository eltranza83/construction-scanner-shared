import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeIssues } from '../src/services/issuesDrive.js';

test('mergeIssues applies CREATE operations correctly', () => {
  const remoteIssues = [];
  const offlineOps = [
    {
      type: 'CREATE',
      id: 'issue_1',
      payload: {
        title: 'Leak under sink',
        category: 'Mechanicals_&_Utilities',
        priority: 'high',
        status: 'open',
        phoneNumber: '5550100'
      },
      timestamp: 1720720485923
    }
  ];

  const merged = mergeIssues(remoteIssues, offlineOps);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'issue_1');
  assert.equal(merged[0].title, 'Leak under sink');
  assert.equal(merged[0].status, 'open');
  assert.equal(merged[0].deletedAt, null);
  assert.ok(merged[0].createdAt);
  assert.ok(merged[0].updatedAt);
});

test('mergeIssues applies UPDATE_STATUS operations to existing issues', () => {
  const remoteIssues = [
    {
      id: 'issue_1',
      title: 'Leak under sink',
      category: 'Mechanicals_&_Utilities',
      priority: 'high',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
      updatedAt: '2026-07-11T12:00:00.000Z',
      deletedAt: null
    }
  ];

  const offlineOps = [
    {
      type: 'UPDATE_STATUS',
      id: 'issue_1',
      payload: { status: 'in_progress' },
      timestamp: 1720720500000
    }
  ];

  const merged = mergeIssues(remoteIssues, offlineOps);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'in_progress');
  assert.equal(merged[0].updatedAt, new Date(1720720500000).toISOString());
});

test('mergeIssues applies SOFT_DELETE operations by setting deletedAt', () => {
  const remoteIssues = [
    {
      id: 'issue_1',
      title: 'Leak under sink',
      category: 'Mechanicals_&_Utilities',
      priority: 'high',
      status: 'open',
      createdAt: '2026-07-11T12:00:00.000Z',
      updatedAt: '2026-07-11T12:00:00.000Z',
      deletedAt: null
    }
  ];

  const offlineOps = [
    {
      type: 'SOFT_DELETE',
      id: 'issue_1',
      timestamp: 1720720600000
    }
  ];

  const merged = mergeIssues(remoteIssues, offlineOps);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deletedAt, new Date(1720720600000).toISOString());
  assert.equal(merged[0].updatedAt, new Date(1720720600000).toISOString());
});

test('mergeIssues applies multiple operations in chronological order', () => {
  const remoteIssues = [];
  const offlineOps = [
    {
      type: 'CREATE',
      id: 'issue_1',
      payload: { title: 'Stud missing', status: 'open', category: 'Framing_&_Lumber' },
      timestamp: 1000
    },
    {
      type: 'UPDATE_STATUS',
      id: 'issue_1',
      payload: { status: 'in_progress' },
      timestamp: 2000
    },
    {
      type: 'SOFT_DELETE',
      id: 'issue_1',
      timestamp: 3000
    }
  ];

  const merged = mergeIssues(remoteIssues, offlineOps);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'in_progress');
  assert.equal(merged[0].deletedAt, new Date(3000).toISOString());
});
