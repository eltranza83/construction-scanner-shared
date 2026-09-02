import { HttpError, errorResponse, jsonResponse, requireScannerAccess } from './_lib/firebase-auth.js';
import { AI_CONFIG } from './_lib/ai-config.js';
import { fetchWithExponentialBackoff } from './_lib/ai-retry.js';

export const OBSERVER_SYSTEM_INSTRUCTION = `You are the Cognitive Preference Observer for SiteTactix (J.A.R.V.I.S.).
Your role is to analyze a builder's conversational input and detect any emerging, implied, or explicit behavioral preferences.

Categories:
- "information_depth": bottom line vs full history vs itemized details
- "response_style": brevity, conciseness, directness
- "formatting_preference": bullet points, tabular, single sentence
- "workflow_preference": preview before send, approval gating
- "terminology": term distinctions, naming conventions

Output Format (strict JSON):
If a preference is expressed or implied:
{
  "hasPreference": true,
  "category": "information_depth" | "response_style" | "formatting_preference" | "workflow_preference" | "terminology",
  "inferredIntent": "<concise_slug_e_g_concise_bottom_line>",
  "preferenceStatement": "<generalized behavioral instruction for the AI>",
  "confidence": 0.50 to 1.0,
  "evidence": "<reasoning>",
  "source": "inferred" | "explicit"
}

If no preference is expressed (just asking for regular construction data):
{
  "hasPreference": false
}`;

export async function POST(request) {
  try {
    await requireScannerAccess(request, fetch, { rateLimit: 30 });

    const body = await request.json().catch(() => ({}));
    const { query, apiKey: clientApiKey } = body;
    const apiKey = process.env.NODE_ENV === 'production'
      ? (process.env.GEMINI_API_KEY || '')
      : (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || clientApiKey || '');

    if (!query) {
      return jsonResponse({ hasPreference: false });
    }

    if (!apiKey) {
      return jsonResponse({ hasPreference: false, warning: 'No API key configured for preference observer' });
    }

    const payload = {
      contents: [{ role: 'user', parts: [{ text: `Analyze this builder input: "${query}"` }] }],
      systemInstruction: { parts: [{ text: OBSERVER_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 300
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_CONFIG.fastModel}:generateContent?key=${apiKey}`;
    const res = await fetchWithExponentialBackoff(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, fetch);

    if (!res.ok) {
      return jsonResponse({ hasPreference: false, error: 'Observer model call failed' });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(text);

    return jsonResponse(parsed);
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.status, err.message);
    }
    return jsonResponse({ hasPreference: false, error: err?.message });
  }
}
