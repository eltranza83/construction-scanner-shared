import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAppsScriptSyncUrl,
  getHistoryFileId,
  shouldFlagUnprocessedUpload
} from '../src/services/invoiceSyncState.js';

test('buildAppsScriptSyncUrl builds sync endpoint with encoded folder id', () => {
  assert.equal(buildAppsScriptSyncUrl(null), null);
  assert.equal(
    buildAppsScriptSyncUrl({
      appsScriptUrl: 'https://script.google.com/macros/s/abc/exec',
      folderId: 'folder 1/2'
    }),
    'https://script.google.com/macros/s/abc/exec?action=sync&folderId=folder+1%2F2'
  );
  assert.equal(
    buildAppsScriptSyncUrl({
      appsScriptUrl: 'https://script.google.com/macros/s/abc/exec',
      appsScriptSecret: 'secret 1/2',
      folderId: 'folder 1/2'
    }),
    'https://script.google.com/macros/s/abc/exec?action=sync&folderId=folder+1%2F2&secret=secret+1%2F2'
  );
});

test('shouldFlagUnprocessedUpload requires Drive upload and apps script URL', () => {
  assert.equal(shouldFlagUnprocessedUpload({ hasDriveUpload: true }, { appsScriptUrl: 'https://script.example' }), true);
  assert.equal(shouldFlagUnprocessedUpload({ hasDriveUpload: false }, { appsScriptUrl: 'https://script.example' }), false);
  assert.equal(shouldFlagUnprocessedUpload({ hasDriveUpload: true }, {}), false);
});

test('getHistoryFileId removes split suffix for shared PDFs', () => {
  assert.equal(getHistoryFileId({ id: 'file-123_split_0' }), 'file-123');
  assert.equal(getHistoryFileId({ id: 'file-456' }), 'file-456');
  assert.equal(getHistoryFileId(null), '');
});
