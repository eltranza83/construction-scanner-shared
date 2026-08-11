import { getClientGeminiApiKey } from './gemini.js';

const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

const AI_ASSISTANT_SYSTEM_PROMPT = `
You are the Adepec Homes AI Construction Financial Assistant.
You have complete real-time access to the user's active home construction project data, spreadsheet summaries, category totals, contractor quotes, labor/material payments, and remaining balances.

Your goals:
1. Provide precise, accurate, human-friendly answers to any user question about their construction project.
2. For CONTRACTOR / TRADE BALANCE QUERIES (e.g. "balance on the framer", "how much do we owe the plumber?", "tiler balance"):
   - Identify the exact matching trade phase (e.g., "Framing Lumber & Truss" for framer, "Plumbing Rough-In" for plumber).
   - State the Payee, Phase Name, Quote, Amount Paid, and Remaining Balance.
   - Set matchedPhase in the JSON response to the exact phase name so the app opens the contractor card.
3. For HIGHEST / BIGGEST EXPENSE QUERIES (e.g. "what is the biggest expense so far?"):
   - Compare all categories and contractor phases carefully.
   - Identify the single category or phase with the highest total quote or paid amount.
   - State its name and dollar amount clearly. DO NOT mention unrelated categories like Stucco unless Stucco is genuinely the highest.
4. For PDF VOUCHER CREATION (e.g. "Create a $60 gas PDF for Lot 103", "Log $45 fuel"):
   - Set action = "CREATE_PDF_RECEIPT".
   - Default category to "Project_Overhead_&_Bills" and phase to "Extra Costs & Misc".
   - Extract amount, vendor (e.g. "Gas Station"), date, and project lot.

Response JSON Schema:
{
  "answerText": "Clean, concise natural language response to be spoken out loud and shown in UI.",
  "matchedPhase": null | "Exact Phase Name matching the query",
  "action": null | "CREATE_PDF_RECEIPT",
  "pdfDetails": null | {
    "amount": 0.00,
    "vendor": "Vendor name (e.g. Gas Station)",
    "category": "Project_Overhead_&_Bills",
    "phase": "Extra Costs & Misc",
    "project": "Project name or Lot number",
    "date": "YYYY-MM-DD",
    "note": "Short note describing the voice voucher"
  }
}

Output ONLY valid JSON without markdown fences.
`;

const AI_ASSISTANT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answerText: { type: 'STRING' },
    matchedPhase: { type: 'STRING', nullable: true },
    action: { type: 'STRING', nullable: true, enum: [null, 'CREATE_PDF_RECEIPT'] },
    pdfDetails: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        amount: { type: 'NUMBER' },
        vendor: { type: 'STRING' },
        category: { type: 'STRING' },
        phase: { type: 'STRING' },
        project: { type: 'STRING' },
        date: { type: 'STRING' },
        note: { type: 'STRING' }
      },
      required: ['amount', 'vendor', 'category', 'phase', 'project', 'date']
    }
  },
  required: ['answerText']
};

/**
 * Cleanly format dashboard data snapshot for Gemini context
 */
function buildDashboardContextPrompt(dashboardData, activeProjectName = '') {
  if (!dashboardData) return 'No active project financial data available.';

  const projectInfo = dashboardData.projectInfo || {};
  const kpis = dashboardData.kpis || {};
  const categories = dashboardData.categories || [];
  const subs = dashboardData.subcontractors || [];

  const categorySummary = categories.map(c => {
    return `- ${c.name}: Quote: $${(c.quote || 0).toLocaleString()}, Paid: $${(c.paid || 0).toLocaleString()} (Labor: $${(c.laborPaid || 0).toLocaleString()}, Material: $${(c.materialPaid || 0).toLocaleString()}), Remaining Balance: $${(c.remainingBalance || 0).toLocaleString()}`;
  }).join('\n');

  const subSummary = subs.map(s => {
    const payeeName = (!s.payee || s.payee.toLowerCase() === 'unassigned') ? 'Unassigned' : s.payee;
    return `- ${payeeName} | Phase: ${s.phase || 'N/A'} | Quote: $${(s.originalQuote || 0).toLocaleString()} | Paid: $${(s.totalLabor || s.totalPaid || 0).toLocaleString()} | Balance: $${(s.remainingBalance || 0).toLocaleString()}`;
  }).join('\n');

  return `
ACTIVE PROJECT: ${activeProjectName || projectInfo.name || 'Current Construction Project'}
TOTAL BUDGET / QUOTE: $${(kpis.totalQuote || projectInfo.quote || 0).toLocaleString()}
TOTAL PAID SO FAR: $${(kpis.totalPaid || projectInfo.paid || 0).toLocaleString()}
TOTAL REMAINING BALANCE: $${(kpis.totalBalance || projectInfo.balance || 0).toLocaleString()}

CATEGORY SUMMARY:
${categorySummary || 'No category data'}

CONTRACTOR / SUB-PHASE SUMMARY:
${subSummary || 'No contractor data'}
`;
}

/**
 * Primary AI query function using Gemini API with model fallback
 */
export async function queryGeminiProjectAssistant({
  query,
  dashboardData,
  activeProjectName = '',
  apiKey = '',
  fetchImpl = fetch
}) {
  const effectiveApiKey = apiKey || getClientGeminiApiKey();

  if (!effectiveApiKey) {
    throw new Error('No Gemini API key provided. Please add your API key in Settings.');
  }

  const contextData = buildDashboardContextPrompt(dashboardData, activeProjectName);
  const fullUserPrompt = `
CURRENT PROJECT FINANCIAL SNAPSHOT:
${contextData}

USER QUESTION / VOICE COMMAND:
"${query}"
`;

  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${effectiveApiKey}`;

      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: AI_ASSISTANT_SYSTEM_PROMPT },
              { text: fullUserPrompt }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: AI_ASSISTANT_RESPONSE_SCHEMA
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Model ${modelName} returned ${res.status}:`, errText);
        lastError = new Error(`Gemini ${modelName} failed (${res.status})`);
        continue; // Try next fallback model
      }

      const payload = await res.json();
      const rawText = payload.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();

      if (!rawText) {
        continue;
      }

      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned);

      return {
        modelUsed: modelName,
        answerText: parsed.answerText || 'I processed your query.',
        matchedPhase: parsed.matchedPhase || null,
        action: parsed.action || null,
        pdfDetails: parsed.pdfDetails || null
      };

    } catch (err) {
      console.warn(`Error querying model ${modelName}:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to query Gemini AI Assistant.');
}
