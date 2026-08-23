/**
 * J.A.R.V.I.S. Builder Brain AI Service
 * Pure AI Model Architecture: Feeds live project records directly to Gemini Cloud AI in one pass.
 * No brittle hardcoded if/else rules or regex catchphrases.
 */
import { determineTaskModel, AI_CONFIG } from '../config/aiConfig.js';
import { executeClientToolCall, circuitBreaker, resetWriteIdempotencyState } from './aiTools.js';
import { getFirebaseAuthInstance } from './firebase.js';
import { INSPECTION_STAGES, loadInspectionData } from './inspectionService.js';
import { searchMemories, formatMemoriesForPrompt, loadUserPreferences, saveUserPreference, updateUserPreferenceStatus, deleteUserPreference, resetAllUserPreferences } from './memoryService.js';
import {
  compileUserPreferencesPrompt,
  analyzeInteractionForPreference,
  calculateObservationConfidence,
  shouldProactivelyPrompt,
  generateProactiveConfirmationQuestion,
  evaluateConfirmationResponse,
  PREFERENCE_STATUS,
  PREFERENCE_SOURCES,
  PREFERENCE_SCOPES
} from './userPreferenceEngine.js';

import {
  evaluateCognitiveInitiative,
  resolvePendingSuggestionConfirmation,
  recordSuggestionOutcome,
  isConversationEnding,
  isUserCorrectingInformation,
  INITIATIVE_OUTCOMES,
  DEFAULT_INITIATIVE_CONFIG
} from './cognitiveInitiativeEngine.js';

let _activeSessionCognitiveState = {
  turnIndex: 0,
  lastSuggestionTurn: -999,
  pendingProactiveSuggestion: null
};

export function getActiveSessionCognitiveState() {
  return _activeSessionCognitiveState;
}

export function resetActiveSessionCognitiveState() {
  _activeSessionCognitiveState = {
    turnIndex: 0,
    lastSuggestionTurn: -999,
    pendingProactiveSuggestion: null
  };
  try {
    resetWriteIdempotencyState();
  } catch (_) {}
}



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
    if (typeof localStorage === 'undefined') return defaultProtocol;
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
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GLOBAL_SITE_SETUP_KEY, JSON.stringify(protocol));
  } catch (e) {
    console.error('Error saving global site setup protocol:', e);
  }
}

export function resetGlobalSiteSetupProtocol(defaultProtocol = {}) {
  try {
    if (typeof localStorage === 'undefined') return defaultProtocol;
    localStorage.removeItem(GLOBAL_SITE_SETUP_KEY);
    return defaultProtocol;
  } catch (e) {
    console.error('Error resetting global site setup protocol:', e);
    return defaultProtocol;
  }
}

export function loadGlobalPhases(defaultPhases = []) {
  try {
    if (typeof localStorage === 'undefined') return defaultPhases;
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
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GLOBAL_PHASES_STORAGE_KEY, JSON.stringify(phases));
  } catch (e) {
    console.error('Error saving global phases:', e);
  }
}

export function resetGlobalPhases(defaultPhases = []) {
  try {
    if (typeof localStorage === 'undefined') return defaultPhases;
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

export function formatNaturalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr || 'N/A';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const year = match[1];
    if (months[month]) {
      const suffix = (day === 1 || day === 21 || day === 31) ? 'st' : (day === 2 || day === 22) ? 'nd' : (day === 3 || day === 23) ? 'rd' : 'th';
      return `${months[month]} ${day}${suffix}, ${year}`;
    }
  }
  return dateStr;
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
export function buildGroundingSystemInstruction(context) {
  const {
    activeProjectName = 'Active Project',
    dashData = null,
    driveData = null,
    projectSpecs = [],
    siteSetupData = null,
    inspectionsData = [],
    pendingR = [],
    memoriesData = [],
    userPreferencesPrompt = '',
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
      const payments = (s.payments || []).map(p => `    - Payment: ${p.amount || p.laborCost || p.materialCost || '$0.00'} to ${p.vendor || payee} on ${formatNaturalDate(p.date)} (Check #${p.checkNumber || 'N/A'}${p.description ? `, ${p.description}` : ''})`).join('\n');

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

  const memoryRecords = formatMemoriesForPrompt(memoriesData);

  return `You are Jarvis, the expert AI Construction Field Co-Pilot for custom home builder ADEPEC HOMES / SiteTactix.

CURRENT PROJECT CONTEXT:
- Active Lot / Project: "${activeProjectName}"
- Current Time: ${currentTimeString}, ${currentDayString}

LIVE PROJECT DATA MODULE MANIFEST FOR "${activeProjectName}":

======================================================================
[MODULE 1: LIVE FINANCIAL SPREADSHEET (Summary_Dashboard)] -> SOURCE: Google Sheets (Project Financials)
======================================================================
(NOTE: Contains ONLY financial numbers, budgets, draws paid, hard costs, and subcontractor payments. Does NOT contain calendar reminders or schedules.)
- Gross Budget: ${grossBudget}
- Hard Cost Build Budget: ${buildBudget}
- Total Draws Paid / Total Spent To Date: ${totalSpent}
- Remaining Working Capital / Net Liquidity: ${workingCapital}

SUBCONTRACTOR CONTRACTS, PAYMENTS & REMAINING BALANCES:
${phaseRecords}

======================================================================
[MODULE 2: SITE SETUP & LOT MOBILIZATION] -> SOURCE: Site Setup Checklist Database
======================================================================
${siteSetupRecords}

======================================================================
[MODULE 3: MUNICIPAL INSPECTION PROTOCOLS (6 BUILD STAGES)] -> SOURCE: Municipal Inspections
======================================================================
${inspectionRecords}

======================================================================
[MODULE 4: HOMEOWNER FINISH SPECIFICATIONS] -> SOURCE: Homeowner Specifications
======================================================================
${specRecords}

======================================================================
[MODULE 5: PENDING FIELD REMINDERS] -> SOURCE: Field Reminders (SiteTactix App)
======================================================================
(NOTE: In-app task and reminder list stored locally in SiteTactix app.)
${reminderRecords}

======================================================================
[MODULE 6: GOOGLE DRIVE FOLDER & FILE TREE] -> SOURCE: Google Drive
======================================================================
${driveRecords}

======================================================================
[MODULE 7: PERSISTENT BUSINESS & SITE MEMORIES (SECOND BRAIN)] -> SOURCE: J.A.R.V.I.S. Memory (Persistent Vault)
======================================================================
(NOTE: Verbal builder notes, contractor preferences, and site facts stored in Firestore /memories.)
${memoryRecords}

======================================================================
[MODULE 8: USER PREFERENCES & INTERACTION STYLE (LEARNED & CONFIGURED)] -> SOURCE: J.A.R.V.I.S. Memory (Persistent Vault)
======================================================================
${userPreferencesPrompt || 'Default: Concise, professional builder co-pilot.'}

======================================================================
BEHAVIOR, VERIFICATION & CITATION RULES:
======================================================================
1. SYSTEM ARCHITECTURE & DUAL-STORE ROLES:
   - "Live Financial Spreadsheet" is the single authoritative source for actual financial transactions, payments, and mathematical accounting.
   - "Persistent Saved Memory" is the authoritative source for verbal quotes, subcontractor preferences, site decisions, and lessons learned that the user told you to remember.
   - You (Jarvis / Gemini) are responsible for natural language understanding, reasoning, and conversational presentation over the data provided in this manifest.

2. EXPLICIT MEMORY COMMAND EXECUTION (SAVE, UPDATE, FORGET):
   - When the user uses explicit memory commands such as:
     * "Remember this / that..."
     * "I need you to remember..."
     * "Make a note of this..."
     * "Keep this in mind..."
     * "Save this for later..."
     * "Going forward..."
     * "Don't forget that..."
   - You MUST IMMEDIATELY call the 'save_memory' function tool with the text and appropriate category/importance. Do NOT ask for confirmation or hesitate—the user's explicit phrase is their direct authorization to save.
   - When the user asks to change, correct, or update a previously remembered fact (e.g., "Actually change that note to check", "The painter wants checks now"), you MUST call the 'update_memory' function tool.
   - When the user asks to forget or remove a memory (e.g., "Forget what I told you about...", "Delete that note"), you MUST call the 'delete_memory' function tool.
   - When the user asks what you remember or queries preferences/quotes (e.g., "What do you remember about Lot 12?", "How does the painter want to get paid?"), answer naturally, concisely, and directly in your professional co-pilot persona (e.g., "For Lot 3, the painter prefers to be paid by check.") using the factual records retrieved from 'search_memories' or [MODULE 7].

3. DUAL-STORE CONTRADICTION & RECONCILIATION RULE:
   - When a saved memory and the live spreadsheet differ (for example, memory records an original verbal quote of $8,500 while the spreadsheet shows $0.00 paid to date), DO NOT state the difference as an absolute financial ledger balance.
   - State both clearly and transparently (e.g., "The painter's saved verbal quote is $8,500, while the project spreadsheet currently shows $0.00 paid. That means $8,500 of the quoted amount has not yet been recorded as paid in the official ledger.").
   - Financial calculations (balances, payments, totals) must ALWAYS come from the spreadsheet, never assumed or hallucinated from memory.

4. STRICT PROJECT ISOLATION:
   - Never apply a project-specific memory from one lot (e.g. Lot 12) to a different lot (e.g. Lot 15).
   - Only memories explicitly marked as [GLOBAL BUSINESS KNOWLEDGE] apply across all projects.
   - If information for a requested lot is not in the spreadsheet or memory, state clearly that you do not have that record; do NOT guess or transfer from other lots.

5. SPECULATION & AMBIGUITY GUARD:
   - If the user uses speculative or tentative language (e.g., "might switch to ACH", "may want", "possibly considering"), do NOT save it as a permanent fact. Clarify or ask for confirmation first.

6. MANDATORY SOURCE CITATION:
   - Always clearly cite the origin of facts in your response:
     * "According to your project spreadsheet..." (for financial numbers, payments)
     * "Your saved memory says..." (for verbal agreements, preferences, quotes)
     * "Municipal Inspection Checklist..." (for plumbing, framing, etc.)
     * "Site Setup Checklist..." (for meters, silt fence, mobilization)
     * "Google Drive Index..." (for folder/file structure)

7. CLEAN FORMATTING & NATURAL DATES (NO ASTERISKS / NO DUPLICATE DATES / NO RAW IDS):
   - Do NOT use Markdown asterisks (* or **) in your text responses. Use plain text and standard bullet dashes (-) or numbered lists (1., 2.).
   - Always output dates in natural conversational English (e.g. "July 22, 2026") or Spanish (e.g. "22 de julio de 2026").
   - NEVER output raw Google Drive Folder IDs or File IDs (e.g. '1-_2MHhajXEKLDsIADlzkOnf1167DMYN_') in your conversational text responses.

8. OPENING DOCUMENTS & PRONOUN CONFIRMATIONS:
   - When the user asks to see, open, pull up, or show a document or receipt, or says 'open it', 'yeah go ahead', 'show it to me', 'pull it up':
     * Check the recent conversation context to resolve the exact file being discussed.
     * If the reference unambiguously maps to a single file, confirm you are opening it and ALWAYS append: [[ACTION:VIEW_FILE:{"fileId":"FILE_ID","fileName":"FILE_NAME","folderName":"FOLDER_NAME"}]].
     * If multiple matching files exist, ask ONE clarifying question asking which specific file to open instead of guessing.

9. STATE-CHANGING ACTIONS & PERMISSIONS:
   - For Google Drive file actions (creating folders, moving files, or deleting files in Drive), you MUST ask for explicit confirmation from the user first (e.g. "Would you like me to go ahead and create the folder '[Folder Name]' in your Google Drive project folder for [Project Name]?").
   - This confirmation requirement does NOT apply to memory commands (save_memory, update_memory, delete_memory), which execute immediately when explicitly commanded.
   - When confirmed by the user, emit the corresponding action code (e.g. [[ACTION:CREATE_FOLDER:FolderName]]).

10. INTENT FIRST & RELEVANCE GUARDRAIL (DATA AVAILABILITY != PERMISSION TO VOLUNTEER):
   - Principle: Having access to project data, financial spreadsheets, municipal inspections, memories, and specs in this prompt does NOT give you permission to volunteer that information unprompted. Answer ONLY what the user specifically asked for, and stop.
   - CASUAL GREETINGS & CHIT-CHAT ("what's up", "hey", "hello", "good morning", "how's it going", "how are you"):
     * Respond with a natural, crisp 1-sentence time-of-day greeting: e.g. "Good evening. How can I help with ${activeProjectName} tonight?" (or in Spanish: "Buenas noches. ¿Cómo te ayudo con ${activeProjectName} hoy?").
     * ABSOLUTE PROHIBITION: NEVER volunteer gross budgets, draws paid, working capital, subcontractor balances, inspection checklists, or memories on greetings or casual chit-chat.
   - SPECIFIC DOMAIN QUERIES:
     * When asked about a specific trade (e.g. "What do we owe the electrician?"), answer ONLY for that trade. Do NOT add unrelated trades, gross budgets, or inspection items.
   - FINANCIAL OVERVIEW QUERIES:
     * When asked specifically about finances (e.g. "How much have we spent?", "What is our remaining budget?"), provide the requested financial figures accurately.
   - PROJECT STATUS QUERIES:
     * When the user explicitly requests an overall project status (e.g. "Where are we at on ${activeProjectName}?", "Give me the status on ${activeProjectName}"), provide the relevant project status.
   - COMPREHENSIVE REPORTS:
     * When the user explicitly requests a comprehensive breakdown (e.g. "Give me a full breakdown", "Provide a comprehensive status report"), deliver the complete detailed report rather than being artificially brief.
   - CONCISE BY DEFAULT, BUT COMPLETE FOR THE TOPIC:
     * Answer the requested question completely and accurately, then stop. Do NOT volunteer unsolicited next steps or unrequested background history.

11. VOICE-FIRST RESPONSE CODES (NO ASTERISKS / NATURAL VOICE):
   - Output clean plain text. Do not emit markdown formatting symbols like asterisks.

12. STRICT TRUTHFUL DATA PROVENANCE & ATTRIBUTION:
   - Always attribute facts to their TRUE originating system:
     * "Google Sheets (Project Financials)" or "Google Sheets (Subcontractor Ledger)": Contains ONLY financial numbers, budgets, payments, and trade balances. You are STRICTLY FORBIDDEN from stating or implying that Google Sheets contains calendar reminders, dates, or schedules.
     * "Field Reminders (SiteTactix App)": In-app task list.
     * "J.A.R.V.I.S. Memory (Persistent Vault)": Verbal builder notes and contractor preferences in Firestore. When speaking to the user, use natural first-person conversational phrasing (e.g. "According to my memory" or "In my notes") rather than referring to yourself in the third person.
     * "Google Drive": Files, plans, blueprints, permits.
     * "Municipal Inspections": 6-stage city building inspection checklist.
     * "Weather API": Real-time jobsite weather.
   - Seamlessly support English and Spanish based on user input.

13. COGNITIVE INITIATIVE & PROACTIVE ASSISTANT BEHAVIOR:
   - Understand context first: Helpful when needed, proactive when useful, quiet when not.
   - If the user shares an observation (e.g. "I'm heading over to Lot 3" or "The electrician is finishing today"), acknowledge warmly and, if genuinely useful, offer AT MOST ONE natural, conversational next step as a brief question.
   - NEVER use robotic alert formats like "Suggestion:" or "Proactive Alert:". Sound like a competent human assistant.
   - If the user confirms a suggestion ("yeah", "sure", "go ahead", "check it"), execute the action immediately without asking twice.
   - If the user is concluding ("thanks", "got it", "that's all"), acknowledge cleanly without unsolicited suggestions or data dumps.

14. GOOGLE DOCS MASTER & PROJECT PURCHASING ARCHITECTURE (V1 FINAL):
   - You manage the parent Master Purchasing Template (resourceType: 'purchasing_master') and individual project lot purchasing documents (resourceType: 'project_purchasing') via get_purchasing_list, add_purchasing_item, update_purchasing_item_status, sync_purchasing_master_to_projects, deprecate_purchasing_master_item, and get_purchasing_audit_log.
   - DEFAULT SCOPE = ACTIVE LOT ONLY: When the user says "Add XYZ to purchasing list", target ONLY the currently active lot (e.g. Lot 3, Lot 37). Never modify the Master or other lots automatically.
   - MASTER TEMPLATE SCOPE & AUTO-VERSIONING: When the user says "Add XYZ to the master purchasing list" or "make XYZ standard for future projects", target the Master Template. The Master version auto-increments (e.g. v1.0 -> v1.1). Confirm and ask: "Added to the Master Purchasing List (v1.1). Do you also want me to add it to existing active projects?"
   - VOICE VS UI DUAL-PAYLOAD: When reporting sync previews over voice, be concise (e.g. "I found 4 projects missing 7 Master items. Want me to sync them?"). The chat UI displays the full breakdown table.
   - MASTER ITEM REMOVAL = DEPRECATION: When an item is removed/retired from Master, call deprecate_purchasing_master_item. It marks the item as deprecated so it is excluded from future projects, while active projects keep their historical records untouched. Never delete items from active projects.
   - PROJECT DOCUMENT DISCOVERY & SINGLE SOURCE OF TRUTH: If a Google Drive document named "Purchasing Checklist" or in a purchasing folder exists for a lot, that file IS the project's live purchasing list. Never claim that a purchasing list doesn't exist or is uninitialized when the Drive file is present. If the checklist has 0 items under a trade, simply state that the purchasing checklist exists on Google Drive but currently has no pending items listed.
   - PROVENANCE ATTRIBUTION: When answering project-specific purchasing questions, attribute the source to "Google Docs (<Project Name> Purchasing Checklist)" (e.g. "Google Docs (Lot 3 Purchasing Checklist)"). Attribute to "Google Docs (Master Purchasing Checklist)" ONLY when explicitly referencing or managing the company-wide Master Template.
   - DOMAIN BOUNDARIES: When the user asks purchasing questions ("what do I need to buy", "what do we still need to purchase", "what materials do we need for [trade]"), focus strictly on physical fixtures, materials, and hardware from the Google Docs Purchasing Checklist (get_purchasing_list). Do NOT dump contractor contract quotes, balances, or payments from Google Sheets unless the user explicitly asked about money, cost, quotes, balances, or payments.`;
}

export function formatUserFriendlyToolError(toolName) {
  if (toolName === 'get_weather_for_jobsite') return 'The jobsite weather forecast service was temporarily unavailable.';
  if (toolName === 'get_drive_files') return 'Google Drive document search was temporarily unreachable.';
  if (toolName === 'save_memory' || toolName === 'update_memory') return 'Memory database sync was temporarily unavailable.';
  if (toolName === 'search_receipts' || toolName === 'get_subcontractor_balance') return 'Financial ledger lookup was temporarily unavailable.';
  return 'The requested tool action was temporarily unavailable.';
}

export function formatToolResultsForSynthesis(toolTelemetryList = []) {
  if (!Array.isArray(toolTelemetryList) || toolTelemetryList.length === 0) {
    return 'No tool calls were executed.';
  }

  return toolTelemetryList.map((t, i) => {
    const classification = t.toolType || (t.name.startsWith('save_') || t.name.startsWith('update_') || t.name.startsWith('delete_') ? 'WRITE' : 'READ');
    const sourceTag = t.source ? `[SOURCE: ${t.source}]` : '[SOURCE: Local Project Data]';
    const statusTag = t.status ? `[STATUS: ${String(t.status).toUpperCase()}]` : (t.success ? '[STATUS: OK]' : '[STATUS: ERROR]');
    const dupTag = t.isDuplicate ? ' (Deduplicated idempotent write)' : '';

    if (t.success) {
      const dataPayload = t.data !== undefined ? t.data : t.result;
      return `Tool ${i + 1} [${t.name}] (Type: ${classification}) ${sourceTag} ${statusTag}${dupTag}: SUCCESS\nStructured Data: ${JSON.stringify(dataPayload)}`;
    } else {
      return `Tool ${i + 1} [${t.name}] (Type: ${classification}) ${sourceTag} ${statusTag}: FAILED\nReason: ${t.error || 'Temporary service error'}`;
    }
  }).join('\n\n');
}

/**
 * Granular & Truthful Grounded Source Provenance Detector
 * Resolves exact originating systems based on the user's query, synthesized answer, and context.
 */
export function detectGroundedSourcesUsed(query = '', answerText = '', context = {}) {
  const sources = new Set();
  const q = String(query).toLowerCase();
  const a = String(answerText).toLowerCase();

  // 1. Casual greetings / chit-chat -> No data source used
  if (/^(what'?s up|hey|hello|good (morning|afternoon|evening)|how'?s it going|how are you)[\s!.,?]*$/i.test(q.trim())) {
    return [];
  }

  // 2. Google Sheets: Subcontractor Ledger or Project Financials
  const isBalanceOrCostQuery = /\$|\b(budget|gross budget|build budget|hard cost|draw|draws|spent|paid|owe|balance|cost|expense|receipt|invoice|contract|payment)\b/i.test(q);
  const isFinanceAnswer = /\$|\b(gross budget|working capital|draws paid|remaining balance|quoted|contract balance)\b/i.test(a);

  if (isBalanceOrCostQuery || isFinanceAnswer) {
    if (/\b(electrician|plumber|framing|drywall|painter|hvac|concrete|roofing|subcontractor|sub|payee|contractor|owe|balance)\b/i.test(q) || /\b(subcontractor|ledger|remaining balance|owed)\b/i.test(a)) {
      sources.add('Google Sheets (Subcontractor Ledger)');
    } else {
      sources.add('Google Sheets (Project Financials)');
    }
  }

  // 3. J.A.R.V.I.S. Memory (Persistent Vault)
  if (
    /\b(remember|memory|note|preference|told you|saved note|said about|likes to|prefers)\b/i.test(q) ||
    /\b(saved memor|memory vault|you told me|remembered|saved note)\b/i.test(a)
  ) {
    sources.add('J.A.R.V.I.S. Memory (Persistent Vault)');
  }

  // 4. Field Reminders (SiteTactix App)
  if (
    /\b(reminder|pending reminder|field reminder|task list|to-do|todo|scheduled for tomorrow|remind me)\b/i.test(q) ||
    /\b(field reminder|pending reminder|no specific reminder|reminder list)\b/i.test(a)
  ) {
    if (/\b(field reminder|pending reminder|app reminder|task list|reminder)s?\b/i.test(a) || /\b(field reminder|reminder list|task list)\b/i.test(q)) {
      sources.add('Field Reminders (SiteTactix App)');
    }
    if (/\b(saved memor|memory vault)\b/i.test(a)) {
      sources.add('J.A.R.V.I.S. Memory (Persistent Vault)');
    }
  }

  // 5. Municipal Inspections
  if (
    /\b(inspection|inspector|passed|failed|permit|municipal|city|stage|foundation inspection|framing inspection|plumbing inspection)\b/i.test(q) ||
    /\b(inspection stage|municipal inspection|inspections passed)\b/i.test(a)
  ) {
    sources.add('Municipal Inspections');
  }

  // 6. Google Drive
  if (
    /\b(file|folder|document|pdf|blueprint|plan|drive|google drive|upload|drawing)\b/i.test(q) ||
    /\b(google drive|drive folder|drive tree|pdf)\b/i.test(a)
  ) {
    sources.add('Google Drive');
  }

  // 7. Homeowner Specifications
  if (
    /\b(spec|specification|finish|fixture|paint color|appliance|cabinet|hardware)\b/i.test(q) ||
    /\b(homeowner specification|finish spec)\b/i.test(a)
  ) {
    sources.add('Homeowner Specifications');
  }

  // 8. Site Setup Checklist Database
  if (
    /\b(site setup|mobilization|silt fence|dumpster|porta potty|temp power|temp water)\b/i.test(q) ||
    /\b(site setup|mobilization checklist)\b/i.test(a)
  ) {
    sources.add('Site Setup Checklist Database');
  }

  // 9. Google Docs (Master Purchasing Checklist)
  if (
    /\b(purchasing|purchasing list|checklist|need to buy|still need|bought|hardware fixtures|plumbing list|electrical list|quartz list)\b/i.test(q) ||
    /\b(purchasing checklist|master purchasing|added to|marked as purchased|google doc)\b/i.test(a)
  ) {
    sources.add('Google Docs (Master Purchasing Checklist)');
  }

  return Array.from(sources);
}

/**
 * Multi-Domain Grounding & Anti-Hallucination Guard
 * Cross-checks currency values, numerical figures, contractor entities, and filenames
 * against live project data and verified tool outputs.
 */
export function verifyResponseGrounding(synthesizedText = '', projectContext = {}, toolResults = []) {
  if (!synthesizedText || typeof synthesizedText !== 'string') {
    return {
      status: 'fully_grounded',
      checkedClaimsCount: 0,
      supportedClaims: [],
      unsupportedClaims: [],
      unsupportedEntities: [],
      unsupportedFiles: []
    };
  }

  // 1. Gather all verified ground truth strings
  const groundTruthTokens = [];

  for (const t of (toolResults || [])) {
    if (t.data) groundTruthTokens.push(JSON.stringify(t.data));
    if (t.result) groundTruthTokens.push(JSON.stringify(t.result));
    if (t.files) groundTruthTokens.push(JSON.stringify(t.files));
  }

  if (projectContext.dashboardData) groundTruthTokens.push(JSON.stringify(projectContext.dashboardData));
  if (projectContext.dashData) groundTruthTokens.push(JSON.stringify(projectContext.dashData));
  if (projectContext.driveTree) groundTruthTokens.push(JSON.stringify(projectContext.driveTree));
  if (projectContext.driveData) groundTruthTokens.push(JSON.stringify(projectContext.driveData));
  if (projectContext.projectSpecs) groundTruthTokens.push(JSON.stringify(projectContext.projectSpecs));
  if (projectContext.memoriesData) groundTruthTokens.push(JSON.stringify(projectContext.memoriesData));
  if (projectContext.items) groundTruthTokens.push(JSON.stringify(projectContext.items));

  const groundTruth = groundTruthTokens.join(' ').toLowerCase();

  const supportedClaims = [];
  const unsupportedClaims = [];
  const unsupportedEntities = [];
  const unsupportedFiles = [];
  let checkedCount = 0;

  // 2. Financial / Currency Validation ($X,XXX or $XXX)
  const currencyRegex = /\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/g;
  const currencyMatches = [...synthesizedText.matchAll(currencyRegex)];

  for (const m of currencyMatches) {
    checkedCount++;
    const rawVal = m[0]; // e.g. "$4,000"
    const rawNum = m[1].replace(/,/g, ''); // "4000"
    const formattedWithComma = parseFloat(rawNum).toLocaleString('en-US'); // "4,000"

    const isSupported =
      groundTruth.includes(rawVal.toLowerCase()) ||
      groundTruth.includes(rawNum) ||
      groundTruth.includes(formattedWithComma);

    if (isSupported) {
      supportedClaims.push(rawVal);
    } else {
      unsupportedClaims.push(rawVal);
    }
  }

  // 3. Document / Blueprint File Claims (*.pdf, *.dwg, etc.)
  const fileRegex = /\b([a-zA-Z0-9_\-]+\.(?:pdf|dwg|png|jpg|docx|xlsx|csv))\b/gi;
  const fileMatches = [...synthesizedText.matchAll(fileRegex)];

  for (const fm of fileMatches) {
    checkedCount++;
    const fileName = fm[1];
    if (groundTruth.includes(fileName.toLowerCase())) {
      supportedClaims.push(fileName);
    } else {
      unsupportedClaims.push(fileName);
      unsupportedFiles.push(fileName);
    }
  }

  // 4. Contractor / Vendor Entity Claims
  const vendorRegex = /\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*\s+(?:Electric|Plumbing|Framing|Roofing|Masonry|Concrete|HVAC|Supply|Pros|Masters|Services|LLC|Inc|Corp|Contractors?))\b/g;
  const vendorMatches = [...synthesizedText.matchAll(vendorRegex)];

  for (const vm of vendorMatches) {
    checkedCount++;
    const vendorName = vm[1].trim();
    if (groundTruth.includes(vendorName.toLowerCase())) {
      supportedClaims.push(vendorName);
    } else {
      unsupportedClaims.push(vendorName);
      unsupportedEntities.push(vendorName);
    }
  }

  let status = 'fully_grounded';
  if (unsupportedClaims.length > 0) {
    status = supportedClaims.length > 0 ? 'partially_grounded' : 'unsupported_claims_detected';
  }

  return {
    status,
    checkedClaimsCount: checkedCount,
    supportedClaims,
    unsupportedClaims,
    unsupportedEntities,
    unsupportedFiles
  };
}

export function formatToolResultsHumanReadable(toolTelemetryList) {
  const parts = [];
  for (const t of (toolTelemetryList || [])) {
    if (!t.success) {
      parts.push(`(Note: ${t.error || formatUserFriendlyToolError(t.name)})`);
      continue;
    }

    const res = t.result;
    if (!res) continue;

    if (t.name === 'get_weather_for_jobsite') {
      if (res.current) {
        parts.push(`The current weather at the jobsite is ${res.current.temperature_2m || res.current.temp || 75}°F${res.current.condition ? `, ${res.current.condition}` : ''}.`);
      }
    } else if (t.name === 'get_subcontractor_balance' || t.name === 'get_vendor_history') {
      if (res.found && res.results?.length > 0) {
        const item = res.results[0];
        parts.push(`For ${item.phaseName || item.contractor}: Quote is $${item.quote?.toLocaleString()}, Total Paid is $${item.totalPaid?.toLocaleString()}, and Remaining Balance owed is $${item.remainingBalance?.toLocaleString()}.`);
      } else if (res.message) {
        parts.push(res.message);
      }
    } else if (t.name === 'get_project_schedule') {
      if (res.items && res.items.length > 0) {
        parts.push(`There are ${res.totalItems} active checklist items on the project schedule.`);
      }
    } else if (t.name === 'save_memory' || t.name === 'update_memory' || t.name === 'delete_memory') {
      if (res.message) {
        parts.push(res.message);
      }
    } else if (t.name === 'search_memories' || t.name === 'list_memories') {
      if (res.memories && res.memories.length > 0) {
        if (res.memories.length === 1) {
          const m = res.memories[0].text;
          parts.push(m.endsWith('.') ? m : `${m}.`);
        } else {
          const memList = res.memories.map(m => `- ${m.text}`).join('\n');
          parts.push(memList);
        }
      } else if (res.found === false || res.total === 0) {
        parts.push(`I don't have any saved notes or preferences matching that request for this project.`);
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
  forceDeepReasoning = false,
  googleTokenOverride = null
) {
  const clientStartTime = Date.now();
  const correlationId = `corr_${clientStartTime}_${Math.random().toString(36).slice(2, 8)}`;
  const projectId = projectIdOverride || activeProjectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dashData = dashboardOverride || loadProjectDashboard(projectId);
  const driveData = driveTreeOverride || loadDriveTree(projectId);
  const projectSpecs = loadProjectSpecs(projectId);
  const siteSetupProtocol = getSiteSetupProtocol();
  let lastErrorCode = null;
  let toolTelemetryList = [];

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

  let savedPhaseChecks = {};
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('jobscan_phase_checks_' + projectId);
      if (raw) savedPhaseChecks = JSON.parse(raw);
    }
  } catch (_) {}

  // Load All 6 Municipal Inspection Stages with live checklist status
  const inspectionsData = (INSPECTION_STAGES || []).map((stage) => {
    const items = loadInspectionData(projectId, stage.id) || [];
    const stageShortId = stage.id === 'rough-in-plumbing' ? 'plumbing' : stage.id;
    const passedCount = items.filter((i) => i.status === 'pass' || savedPhaseChecks[`${stageShortId}_${i.id}`] || savedPhaseChecks[`${stage.id}_${i.id}`]).length;
    return {
      stageId: stage.id,
      stageName: stage.name,
      icon: stage.icon,
      description: stage.description,
      totalItems: items.length,
      passedCount,
      isFullyPassed: items.length > 0 && passedCount === items.length,
      items: items.map((i) => {
        const isPassed = i.status === 'pass' || savedPhaseChecks[`${stageShortId}_${i.id}`] || savedPhaseChecks[`${stage.id}_${i.id}`];
        return {
          id: i.id,
          title: i.title || i.text || i.name || 'Inspection Item',
          category: i.category || 'General',
          status: isPassed ? 'PASSED' : (i.status === 'fail' ? 'FAILED' : 'PENDING'),
          note: i.note || ''
        };
      })
    };
  });


  // Pre-fetch relevant persistent memories for this lot / project scope
  let memoriesData = [];
  try {
    memoriesData = await searchMemories(query, {
      projectId,
      limit: 8
    });
  } catch (mErr) {
    console.warn('[BuilderBrain] Failed to pre-fetch memories:', mErr);
  }

  const authInstance = getFirebaseAuthInstance();
  const userId = authInstance?.currentUser?.uid || 'default_user';

  let userPreferences = [];
  let userPreferencesPrompt = '';
  try {
    userPreferences = await loadUserPreferences(userId, projectId);
    userPreferencesPrompt = compileUserPreferencesPrompt(userPreferences, projectId);
  } catch (pErr) {
    console.warn('[BuilderBrain] Failed to load user preferences:', pErr);
  }

  const accessToken = googleTokenOverride || (typeof window !== 'undefined' ? (localStorage.getItem('jobscan_google_token') || localStorage.getItem('google_access_token') || localStorage.getItem('gdrive_token')) : null);

  const projectContext = {
    projectId,
    userId,
    accessToken,
    activeProjectName,
    items: reminders,
    pendingR,
    dashboardData: dashData,
    driveTree: driveData,
    projectSpecs,
    siteSetupData,
    inspectionsData,
    memoriesData,
    userPreferences
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
    memoriesData,
    userPreferencesPrompt,
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

  // 1. DIRECT USER PREFERENCE COMMAND PROCESSING
  const prefAnalysis = analyzeInteractionForPreference(query, { activeProjectId: projectId, userId });
  if (prefAnalysis) {
    if (prefAnalysis.type === 'session_opt_out') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('jobscan_session_learning_disabled', 'true');
      }
      return {
        text: "Understood. I will not learn or observe any communication preferences from this conversation.",
        telemetry: {
          modelUsed: determineTaskModel(query, forceDeepReasoning),
          source: 'User Preference Engine',
          intent: 'Session Learning Disabled',
          durationMs: Date.now() - clientStartTime
        }
      };
    }
    if (prefAnalysis.type === 'user_command') {
      if (prefAnalysis.action === 'list_preferences') {
        const listRes = await executeClientToolCall('list_user_preferences', {}, projectContext, correlationId);
        const prefsList = listRes?.preferences || [];
        const text = prefsList.length > 0
          ? `Here is what I've learned about how you work:\n` + prefsList.map((p, i) => `${i + 1}. [${p.scope === 'project' ? `Project: ${p.projectId}` : 'Global'}] ${p.statement}`).join('\n')
          : "I haven't saved any custom communication preferences for you yet. You can tell me how you prefer answers (for example: \"Remember that I always want the bottom line first\").";
        return {
          text,
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'User Preference Engine',
            intent: 'List Preferences',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'list_user_preferences', result: listRes }]
          }
        };
      }
      if (prefAnalysis.action === 'reset_all_preferences') {
        const resetRes = await executeClientToolCall('reset_user_preferences', { confirm: true }, projectContext, correlationId);
        return {
          text: "I've reset and cleared all learned communication preferences and behavioral habits.",
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'User Preference Engine',
            intent: 'Reset Preferences',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'reset_user_preferences', result: resetRes }]
          }
        };
      }
      if (prefAnalysis.action === 'deactivate_specific') {
        const deactRes = await executeClientToolCall('deactivate_user_preference', { searchQuery: prefAnalysis.target }, projectContext, correlationId);
        return {
          text: deactRes?.message || `I've removed that preference.`,
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'User Preference Engine',
            intent: 'Deactivate Preference',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'deactivate_user_preference', result: deactRes }]
          }
        };
      }
    }
    if (prefAnalysis.type === 'explicit_preference') {
      const savePrefRes = await saveUserPreference(userId, {
        preferenceStatement: prefAnalysis.preferenceStatement,
        inferredIntent: prefAnalysis.inferredIntent,
        category: prefAnalysis.category,
        source: PREFERENCE_SOURCES.EXPLICIT,
        scope: prefAnalysis.scope,
        projectId: prefAnalysis.projectId,
        confidence: 1.0,
        status: PREFERENCE_STATUS.ACTIVE
      });
      return {
        text: `Got it. I've saved your preference: "${prefAnalysis.preferenceStatement}" as your persistent ${prefAnalysis.scope} default.`,
        telemetry: {
          modelUsed: determineTaskModel(query, forceDeepReasoning),
          source: 'User Preference Engine',
          intent: 'Explicit Preference Saved',
          durationMs: Date.now() - clientStartTime,
          preference: savePrefRes
        }
      };
    }
  }

  // 1.0. COGNITIVE INITIATIVE PENDING CONFIRMATION RESOLVER
  _activeSessionCognitiveState.turnIndex++;
  const pendingCheck = resolvePendingSuggestionConfirmation(query, _activeSessionCognitiveState);
  if (pendingCheck && pendingCheck.isConfirmed) {
    recordSuggestionOutcome(userId, pendingCheck.domain, INITIATIVE_OUTCOMES.ACCEPTED, pendingCheck.originalSuggestion);
    const action = pendingCheck.pendingAction;
    _activeSessionCognitiveState.pendingProactiveSuggestion = null;

    try {
      const toolRes = await executeClientToolCall(action.toolName, action.args || {}, projectContext, correlationId);
      const provenanceSource = toolRes.source || action.provenanceSource || 'Municipal Inspections';
      
      let replyText = '';
      if (action.toolName === 'get_municipal_inspections') {
        const stages = toolRes.stages || [];
        const pendingStages = stages.filter(s => !s.isPassed);
        if (pendingStages.length > 0) {
          const stageList = pendingStages.slice(0, 3).map(s => `- ${s.title} (${s.pendingItemsCount || 0} pending items)`).join('\n');
          replyText = `Here is the current municipal inspection status for ${activeProjectName}:\n${stageList}`;
        } else {
          replyText = `All municipal inspection stages are currently marked passed for ${activeProjectName}.`;
        }
      } else if (action.toolName === 'get_project_schedule') {
        const items = toolRes.items || [];
        if (items.length > 0) {
          const itemList = items.slice(0, 3).map(i => `- ${i.title || i.phase || i.name}`).join('\n');
          replyText = `Here is what is currently active in field reminders for ${activeProjectName}:\n${itemList}`;
        } else {
          replyText = `Everything is currently up to date on ${activeProjectName} with no pending items.`;
        }
      } else if (action.toolName === 'get_weather_for_jobsite') {
        replyText = `The current forecast for ${activeProjectName} shows ${toolRes.forecast || toolRes.condition || 'clear conditions'}.`;
      } else {
        replyText = `Done. Here is the verified status for ${activeProjectName}.`;
      }

      return {
        text: replyText,
        telemetry: {
          modelUsed: 'Cognitive Action Dispatcher',
          source: provenanceSource,
          intent: 'Proactive Action Confirmed',
          durationMs: Date.now() - clientStartTime,
          sourcesUsed: [provenanceSource],
          toolsExecuted: [{ name: action.toolName, args: action.args, source: provenanceSource, result: toolRes }]
        }
      };
    } catch (actErr) {
      console.warn('[BuilderBrain] Proactive action execution failed:', actErr);
    }
  } else if (pendingCheck && pendingCheck.isRejected) {
    recordSuggestionOutcome(userId, pendingCheck.domain, INITIATIVE_OUTCOMES.REJECTED);
    _activeSessionCognitiveState.pendingProactiveSuggestion = null;
    return {
      text: "Understood. I won't check that.",
      telemetry: {
        modelUsed: 'Cognitive Engine',
        source: 'User Preference Engine',
        intent: 'Proactive Suggestion Rejected',
        durationMs: Date.now() - clientStartTime,
        sourcesUsed: []
      }
    };
  }

  // 1.1. CONVERSATION ENDING SIGN-OFF
  if (isConversationEnding(query)) {
    _activeSessionCognitiveState.pendingProactiveSuggestion = null;
    return {
      text: `You're welcome. Let me know when you need anything on ${activeProjectName}.`,
      telemetry: {
        modelUsed: 'Cognitive Engine',
        source: 'Conversational State',
        intent: 'Sign Off',
        durationMs: Date.now() - clientStartTime,
        sourcesUsed: []
      }
    };
  }

  // 1.2. EVALUATE COGNITIVE INITIATIVE
  const cognitiveDecision = evaluateCognitiveInitiative({
    query,
    conversationHistory: contents,
    context: projectContext,
    preferences: userPreferences,
    sessionState: _activeSessionCognitiveState
  });

  if (cognitiveDecision.warranted) {
    _activeSessionCognitiveState.pendingProactiveSuggestion = {
      id: `sug_${Date.now()}`,
      domain: cognitiveDecision.domain,
      topic: cognitiveDecision.topic,
      suggestionText: cognitiveDecision.suggestionText,
      suggestedAction: cognitiveDecision.suggestedAction
    };
    _activeSessionCognitiveState.lastSuggestionTurn = _activeSessionCognitiveState.turnIndex;
  } else {
    if (_activeSessionCognitiveState.pendingProactiveSuggestion) {
      recordSuggestionOutcome(userId, _activeSessionCognitiveState.pendingProactiveSuggestion.domain, INITIATIVE_OUTCOMES.IGNORED);
      _activeSessionCognitiveState.pendingProactiveSuggestion = null;
    }
  }

  // 1.3. DIRECT EXPLICIT MEMORY COMMAND PROCESSING
  const qTrim = query.trim();
  const rememberMatch = qTrim.match(/^(?:i need you to |please )?remember (?:that )?(.+)$/i) 
    || qTrim.match(/^(?:make a note|take note|save (?:this )?(?:for later|to memory)?|keep (?:this )?in mind)(?: that|:)? (.+)$/i);

  const updateMatch = qTrim.match(/^(?:hey,? )?(?:actually,? )?(?:we need to |please )?(?:change|update)(?: that[.,]?)?(?: note| preference| memory)? (?:to|that)?[:\s]*(.+)$/i)
    || qTrim.match(/^(?:actually,? )?(?:the painter|he|she|they) (?:wants|prefers) (?:to be paid by )?(.+) now[.,]?$/i);

  const forgetMatch = qTrim.match(/^(?:forget|delete|remove)(?: what i told you about| that note about| the note about| that)? (.+)$/i);

  if (rememberMatch && !rememberMatch[1].toLowerCase().startsWith('what') && !rememberMatch[1].toLowerCase().startsWith('how') && !rememberMatch[1].toLowerCase().startsWith('where')) {
    const textToSave = rememberMatch[1].trim();
    try {
      const saveRes = await executeClientToolCall('save_memory', {
        text: textToSave,
        projectId
      }, projectContext);

      if (saveRes && saveRes.saved) {
        return {
          text: "Got it. I've saved that to your memory.",
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Memory Engine',
            intent: 'Memory Saved',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'save_memory', args: { text: textToSave, projectId }, result: saveRes }]
          }
        };
      }
    } catch (sErr) {
      console.warn('[BuilderBrain] Direct memory save fallback failed:', sErr);
    }
  } else if (updateMatch) {
    const updatedText = updateMatch[1].trim();
    try {
      const updateRes = await executeClientToolCall('update_memory', {
        updatedText,
        projectId,
        searchQuery: updatedText
      }, projectContext);

      if (updateRes && updateRes.updated) {
        return {
          text: "Got it. I've updated that memory.",
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Memory Engine',
            intent: 'Memory Updated',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'update_memory', args: { updatedText, projectId }, result: updateRes }]
          }
        };
      }
    } catch (uErr) {
      console.warn('[BuilderBrain] Direct memory update fallback failed:', uErr);
    }
  } else if (forgetMatch) {
    const searchQuery = forgetMatch[1].trim();
    try {
      const deleteRes = await executeClientToolCall('delete_memory', {
        searchQuery,
        projectId
      }, projectContext);

      if (deleteRes && deleteRes.deleted) {
        return {
          text: "Got it. I've removed that from your active memory.",
          telemetry: {
            modelUsed: determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Memory Engine',
            intent: 'Memory Deleted',
            durationMs: Date.now() - clientStartTime,
            toolsExecuted: [{ name: 'delete_memory', args: { searchQuery, projectId }, result: deleteRes }]
          }
        };
      }
    } catch (dErr) {
      console.warn('[BuilderBrain] Direct memory delete fallback failed:', dErr);
    }
  }

  // 2. REMOTE CLOUD AI INFERENCE WITH FULL GROUNDED MANIFEST (25s timeout + 1s single retry)
  const CLIENT_REQUEST_TIMEOUT_MS = 25000;
  let apiRes = null;
  let attempt1Start = Date.now();
  let attempt1DurationMs = 0;
  let attempt2DurationMs = 0;
  let retryOccurred = false;
  let retryReason = null;

  try {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const auth = getFirebaseAuthInstance();
      const user = auth?.currentUser;
      if (user) {
        const idToken = await user.getIdToken();
        if (idToken) {
          headers.Authorization = `Bearer ${idToken}`;
        }
      }
    } catch (_) {}

    const reqPayload = JSON.stringify({
      contents,
      systemInstruction,
      query,
      forceDeepReasoning,
      apiKey: effectiveKey
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

      apiRes = await fetch('/api/ask-brain', {
        method: 'POST',
        headers,
        body: reqPayload,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      attempt1DurationMs = Date.now() - attempt1Start;
      if (!apiRes.ok && apiRes.status >= 500) {
        throw new Error(`Server error ${apiRes.status}`);
      }
    } catch (firstErr) {
      attempt1DurationMs = Date.now() - attempt1Start;
      retryOccurred = true;
      retryReason = firstErr.name === 'AbortError' || attempt1DurationMs >= (CLIENT_REQUEST_TIMEOUT_MS - 500)
        ? 'FIRST_ATTEMPT_TIMEOUT'
        : (firstErr.message || 'FIRST_ATTEMPT_NETWORK_ERROR');

      // Single 1-second retry on network timeout/drop before local fallback
      await new Promise(resolve => setTimeout(resolve, 1000));
      const attempt2Start = Date.now();
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), CLIENT_REQUEST_TIMEOUT_MS);

      apiRes = await fetch('/api/ask-brain', {
        method: 'POST',
        headers,
        body: reqPayload,
        signal: retryController.signal
      });
      clearTimeout(retryTimeoutId);
      attempt2DurationMs = Date.now() - attempt2Start;
    }

    if (apiRes.ok) {
      const data = await apiRes.json();

      // If Gemini requested a tool execution (e.g. weather, memory, balance lookup)
      if (data && data.toolCalls && data.toolCalls.length > 0) {
        for (const tc of data.toolCalls) {
          const toolStartTime = Date.now();
          try {
            const result = await executeClientToolCall(tc.name, tc.args || {}, projectContext, correlationId);
            const durationMs = result._executionDurationMs || (Date.now() - toolStartTime);

            if (result && (result.error || result.success === false)) {
              toolTelemetryList.push({
                name: tc.name,
                args: tc.args,
                toolType: result.toolType || (tc.name.startsWith('save_') || tc.name.startsWith('update_') || tc.name.startsWith('delete_') ? 'WRITE' : 'READ'),
                source: result.source || 'Local Project Data',
                status: 'error',
                success: false,
                isDuplicate: false,
                durationMs,
                error: result.error || formatUserFriendlyToolError(tc.name)
              });
            } else {
              toolTelemetryList.push({
                name: tc.name,
                args: tc.args,
                toolType: result.toolType || (tc.name.startsWith('save_') || tc.name.startsWith('update_') || tc.name.startsWith('delete_') ? 'WRITE' : 'READ'),
                source: result.source || 'Local Project Data',
                status: result.status || 'ok',
                success: true,
                isDuplicate: Boolean(result.isDuplicate),
                idempotencyKey: result.idempotencyKey || null,
                durationMs,
                data: result.data !== undefined ? result.data : result,
                result
              });
            }
          } catch (tErr) {
            const friendlyError = formatUserFriendlyToolError(tc.name);
            toolTelemetryList.push({
              name: tc.name,
              args: tc.args,
              toolType: tc.name.startsWith('save_') || tc.name.startsWith('update_') || tc.name.startsWith('delete_') ? 'WRITE' : 'READ',
              source: 'Local Project Data',
              status: 'error',
              success: false,
              isDuplicate: false,
              durationMs: Date.now() - toolStartTime,
              error: friendlyError
            });
          }
        }

        // Collect exact provenance strictly from executed tools
        const sourcesUsedSet = new Set();
        for (const t of toolTelemetryList) {
          if (t.source) sourcesUsedSet.add(t.source);
        }
        const sourcesUsed = Array.from(sourcesUsedSet);

        const toolsSucceeded = toolTelemetryList.filter(t => t.success).map(t => ({
          name: t.name,
          args: t.args || {},
          source: t.source,
          result: t.result
        }));
        const toolsFailed = toolTelemetryList.filter(t => !t.success).map(t => ({ name: t.name, error: t.error }));

        // 2. Perform Second-Pass Multi-Intent Synthesis via Gemini Cloud AI
        // forceNoTools: true is strictly enforced to guarantee no infinite loops
        const synthesisPrompt = `${systemInstruction}

[MULTI-INTENT TOOL EXECUTION OUTCOMES]
The user issued a request that required tool execution and/or project data retrieval.
Tool Outcomes:
${formatToolResultsForSynthesis(toolTelemetryList)}

SYNTHESIS INSTRUCTIONS & GROUNDING RULES:
1. You MUST directly address EVERY part, intent, and question in the user's original request.
2. STRICT GROUNDING RULE: You may ONLY state financial figures, dollar amounts, contractor quotes, balances, payments, and dates that appear EXACTLY in the project manifest or tool outcomes above. Do NOT invent, assume, or estimate numbers.
3. If a tool succeeded (e.g. saving a reminder/memory), clearly confirm it in your response.
4. If a tool failed, clearly and concisely report what couldn't be completed (e.g. "The weather service was temporarily unavailable") without technical jargon.
5. Provide ONE single, unified, coherent, and professional answer.`;

        let synthesisText = null;
        try {
          const synthController = new AbortController();
          const synthTimeoutId = setTimeout(() => synthController.abort(), 15000);

          const synthRes = await fetch('/api/ask-brain', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              contents,
              systemInstruction: synthesisPrompt,
              query,
              forceDeepReasoning: true,
              forceNoTools: true,
              apiKey: effectiveKey
            }),
            signal: synthController.signal
          });
          clearTimeout(synthTimeoutId);

          if (synthRes.ok) {
            const synthData = await synthRes.json();
            if (synthData?.text) {
              synthesisText = synthData.text.trim();
            }
          }
        } catch (sErr) {
          console.warn('[BuilderBrain] Second-pass synthesis request failed, using grounded fallback combiner:', sErr);
        }

        if (synthesisText) {
          const groundingReport = verifyResponseGrounding(synthesisText, projectContext, toolTelemetryList);

          return {
            text: synthesisText,
            telemetry: {
              schemaVersion: '1.0',
              correlationId,
              modelUsed: data.telemetry?.modelUsed || determineTaskModel(query, true),
              source: 'Gemini Cloud AI (Two-Pass Orchestration)',
              intent: 'Multi-Intent Tool Synthesis',
              durationMs: Date.now() - clientStartTime,
              intentsCount: toolTelemetryList.length + (query.toLowerCase().includes('how much') || query.toLowerCase().includes('what') || query.toLowerCase().includes('who') ? 1 : 0),
              toolsRequested: data.toolCalls.map(t => t.name),
              toolsExecuted: toolsSucceeded.map(t => typeof t === 'string' ? t : t.name),
              toolsFailed: toolsFailed,
              circuitBreakerStatus: {
                weather: circuitBreaker.getStatus('get_weather_for_jobsite')
              },
              tools: toolTelemetryList.map(t => ({
                schemaVersion: '1.0',
                correlationId,
                name: t.name,
                type: t.toolType,
                source: t.source,
                status: t.status,
                durationMs: t.durationMs,
                isDuplicate: t.isDuplicate,
                error: t.error || null
              })),
              grounding: groundingReport,
              groundingStatus: groundingReport.status,
              synthesisMode: 'cloud_synthesis',
              sourcesUsed,
              memoriesGroundedCount: memoriesData?.length || 0
            }
          };
        }

        // Grounded fallback if synthesis network failed
        const cleanSummary = formatToolResultsHumanReadable(toolTelemetryList);
        const fallbackGrounding = verifyResponseGrounding(cleanSummary || '', projectContext, toolTelemetryList);

        return {
          text: cleanSummary || 'Action completed.',
          telemetry: {
            modelUsed: data.telemetry?.modelUsed || determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Cloud AI',
            intent: 'Tool Augmented Response',
            durationMs: Date.now() - clientStartTime,
            intentsCount: toolTelemetryList.length,
            toolsRequested: data.toolCalls.map(t => t.name),
            toolsExecuted: toolsSucceeded.map(t => typeof t === 'string' ? t : t.name),
            toolsFailed: toolsFailed,
            tools: toolTelemetryList.map(t => ({
              name: t.name,
              type: t.toolType,
              source: t.source,
              status: t.status,
              durationMs: t.durationMs,
              isDuplicate: t.isDuplicate,
              error: t.error || null
            })),
            grounding: fallbackGrounding,
            groundingStatus: fallbackGrounding.status,
            synthesisMode: 'grounded_fallback',
            sourcesUsed,
            cognitiveInitiative: cognitiveDecision,
            memoriesGroundedCount: memoriesData?.length || 0,
            latencyMetrics: {
              attempt1DurationMs,
              attempt2DurationMs,
              retryOccurred,
              retryReason,
              totalDurationMs: Date.now() - clientStartTime,
              latencyHealth: retryOccurred ? 'RECOVERED_RETRY_UX_WARNING' : (Date.now() - clientStartTime > 5000 ? 'ELEVATED' : 'OPTIMAL')
            }
          }
        };
      }

      if (data && data.text) {
        let finalReply = data.text.trim();

        // If cognitive initiative determined a high-value suggestion is warranted on an observation
        if (cognitiveDecision.warranted && cognitiveDecision.suggestionText && !finalReply.includes('?') && !finalReply.includes(cognitiveDecision.suggestionText)) {
          finalReply = `${finalReply} ${cognitiveDecision.suggestionText}`;
        }

        const sourcesUsed = detectGroundedSourcesUsed(query, finalReply, projectContext);

        return {
          text: finalReply,
          telemetry: {
            modelUsed: data.telemetry?.modelUsed || determineTaskModel(query, forceDeepReasoning),
            source: 'Gemini Cloud AI',
            intent: data.telemetry?.intent || (forceDeepReasoning ? 'Forced Deep Reasoning' : 'Standard Response'),
            durationMs: Date.now() - clientStartTime,
            sourcesUsed: sourcesUsed,
            cognitiveInitiative: cognitiveDecision,
            memoriesGroundedCount: memoriesData?.length || 0,
            toolsExecuted: [],
            latencyMetrics: {
              attempt1DurationMs,
              attempt2DurationMs,
              retryOccurred,
              retryReason,
              totalDurationMs: Date.now() - clientStartTime,
              latencyHealth: retryOccurred ? 'RECOVERED_RETRY_UX_WARNING' : (Date.now() - clientStartTime > 5000 ? 'ELEVATED' : 'OPTIMAL')
            }
          }
        };
      }
    } else {
      lastErrorCode = apiRes.status;
    }
  } catch (err) {
    lastErrorCode = 'NETWORK_TIMEOUT';
  }

  // 3. FAST LOCAL LEDGER & PERSISTENT MEMORY FALLBACK
  if (memoriesData && memoriesData.length > 0) {
    const memSummary = memoriesData.map(m => `- ${m.text}`).join('\n');
    return {
      text: `According to my memory:\n${memSummary}`,
      telemetry: {
        modelUsed: 'Local Memory Engine',
        source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
        intent: 'Memory Retrieval',
        durationMs: Date.now() - clientStartTime,
        toolsExecuted: [],
        latencyMetrics: {
          attempt1DurationMs,
          attempt2DurationMs,
          retryOccurred,
          retryReason,
          totalDurationMs: Date.now() - clientStartTime,
          latencyHealth: 'OFFLINE_FALLBACK'
        }
      }
    };
  }

  return {
    text: `That request took longer than the expected response window, so I switched to local mode. All your project financials, schedule, and files for ${activeProjectName} are active locally. What specific record would you like to check?`,
    telemetry: {
      modelUsed: 'Local Fast Ledger Engine',
      source: 'Local Project Ledger',
      intent: 'Local Mode Switch',
      durationMs: Date.now() - clientStartTime,
      toolsExecuted: [],
      errorCode: lastErrorCode,
      latencyMetrics: {
        attempt1DurationMs,
        attempt2DurationMs,
        retryOccurred,
        retryReason,
        totalDurationMs: Date.now() - clientStartTime,
        latencyHealth: 'OFFLINE_FALLBACK'
      }
    }
  };
}
