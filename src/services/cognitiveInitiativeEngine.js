/**
 * SiteTactix J.A.R.V.I.S. Cognitive Initiative & Proactive Assistant Layer
 * Implements the Understand -> Consider -> Decide -> Act -> Respond -> Learn cognitive cycle.
 * Model-driven semantic opportunity formulation with application-enforced budget, throttling, and truthful provenance.
 */

export const DEFAULT_INITIATIVE_CONFIG = {
  defaultThreshold: 0.70, // Balanced threshold minimum gate
  brevityThreshold: 0.85, // Higher threshold when concise preference is active
  cooldownTurns: 2,       // Minimum turns between non-urgent proactive suggestions
  weights: {
    relevance: 0.35,
    usefulness: 0.30,
    urgency: 0.20,
    affinity: 0.15
  }
};

export const INITIATIVE_OUTCOMES = {
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  IGNORED: 'ignored',
  ACTED: 'acted'
};

export const AFFINITY_DOMAINS = [
  'municipal_inspections',
  'subcontractors',
  'weather',
  'field_reminders',
  'blueprints',
  'finances',
  'general_planning'
];

const INITIATIVE_STORAGE_PREFIX = 'jobscan_initiative_memory_';

/**
 * Load initiative memory tracking user acceptance affinity per domain
 */
export function loadInitiativeMemory(userId = 'default_user') {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${INITIATIVE_STORAGE_PREFIX}${userId}`);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  // Default neutral affinity
  const initialMemory = {
    domainAffinities: {
      municipal_inspections: 0.80, // Builders generally appreciate inspection awareness
      subcontractors: 0.75,
      weather: 0.75,
      field_reminders: 0.70,
      blueprints: 0.65,
      finances: 0.60,
      general_planning: 0.65
    },
    history: [],
    rejectedCooldowns: {},
    totalAccepted: 0,
    totalRejected: 0
  };
  return initialMemory;
}

/**
 * Persist updated initiative memory
 */
export function saveInitiativeMemory(userId = 'default_user', memory) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${INITIATIVE_STORAGE_PREFIX}${userId}`, JSON.stringify(memory));
    }
  } catch (_) {}
}

/**
 * Record the user's reaction to a proactive suggestion
 */
export function recordSuggestionOutcome(userId = 'default_user', domain, outcome, suggestionText = '') {
  const memory = loadInitiativeMemory(userId);
  const currentAffinity = memory.domainAffinities[domain] ?? 0.70;

  if (outcome === INITIATIVE_OUTCOMES.ACCEPTED || outcome === INITIATIVE_OUTCOMES.ACTED) {
    memory.domainAffinities[domain] = Math.min(1.0, currentAffinity + 0.10);
    memory.totalAccepted++;
  } else if (outcome === INITIATIVE_OUTCOMES.REJECTED) {
    memory.domainAffinities[domain] = Math.max(0.20, currentAffinity - 0.20);
    memory.totalRejected++;
    // Set 7-day cooldown for domain
    memory.rejectedCooldowns[domain] = Date.now() + (7 * 24 * 60 * 60 * 1000);
  } else if (outcome === INITIATIVE_OUTCOMES.IGNORED) {
    memory.domainAffinities[domain] = Math.max(0.30, currentAffinity - 0.05);
  }

  memory.history.push({
    timestamp: Date.now(),
    domain,
    outcome,
    suggestionText: suggestionText.slice(0, 100)
  });

  if (memory.history.length > 50) memory.history.shift();
  saveInitiativeMemory(userId, memory);
  return memory;
}

/**
 * Check if the user's turn confirms a pending proactive suggestion from the previous turn
 */
export function resolvePendingSuggestionConfirmation(query = '', sessionState = {}) {
  const pending = sessionState?.pendingProactiveSuggestion;
  if (!pending || !pending.suggestedAction) return null;

  const q = String(query).trim().toLowerCase();

  // Affirmative confirmations
  const isAffirmative =
    /^(yes|yeah|yep|sure|go ahead|check it|check that|do that|do it|please|proceed|yup|ok|okay|sounds good|let'?s do it|let'?s check)\b/i.test(q) ||
    /^(yeah|sure|yes|ok|okay)[,\s]+(check it|check that|do that|go ahead|please)/i.test(q) ||
    /^(check (it|that|inspections?|reminders?)|pull (it|that) up)\b/i.test(q);

  if (isAffirmative) {
    return {
      isConfirmed: true,
      pendingAction: pending.suggestedAction,
      domain: pending.domain,
      suggestionId: pending.id,
      originalSuggestion: pending.suggestionText
    };
  }

  // Explicit rejections
  const isRejection =
    /^(no|nope|don'?t|stop|nah|not now|never mind|cancel|skip)\b/i.test(q) ||
    /\b(don'?t (check|worry|do that)|no thanks|not right now)\b/i.test(q);

  if (isRejection) {
    return {
      isConfirmed: false,
      isRejected: true,
      domain: pending.domain,
      suggestionId: pending.id
    };
  }

  return null;
}

/**
 * Check if user is concluding conversation or saying thanks
 */
export function isConversationEnding(query = '') {
  const q = String(query).trim().toLowerCase();
  return (
    /^(thanks|thank you|thanks jarvis|got it|that'?s all|all set|good for now|all set for now|have a good (day|night)|see you|bye)(?:,? jarvis)?[\s!.,?]*$/i.test(q) ||
    /\b(all set|that'?s all|all set for now)\b/i.test(q)
  );
}

/**
 * Check if user is in an active correction or focused numerical editing state
 */
export function isUserCorrectingInformation(query = '') {
  const q = String(query).trim().toLowerCase();
  return (
    /\b(no that'?s not|not \$\d|wrong number|actually it'?s \$\d|change that to \$\d|correct that to|it should be \$\d)\b/i.test(q) ||
    /^(no,?\s+)(it'?s|that'?s|they are)\b/i.test(q)
  );
}

/**
 * Evaluate Cognitive Initiative for a conversational turn
 */
export function evaluateCognitiveInitiative({
  query = '',
  conversationHistory = [],
  context = {},
  preferences = [],
  sessionState = {},
  initiativeConfig = DEFAULT_INITIATIVE_CONFIG
}) {
  const q = String(query).trim().toLowerCase();
  const userId = context.userId || 'default_user';
  const initiativeMemory = loadInitiativeMemory(userId);

  // 1. Explicit Proactivity Opt-Out Check
  const optOutPref = preferences.find(p =>
    p.status === 'active' &&
    (p.inferredIntent === 'disable_proactivity' ||
     p.preferenceStatement?.toLowerCase().includes('don\'t suggest') ||
     p.preferenceStatement?.toLowerCase().includes('no suggestions'))
  );

  if (optOutPref) {
    return {
      warranted: false,
      score: 0.0,
      reason: 'Proactivity explicitly disabled by user preference',
      intentType: 'direct_query',
      suppressSuggestions: true,
      unsolicitedDataToSuppress: ['all_unrequested_modules']
    };
  }

  // 2. Conversation Ending / Sign-off Check
  if (isConversationEnding(q)) {
    return {
      warranted: false,
      score: 0.0,
      intentType: 'sign_off',
      suppressSuggestions: true,
      reason: 'User is concluding conversation'
    };
  }

  // 3. Information Correction Check -> High Interruption Cost
  if (isUserCorrectingInformation(q)) {
    return {
      warranted: false,
      score: 0.0,
      intentType: 'correction',
      interruptionCost: 1.0,
      suppressSuggestions: true,
      reason: 'User is correcting information; focus strictly on correction'
    };
  }

  // 4. Cooldown Check
  const lastSuggestionTurn = sessionState?.lastSuggestionTurn || -999;
  const currentTurn = sessionState?.turnIndex || conversationHistory.length;
  const isCooldownActive = (currentTurn - lastSuggestionTurn) < initiativeConfig.cooldownTurns;

  // 5. Brevity Preference Check
  const isConcisePrefActive = preferences.some(p =>
    p.status === 'active' &&
    (p.inferredIntent === 'concise_bottom_line' || p.category === 'response_style')
  );
  const effectiveThreshold = isConcisePrefActive
    ? initiativeConfig.brevityThreshold
    : initiativeConfig.defaultThreshold;

  // 6. Semantic Opportunity Identification (Generic, cross-domain)
  let opportunity = null;

  // Pattern A: Jobsite visit / arrival observation (e.g. "I'm heading to Lot 3", "On site at Lot 3")
  if (/\b(heading (over )?to|on (my )?way to|arrived at|on site at|at the lot|pulling up to)\b/i.test(q)) {
    opportunity = {
      domain: 'municipal_inspections',
      topic: 'site_arrival_status',
      urgency: 0.60,
      usefulness: 0.85,
      relevance: 0.90,
      suggestionText: 'Want me to check if any municipal inspections or punch items are pending for Lot 3?',
      suggestedAction: {
        toolName: 'get_project_schedule',
        args: { category: 'all' },
        provenanceSource: 'Municipal Inspections'
      },
      suppressData: ['grossBudget', 'workingCapital', 'subcontractorBalances']
    };
  }
  // Pattern B: Subcontractor completion observation (e.g. "The electrician is finishing today")
  else if (/\b(finishing|wrapping up|done|completed)\b/i.test(q) && /\b(electrician|plumber|framing|drywall|painter|hvac|concrete|roofing|sub)\b/i.test(q)) {
    const trade = (q.match(/\b(electrician|plumber|framing|drywall|painter|hvac|concrete|roofing)\b/i) || ['subcontractor'])[0];
    opportunity = {
      domain: 'municipal_inspections',
      topic: `${trade}_inspection_verification`,
      urgency: 0.70,
      usefulness: 0.85,
      relevance: 0.95,
      suggestionText: `Since the ${trade} is wrapping up, want me to verify the inspection status?`,
      suggestedAction: {
        toolName: 'get_project_schedule',
        args: { category: 'reminder' },
        provenanceSource: 'Municipal Inspections'
      },
      suppressData: ['grossBudget', 'workingCapital']
    };
  }
  // Pattern C: Weather-sensitive operations (e.g. concrete, roofing, painting)
  else if (/\b(pouring concrete|painting outside|roofing|framing)\b/i.test(q) && /\b(tomorrow|this week|today|friday|monday)\b/i.test(q)) {
    opportunity = {
      domain: 'weather',
      topic: 'outdoor_trade_weather_check',
      urgency: 0.80,
      usefulness: 0.90,
      relevance: 0.90,
      suggestionText: 'Want me to pull up the on-site weather forecast for that day?',
      suggestedAction: {
        toolName: 'get_weather_for_jobsite',
        args: {},
        provenanceSource: 'Weather API'
      },
      suppressData: ['grossBudget', 'subcontractorBalances']
    };
  }
  // Pattern D: Casual / Chitchat / General remark without specific operational trigger
  else if (/^(what'?s up|hey|hello|good (morning|afternoon|evening)|how'?s it going)(?:,? jarvis)?[\s!.,?]*$/i.test(q)) {
    return {
      warranted: false,
      score: 0.10,
      intentType: 'casual_greeting',
      suppressSuggestions: true,
      reason: 'Casual greeting; respond warmly without unprompted initiative',
      unsolicitedDataToSuppress: ['all_project_data']
    };
  }

  if (!opportunity) {
    return {
      warranted: false,
      score: 0.30,
      intentType: 'direct_query',
      suppressSuggestions: true,
      reason: 'No high-value proactive opportunity identified'
    };
  }

  // Check 7-day rejected cooldown for domain
  const domainCooldown = initiativeMemory.rejectedCooldowns[opportunity.domain];
  if (domainCooldown && Date.now() < domainCooldown) {
    return {
      warranted: false,
      score: 0.0,
      intentType: 'observation',
      suppressSuggestions: true,
      reason: `Domain "${opportunity.domain}" is currently in a 7-day suppression cooldown`
    };
  }

  // 7. Calculate Initiative Score
  const domainAffinity = initiativeMemory.domainAffinities[opportunity.domain] ?? 0.70;
  const weights = initiativeConfig.weights;

  let calculatedScore =
    (opportunity.relevance * weights.relevance) +
    (opportunity.usefulness * weights.usefulness) +
    (opportunity.urgency * weights.urgency) +
    (domainAffinity * weights.affinity);

  // If cooldown is active and urgency is not HIGH, dampen score
  if (isCooldownActive && opportunity.urgency < 0.80) {
    calculatedScore -= 0.35;
  }

  const isWarranted = calculatedScore >= effectiveThreshold;

  return {
    warranted: isWarranted,
    score: parseFloat(calculatedScore.toFixed(3)),
    threshold: effectiveThreshold,
    intentType: 'observation',
    domain: opportunity.domain,
    topic: opportunity.topic,
    suggestionText: opportunity.suggestionText,
    suggestedAction: opportunity.suggestedAction,
    suppressData: opportunity.suppressData || [],
    reasoning: isWarranted
      ? `High-value proactive opportunity in "${opportunity.domain}" (Score: ${calculatedScore.toFixed(2)} >= Threshold: ${effectiveThreshold})`
      : `Initiative score ${calculatedScore.toFixed(2)} below threshold ${effectiveThreshold}`
  };
}
