import * as chrono from 'chrono-node';
import { INSPECTION_STAGES } from './inspectionService';

const BRAIN_STORAGE_PREFIX = 'jobscan_builder_brain_';
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

const TRADES = [
  { keywords: ['electrician', 'electrical', 'sparks', 'wiring', 'panel'], name: 'Electrician' },
  { keywords: ['plumber', 'plumbing', 'pipe', 'water', 'drain', 'sewer'], name: 'Plumber' },
  { keywords: ['framer', 'framing', 'lumber', 'truss', 'sheathing', 'stud'], name: 'Framer' },
  { keywords: ['hvac', 'heating', 'cooling', 'duct', 'ac', 'condensate'], name: 'HVAC' },
  { keywords: ['concrete', 'pour', 'slab', 'footing', 'foundation', 'rebar'], name: 'Concrete' },
  { keywords: ['roofer', 'roofing', 'shingles', 'flashing'], name: 'Roofer' },
  { keywords: ['painter', 'paint', 'drywall', 'texture'], name: 'Drywall & Paint' },
  { keywords: ['inspector', 'inspection', 'city', 'pre-check'], name: 'City Inspector' },
  { keywords: ['supplier', 'delivery', 'materials', 'lumberyard', 'drop-off'], name: 'Supplier' },
];

export function parseFieldNote(input, defaultProjectName = 'Active Site') {
  if (!input || !input.trim()) return null;

  const rawText = input.trim();
  const lower = rawText.toLowerCase();

  const parsedResults = chrono.parse(rawText);
  let targetDate = null;
  let cleanText = rawText;

  if (parsedResults && parsedResults.length > 0) {
    const result = parsedResults[0];
    targetDate = result.start.date();
    cleanText = rawText.replace(result.text, '').replace(/\s+/g, ' ').trim();
  }

  let lot = null;
  const lotMatch = rawText.match(/\b(lot\s*\d+|lot\s*[a-z0-9-]+|unit\s*\d+)\b/i);
  if (lotMatch) {
    lot = lotMatch[0].toUpperCase().replace(/\s+/, ' ');
  }

  let subcontractor = null;
  for (const trade of TRADES) {
    if (trade.keywords.some((kw) => lower.includes(kw))) {
      subcontractor = trade.name;
      break;
    }
  }

  let category = 'reminder';
  if (
    lower.includes('watch out') ||
    lower.includes('watchout') ||
    lower.includes('risk') ||
    lower.includes('hazard') ||
    lower.includes('warning') ||
    lower.includes('issue') ||
    lower.includes('defect') ||
    lower.includes('quality') ||
    lower.includes('check before')
  ) {
    category = 'watchout';
  } else if (
    subcontractor ||
    lower.includes('call') ||
    lower.includes('text') ||
    lower.includes('waiting on') ||
    lower.includes('sub') ||
    lower.includes('ask') ||
    lower.includes('confirm')
  ) {
    category = 'subcontractor';
  }

  if (!cleanText || cleanText.length < 3) {
    cleanText = rawText;
  }

  return {
    id: 'brain_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    rawInput: rawText,
    title: cleanText.charAt(0).toUpperCase() + cleanText.slice(1),
    category,
    targetDate: targetDate ? targetDate.toISOString() : null,
    lot: lot || defaultProjectName || 'General Site',
    subcontractor: subcontractor || (category === 'subcontractor' ? 'Subcontractor' : null),
    priority: category === 'watchout' ? 'high' : 'medium',
    status: 'pending',
    createdAt: new Date().toISOString(),
    notes: '',
  };
}

export function loadBrainItems(projectId = 'default') {
  try {
    const key = `${BRAIN_STORAGE_PREFIX}${projectId}`;
    const raw = localStorage.getItem(key);
    let items = raw ? JSON.parse(raw) : null;

    // Check if current items only contains default sample items
    const hasCustomItems = items && Array.isArray(items) && items.some(i => !i.id?.startsWith('b_sample_'));

    if (!hasCustomItems) {
      // Harvest any user-created items from other project keys in localStorage
      const harvested = [];
      const seenIds = new Set();

      for (let i = 0; i < localStorage.length; i++) {
        const lKey = localStorage.key(i);
        if (lKey && lKey.startsWith(BRAIN_STORAGE_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(lKey));
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item && item.id && !seenIds.has(item.id) && !item.id.startsWith('b_sample_')) {
                  seenIds.add(item.id);
                  harvested.push(item);
                }
              }
            }
          } catch {
            // ignore parse error
          }
        }
      }

      if (harvested.length > 0) {
        // Merge harvested user items with any existing items
        const combined = [...harvested, ...(Array.isArray(items) ? items.filter(i => i.id?.startsWith('b_sample_')) : [])];
        saveBrainItems(projectId, combined);
        return combined;
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      const initial = [
        {
          id: 'b_sample_1',
          rawInput: 'Watch out: Check truss hanger nails before framing inspection',
          title: 'Check truss hanger nails before framing inspection',
          category: 'watchout',
          targetDate: new Date(Date.now() + 3600000 * 2).toISOString(),
          lot: 'LOT 14',
          subcontractor: 'Framer',
          priority: 'high',
          status: 'pending',
          createdAt: new Date().toISOString(),
          notes: 'Inspector flagged missing hurricane ties on adjacent build last week.',
        },
        {
          id: 'b_sample_2',
          rawInput: 'Call Dave (Plumber) at 1 PM to confirm drain rough-in completion',
          title: 'Call Dave (Plumber) to confirm drain rough-in completion',
          category: 'subcontractor',
          targetDate: new Date(Date.now() + 3600000 * 4).toISOString(),
          lot: 'LOT 8',
          subcontractor: 'Plumber',
          priority: 'high',
          status: 'pending',
          createdAt: new Date().toISOString(),
          notes: 'Need rough-in signed off before slab prep.',
        },
        {
          id: 'b_sample_3',
          rawInput: 'Remind me at 3:30 PM today to order extra 2x6 studs for garage header',
          title: 'Order extra 2x6 studs for garage header',
          category: 'reminder',
          targetDate: new Date(Date.now() + 3600000 * 6).toISOString(),
          lot: 'LOT 14',
          subcontractor: 'Supplier',
          priority: 'medium',
          status: 'pending',
          createdAt: new Date().toISOString(),
          notes: 'Call 84 Lumber or Builder First Source.',
        },
      ];
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    return items;
  } catch (err) {
    console.error('Error loading Builder Brain data:', err);
    return [];
  }
}

export function saveBrainItems(projectId = 'default', items = []) {
  try {
    const key = `${BRAIN_STORAGE_PREFIX}${projectId}`;
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error('Error saving Builder Brain data:', err);
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
    text += `- Phase: ${s.phase || 'N/A'} | Contractor: ${s.payee || 'Unassigned'}
    Quote: ${s.originalQuote || '$0.00'} | Paid: ${s.totalSpent || s.totalPaid || '$0.00'} | Balance: ${s.remainingBalance || '$0.00'}
    Material: ${s.totalMaterial || '$0.00'} | Labor: ${s.totalLabor || '$0.00'} | Status: ${s.status || 'Pending'}
`;
  });

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

export async function askGeminiBrain(query, items, activeProjectName = 'General Site', apiKey = null, dashboardData = null, projectId = null) {
  // Strict Lot Filtering to prevent cross-lot data leaks
  const cleanLotName = activeProjectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const projectItems = items.filter((i) => {
    if (!i.lot || i.lot === 'General Site') return true;
    const itemLot = i.lot.toLowerCase().replace(/[^a-z0-9]/g, '');
    return itemLot === cleanLotName || cleanLotName.includes(itemLot) || itemLot.includes(cleanLotName);
  });

  const pendingW = projectItems.filter((i) => i.category === 'watchout' && i.status === 'pending');
  const pendingS = projectItems.filter((i) => i.category === 'subcontractor' && i.status === 'pending');
  const pendingR = projectItems.filter((i) => i.category === 'reminder' && i.status === 'pending');

  const dashData = dashboardData || (projectId ? loadProjectDashboard(projectId) : null);
  const financialContext = formatDashboardContext(dashData);

  const siteSetupData = loadProjectSiteSetup(projectId);
  const siteSetupProtocol = siteSetupData.protocol;
  const siteSetupChecks = siteSetupData.checks;
  const siteSetupCompleted = siteSetupProtocol.inspectionChecklist.filter((i) => siteSetupChecks[i.id]).length;
  const siteSetupTotal = siteSetupProtocol.inspectionChecklist.length;

  const contextPrompt = `
You are "Adepec Builder Brain", an expert AI Construction Field & Financial Assistant for custom home builder Adepec Homes.
Active Project: ${activeProjectName}

PROJECT DATA CONTEXT:
- Site Setup & Mobilization Status: ${siteSetupCompleted}/${siteSetupTotal} Checked Off
${siteSetupProtocol.inspectionChecklist.map((c) => `  * [${siteSetupChecks[c.id] ? 'CHECKED' : 'UNCHECKED'}] ${c.text}`).join('\n')}

- Active Site Watch-Outs (${pendingW.length}):
${pendingW.map((w) => `  * [${w.lot || activeProjectName}] (${w.subcontractor || 'General'}): ${w.title} - Notes: ${w.notes || 'None'}`).join('\n') || '  (None)'}

- Pending Subcontractor Calls (${pendingS.length}):
${pendingS.map((s) => `  * [${s.lot || activeProjectName}] Call ${s.subcontractor || 'Trade'}: ${s.title}`).join('\n') || '  (None)'}

- Scheduled Field Reminders (${pendingR.length}):
${pendingR.map((r) => `  * [${r.lot || activeProjectName}] ${r.title} (Target: ${r.targetDate ? new Date(r.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Flexible'})`).join('\n') || '  (None)'}

FINANCIAL & DASHBOARD EXPENSES LEDGER:
${financialContext}

CITY INSPECTION STAGES CONFIGURED:
${INSPECTION_STAGES.map((s) => `- ${s.name} (${s.shortName}): ${s.description}`).join('\n')}

USER QUESTION: "${query}"

CRITICAL INSTRUCTIONS & RESPONSE RULES:
1. DEFAULT LENGTH: 1 TO 2 SHORT, DIRECT SENTENCES ONLY. Keep answers punchy, precise, and fast to read / listen to.
2. ONLY ANSWER WHAT WAS ASKED: NEVER provide unsolicited status summaries, financial dumps, or site setup checklists unless the user explicitly asks for them.
3. CASUAL GREETINGS: If the user greets you or asks "how's it going", "what's up", or "how are you", reply with a simple, friendly 1-sentence response like: "Everything is going well! How can I help you on ${activeProjectName} today?" (Do NOT dump project status or budgets on greetings).
4. ON-DEMAND DETAIL MODE: ONLY if the user explicitly asks for "all the details", "be thorough", "full breakdown", "itemized list", or "explain in detail", then provide a structured, comprehensive multi-paragraph breakdown.
5. NO FLUFF: Avoid robotic intros or repetitive pleasantries before getting to the answer.
`;

  const envKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) ? import.meta.env.VITE_GEMINI_API_KEY : '';
  const effectiveKey = (apiKey && apiKey.trim()) || (typeof window !== 'undefined' ? localStorage.getItem('jobscan_gemini_key') : '') || envKey || '';

  if (effectiveKey && effectiveKey.trim()) {
    const keyClean = effectiveKey.trim();
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
    for (const model of modelsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyClean}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: contextPrompt }] }],
              generationConfig: {
                maxOutputTokens: 350,
                temperature: 0.2
              }
            }),
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (cand) return cand.trim();
        } else {
          const errJson = await res.json().catch(() => ({}));
          console.warn(`Gemini API error for model ${model}:`, errJson);
        }
      } catch (e) {
        console.warn(`Gemini cloud API error with ${model}:`, e);
      }
    }
  }

  const raw = query.toLowerCase().trim();

  // 1. Site Setup & Mobilization Checklist Query Handler (with speech tolerance)
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
      return (
        `🎉 **Site Setup & Mobilization Complete — ${activeProjectName}** (${siteSetupTotal}/${siteSetupTotal}):\n\n` +
        `All **5 Site Setup checklist items** have been checked off!\n` +
        `The lot is fully mobilized and ready for **1. Plumbing Rough-In**.`
      );
    }

    return (
      `🚩 **Site Setup Readiness Audit — ${activeProjectName}** (${completedItems.length}/${siteSetupTotal} Completed):\n\n` +
      `You have **${pendingItems.length} item${pendingItems.length === 1 ? '' : 's'} remaining** to check off before site mobilization is complete:\n\n` +
      pendingItems.map((item, idx) => `${idx + 1}. ⬜ **${item.text}**`).join('\n') +
      (completedItems.length > 0
        ? `\n\n*✅ Completed (${completedItems.length}): ${completedItems.map((c) => c.text).join(', ')}*`
        : `\n\n*(All ${siteSetupTotal} items are currently pending).*`)
    );
  }

  // Financial & Payment query local fallback
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

      // Collect all phases with recorded spent/payments
      const paidPhases = subs.filter((s) => {
        const spent = s.totalSpent ? parseFloat(String(s.totalSpent).replace(/[^0-9.]/g, '')) : 0;
        const paid = s.totalPaid ? parseFloat(String(s.totalPaid).replace(/[^0-9.]/g, '')) : 0;
        return spent > 0 || paid > 0 || (s.payments && s.payments.length > 0);
      });

      // Extract numeric dollar amount from query if present (e.g. 1000 or $1,000)
      const numMatch = raw.match(/\$?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
      const queryAmount = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : null;

      // 1. Ranking Query: Biggest / Largest Expense So Far
      if (
        raw.includes('biggest expense') ||
        raw.includes('largest expense') ||
        raw.includes('highest expense') ||
        raw.includes('most expensive so far') ||
        raw.includes('top expense') ||
        raw.includes('what did we spend the most on') ||
        raw.includes('most spent')
      ) {
        if (paidPhases.length > 0) {
          const sortedPaid = [...paidPhases].sort((a, b) => {
            const aSpent = parseFloat(String(a.totalSpent || a.totalPaid || '0').replace(/[^0-9.]/g, ''));
            const bSpent = parseFloat(String(b.totalSpent || b.totalPaid || '0').replace(/[^0-9.]/g, ''));
            return bSpent - aSpent;
          });
          const top = sortedPaid[0];
          return (
            `🏆 **Biggest Expenditure to Date — ${activeProjectName}**:\n\n` +
            `* **Phase**: ${top.phase}\n` +
            `* **Contractor / Payee**: ${top.payee || 'Unassigned'}\n` +
            `* **Amount Paid**: ${top.totalSpent || top.totalPaid || '$0.00'}\n` +
            `* **Original Quote**: ${top.originalQuote || '$0.00'}\n` +
            `* **Remaining Balance**: ${top.remainingBalance || '$0.00'}\n\n` +
            `*This represents the largest portion of your **${info.totalSpent || '$0.00'} total draws spent to date**.*`
          );
        } else {
          return (
            `🏆 **Biggest Expense to Date — ${activeProjectName}**:\n\n` +
            `Aside from the **Land / Acquisition Cost (${info.budgetLand || '$0.00'})**, you have **$0.00 in trade draws spent** recorded so far.\n` +
            `Total Hard Cost Build Budget is **${info.budgetBuild || '$0.00'}**.`
          );
        }
      }

      // 2. Ranking Query: Highest Quote / Most Expensive Phase Overall
      if (
        raw.includes('highest quote') ||
        raw.includes('biggest quote') ||
        raw.includes('largest quote') ||
        raw.includes('most expensive phase') ||
        raw.includes('biggest phase') ||
        raw.includes('highest budget phase') ||
        raw.includes('largest budget')
      ) {
        const sortedQuotes = [...subs].sort((a, b) => {
          const aQ = parseFloat(String(a.originalQuote || '0').replace(/[^0-9.]/g, ''));
          const bQ = parseFloat(String(b.originalQuote || '0').replace(/[^0-9.]/g, ''));
          return bQ - aQ;
        });

        const top3 = sortedQuotes.slice(0, 3);
        return (
          `📊 **Top Most Expensive Phases by Quote — ${activeProjectName}**:\n\n` +
          top3
            .map((s, idx) => {
              return `${idx + 1}. **${s.phase}**: **${s.originalQuote || '$0.00'}**\n   * Contractor: ${s.payee || 'Unassigned'} | Paid: ${s.totalSpent || s.totalPaid || '$0.00'} | Balance: ${s.remainingBalance || '$0.00'}`;
            })
            .join('\n\n')
        );
      }

      // 3. Ranking Query: Largest Remaining Balance / Highest Unpaid
      if (
        raw.includes('highest balance') ||
        raw.includes('largest balance') ||
        raw.includes('biggest balance') ||
        raw.includes('who is owed the most') ||
        raw.includes('owed the most') ||
        raw.includes('most balance') ||
        raw.includes('largest unpaid')
      ) {
        const sortedOwed = [...subs].sort((a, b) => {
          const aBal = parseFloat(String(a.remainingBalance || '0').replace(/[^0-9.]/g, ''));
          const bBal = parseFloat(String(b.remainingBalance || '0').replace(/[^0-9.]/g, ''));
          return bBal - aBal;
        });

        const topOwed = sortedOwed.filter((s) => parseFloat(String(s.remainingBalance || '0').replace(/[^0-9.]/g, '')) > 0).slice(0, 3);
        if (topOwed.length > 0) {
          return (
            `💳 **Largest Remaining Balances Owed — ${activeProjectName}**:\n\n` +
            topOwed
              .map((s, idx) => {
                return `${idx + 1}. **${s.phase}**: **${s.remainingBalance || '$0.00'}** balance due\n   * Contractor: ${s.payee || 'Unassigned'} (Quote: ${s.originalQuote || 'N/A'}, Paid: ${s.totalSpent || s.totalPaid || '$0.00'})`;
              })
              .join('\n\n')
          );
        } else {
          return `💳 **Balances — ${activeProjectName}**:\nAll phases currently have zero remaining balance due!`;
        }
      }

      const isPaymentQuery =
        raw.includes('pay') ||
        raw.includes('paid') ||
        raw.includes('spent') ||
        raw.includes('check') ||
        raw.includes('trans') ||
        raw.includes('who did') ||
        raw.includes('what did');

      if (isPaymentQuery && (queryAmount !== null || raw.includes('who did') || raw.includes('what did') || raw.includes('payments') || raw.includes('paid so far'))) {
        // If searching for a specific amount like $1,000
        if (queryAmount !== null && queryAmount > 0) {
          const matchingPhases = paidPhases.filter((s) => {
            const spent = parseFloat(String(s.totalSpent || s.totalPaid || '0').replace(/[^0-9.]/g, ''));
            const matchesSpent = Math.abs(spent - queryAmount) < 0.01;
            const matchesIndividual = s.payments?.some((p) => {
              const pAmt = parseFloat(String(p.amount || '0').replace(/[^0-9.]/g, ''));
              return Math.abs(pAmt - queryAmount) < 0.01;
            });
            return matchesSpent || matchesIndividual;
          });

          if (matchingPhases.length > 0) {
            return (
              `💰 **Payment Breakdown for $${queryAmount.toLocaleString()} — ${activeProjectName}**:\n\n` +
              matchingPhases
                .map((s, idx) => {
                  const lines = [
                    `${idx + 1}. **Phase**: ${s.phase}`,
                    `   * **Contractor / Payee**: ${s.payee || 'Unassigned'}`,
                    `   * **Total Paid to Date**: ${s.totalSpent || s.totalPaid || '$' + queryAmount.toLocaleString()}`,
                    `   * **Original Quote**: ${s.originalQuote || '$0.00'}`,
                    `   * **Remaining Balance**: ${s.remainingBalance || '$0.00'}`
                  ];
                  if (s.payments && s.payments.length > 0) {
                    const pLines = s.payments.map((p) => `     - ${p.date || 'Recent'}: ${p.amount || '$' + queryAmount.toLocaleString()} (${p.payee || s.payee || 'Payee'}, Check: ${p.check || 'N/A'})`);
                    lines.push(`   * **Transactions**:\n${pLines.join('\n')}`);
                  }
                  return lines.join('\n');
                })
                .join('\n\n')
            );
          }
        }

        // If general "who did we pay" / payments list
        if (paidPhases.length > 0) {
          return (
            `💳 **Payments Made to Date — ${activeProjectName}** (${paidPhases.length} Phases):\n\n` +
            paidPhases
              .map((s, idx) => {
                return `${idx + 1}. **${s.phase}**: Paid **${s.totalSpent || s.totalPaid}** to **${s.payee || 'Contractor'}** (Balance: ${s.remainingBalance || '$0.00'}, Quote: ${s.originalQuote || 'N/A'})`;
              })
              .join('\n') +
            `\n\n*Total Spent to Date: **${info.totalSpent || '$0.00'}** | Net Working Capital Remaining: **${info.capitalBalance || '$0.00'}***`
          );
        } else {
          return (
            `💳 **Payments — ${activeProjectName}**:\n\n` +
            `No payments have been recorded yet in the dashboard sheets for this lot. Total Spent is currently **${info.totalSpent || '$0.00'}**.`
          );
        }
      }

      // Check if querying a specific phase/trade
      const matchedPhase = subs.find(
        (s) =>
          s.phase &&
          (raw.includes(s.phase.toLowerCase()) ||
            (s.payee && raw.includes(s.payee.toLowerCase())) ||
            (raw.includes('plumb') && s.phase.toLowerCase().includes('plumb')) ||
            (raw.includes('fram') && s.phase.toLowerCase().includes('fram')) ||
            (raw.includes('found') && s.phase.toLowerCase().includes('found')) ||
            (raw.includes('elect') && s.phase.toLowerCase().includes('elect')) ||
            (raw.includes('hvac') && s.phase.toLowerCase().includes('hvac')))
      );

      if (matchedPhase) {
        return (
          `💰 **${matchedPhase.phase} Financials**:\n\n` +
          `* **Contractor/Payee**: ${matchedPhase.payee || 'Unassigned'}\n` +
          `* **Original Quote**: ${matchedPhase.originalQuote || '$0.00'}\n` +
          `* **Total Spent / Paid**: ${matchedPhase.totalSpent || matchedPhase.totalPaid || '$0.00'}\n` +
          `* **Remaining Balance Due**: ${matchedPhase.remainingBalance || '$0.00'}\n` +
          `* **Material**: ${matchedPhase.totalMaterial || '$0.00'} | **Labor**: ${matchedPhase.totalLabor || '$0.00'}\n` +
          `* **Status**: ${matchedPhase.status || 'In Progress'}`
        );
      }

      return (
        `💰 **Project Financial Summary — ${activeProjectName}**:\n\n` +
        `* **Hard Cost Build Budget**: ${info.budgetBuild || '$0.00'}\n` +
        `* **Gross Projected Cost**: ${info.budgetGross || '$0.00'}\n` +
        `* **Lot / Land Cost**: ${info.budgetLand || '$0.00'}\n` +
        `* **Total Spent to Date (Draws)**: ${info.totalSpent || '$0.00'}\n` +
        `* **Net Working Capital Balance**: ${info.capitalBalance || '$0.00'}\n\n` +
        `Tracked across **${subs.length} construction phases** in your Google Sheets Dashboard.`
      );
    } else {
      return (
        `💰 **Dashboard Expenses**:\n\n` +
        `No cached financial dashboard data found for **${activeProjectName}** yet.\n` +
        `Open the **Dashboard** tab once to pull the latest budget, quotes, and payment numbers from your Google Sheet!`
      );
    }
  }

  if (raw.includes('reminder') || raw.includes('schedule') || raw.includes('today') || raw.includes('alarm')) {
    if (pendingR.length === 0) return "⏰ **Today's Schedule**:\nYou have zero pending field reminders scheduled for today!";
    return (
      `⏰ **Field Reminders for Today** (${pendingR.length} total):\n\n` +
      pendingR
        .map((r, idx) => {
          const t = r.targetDate ? new Date(r.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Flexible';
          return `${idx + 1}. **[${r.lot || activeProjectName}]** ${r.title} — *${t}*`;
        })
        .join('\n')
    );
  }

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
    if (pendingS.length === 0) return "📞 **Trade Calls**:\nZero pending subcontractor calls for this lot right now!";
    return (
      `📞 **Pending Trade Calls — ${activeProjectName}** (${pendingS.length} total):\n\n` +
      pendingS.map((s, idx) => `${idx + 1}. **${s.subcontractor || 'Trade'}**: "${s.title}"`).join('\n')
    );
  }

  if (raw.includes('watch') || raw.includes('risk') || raw.includes('hazard') || raw.includes('issue') || raw.includes('defect')) {
    if (pendingW.length === 0) return `🎉 **Site Watch-Outs**:\nZero active watch-outs for ${activeProjectName}!`;
    return (
      `🚨 **Active Site Watch-Outs — ${activeProjectName}** (${pendingW.length} total):\n\n` +
      pendingW.map((w, idx) => `${idx + 1}. **${w.title}**`).join('\n')
    );
  }

  return (
    `👋 **Adepec Builder Brain (${activeProjectName})**:\n` +
    `You have **${projectItems.filter((i) => i.status === 'pending').length} active items** on site:\n` +
    `• 🚨 **${pendingW.length} Watch-Outs**\n` +
    `• 👷 **${pendingS.length} Trade Calls**\n` +
    `• ⏰ **${pendingR.length} Reminders**\n\n` +
    `Ask me anything: *"What did we pay $1,000 for?"*, *"How much spent on framing?"*, *"What reminders do I have today?"*, or *"Who do I need to call?"*.`
  );
}
