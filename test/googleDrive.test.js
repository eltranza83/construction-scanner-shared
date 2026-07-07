import assert from 'node:assert/strict';
import test from 'node:test';

import { findOrCreateFolder } from '../src/services/googleDrive.js';

test('findOrCreateFolder escapes folder query values and returns existing folder', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({ files: [{ id: 'folder-123', name: "Owner's Uploads" }] })
    };
  };

  try {
    const folderId = await findOrCreateFolder('token-1', "Owner's Uploads", 'parent-folder');
    const query = decodeURIComponent(new URL(requestedUrl).searchParams.get('q'));

    assert.equal(folderId, 'folder-123');
    assert.match(query, /name='Owner\\'s Uploads'/);
    assert.match(query, /'parent-folder' in parents/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findOrCreateFolder includes Google response body in search failures', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    text: async () => 'Invalid Value'
  });

  try {
    await assert.rejects(
      () => findOrCreateFolder('token-1', 'Invoice Uploads', 'bad-folder'),
      /Failed to search for folder Invoice Uploads: Invalid Value/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findOrCreateFolder rejects missing parent folder ids before calling Drive', async () => {
  await assert.rejects(
    () => findOrCreateFolder('token-1', 'Invoice Uploads', ''),
    /No project folder is selected/
  );
});
