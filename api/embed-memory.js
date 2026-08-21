/**
 * Serverless API Route: /api/embed-memory
 * Generates vector embeddings for memory text and search queries via Gemini Embeddings API.
 */
import { errorResponse, jsonResponse, requireScannerAccess } from './_lib/firebase-auth.js';
import { fetchWithExponentialBackoff } from './_lib/ai-retry.js';
import { AI_CONFIG } from './_lib/ai-config.js';

export async function POST(request) {
  try {
    await requireScannerAccess(request, fetch, { rateLimit: 40 });

    const body = await request.json().catch(() => ({}));
    const { text, texts, apiKey: clientApiKey } = body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || clientApiKey || '';

    if (!apiKey) {
      return errorResponse(new Error('GEMINI_API_KEY is not configured.'), 500);
    }

    const inputTexts = Array.isArray(texts) ? texts : (text ? [String(text)] : []);
    if (inputTexts.length === 0) {
      return jsonResponse({ embeddings: [] });
    }

    // Call Gemini Embeddings API (text-embedding-004)
    const model = 'text-embedding-004';
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;

    const requests = inputTexts.map(t => ({
      model: `models/${model}`,
      content: { parts: [{ text: t }] }
    }));

    const response = await fetchWithExponentialBackoff(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ requests })
      },
      AI_CONFIG.retry
    );

    if (!response.ok) {
      const errText = await response.text();
      // Gracefully return empty embeddings on embedding service unavailability
      return jsonResponse({
        embeddings: [],
        warning: `Embedding API unavailable: ${response.status} ${errText}`
      });
    }

    const data = await response.json();
    const embeddings = (data.embeddings || []).map(e => e.values || []);

    return jsonResponse({
      embeddings: Array.isArray(texts) ? embeddings : (embeddings[0] || [])
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
