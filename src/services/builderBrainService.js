/**
 * J.A.R.V.I.S. Builder Brain AI Service
 * Pure AI Model Architecture: Feeds live project records directly to Gemini Cloud AI in one pass.
 * No brittle hardcoded if/else rules or regex catchphrases.
 */
import { AI_CONFIG, determineTaskModel } from '../config/aiConfig.js';
import { executeClientToolCall } from './aiTools.js';
import { INSPECTION_STAGES, loadInspectionData } from './inspectionService.js';


const SPECS_STORAGE_PREFIX = 'jobscan_project_specs_';
const GLOBAL_PHASES_STORAGE_KEY = 'jobscan_global_phase_protocols_v4';
const GLOBAL_SITE_SETUP_KEY = 'jobscan_global_site_setup_protocol_v2';

export function playChimeAlert() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (_) {}
}

export function loadGlobalSiteSetupProtocol(defaultProtocol = {}) {
  try {
    const raw = localStorage.getItem(GLOBAL_SITE_SETUP_KEY);
    if (!raw) return defaultProtocol;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultProtocol;
  } catch (e) {
    console.error('Error loading global site setup protocol:', e);
    return defaultProtocol;
  }
}

export function saveGlobalSiteSetupProtocol(protocol) {
  try {
    localStorage.setItem(GLOBAL_SITE_SETUP_KEY, JSON.stringify(protocol));
  } catch (e) {
    console.error('Error saving global site setup protocol:', e);
  }
}

export function resetGlobalSiteSetupProtocol(defaultProtocol = {}) {
  try {
    localStorage.removeItem(GLOBAL_SITE_SETUP_KEY);
    return defaultProtocol;
  } catch (e) {
    console.error('Error resetting global site setup protocol:', e);
    return defaultProtocol;
  }
}

export function loadGlobalPhases(defaultPhases = []) {
  try {
    const raw = localStorage.getItem(GLOBAL_PHASES_STORAGE_KEY);
    if (!raw) return defaultPhases;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPhases;
  } catch (e) {
    console.error('Error loading global phases:', e);
    return defaultPhases;
  }
}

export function saveGlobalPhases(phases) {
  try {
    localStorage.setItem(GLOBAL_PHASES_STORAGE_KEY, JSON.stringify(phases));
  } catch (e) {
    console.error('Error saving global phases:', e);
  }
}

export function resetGlobalPhases(defaultPhases = []) {
  try {
    localStorage.removeItem(GLOBAL_PHASES_STORAGE_KEY);
    return defaultPhases;
  } catch (e) {
    console.error('Error resetting global phases:', e);
    return defaultPhases;
  }
}

export const DEFAULT_SITE_SETUP_PROTOCOL = {
  id: 'site_setup',
  name: 'Site Setup & Lot Mobilization',
  trade: 'Site Prep & Utilities',
  icon: '🚩',
  preTradeNotes: [
    'Set temporary hose bibb with anti-siphon vacuum breaker on water meter line.',
    'Erect permit board with visible Lot # and city building permit in clear weatherproof pouch.',
    'Install erosion control barrier / silt fencing along lot boundaries to prevent dirt runoff.',
    'Ensure port-a-potty / temporary toilet is delivered and visible at front of lot.',
    'Verify city utility water meter is requested, set, and active prior to temp plumbing connections.'
  ],
  inspectionChecklist: [
    { id: 'ss_water_meter', text: 'City Water Meter Set & Installed' },
    { id: 'ss_vacuum_breaker', text: 'Temporary Hose Faucet with Vacuum Breaker (Backflow Preventer)' },
    { id: 'ss_permit_board', text: 'Lot Number & City Building Permit Board Posted On-Site' },
    { id: 'ss_erosion_control', text: 'Erosion Control Barrier / Silt Fencing' },
    { id: 'ss_port_a_potty', text: 'Port-A-Potty / Temporary Toilet Delivered On-Site' }
  ]
};

function getSiteSetupProtocol() {
  return loadGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
}


export function loadStoredReminders() {
  try {
    const keys = ['jobscan_reminders', 'jobscan_ai_reminders', 'jobscan_field_reminders'];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return [];
}


export function saveStoredReminders(reminders) {
  try {
    localStorage.setItem('jobscan_reminders', JSON.stringify(reminders));
    localStorage.setItem('jobscan_ai_reminders', JSON.stringify(reminders));
  } catch (_) {}
}

export function loadProjectSpecs(projectId) {
  if (!projectId) return [];
  try {
    const raw = localStorage.getItem(`${SPECS_STORAGE_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveProjectSpecs(projectId, specs) {
  if (!projectId) return;
  try {
    localStorage.setItem(`${SPECS_STORAGE_PREFIX}${projectId}`, JSON.stringify(specs));
  } catch (_) {}
}

export function loadProjectDashboard(projectId) {
  try {
    if (!projectId) return null;
    const directKey = `jobscan_cached_dashboard_${projectId}`;
    const rawDirect = localStorage.getItem(directKey);
    if (rawDirect) return JSON.parse(rawDirect);

    const normKey = `jobscan_cached_dashboard_${projectId.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')}`;
    const rawNorm = localStorage.getItem(normKey);
    if (rawNorm) return JSON.parse(rawNorm);

    return null;
  } catch (_) {
    return null;
  }
}

export function loadProjectDriveTree(projectId) {
  try {
    if (!projectId) return null;
    const raw = localStorage.getItem(`jobscan_cached_drivetree_${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function saveProjectDriveTree(projectId, tree) {
  if (!projectId || !tree) return;
  try {
    localStorage.setItem(`jobscan_cached_drivetree_${projectId}`, JSON.stringify(tree));
  } catch (_) {}
}

export const loadDriveTree = loadProjectDriveTree;

/**
 * Builds grounded Markdown context for the Gemini system prompt.
 * This feeds your entire project ledger, sub-balances, expenses, site setup, municipal inspections, specs, and drive files directly into Gemini.
 */
function buildGroundingSystemInstruction(context) {
  const {
    activeProjectName = 'Active Project',
    dashData = null,
    driveData = null,
    projectSpecs = [],
    siteSetupData = null,
    inspectionsData = [],
    pendingR = [],
    timeGreeting = 'Good morning',
    spanishTimeGreeting = 'Buenos días',
    currentTimeString = '',
    currentDayString = ''
  } = context;

  const info = dashData?.projectInfo || {};
  const subs = Array.isArray(dashData?.subcontractors) ? dashData.subcontractors : (Array.isArray(dashData?.phases) ? dashData.phases : []);

  const grossBudget = info.budgetGross || info.grossBudget || '$0.00';
  const buildBudget = info.budgetBuild || info.buildBudget || '$0.00';
  const totalSpent = info.totalSpent || info.drawsPaid || '$0.00';
  const workingCapital = info.capitalBalance || info.netCapital || '$0.00';

  let phaseRecords = 'No trade records recorded yet.';
  if (subs.length > 0) {
    phaseRecords = subs.map(s => {
      const name = s.phase || s.name || 'Trade';
      const payee = s.payee || s.contractor || 'Unassigned';
      const quote = s.originalQuote || s.quote || '$0.00';
      const paid = s.totalSpent || s.totalPaid || '$0.00';
      const bal = s.remainingBalance || '$0.00';
      const payments = (s.payments || []).map(p => `    - Payment: ${p.amount || p.laborCost || p.materialCost || '$0.00'} to ${p.vendor || payee} on ${p.date || 'N/A'} (Check #${p.checkNumber || 'N/A'}${p.description ? `, ${p.description}` : ''})`).join('\n');
      return `* Phase: "${name}" | Payee: "${payee}" | Quote: ${quote} | Paid: ${paid} | Remaining Balance: ${bal}${payments ? '\n' + payments : ''}`;
    }).join('\n');
  }

  let siteSetupRecords = 'Site Setup Protocol not initialized.';
  if (siteSetupData?.protocol) {
    const protocol = siteSetupData.protocol;
    const preNotes = protocol.preTradeNotes || protocol.lotPrepList || [];
    const chkList = protocol.inspectionChecklist || [];
    const checks = siteSetupData.checks || {};
    const passedCount = chkList.filter(c => checks[c.id]).length;

    const notesFormatted = preNotes.length > 0
      ? preNotes.map((n, i) => `  ${i + 1}. ${typeof n === 'string' ? n : n.text || n.title}`).join('\n')
      : '  (No pre-work notes)';

    const auditFormatted = chkList.length > 0
      ? chkList.map(c => `  - [${checks[c.id] ? 'x' : ' '}] ${c.text || c.title} (${checks[c.id] ? 'PASSED / CHECKED' : 'PENDING'})`).join('\n')
      : '  (No checklist items)';

    siteSetupRecords = `Status: ${passedCount}/${chkList.length} Passed\nCritical Pre-Work Notes:\n${notesFormatted}\n\nSite Readiness Audit Checklist:\n${auditFormatted}`;
  }

  let inspectionRecords = 'No municipal inspection data loaded.';
  if (Array.isArray(inspectionsData) && inspectionsData.length > 0) {
    inspectionRecords = inspectionsData.map((s, idx) => {
      const itemsList = s.items.map(i => `    - [${i.status === 'PASSED' ? 'x' : ' '}] ${i.title} [Status: ${i.status}]${i.category ? ` (Category: ${i.category})` : ''}${i.note ? ` - Note: "${i.note}"` : ''}`).join('\n');
      return `${idx + 1}. Stage: "${s.stageName}" (${s.passedCount}/${s.totalItems} Passed - ${s.isFullyPassed ? 'COMPLETE' : 'IN PROGRESS'})\n   Description: ${s.description}\n   Checklist:\n${itemsList}`;
    }).join('\n\n');
  }

  let reminderRecords = 'No pending field reminders.';
  if (pendingR.length > 0) {
    reminderRecords = pendingR.map((r, i) => `${i + 1}. ${r.title} (${r.notes || 'No notes'})`).join('\n');
  }

  let specRecords = 'No finish specifications recorded.';
  if (projectSpecs.length > 0) {
    specRecords = projectSpecs.map(s => `* ${s.category} (${s.location}): ${s.brand ? s.brand + ' - ' : ''}${s.title || s.code}${s.sheen ? ` (${s.sheen})` : ''}`).join('\n');
  }

  let driveRecords = 'No Drive folders or files indexed.';
  if (driveData) {
    const lines = [];
    if (Array.isArray(driveData.directFiles) && driveData.directFiles.length > 0) {
      lines.push(`* Root Project Folder Files:\n` + driveData.directFiles.map(f => `  - "${f.name}" (${f.mimeType || 'file'}${f.id ? `, ID: ${f.id}` : ''})`).join('\n'));
    }
    if (Array.isArray(driveData.subfolders) && driveData.subfolders.length > 0) {
      for (const sub of driveData.subfolders) {
        const fileList = Array.isArray(sub.files) && sub.files.length > 0
          ? sub.files.map(f => `  - "${f.name}" (${f.mimeType || 'file'}${f.id ? `, ID: ${f.id}` : ''})`).join('\n')
          : '  - (Empty folder or no files uploaded yet)';
        lines.push(`* Folder "${sub.folderName}" (Folder ID: ${sub.folderId || sub.id || 'N/A'}):\n${fileList}`);
      }
    }
    if (lines.length > 0) {
      driveRecords = lines.join('\n\n');
    }
  }

  return `You are Jarvis, the expert AI Construction Field Co-Pilot for custom home builder ADEPEC HOMES / SiteTactix.

CURRENT PROJECT CONTEXT:
- Active Lot / Project: "${activeProjectName}"
- Current Time: ${currentTimeString}, ${currentDayString}

LIVE PROJECT DATA MODULE MANIFEST FOR "${activeProjectName}":

======================================================================
[MODULE 1: LIVE FINANCIAL SPREADSHEET] -> STATUS: LOADED & ACTIVE
======================================================================
- Gross Budget: ${grossBudget}
- Hard Cost Build Budget: ${buildBudget}
- Total Draws Paid / Total Spent To Date: ${totalSpent}
- Remaining Working Capital / Net Liquidity: ${workingCapital}

SUBCONTRACTOR CONTRACTS, PAYMENTS & REMAINING BALANCES:
${phaseRecords}

======================================================================
[MODULE 2: SITE SETUP & LOT MOBILIZATION] -> STATUS: LOADED & ACTIVE
======================================================================
${siteSetupRecords}

======================================================================
[MODULE 3: MUNICIPAL INSPECTION PROTOCOLS (6 BUILD STAGES)] -> STATUS: LOADED & ACTIVE
======================================================================
${inspectionRecords}

======================================================================
[MODULE 4: HOMEOWNER FINISH SPECIFICATIONS] -> STATUS: LOADED & ACTIVE
======================================================================
${specRecords}

======================================================================
[MODULE 5: PENDING FIELD REMINDERS] -> STATUS: LOADED & ACTIVE
======================================================================
${reminderRecords}

======================================================================
[MODULE 6: GOOGLE DRIVE FOLDER & FILE TREE] -> STATUS: LOADED (METADATA & DIRECTORY HIERARCHY ONLY - INTERNAL DOCUMENT CONTENTS NOT EXTRACTED)
======================================================================
${driveRecords}

======================================================================
BEHAVIOR, VERIFICATION & CITATION RULES:
======================================================================
1. SYSTEM ARCHITECTURE BOUNDARIES:
   - The application is the authoritative source for deterministic data retrieval, validation, permissions, and actions.
   - You (Jarvis / Gemini) are responsible solely for natural language understanding, reasoning, and conversational presentation over the data provided in this manifest.
   - Module statuses (LOADED & ACTIVE, NOT LOADED, METADATA ONLY, CONTENT EXTRACTED) are authoritative.

2. MODULE VERIFICATION & MISSING DATA PROTOCOL:
   - Before answering any query, verify that the required data module is marked as LOADED.
   - If a required module is NOT LOADED, or if the internal contents of a document (e.g. PDF closing statements, contract text, unextracted receipts) are marked METADATA ONLY, you MUST explicitly state what is missing, identify the missing source, and either ask a clarifying question or request the appropriate app action (such as opening the document on screen with [[ACTION:VIEW_FILE:...]]).
   - NEVER fabricate, extrapolate, or guess data, dollar figures, inspection items, or document text.

3. MANDATORY SOURCE PROVENANCE:
   - Every factual statement must cite its exact provenance naturally in your answer:
     * "Live Financial Spreadsheet" (for budgets, payments, contractor balances)
     * "Municipal Inspection Checklist" (for plumbing, framing, foundation, etc.)
     * "Site Setup Checklist" (for mobilization, permit boards, meters, temp utilities)
     * "Google Drive Index" (for folder names, uploaded files, file metadata)
     * "Extracted Document Text" (when document contents are explicitly provided in prompt)

4. OPENING DOCUMENTS & PRONOUN CONFIRMATIONS:
   - When the user asks to see, open, pull up, or show a document or receipt, or says 'open it', 'yeah go ahead', 'show it to me', 'pull it up':
     * Check the recent conversation context to resolve the exact file being discussed.
     * If the reference unambiguously maps to a single file, confirm you are opening it and ALWAYS append: [[ACTION:VIEW_FILE:{"fileId":"FILE_ID","fileName":"FILE_NAME","folderName":"FOLDER_NAME"}]].
     * If multiple matching files exist, ask ONE clarifying question asking which specific file to open instead of guessing.

5. STATE-CHANGING ACTIONS & PERMISSIONS:
   - For any action that modifies data—creating folders, editing sheets, moving files, or logging records—you MUST ask for explicit confirmation from the user first (e.g. "Would you like me to go ahead and create the folder '[Folder Name]' in your Google Drive project folder for [Project Name]?"), unless the user has explicitly given automatic approval for that action in the conversation.
   - When confirmed by the user, emit the corresponding action code (e.g. [[ACTION:CREATE_FOLDER:FolderName]]).

6. MUNICIPAL INSPECTIONS & SITE SETUP:
   - For municipal inspection status or punchlist queries, reference the exact checklist items marked as "PENDING" or "[ ]" under [MODULE 3].
   - For site mobilization readiness, reference [MODULE 2] and report which items are passed vs pending.

7. NATURAL GREETINGS & VOICE FLOW:
   - Greet the user with a time-of-day greeting (Good morning / afternoon / evening) ONLY when the user initiates a greeting.
   - Do NOT repeat greetings on follow-up questions or data inquiries—answer directly, cleanly, and concisely.
   - Seamlessly support English and Spanish based on user input.`;
}










function formatToolResultsHumanReadable(toolTelemetryList) {
  const parts = [];
  for (const t of (toolTelemetryList || [])) {
    const res = t.result;
    if (!res) continue;

    if (t.name === 'get_weather_for_jobsite') {
      if (res.current) {
        parts.push(`The current weather at the jobsite is **${res.current.temperature_2m || res.current.temp || 75}°F**${res.current.condition ? `, ${res.current.condition}` : ''}.`);
      }
    } else if (t.name === 'get_project_schedule') {
      if (res.items && res.items.length > 0) {
        parts.push(`There are **${res.totalItems}** active checklist items on the project schedule.`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * Main AI Query Handler: Pure AI Model with Grounded Live Project Data
 */
export async function askGeminiBrain(
  query,
  conversationHistory = [],
  activeProjectName = 'Lot 3',
  apiKey = '',
  dashboardOverride = null,
  projectIdOverride = '',
  messages = [],
  driveTreeOverride = null,
  fileAttachment = null,
  forceDeepReasoning = false
) {
  const clientStartTime = Date.now();
  const projectId = projectIdOverride || activeProjectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dashData = dashboardOverride || loadProjectDashboard(projectId);
  const driveData = driveTreeOverride || loadDriveTree(projectId);
  const projectSpecs = loadProjectSpecs(projectId);
  const siteSetupProtocol = getSiteSetupProtocol();

  let siteSetupChecks = {};
  try {
    if (projectId) {
      const raw = localStorage.getItem(`jobscan_sitesetup_checks_${projectId}`);
      if (raw) siteSetupChecks = JSON.parse(raw);
    }
  } catch (_) {}

  const siteSetupData = {
    protocol: siteSetupProtocol,
    checks: siteSetupChecks
  };

  const reminders = loadStoredReminders();
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingR = reminders.filter((r) => r.status === 'pending' && (!r.targetDate || r.targetDate === todayStr));

  // Load All 6 Municipal Inspection Stages with live checklist status
  const inspectionsData = (INSPECTION_STAGES || []).map((stage) => {
    const items = loadInspectionData(projectId, stage.id) || [];
    const passedCount = items.filter((i) => i.status === 'pass').length;
    return {
      stageId: stage.id,
      stageName: stage.name,
      icon: stage.icon,
      description: stage.description,
      totalItems: items.length,
      passedCount,
      isFullyPassed: items.length > 0 && passedCount === items.length,
      items: items.map((i) => ({
        id: i.id,
        title: i.title || i.text || i.name || 'Inspection Item',
        category: i.category || 'General',
        status: i.status === 'pass' ? 'PASSED' : (i.status === 'fail' ? 'FAILED' : 'PENDING'),
        note: i.note || ''
      }))
    };
  });

  const projectContext = {
    projectId,
    activeProjectName,
    items: reminders,
    pendingR,
    dashboardData: dashData,
    driveTree: driveData,
    projectSpecs,
    siteSetupData,
    inspectionsData
  };

  const now = new Date();
  const currentHour = now.getHours();
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const spanishTimeGreeting = currentHour < 12 ? 'Buenos días' : currentHour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const currentTimeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const currentDayString = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  // Build the complete grounded system prompt
  const systemInstruction = buildGroundingSystemInstruction({
    activeProjectName,
    dashData,
    driveData,
    projectSpecs,
    siteSetupData,
    inspectionsData,
    pendingR,
    timeGreeting,
    spanishTimeGreeting,
    currentTimeString,
    currentDayString
  });


  // Prepare clean conversation history
  const historySource = (Array.isArray(messages) && messages.length > 0) ? messages : conversationHistory;
  const recentHistory = historySource.slice(-6);
  const rawContents = [];

  for (const msg of recentHistory) {
    const text = msg.text || msg.content || '';
    if (!text || typeof text !== 'string') continue;
    rawContents.push({
      role: (msg.sender === 'ai' || msg.role === 'model' || msg.sender === 'jarvis') ? 'model' : 'user',
      parts: [{ text: text.slice(0, 1500) }]
    });
  }

  rawContents.push({
    role: 'user',
    parts: [{ text: query }]
  });

  while (rawContents.length > 0 && rawContents[0].role !== 'user') {
    rawContents.shift();
  }

  const contents = [];
  for (const turn of rawContents) {
    if (contents.length > 0 && contents[contents.length - 1].role === turn.role) {
      contents[contents.length - 1].parts.push(...turn.parts);
    } else {
      contents.push(turn);
    }
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: query }] });
  }

  const envKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) ? import.meta.env.VITE_GEMINI_API_KEY : '';
  const effectiveKey = (apiKey && apiKey.trim()) || (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_gemini_api_key') || localStorage.getItem('jobscan_gemini_key')) : '') || envKey || '';

  let lastErrorCode = null;
  let toolTelemetryList = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const apiRes = await fetch('/api/ask-brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction,
        query,
        forceDeepReasoning,
        apiKey: effectiveKey
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (apiRes.ok) {
      const data = await apiRes.json();

      // If Gemini requested a tool execution (e.g. weather)
      if (data && data.toolCalls && data.toolCalls.length > 0) {
        for (const tc of data.toolCalls) {
          try {
            const result = await executeClientToolCall(tc.name, tc.args || {}, projectContext);
            toolTelemetryList.push({
              name: tc.name,
              args: tc.args,
              result
            });
          } catch (tErr) {
            toolTelemetryList.push({
              name: tc.name,
              args: tc.args,
              error: tErr.message
            });
          }
        }

        const cleanSummary = formatToolResultsHumanReadable(toolTelemetryList);
        if (cleanSummary) {
          return {
            text: cleanSummary,
            telemetry: {
              modelUsed: data.telemetry?.modelUsed || determineTaskModel(query, forceDeepReasoning),
              source: 'Gemini Cloud AI',
              intent: 'Tool Augmented Response',
              durationMs: Date.now() - clientStartTime,
              toolsExecuted: toolTelemetryList
            }
          };
        }
      }

      if (data && data.text) {
        return {
          text: data.text.trim(),
          telemetry: {
            modelUsed: data.telemetry?.modelUsed || determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Cloud AI',
            intent: data.telemetry?.intent || (forceDeepReasoning ? 'Forced Deep Reasoning' : 'Standard Response'),
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: []
          }
        };
      }
    } else {
      lastErrorCode = apiRes.status;
    }
  } catch (err) {
    lastErrorCode = 'NETWORK_TIMEOUT';
  }

  // Graceful fallback when cloud assistant is unavailable
  return {
    text: `I am temporarily unable to connect to the cloud AI assistant for open reasoning. However, all your project financials, schedule, and files for ${activeProjectName} are active locally. What specific record would you like to check?`,
    telemetry: {
      modelUsed: 'Local Fast Ledger Engine',
      source: 'Local Project Ledger',
      intent: 'Offline Notice',
      durationMs: Date.now() - clientStartTime,
      toolsExecuted: [],
      errorCode: lastErrorCode
    }
  };
}
