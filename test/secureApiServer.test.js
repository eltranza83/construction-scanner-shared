import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HttpError,
  getBearerToken,
  requireScannerAccess,
  verifyFirebaseIdentity
} from '../api/_lib/firebase-auth.js';
import { generateDocumentData } from '../api/extract-document.js';

test('getBearerToken accepts only bearer authorization', () => {
  assert.equal(getBearerToken(new Request('https://example.test')), '');
  assert.equal(getBearerToken(new Request('https://example.test', { headers: { authorization: 'Bearer token-1' } })), 'token-1');
});

test('verifyFirebaseIdentity rejects a missing token', async () => {
  await assert.rejects(() => verifyFirebaseIdentity('', async () => null), (error) => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 401);
    return true;
  });
});

test('requireScannerAccess verifies identity and an access document', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes('accounts:lookup')) {
      return Response.json({ users: [{ localId: 'uid-1', email: 'Builder@Example.com' }] });
    }
    if (String(url).includes('/admins/')) return new Response('', { status: 404 });
    return Response.json({ name: 'access' });
  };

  const user = await requireScannerAccess(new Request('https://example.test', {
    headers: { authorization: 'Bearer firebase-token' }
  }), fetchImpl);

  assert.deepEqual(user, { uid: 'uid-1', email: 'builder@example.com' });
  assert.equal(requested.some((url) => url.includes('user_access/uid-1')), true);
});

test('generateDocumentData sends inline bytes and parses Gemini JSON', async () => {
  let requestBody;
  const data = await generateDocumentData({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/png',
    apiKey: 'server-key',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      assert.equal(options.headers['x-goog-api-key'], 'server-key');
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"vendor":"Test"}' }] } }] });
    }
  });

  assert.deepEqual(data, { vendor: 'Test' });
  assert.equal(requestBody.contents[0].parts[1].inlineData.data, 'AQID');
});
