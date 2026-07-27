import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireScannerAccess
} from './_lib/firebase-auth.js';

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyBtgcVfCJndLKLpOWst8QDhn_i-bZbuxhvF9Uz62Mx0-KPeWAtHJIl27Gieuvc60kdag/exec';
const DEFAULT_APPS_SCRIPT_SECRET = 'adepec_scanner_secret_2026';

function getConfiguredScriptUrl(customUrl = '') {
  const value = customUrl || process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, 'Spreadsheet sync is not configured on the server.');
  }

  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.includes('/macros/s/')) {
    throw new HttpError(503, 'Spreadsheet sync has an invalid server configuration.');
  }
  return url;
}

export async function POST(request) {
  try {
    await requireScannerAccess(request);
    const clientScriptUrl = request.headers.get('x-apps-script-url') || '';
    const secret = request.headers.get('x-apps-script-secret') || process.env.APPS_SCRIPT_SECRET || DEFAULT_APPS_SCRIPT_SECRET;

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

    const scriptUrl = getConfiguredScriptUrl(clientScriptUrl);
    scriptUrl.searchParams.set('action', 'sync');
    scriptUrl.searchParams.set('folderId', folderId);
    if (secret) {
      scriptUrl.searchParams.set('secret', secret);
    }

    const response = await fetch(scriptUrl, { method: 'POST', redirect: 'follow' });
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
