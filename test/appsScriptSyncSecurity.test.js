import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/apps-script-sync.js';

describe('Apps Script Sync Security Tests', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/SERVER_CANONICAL_DEPLOYMENT_ID/exec';
    process.env.APPS_SCRIPT_SECRET = 'SUPER_SECRET_PRODUCTION_TOKEN_XYZ123';
    process.env.FIREBASE_WEB_API_KEY = 'test-api-key';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function createMockRequest({ headers = {}, body = { folderId: 'valid-folder-id-12345' } } = {}) {
    const allHeaders = new Map(Object.entries({
      'authorization': 'Bearer valid-id-token',
      'content-type': 'application/json',
      ...headers
    }));

    return {
      url: 'http://localhost:3000/api/apps-script-sync',
      headers: {
        get: (key) => allHeaders.get(key.toLowerCase()) || null
      },
      json: async () => body
    };
  }

  function mockAuthorizedAuthAndCaptureOutbound() {
    let capturedOutboundCall = null;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);

      // Mock Firebase Auth verification
      if (urlStr.includes('identitytoolkit.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            users: [{ localId: 'user_123', email: 'authorized-admin@sitetactix.com' }]
          })
        };
      }

      // Mock Firestore admin/user_access check
      if (urlStr.includes('firestore.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({})
        };
      }

      // Outbound Apps Script call
      capturedOutboundCall = {
        url: urlStr,
        method: options.method,
        headers: options.headers,
        body: options.body ? JSON.parse(options.body) : null
      };

      return {
        ok: true,
        status: 200,
        text: async () => 'Sync Completed'
      };
    };

    return () => capturedOutboundCall;
  }

  it('strictly ignores browser-supplied x-apps-script-url and dispatches only to server-configured URL', async () => {
    const getCapturedCall = mockAuthorizedAuthAndCaptureOutbound();

    const attackerUrl = 'https://script.google.com/macros/s/ATTACKER_DEPLOYMENT_ID/exec';
    const request = createMockRequest({
      headers: {
        'x-apps-script-url': attackerUrl
      },
      body: {
        folderId: 'project_folder_abc_123'
      }
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 200);

    const captured = getCapturedCall();
    assert.ok(captured, 'Expected outbound fetch to Apps Script');
    assert.ok(
      captured.url.startsWith('https://script.google.com/macros/s/SERVER_CANONICAL_DEPLOYMENT_ID/exec'),
      `Expected server to call canonical URL, but called: ${captured.url}`
    );
    assert.ok(!captured.url.includes('ATTACKER'), 'Attacker URL must not be used');
  });

  it('never places the secret in the request URL query string', async () => {
    const getCapturedCall = mockAuthorizedAuthAndCaptureOutbound();

    const request = createMockRequest({
      body: {
        folderId: 'project_folder_abc_123'
      }
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 200);

    const captured = getCapturedCall();
    assert.ok(captured, 'Expected outbound fetch to Apps Script');

    const outboundUrl = new URL(captured.url);
    assert.strictEqual(
      outboundUrl.searchParams.has('secret'),
      false,
      'URL must not have secret query param'
    );
    assert.ok(
      !captured.url.includes('SUPER_SECRET_PRODUCTION_TOKEN_XYZ123'),
      'The secret value must never appear anywhere in the request URL string'
    );

    // Secret must instead be delivered safely in the POST body and headers
    assert.strictEqual(
      captured.body?.secret,
      'SUPER_SECRET_PRODUCTION_TOKEN_XYZ123',
      'Secret must be passed inside the POST body'
    );
    assert.strictEqual(
      captured.headers?.['x-apps-script-secret'],
      'SUPER_SECRET_PRODUCTION_TOKEN_XYZ123',
      'Secret must be present in server-to-server headers'
    );
  });

  it('rejects with 503 if server APPS_SCRIPT_URL is not configured (refusing client URL fallback)', async () => {
    delete process.env.APPS_SCRIPT_URL;

    mockAuthorizedAuthAndCaptureOutbound();

    const request = createMockRequest({
      headers: {
        'x-apps-script-url': 'https://script.google.com/macros/s/ATTACKER/exec'
      },
      body: {
        folderId: 'project_folder_abc_123'
      }
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 503);
    const data = await response.json();
    assert.ok(data.error.includes('Spreadsheet sync is not configured on the server'));
  });

  it('rejects invalid or missing folderId with 400', async () => {
    mockAuthorizedAuthAndCaptureOutbound();

    const request = createMockRequest({
      body: {
        folderId: 'bad!folder$id'
      }
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 400);
    const data = await response.json();
    assert.ok(data.error.includes('A valid project folder is required'));
  });
});
