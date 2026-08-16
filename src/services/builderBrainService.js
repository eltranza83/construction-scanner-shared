import { INSPECTION_STAGES } from './inspectionService';

const GLOBAL_PHASES_STORAGE_KEY = 'jobscan_global_phase_protocols_v4';
const LEGACY_GLOBAL_PHASES_KEY = 'jobscan_global_phase_protocols_v3';
const GLOBAL_SITE_SETUP_KEY = 'jobscan_global_site_setup_protocol_v2';

export function loadGlobalSiteSetupProtocol(defaultProtocol) {
  try {
    const raw = localStorage.getItem(GLOBAL_SITE_SETUP_KEY);
    if (!raw) return defaultProtocol;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.preTradeNotes || parsed.preTradeNotes.length === 0) {
      return defaultProtocol;
    }
    return parsed;
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

export function resetGlobalSiteSetupProtocol(defaultProtocol) {
  try {
    localStorage.removeItem(GLOBAL_SITE_SETUP_KEY);
    return defaultProtocol;
  } catch (e) {
    console.error('Error resetting global site setup protocol:', e);
    return defaultProtocol;
  }
}

export function loadGlobalPhases(defaultPhases) {
  try {
    const historicalKeys = [
      GLOBAL_PHASES_STORAGE_KEY,
      LEGACY_GLOBAL_PHASES_KEY,
      'jobscan_global_phase_protocols_v2',
      'jobscan_global_phase_protocols'
    ];

    // Collect all stored phase versions to harvest user-added custom notes/checklists
    const storedPhaseSets = [];
    for (const key of historicalKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            storedPhaseSets.push(parsed);
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (storedPhaseSets.length === 0) {
      saveGlobalPhases(defaultPhases);
      return defaultPhases;
    }

    const migrated = defaultPhases.map((defPhase) => {
      // Find matches in stored phase sets
      const matches = storedPhaseSets
        .map((set) => set.find((p) => p.id === defPhase.id))
        .filter(Boolean);

      if (matches.length === 0) return defPhase;

      if (defPhase.hasSubcategories) {
        const subcategories = defPhase.subcategories.map((defSub) => {
          // Aggregate pre-notes across all matching historical subcategories
          const allPreNotes = [...(defSub.preTradeNotes || [])];
          const allChecklist = [...(defSub.inspectionChecklist || [])];
          const checkIds = new Set(allChecklist.map((c) => (c.text || c).trim().toLowerCase()));

          for (const match of matches) {
            const matchSub = match.subcategories?.find((s) => s.id === defSub.id);
            if (matchSub) {
              if (Array.isArray(matchSub.preTradeNotes)) {
                for (const note of matchSub.preTradeNotes) {
                  if (note && typeof note === 'string' && !allPreNotes.includes(note.trim())) {
                    allPreNotes.push(note.trim());
                  }
                }
              }
              if (Array.isArray(matchSub.inspectionChecklist)) {
                for (const item of matchSub.inspectionChecklist) {
                  const txt = (item.text || item || '').trim();
                  const key = txt.toLowerCase();
                  if (txt && !checkIds.has(key)) {
                    checkIds.add(key);
                    allChecklist.push(typeof item === 'object' ? item : { id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), text: txt });
                  }
                }
              }
            }
          }

          return {
            ...defSub,
            preTradeNotes: allPreNotes,
            inspectionChecklist: allChecklist
          };
        });

        return {
          ...defPhase,
          hasSubcategories: true,
          subcategories
        };
      }

      // Flat Phase: aggregate all pre-trade notes and checklists across matches
      const allPreNotes = [...(defPhase.preTradeNotes || [])];
      const allChecklist = [...(defPhase.inspectionChecklist || [])];
      const checkIds = new Set(allChecklist.map((c) => (c.text || c).trim().toLowerCase()));

      for (const match of matches) {
        if (Array.isArray(match.preTradeNotes)) {
          for (const note of match.preTradeNotes) {
            if (note && typeof note === 'string' && !allPreNotes.includes(note.trim())) {
              allPreNotes.push(note.trim());
            }
          }
        }
        if (Array.isArray(match.inspectionChecklist)) {
          for (const item of match.inspectionChecklist) {
            const txt = (item.text || item || '').trim();
            const key = txt.toLowerCase();
            if (txt && !checkIds.has(key)) {
              checkIds.add(key);
              allChecklist.push(typeof item === 'object' ? item : { id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6), text: txt });
            }
          }
        }
      }

      return {
        ...defPhase,
        hasSubcategories: false,
        preTradeNotes: allPreNotes,
        inspectionChecklist: allChecklist
      };
    });

    saveGlobalPhases(migrated);
    return migrated;
  } catch (e) {
    console.error('Error loading global phase protocols:', e);
    return defaultPhases;
  }
}

export function saveGlobalPhases(phases) {
  try {
    localStorage.setItem(GLOBAL_PHASES_STORAGE_KEY, JSON.stringify(phases));
  } catch (e) {
    console.error('Error saving global phase protocols:', e);
  }
}

export function resetGlobalPhases(defaultPhases) {
  try {
    localStorage.removeItem(GLOBAL_PHASES_STORAGE_KEY);
    return defaultPhases;
  } catch (e) {
    console.error('Error resetting global phase protocols:', e);
    return defaultPhases;
  }
}

const SPECS_STORAGE_PREFIX = 'jobscan_finish_specs_';

export function loadProjectSpecs(projectId = 'default') {
  try {
    const raw = localStorage.getItem(`${SPECS_STORAGE_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error loading finish specs:', err);
    return [];
  }
}

export function saveProjectSpecs(projectId = 'default', specs = []) {
  try {
    localStorage.setItem(`${SPECS_STORAGE_PREFIX}${projectId}`, JSON.stringify(specs));
  } catch (err) {
    console.error('Error saving finish specs:', err);
  }
}

export function playChimeAlert() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    osc2.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (err) {
    console.warn('Audio chime warning:', err);
  }
}

export function loadProjectDashboard(projectId) {
  try {
    if (!projectId) return null;
    const raw = localStorage.getItem(`jobscan_cached_dashboard_${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error loading cached project dashboard:', e);
    return null;
  }
}

export function formatDashboardContext(dashboardData) {
  if (!dashboardData) return 'No financial dashboard data loaded yet for this project.';
  const info = dashboardData.projectInfo || {};
  const subs = dashboardData.subcontractors || [];
  const cats = dashboardData.categories || [];

  let text = `OVERALL PROJECT FINANCIALS & CAPITAL LEDGER:
- Project Name: ${info.name || 'N/A'}
- Hard Cost Budget (Build): ${info.budgetBuild || '$0.00'}
- Land Acquisition Cost: ${info.budgetLand || '$0.00'}
- Gross Projected Cost: ${info.budgetGross || '$0.00'}
- Real Budget Deposits (Capital): ${info.deposits || '$0.00'}
- Total Spent to Date (Draws): ${info.totalSpent || '$0.00'}
- Net Working Capital Balance: ${info.capitalBalance || '$0.00'}

PHASE & CONTRACTOR EXPENSE BREAKDOWN (${subs.length} Phases Tracked):
`;

  subs.forEach((s) => {
    text += `- Phase: ${s.phase || 'N/A'} | Contractor / Payee: ${s.payee || 'Unassigned'}
    Quote: ${s.originalQuote || '$0.00'} | Total Paid: ${s.totalSpent || s.totalPaid || '$0.00'} | Remaining Balance: ${s.remainingBalance || '$0.00'}
    Material: ${s.totalMaterial || '$0.00'} | Labor: ${s.totalLabor || '$0.00'} | Status: ${s.status || 'Pending'}
`;
    if (s.payments && s.payments.length > 0) {
      text += `    Recorded Payments & Invoices:\n`;
      s.payments.forEach((p) => {
        const amt = p.materialCost !== '$0.00' ? p.materialCost : (p.laborCost !== '$0.00' ? p.laborCost : '$0.00');
        text += `      * Payee/Vendor: ${p.vendor || s.payee || 'Payee'} | Amount: ${amt} | Check/Trans: ${p.checkNumber || 'N/A'} | Date: ${p.date || 'N/A'}\n`;
      });
    }
  });

  return text;
}

export function saveProjectDriveTree(projectId, driveTree) {
  try {
    if (!projectId || !driveTree) return;
    localStorage.setItem(`jobscan_cached_drivetree_${projectId}`, JSON.stringify(driveTree));
  } catch (e) {
    console.error('Error saving cached drive tree:', e);
  }
}

export function loadProjectDriveTree(projectId) {
  try {
    if (!projectId) return null;
    const raw = localStorage.getItem(`jobscan_cached_drivetree_${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error loading cached drive tree:', e);
    return null;
  }
}

export function formatDriveContext(driveTree) {
  if (!driveTree) return 'No Google Drive file manifest loaded yet.';
  let text = 'GOOGLE DRIVE PROJECT FOLDERS & REPOSITORY:\n';
  if (driveTree.directFiles && driveTree.directFiles.length > 0) {
    text += `- Root Project Folder Files:\n` + driveTree.directFiles.map((f) => `  * 📄 ${f.name} (ID: ${f.id})`).join('\n') + '\n';
  }
  if (driveTree.subfolders && driveTree.subfolders.length > 0) {
    text += `- Subfolders & Documents:\n`;
    driveTree.subfolders.forEach((sub) => {
      text += `  📁 ${sub.folderName}/ (${sub.files.length} files)\n`;
      if (sub.files.length > 0) {
        text += sub.files.map((f) => `    - 📄 ${f.name} (ID: ${f.id})`).join('\n') + '\n';
      }
    });
  }
  return text;
}

export function loadProjectSiteSetup(projectId) {
  const defaultProtocol = {
    id: 'site_setup_protocol',
    name: 'Site Setup & Lot Mobilization',
    shortName: 'Site Setup',
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

  const protocol = loadGlobalSiteSetupProtocol(defaultProtocol);
  let checks = {};
  try {
    if (projectId) {
      const raw = localStorage.getItem(`jobscan_sitesetup_checks_${projectId}`);
      if (raw) checks = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading site setup checks:', e);
  }
  return { protocol, checks };
}

export async function askGeminiBrain(query, items = [], activeProjectName = 'General Site', apiKey = null, dashboardData = null, projectId = null, chatHistory = [], driveTree = null) {
  const safeItems = Array.isArray(items) ? items : [];
  // Strict Lot Filtering to prevent cross-lot data leaks
  const cleanLotName = activeProjectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const projectItems = safeItems.filter((i) => {
    if (!i.lot || i.lot === 'General Site') return true;
    const itemLot = i.lot.toLowerCase().replace(/[^a-z0-9]/g, '');
    return itemLot === cleanLotName || cleanLotName.includes(itemLot) || itemLot.includes(cleanLotName);
  });

  const pendingW = projectItems.filter((i) => i.category === 'watchout' && i.status === 'pending');
  const pendingS = projectItems.filter((i) => i.category === 'subcontractor' && i.status === 'pending');
  const pendingR = projectItems.filter((i) => i.category === 'reminder' && i.status === 'pending');

  const dashData = dashboardData || (projectId ? loadProjectDashboard(projectId) : null);
  const financialContext = formatDashboardContext(dashData);

  const driveData = driveTree || (projectId ? loadProjectDriveTree(projectId) : null);
  const driveContext = formatDriveContext(driveData);

  const siteSetupData = loadProjectSiteSetup(projectId);
  const siteSetupProtocol = siteSetupData.protocol;
  const siteSetupChecks = siteSetupData.checks;
  const siteSetupCompleted = siteSetupProtocol.inspectionChecklist.filter((i) => siteSetupChecks[i.id]).length;
  const siteSetupTotal = siteSetupProtocol.inspectionChecklist.length;

  const projectSpecs = projectId ? loadProjectSpecs(projectId) : [];

  const systemInstruction = `You are J.A.R.V.I.S., the refined, highly intelligent AI Co-Pilot and Second Brain for custom home builder Adepec Homes.
Active Lot / Project: ${activeProjectName}

PERSONALITY & MANNERISMS (J.A.R.V.I.S.):
- Speak with the sophisticated, calm, articulate, and respectful manner of J.A.R.V.I.S. from Iron Man.
- Address the user respectfully as "Sir" in English (or "Señor" in Spanish).
- Be crisp, sharp, polite, and thoroughly dependable. Deliver financial figures, vendor quotes, inspection notes, and Drive folders with elegant precision.
- Keep responses naturally concise (1 to 2 short sentences by default) unless the user requests an exhaustive breakdown.

You have direct, complete access to all project data for this build:

1. SITE SETUP & MOBILIZATION PROTOCOL:
Status: ${siteSetupCompleted}/${siteSetupTotal} Checked Off
${siteSetupProtocol.inspectionChecklist.map((c) => `  * [${siteSetupChecks[c.id] ? 'CHECKED' : 'UNCHECKED'}] ${c.text}`).join('\n')}

2. ACTIVE FIELD ITEMS:
- Active Site Watch-Outs (${pendingW.length}):
${pendingW.map((w) => `  * [${w.lot || activeProjectName}] (${w.subcontractor || 'General'}): ${w.title} - Notes: ${w.notes || 'None'}`).join('\n') || '  (None)'}

- Pending Trade Calls (${pendingS.length}):
${pendingS.map((s) => `  * [${s.lot || activeProjectName}] Call ${s.subcontractor || 'Trade'}: ${s.title}`).join('\n') || '  (None)'}

- Scheduled Field Reminders (${pendingR.length}):
${pendingR.map((r) => `  * [${r.lot || activeProjectName}] ${r.title} (Target: ${r.targetDate ? new Date(r.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Flexible'})`).join('\n') || '  (None)'}

3. RECORDED HOMEOWNER FINISH SPECS & PAINT SCHEDULE (${projectSpecs.length}):
${projectSpecs.map((s) => `  * [${s.category || 'Spec'}] ${s.location || 'General'}: ${s.brand ? s.brand + ' ' : ''}${s.code || s.title || ''}${s.sheen ? ' (' + s.sheen + ')' : ''}${s.notes ? ' - Notes: ' + s.notes : ''}`).join('\n') || '  (No finishes logged yet)'}

4. FINANCIALS, BUDGETS, QUOTES & TRANSACTION INVOICES:
${financialContext}

5. GOOGLE DRIVE PROJECT FOLDERS & FILES:
${driveContext}

6. CITY INSPECTION STAGES & PROTOCOLS:
${INSPECTION_STAGES.map((s) => `- ${s.name} (${s.shortName}): ${s.description}`).join('\n')}

CRITICAL BEHAVIOR & ACCURACY RULES:
1. TRADE SYNONYMS & FINANCIAL LEDGER RETRIEVAL (MANDATORY):
When the user asks about ANY trade, contractor, balance, quote, payment, or expense (e.g. "electrician", "plumber", "concrete guy", "framer", "painter", "roofer", "HVAC / AC guy", "sheetrock / drywall", "Kike", "Vallejo", etc.):
- NEVER do a simple literal name search. Always cross-reference ALL three dimensions:
  1. The Phase Name (e.g. "electrician" matches the "Electrical & Lighting" phase; "plumber" matches "Plumbing Rough-In"; "concrete guy" matches "Foundation & Concrete", etc.)
  2. The Contractor / Payee Name (e.g. "Kike Vallejo")
  3. The Recorded Payments & Invoices list under each phase
- If a phase or contractor is in the PHASE & CONTRACTOR EXPENSE BREAKDOWN, immediately state their exact numbers on the very first try (Quote, Total Paid, and Remaining Balance, e.g. "For the Electrical & Lighting phase, the total quote is $15,000.00, with $5,000.00 paid to Kike Vallejo, leaving a remaining balance of $10,000.00, Sir.").
- NEVER say there is no invoice or record without checking both the trade/phase category AND the payee name.

2. DIRECT FACTUAL ANSWERS:
Answer questions immediately with precise project facts. Never give evasive generic answers. Address the user as "Sir" (or "Señor").

3. CONVERSATIONAL PRONOUNS & FOLLOW-UPS:
Always use recent chat messages to resolve pronouns. If the previous message discussed "4 subfolders" and the user asks "can you tell me what they are what they're called" or "list them", immediately list the exact names of those 4 subfolders!

4. GREETINGS ONLY ON PURE PLEASANTRIES:
Reply with a greeting ONLY if the user solely sent a greeting ("hello", "hi", "good morning", "buenos días") without asking a question.

5. DEFAULT CONCISENESS (1-2 SHORT SENTENCES):
Deliver the exact answer, list of names, vendor, date, or number requested in 1 to 2 direct sentences.

6. ON-DEMAND DETAIL MODE:
Provide comprehensive lists or deep breakdowns only when explicitly requested ("give me all details", "full breakdown", "itemized list").

7. SPEECH RECOGNITION TOLERANCE:
Understand voice-dictation typos without correcting the user.

8. FULL BILINGUAL ENGLISH & SPANISH SUPPORT:
Fluently match English or Spanish automatically.

9. GOOGLE DRIVE DIRECT FOLDER ACTIONS:
You HAVE FULL PERMISSIONS to create and delete folders in the project's Google Drive folder!
- When the user asks to create/make/add a folder or subfolder in English or Spanish (e.g. "can you create a new sub folder for this project in Google Drive called test folder", "crea una carpeta llamada Planos"), you MUST include this exact tag in your response:
[[ACTION:CREATE_FOLDER:Folder Name]]
Along with a short 1-sentence confirmation (e.g. "Created the new subfolder **Folder Name** in your Google Drive project folder!").
- When the user asks to delete/trash a folder, include:
[[ACTION:DELETE_FOLDER:Folder Name]]
Along with a short 1-sentence confirmation.

10. PUNCH LIST & TASK TRACKING:
Physical site defects, punch list items, and blueprint markers are tracked under the X-Ray Punch List & Blueprint Pinboard. When the user mentions a punch list defect, remind them it can be pinned with photo attachments in X-Ray / Punch List.

11. REAL-TIME GOOGLE SEARCH & LIVE WEB PRICING:
You HAVE active Google Search capability enabled!
- When the user asks about current market pricing, quotes, unit specs, local building supplies (Home Depot, Lowes, Ferguson, 84 Lumber, etc.), or material availability:
  * NEVER say "I will have the figures ready in a moment" or pretend to be surveying in the background.
  * Search Google immediately and deliver the real, current dollar pricing, vendor names, and item specifications in your immediate response!

12. CRITICAL SPREADSHEET IMMUTABILITY & SAFETY (READ-ONLY):
The Google Sheet / spreadsheet in the project folder contains master bookkeeping and data entry (expenses, payments, budgets, invoices).
- You are PERMANENTLY FORBIDDEN from ever editing, modifying, writing to, or deleting any Google Sheet or spreadsheet file.
- You have READ-ONLY permission to answer financial and budget questions.
- If requested to modify or delete a spreadsheet, state that spreadsheets are permanently protected in read-only mode.

13. FINISH SELECTIONS & PAINT SCHEDULE RECORDING:
You HAVE FULL PERMISSIONS to record finish selections, paint colors & codes, tile names, grout colors, countertops, and fixtures directly into the project's Homeowner Finish Schedule & dedicated Google Sheet!
- When the user tells you about paint colors, tile, grout, countertops, fixtures, or finishes (in English or Spanish, e.g. "for Lot 3, walls are SW Pure White 7005 flat and cabinets are Extra White 7006", "el piso del baño principal es Daltile Calacatta Gold"):
You MUST include this exact tag in your response:
[[ACTION:ADD_SPEC:{"category":"Paint","location":"Walls","brand":"Sherwin-Williams","code":"Pure White SW 7005","sheen":"Flat","supplier":"Sherwin-Williams","notes":""}]]
If multiple items are given in a single prompt, you can output multiple [[ACTION:ADD_SPEC:...]] tags!
Categories must be one of: "Paint", "Tile & Grout", "Countertops & Flooring", "Fixtures & Hardware", "Exterior", "Appliances & Custom", or "General".
Along with a concise confirmation (e.g. "Recorded **Pure White (SW 7005)** for the walls in the Finish Schedule & Google Sheet, Sir!").
`;

  // Build multi-turn conversational history
  const rawContents = [];
  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    const recent = chatHistory.slice(-8);
    recent.forEach((m) => {
      if (!m.text) return;
      rawContents.push({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      });
    });
  }
  rawContents.push({
    role: 'user',
    parts: [{ text: query }]
  });

  // Ensure first turn is 'user' and roles alternate
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

  // 1. Primary: Query the dedicated Serverless Cloud AI Endpoint (/api/ask-brain)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const apiRes = await fetch('/api/ask-brain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction,
        apiKey: effectiveKey
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.text) {
        return data.text.trim();
      }
    }
  } catch (err) {
    console.warn('Direct /api/ask-brain endpoint note:', err.message);
  }

  // 2. Direct client fallback if API key is provided
  if (effectiveKey && effectiveKey.trim()) {
    const keyClean = effectiveKey.trim();
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
    for (const model of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyClean}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              tools: [{ googleSearch: {} }],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              generationConfig: {
                maxOutputTokens: 1500,
                temperature: 0.3
              }
            }),
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p) => p.text).filter(Boolean).join('\n');
          if (text) return text.trim();
        }
      } catch {
        // continue
      }
    }
  }

  // 3. Fallback: Concise 1-2 sentence local response engine
  const raw = query.toLowerCase().trim();

  // Greetings
  if (
    raw.includes('hello') ||
    raw.includes('hi') ||
    raw.includes('hey') ||
    raw.includes('how are you') ||
    raw.includes("how's it going") ||
    raw.includes('how you doing') ||
    raw.includes('good morning') ||
    raw.includes('good afternoon') ||
    raw.includes('what\'s up')
  ) {
    return `Everything is going well! How can I help you on ${activeProjectName} today?`;
  }

  // Site Setup & Mobilization
  const isSiteSetupQuery =
    raw.includes('site setup') ||
    raw.includes('foresight setup') ||
    raw.includes('four site setup') ||
    raw.includes('for site setup') ||
    raw.includes('site prep') ||
    raw.includes('lot setup') ||
    raw.includes('mobilization') ||
    raw.includes('lot prep') ||
    raw.includes('prep lot') ||
    ((raw.includes('check off') || raw.includes('checklist') || raw.includes('unchecked') || raw.includes('still need to check') || raw.includes('how many things')) &&
      (raw.includes('setup') || raw.includes('site') || raw.includes('lot') || raw.includes('foresight')));

  if (isSiteSetupQuery) {
    const pendingItems = siteSetupProtocol.inspectionChecklist.filter((i) => !siteSetupChecks[i.id]);
    const completedItems = siteSetupProtocol.inspectionChecklist.filter((i) => siteSetupChecks[i.id]);

    if (pendingItems.length === 0) {
      return `Site setup for ${activeProjectName} is 100% complete (${siteSetupTotal}/${siteSetupTotal} items checked off) and ready for Plumbing Rough-In.`;
    }

    if (raw.includes('list') || raw.includes('detail') || raw.includes('what are') || raw.includes('which') || raw.includes('all')) {
      return `Site setup for ${activeProjectName} is at ${completedItems.length}/${siteSetupTotal}. Remaining items:\n` +
        pendingItems.map((item, idx) => `${idx + 1}. ⬜ ${item.text}`).join('\n');
    }

    return `Site setup for ${activeProjectName} is at ${completedItems.length}/${siteSetupTotal} complete with ${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'} remaining: ${pendingItems.map(p => p.text).join(', ')}.`;
  }

  // Financial & Payment queries
  if (
    raw.includes('budget') ||
    raw.includes('spent') ||
    raw.includes('cost') ||
    raw.includes('capital') ||
    raw.includes('expense') ||
    raw.includes('paid') ||
    raw.includes('balance') ||
    raw.includes('quote') ||
    raw.includes('money') ||
    raw.includes('draw') ||
    raw.includes('pay') ||
    raw.includes('who did we pay') ||
    raw.includes('what did we pay') ||
    raw.includes('transaction') ||
    raw.includes('check')
  ) {
    if (dashData && dashData.projectInfo) {
      const info = dashData.projectInfo;
      const subs = dashData.subcontractors || [];

      // Check for specific dollar amount or payment query (e.g. $1,000 or "what was it for")
      const paidPhases = subs.filter((s) => {
        const spent = s.totalSpent ? parseFloat(String(s.totalSpent).replace(/[^0-9.]/g, '')) : 0;
        const paid = s.totalPaid ? parseFloat(String(s.totalPaid).replace(/[^0-9.]/g, '')) : 0;
        return spent > 0 || paid > 0 || (s.payments && s.payments.length > 0);
      });

      const numMatch = raw.match(/\$?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
      const isThousand = raw.includes('thousand');
      const queryAmount = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : (isThousand ? 1000 : null);

      if (queryAmount !== null || raw.includes('what was') || raw.includes('what were') || raw.includes('what did we pay') || raw.includes('who did we pay') || raw.includes('for what') || raw.includes('tied to') || raw.includes('type to') || raw.includes('look closer')) {
        if (paidPhases.length > 0) {
          const matchingPhases = queryAmount !== null
            ? paidPhases.filter((s) => {
              const spent = parseFloat(String(s.totalSpent || s.totalPaid || '0').replace(/[^0-9.]/g, ''));
              return Math.abs(spent - queryAmount) < 0.01;
            })
            : paidPhases;

          const targetPhases = matchingPhases.length > 0 ? matchingPhases : paidPhases;
          const summary = targetPhases
            .map((s) => {
              if (s.payments && s.payments.length > 0) {
                const pItems = s.payments.map((p) => {
                  const v = p.vendor && p.vendor !== 'Unknown Vendor' ? p.vendor : (s.payee || 'Payee');
                  const check = p.checkNumber && p.checkNumber !== 'N/A' ? ` (Check #${p.checkNumber})` : '';
                  const dt = p.date && p.date !== 'N/A' ? ` on ${p.date}` : '';
                  const amt = p.materialCost !== '$0.00' ? p.materialCost : (p.laborCost !== '$0.00' ? p.laborCost : s.totalSpent || '$1,000.00');
                  return `**${s.phase}** paid to **${v}** for **${amt}**${check}${dt}`;
                }).join('; ');
                return pItems;
              }
              return `**${s.phase}** paid to **${s.payee || 'Payee'}** (${s.totalSpent || s.totalPaid || '$0.00'})`;
            })
            .join(', ');

          return `That ${queryAmount ? '$' + queryAmount.toLocaleString() : 'expense'} was for ${summary}.`;
        }
      }

      // Check if querying a specific phase/trade/contractor
      const tradeKeywords = [
        'paint', 'drywall', 'sheetrock', 'roof', 'tile', 'floor', 'stucco', 'mason',
        'cabinet', 'trim', 'carpent', 'window', 'door', 'flatwork', 'insulat', 'foam',
        'clean', 'dumpster', 'fence', 'landscap', 'plumb', 'elect', 'hvac', 'fram',
        'found', 'utility', 'permit', 'paperwork', 'countertop', 'granite', 'quartz', 'glass'
      ];

      const matchedPhase = subs.find((s) => {
        if (!s.phase && !s.payee) return false;
        const pLower = (s.phase || '').toLowerCase();
        const payeeLower = (s.payee || '').toLowerCase();
        if (raw.includes(pLower) || (payeeLower && raw.includes(payeeLower))) return true;
        return tradeKeywords.some((kw) => raw.includes(kw) && (pLower.includes(kw) || payeeLower.includes(kw)));
      });

      if (matchedPhase) {
        const spent = matchedPhase.totalSpent || matchedPhase.totalPaid || '$0.00';
        const bal = matchedPhase.remainingBalance || '$0.00';
        const quote = matchedPhase.originalQuote || '$0.00';
        const payee = matchedPhase.payee || 'Unassigned';

        if (raw.includes('balance') || raw.includes('owe') || raw.includes('due')) {
          return `Your **${matchedPhase.phase}** contractor (${payee}) has a remaining balance of **${bal}** due (Original quote: ${quote}, Paid: ${spent}).`;
        }
        if (raw.includes('quote') || raw.includes('estimate') || raw.includes('bid')) {
          return `The original quote for **${matchedPhase.phase}** (${payee}) is **${quote}** (Paid: ${spent}, Remaining balance: ${bal}).`;
        }
        if (raw.includes('paid') || raw.includes('spent') || raw.includes('for')) {
          return `You have paid **${spent}** to date for **${matchedPhase.phase}** (${payee}) with a remaining balance of **${bal}**.`;
        }
        return `**${matchedPhase.phase}** (${payee}): Quote: **${quote}**, Paid: **${spent}**, Remaining Balance: **${bal}**.`;
      }

      const specificTradeInQuery = tradeKeywords.some((kw) => raw.includes(kw));
      if (specificTradeInQuery) {
        return `No recorded contractor quote or payment was found for that trade in your **${activeProjectName}** dashboard sheet.`;
      }

      return `For **${activeProjectName}**, your hard cost budget is **${info.budgetBuild || '$0.00'}**, with **${info.totalSpent || '$0.00'}** spent to date and **${info.capitalBalance || '$0.00'}** working capital remaining.`;
    } else {
      return `No cached financial data found for **${activeProjectName}**. Open the Dashboard tab once to pull the latest numbers.`;
    }
  }

  // Reminders
  if (raw.includes('reminder') || raw.includes('schedule') || raw.includes('today') || raw.includes('alarm')) {
    if (pendingR.length === 0) return `You have zero pending field reminders scheduled for today on ${activeProjectName}.`;
    return `You have ${pendingR.length} reminder${pendingR.length === 1 ? '' : 's'} for today on ${activeProjectName}: ${pendingR.map(r => r.title).join(', ')}.`;
  }

  // Subcontractor calls
  if (
    (raw.includes('call') ||
      raw.includes('phone') ||
      raw.includes('who to call') ||
      raw.includes('who do i call') ||
      (raw.includes('sub') && !raw.includes('summary')) ||
      raw.includes('trade')) &&
    !raw.includes('pay') &&
    !raw.includes('paid') &&
    !raw.includes('spent')
  ) {
    if (pendingS.length === 0) return `Zero pending subcontractor calls for ${activeProjectName} right now.`;
    return `You have ${pendingS.length} pending trade call${pendingS.length === 1 ? '' : 's'} on ${activeProjectName}: ${pendingS.map(s => `${s.subcontractor || 'Trade'} (${s.title})`).join(', ')}.`;
  }

  // Watch-outs
  if (raw.includes('watch') || raw.includes('risk') || raw.includes('hazard') || raw.includes('issue') || raw.includes('defect')) {
    if (pendingW.length === 0) return `Zero active watch-outs for ${activeProjectName}.`;
    return `You have ${pendingW.length} active watch-out${pendingW.length === 1 ? '' : 's'} on ${activeProjectName}: ${pendingW.map(w => w.title).join(', ')}.`;
  }

  // Google Drive File & Folder queries
  if (
    raw.includes('drive') ||
    raw.includes('file') ||
    raw.includes('folder') ||
    raw.includes('document') ||
    raw.includes('carpetas') ||
    raw.includes('archivos')
  ) {
    const driveData = projectId ? loadProjectDriveTree(projectId) : null;
    if (driveData) {
      const subCount = (driveData.subfolders || []).length;
      const directFileCount = (driveData.directFiles || []).length;
      const subFileCount = (driveData.subfolders || []).reduce((acc, sub) => acc + (sub.files || []).length, 0);
      const totalFiles = directFileCount + subFileCount;

      if (raw.includes('file') || raw.includes('document') || raw.includes('how many') || raw.includes('total') || raw.includes('archivos') || raw.includes('cuantos')) {
        return `You have **${totalFiles} total file${totalFiles === 1 ? '' : 's'}** across ${subCount} subfolders in your **${activeProjectName}** Google Drive project folder.`;
      }
      if (raw.includes('subfolder') || raw.includes('folder') || raw.includes('carpetas')) {
        const names = (driveData.subfolders || []).map((s) => s.folderName).join(', ');
        return `There are **${subCount} subfolders** in ${activeProjectName} Google Drive: ${names || 'None'}.`;
      }
    }
  }

  const isSpanishQuery =
    /[áéíóúüñ¿¡]/i.test(raw) ||
    /\b(el|la|los|las|un|una|del|por|para|con|este|esta|lote|plomero|pintor|electricista|dinero|gastado|cuanto|cuánto|quien|quién|recordatorio|buenos|dias|días|tardes|hola|cómo|como|estás|estas|saldo|deber|debemos)\b/i.test(raw);

  if (raw.includes('hola') || raw.includes('buenos dias') || raw.includes('buenos días') || raw.includes('como estas') || raw.includes('cómo estás')) {
    return `¡Buenos días! ¿En qué puedo ayudarte hoy con el proyecto del ${activeProjectName}?`;
  }

  // Catch-all
  if (isSpanishQuery) {
    return `Estoy listo para ayudarte con el ${activeProjectName}. ¿Qué te gustaría consultar?`;
  }
  return `I'm ready to help with ${activeProjectName}. What would you like to check on?`;
}
