import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireScannerAccess
} from './_lib/firebase-auth.js';

function getConfiguredScriptUrl() {
  const value = process.env.APPS_SCRIPT_URL || '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, 'Spreadsheet sync is not configured on the server. Please add APPS_SCRIPT_URL to .env or Vercel settings.');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.includes('/macros/s/')) {
    throw new HttpError(503, 'Spreadsheet sync has an invalid server configuration.');
  }
  return url;
}

export async function POST(request) {
  try {
    await requireScannerAccess(request);
    const secret = process.env.APPS_SCRIPT_SECRET || '';

    if (!process.env.APPS_SCRIPT_URL) {
      throw new HttpError(503, 'Spreadsheet sync is not configured on the server. Please add APPS_SCRIPT_URL to .env or Vercel settings.');
    }

    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'Invalid sync request.');
    }

    const folderId = String(body?.folderId || '').trim();
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
      throw new HttpError(400, 'A valid project folder is required.');
    }

    const scriptUrl = getConfiguredScriptUrl();
    scriptUrl.searchParams.set('action', 'sync');
    scriptUrl.searchParams.set('folderId', folderId);
    // CRITICAL: Secret is NEVER placed in URL search params to avoid credential exposure or logging leaks

    const syncPayload = {
      action: 'sync',
      folderId
    };
    if (secret) {
      syncPayload.secret = secret;
    }

    const headers = {
      'content-type': 'application/json'
    };
    if (secret) {
      headers['x-apps-script-secret'] = secret;
      headers['authorization'] = `Bearer ${secret}`;
    }

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(syncPayload),
      redirect: 'follow'
    });
    if (!response.ok) {
      console.error(`Apps Script sync failed with status ${response.status}.`);
      throw new HttpError(502, 'Spreadsheet sync could not be started. Please try again.');
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

export const maxDuration = 60;
