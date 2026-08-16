import { HttpError, errorResponse, jsonResponse } from './_lib/firebase-auth.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { contents, systemInstruction, prompt, query, apiKey: clientApiKey } = body;
    const apiKey = process.env.GEMINI_API_KEY || clientApiKey || '';

    let formattedContents = [];
    if (Array.isArray(contents) && contents.length > 0) {
      const raw = contents.map((c) => ({
        role: c.role === 'assistant' || c.role === 'ai' || c.role === 'model' ? 'model' : 'user',
        parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.text || c.content || '') }]
      }));

      // Gemini requires the first turn to be 'user'
      while (raw.length > 0 && raw[0].role !== 'user') {
        raw.shift();
      }

      // Merge consecutive identical roles to guarantee strict alternating turns
      for (const turn of raw) {
        if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === turn.role) {
          formattedContents[formattedContents.length - 1].parts.push(...turn.parts);
        } else {
          formattedContents.push(turn);
        }
      }
    } else if (prompt || query) {
      formattedContents = [{ role: 'user', parts: [{ text: String(prompt || query) }] }];
    }

    if (formattedContents.length === 0) {
      formattedContents = [{ role: 'user', parts: [{ text: String(prompt || query || 'Hello') }] }];
    }

    const payload = {
      contents: formattedContents,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.4
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = typeof systemInstruction === 'string'
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;
    }

    const modelsToTry = [
      process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
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
            body: JSON.stringify(payload)
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
