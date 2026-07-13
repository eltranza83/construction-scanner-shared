import { DOCUMENT_EXTRACTION_PROMPT } from './_lib/document-prompt.js';
import {
  HttpError,
  errorResponse,
  jsonResponse,
  requireScannerAccess
} from './_lib/firebase-auth.js';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function parseGeminiJson(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

export async function generateDocumentData({ bytes, mimeType, apiKey, fetchImpl = fetch }) {
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: DOCUMENT_EXTRACTION_PROMPT },
            {
              inlineData: {
                data: Buffer.from(bytes).toString('base64'),
                mimeType
              }
            }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Gemini request failed (${response.status}): ${detail}`);
    throw new HttpError(502, 'AI extraction is temporarily unavailable. Please try again.');
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new HttpError(502, 'AI extraction returned an empty response. Please try again.');
  }

  try {
    return parseGeminiJson(text);
  } catch (error) {
    console.error('Gemini returned invalid JSON:', error);
    throw new HttpError(502, 'AI extraction returned unreadable data. Please try again.');
  }
}

export async function POST(request) {
  try {
    await requireScannerAccess(request);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpError(503, 'AI processing is not configured on the server.');
    }

    const mimeType = (request.headers.get('x-document-mime') || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new HttpError(415, 'Only PDF, JPEG, PNG, and WebP documents are supported.');
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_DOCUMENT_BYTES) {
      throw new HttpError(413, 'This document is too large. Please use a file smaller than 4 MB.');
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new HttpError(400, 'The selected document is empty.');
    }
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new HttpError(413, 'This document is too large. Please use a file smaller than 4 MB.');
    }

    const data = await generateDocumentData({ bytes, mimeType, apiKey });
    return jsonResponse({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

export const maxDuration = 60;
