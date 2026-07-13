import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectsConfigBlob,
  resolveActiveProject
} from '../src/services/projectCloudSync.js';

test('resolveActiveProject falls back to first project when no active id matches', () => {
  const projects = [
    { id: 'project-1', name: 'Lot 1' },
    { id: 'project-2', name: 'Lot 2' }
  ];

  assert.equal(resolveActiveProject([], 'project-1'), null);
  assert.deepEqual(resolveActiveProject(projects, null), projects[0]);
  assert.deepEqual(resolveActiveProject(projects, 'missing'), projects[0]);
  assert.deepEqual(resolveActiveProject(projects, 'project-2'), projects[1]);
});

test('createProjectsConfigBlob serializes project config as formatted JSON', async () => {
  const blob = createProjectsConfigBlob([{
    id: 'project-1',
    name: 'Lot 1',
    appsScriptUrl: 'https://script.example',
    appsScriptSecret: 'secret'
  }]);

  assert.equal(blob.type, 'application/json');
  assert.equal(
    await blob.text(),
    '[\n  {\n    "id": "project-1",\n    "name": "Lot 1"\n  }\n]'
  );
});
