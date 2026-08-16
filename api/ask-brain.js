import { HttpError, errorResponse, jsonResponse } from './_lib/firebase-auth.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prompt, query } = body;
    const apiKey = process.env.GEMINI_API_KEY || '';

    if (!prompt && !query) {
      throw new HttpError(400, 'Missing prompt or query in request.');
    }

    const fullPrompt = prompt || query;
    const modelsToTry = [
      process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-latest'
    ];

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                maxOutputTokens: 350,
                temperature: 0.2
              }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return jsonResponse({ text: text.trim() });
          }
        } else {
          lastError = await response.text();
          console.warn(`Gemini cloud model ${model} failed (${response.status}):`, lastError);
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`Gemini cloud fetch error for ${model}:`, err);
      }
    }

    throw new HttpError(502, `AI service temporarily unavailable. ${lastError || ''}`);
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

export const maxDuration = 60;
