import { HttpError, errorResponse, jsonResponse, requireScannerAccess } from './_lib/firebase-auth.js';
import { determineTaskModel, AI_CONFIG } from './_lib/ai-config.js';
import { fetchWithExponentialBackoff } from './_lib/ai-retry.js';
import { AI_TOOL_DECLARATIONS } from './_lib/ai-tools-definitions.js';

export async function POST(request) {
  const startTime = Date.now();
  try {
    await requireScannerAccess(request, fetch, { rateLimit: 30 });

    const body = await request.json().catch(() => ({}));
    const { contents, systemInstruction, prompt, query, forceDeepReasoning, forceNoTools, apiKey: clientApiKey } = body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || clientApiKey || '';

    let userQuery = String(prompt || query || '');

    let formattedContents = [];
    if (Array.isArray(contents) && contents.length > 0) {
      const raw = contents.map((c) => ({
        role: c.role === 'assistant' || c.role === 'ai' || c.role === 'model' ? 'model' : 'user',
        parts: Array.isArray(c.parts) ? c.parts : [{ text: String(c.text || c.content || '') }]
      }));

      while (raw.length > 0 && raw[0].role !== 'user') {
        raw.shift();
      }

      for (const turn of raw) {
        if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === turn.role) {
          formattedContents[formattedContents.length - 1].parts.push(...turn.parts);
        } else {
          formattedContents.push(turn);
        }
      }

      const lastUserTurn = formattedContents.slice().reverse().find(c => c.role === 'user');
      if (lastUserTurn && lastUserTurn.parts.length > 0) {
        userQuery = lastUserTurn.parts.map(p => p.text).filter(Boolean).join(' ');
      }
    } else if (prompt || query) {
      formattedContents = [{ role: 'user', parts: [{ text: userQuery }] }];
    }

    if (formattedContents.length === 0) {
      formattedContents = [{ role: 'user', parts: [{ text: userQuery || 'Hello' }] }];
    }

    // Single selected model driven by intent classification
    const model = determineTaskModel(userQuery, forceDeepReasoning);
    const intent = forceDeepReasoning ? 'Forced Deep Reasoning' : (model === AI_CONFIG.reasoningModel ? 'Complex Analytical Audit' : 'Standard Lookup');

    const payload = {
      contents: formattedContents,
      generationConfig: {
        maxOutputTokens: AI_CONFIG.generation.maxOutputTokens,
        temperature: AI_CONFIG.generation.temperature
      }
    };

    if (!forceNoTools) {
      payload.tools = [
        { functionDeclarations: AI_TOOL_DECLARATIONS }
      ];
    }


    if (systemInstruction) {
      payload.systemInstruction = typeof systemInstruction === 'string'
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;
    }

    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    
    // Fetch using Exponential Backoff Retries on the single chosen model
    let response = await fetchWithExponentialBackoff(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      },
      AI_CONFIG.retry
    );

    // If tools schema is rejected by target model, retry without tools
    if (!response.ok && !forceNoTools) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.tools;
      response = await fetchWithExponentialBackoff(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(fallbackPayload)
        },
        AI_CONFIG.retry
      );
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new HttpError(response.status || 502, `Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Check if model returned function calls (tool requests)
    const toolCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    const textParts = parts.map((p) => p.text).filter(Boolean);
    const text = textParts.join('\n').trim();
    const durationMs = Date.now() - startTime;

    return jsonResponse({
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      telemetry: {
        modelUsed: model,
        intent,
        durationMs,
        toolCalls: toolCalls.map(tc => ({ name: tc.name, args: tc.args || {} })),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

export const maxDuration = 60;
