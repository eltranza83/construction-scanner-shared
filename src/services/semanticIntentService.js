/**
 * J.A.R.V.I.S. True Plugin-Style Semantic Intent & Modality Registry Architecture
 * 
 * Core Architectural Pillars:
 * 1. Tool Output = Grounded Evidence.
 * 2. Intent Modality Plugins = Self-contained plugins defining contract validation, 
 *    semantic classification, cloud prompt guidelines, applicability guards, and local synthesis.
 * 3. Deterministic Conflict Resolution = Multi-match scoring based on confidence, specificity, and priority.
 * 4. Zero-Touch Extensibility = Adding a future modality requires registering a standalone plugin,
 *    never editing core synthesis/reasoning logic.
 */

export const INTENT_MODALITIES = Object.freeze({
  // Core Default Modalities
  RETRIEVAL: 'retrieval',
  VERIFICATION_META: 'verification_meta',
  ANALYTICAL: 'analytical',

  // Standard Extended Modalities
  EXPLANATION_WHY: 'explanation_why',
  SUMMARIZATION: 'summarization',
  INSTRUCTION_HOWTO: 'instruction_howto',
  RECOMMENDATION: 'recommendation',
  PLANNING: 'planning',
  CONFIRMATION: 'confirmation',
  ACTION_COMMAND: 'action_command',
  CLARIFICATION: 'clarification'
});

/**
 * Validates the strict plugin contract to prevent malformed runtime registration.
 */
export function validatePluginContract(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    throw new TypeError('Invalid Modality Plugin: Plugin definition must be a non-null object.');
  }

  if (!plugin.id || typeof plugin.id !== 'string' || plugin.id.trim() === '') {
    throw new TypeError('Invalid Modality Plugin: Plugin must have a valid non-empty "id" string.');
  }

  if (typeof plugin.priority !== 'number' || Number.isNaN(plugin.priority)) {
    throw new TypeError(`Invalid Modality Plugin [${plugin.id}]: "priority" must be a valid number.`);
  }

  if (typeof plugin.classifier !== 'function') {
    throw new TypeError(`Invalid Modality Plugin [${plugin.id}]: "classifier" must be an executable function.`);
  }

  if (plugin.isApplicable && typeof plugin.isApplicable !== 'function') {
    throw new TypeError(`Invalid Modality Plugin [${plugin.id}]: Optional "isApplicable" must be a function if provided.`);
  }

  if (plugin.synthesizeEvidence && typeof plugin.synthesizeEvidence !== 'function') {
    throw new TypeError(`Invalid Modality Plugin [${plugin.id}]: Optional "synthesizeEvidence" must be a function if provided.`);
  }

  return true;
}

/**
 * ----------------------------------------------------------------------------
 * STANDARD SELF-CONTAINED MODALITY PLUGINS
 * ----------------------------------------------------------------------------
 */

export const AnalyticalPlugin = {
  id: INTENT_MODALITIES.ANALYTICAL,
  name: 'Analytical & Comparative',
  priority: 10,
  description: 'Comparative, ranking, extremum (most/least/highest/lowest), and statistical calculation inquiries.',
  promptGuideline: 'ANALYTICAL & COMPARATIVE: Perform calculations, comparisons, or rankings over the evidence and state the specific analytical answer directly with supporting figures.',
  classifier: (cleanQuery) => {
    const matched = 
      /\b(which|who|what|why)\b.*\b(most|least|highest|lowest|greatest|smallest|biggest|largest|more than|less than|heaviest|cheapest|expensive|max|min)\b/i.test(cleanQuery) ||
      /\b(more\s+\w+\s+than|less\s+\w+\s+than|more\s+than|less\s+than|compared to)\b/i.test(cleanQuery) ||
      /\b(compare|comparison|difference between|how many total|rank|top|bottom)\b/i.test(cleanQuery) ||
      /\b(which one|which list|which trade|which contractor|which phase|which stage|who has more|who owes more|what has more|have more|has more)\b/i.test(cleanQuery);
    
    return matched ? { matched: true, confidence: 0.95, specificity: 1.2 } : false;
  },
  synthesizeEvidence: (evidenceList, query, projectContext) => {
    const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';
    const responses = [];

    for (const t of evidenceList) {
      const res = t.result;
      if (t.name === 'get_purchasing_list') {
        const sections = res.sections || [];
        if (sections.length > 0) {
          const sorted = [...sections].sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0));
          const top = sorted[0];
          const count = top.items?.length || 0;
          responses.push(`${top.category || top.title} has the most items on the checklist with ${count} item${count === 1 ? '' : 's'} listed.`);
        } else {
          responses.push(`There are no purchasing items to compare on the ${activeProject} Purchasing Checklist.`);
        }
      } else if (t.name === 'get_subcontractor_balance' || t.name === 'get_vendor_history') {
        const records = res.results || [];
        if (records.length > 0) {
          const sorted = [...records].sort((a, b) => (b.remainingBalance || 0) - (a.remainingBalance || 0));
          const top = sorted[0];
          responses.push(`${top.phaseName || top.contractor} has the highest remaining balance owed at $${top.remainingBalance?.toLocaleString() || 0} (Quote: $${top.quote?.toLocaleString() || 0}, Paid: $${top.totalPaid?.toLocaleString() || 0}).`);
        }
      } else if (t.name === 'search_receipts') {
        const receipts = res.results || res.receipts || [];
        if (receipts.length > 0) {
          const sorted = [...receipts].sort((a, b) => (b.amount || 0) - (a.amount || 0));
          const top = sorted[0];
          responses.push(`The largest receipt is $${top.amount?.toLocaleString()} from ${top.vendor || 'Vendor'} on ${top.date || 'recorded date'}.`);
        }
      }
    }
    return responses.length > 0 ? responses.join('\n\n') : null;
  }
};

export const VerificationMetaPlugin = {
  id: INTENT_MODALITIES.VERIFICATION_META,
  name: 'Verification & Meta',
  priority: 20,
  description: 'Exhaustiveness, exclusivity, existence, presence/absence, and completeness inquiries.',
  promptGuideline: 'VERIFICATION & META: Answer the existential/completeness question directly (e.g. "Those N items are currently all that are recorded on [Source].") rather than dumping raw lists.',
  classifier: (cleanQuery) => {
    const matched = 
      /\b(any other|any more|anything else|anything more|anything further|anything additional|anyone else|any others|another|besides|except|other than)\b/i.test(cleanQuery) ||
      /\b(is that all|is this all|are those all|are these all|is that everything|is this everything|are they all)\b/i.test(cleanQuery) ||
      /\b(only one|only ones|the only|all we have|all that exists|all that are listed|all that is listed)\b/i.test(cleanQuery) ||
      /\b(do we have more|are there more|is there more|do we have other|are there other|is there another|do we have anything)\b/i.test(cleanQuery) ||
      /\b(does anything else exist|do any other exist|is anything missing|are any missing)\b/i.test(cleanQuery);
    
    return matched ? { matched: true, confidence: 0.95, specificity: 1.1 } : false;
  },
  synthesizeEvidence: (evidenceList, query, projectContext) => {
    const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';
    const responses = [];

    for (const t of evidenceList) {
      const res = t.result;
      if (t.name === 'get_purchasing_list') {
        const sections = res.sections || [];
        const totalSections = sections.length;
        const names = sections.map(s => s.category || s.title || 'Category').join(', ');
        if (totalSections === 0) {
          responses.push(`There are currently no purchasing categories or items listed on the ${activeProject} Purchasing Checklist.`);
        } else {
          responses.push(`Those ${totalSections} categories (${names}) are currently all the categories listed on the ${activeProject} Purchasing Checklist.`);
        }
      } else if (t.name === 'get_subcontractor_balance' || t.name === 'get_vendor_history') {
        const records = res.results || [];
        if (records.length === 0) {
          responses.push(`There are no additional subcontractor balances recorded for ${activeProject} in the financial ledger.`);
        } else if (records.length === 1) {
          const item = records[0];
          responses.push(`For ${item.phaseName || item.contractor}, that is the only contract balance recorded in the financial ledger (Quote: $${item.quote?.toLocaleString() || 0}, Paid: $${item.totalPaid?.toLocaleString() || 0}, Balance: $${item.remainingBalance?.toLocaleString() || 0}).`);
        } else {
          responses.push(`Those ${records.length} trade contracts are currently all that are recorded in the ${activeProject} financial ledger.`);
        }
      } else if (t.name === 'search_receipts') {
        const receipts = res.results || res.receipts || [];
        responses.push(`Those ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} are currently all that are recorded for that category in ${activeProject}.`);
      } else if (t.name === 'search_memories' || t.name === 'list_memories') {
        const memories = res.memories || [];
        responses.push(`Those ${memories.length} note${memories.length === 1 ? '' : 's'} are currently all the persistent memories I have saved for this topic.`);
      } else if (t.name === 'get_drive_files') {
        const files = res.files || [];
        if (res.isFolderEmpty && res.folderName) {
          responses.push(`The "${res.folderName}" directory exists in Google Drive for ${activeProject}, but it does not currently contain any files.`);
        } else if (files.length === 0) {
          responses.push(res.message || `No files found in Google Drive for ${activeProject}.`);
        } else {
          responses.push(`Those ${files.length} file${files.length === 1 ? '' : 's'} are currently all that exist in that folder.`);
        }
      }
    }
    return responses.length > 0 ? responses.join('\n\n') : null;
  }
};

export const ExplanationWhyPlugin = {
  id: INTENT_MODALITIES.EXPLANATION_WHY,
  name: 'Explanation & Why',
  priority: 30,
  description: 'Reasoning, root cause, rationale, and justification inquiries.',
  promptGuideline: 'EXPLANATION & WHY: Provide a clear, logical rationale and root cause grounded strictly in project records.',
  classifier: (cleanQuery) => {
    return /\b(why|reason|explain why|how come|what caused|why did|rationale)\b/i.test(cleanQuery);
  }
};

export const SummarizationPlugin = {
  id: INTENT_MODALITIES.SUMMARIZATION,
  name: 'Summarization',
  priority: 40,
  description: 'High-level executive briefing, summary, and snapshot inquiries.',
  promptGuideline: 'SUMMARIZATION: Provide a concise executive overview highlighting key totals, critical milestones, and pending items.',
  classifier: (cleanQuery) => {
    return /\b(summarize|summary|overview|briefing|executive summary|quick recap|recap|tldr)\b/i.test(cleanQuery);
  },
  synthesizeEvidence: (evidenceList, query, projectContext) => {
    const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';
    const summaries = [];
    for (const t of evidenceList) {
      const res = t.result;
      if (t.name === 'get_purchasing_list') {
        const sections = res.sections || [];
        const totalItems = res.totalItems || sections.reduce((acc, s) => acc + (s.items?.length || 0), 0);
        summaries.push(`${activeProject} Purchasing Summary: ${sections.length} active categories with ${totalItems} total pending items.`);
      }
    }
    return summaries.length > 0 ? summaries.join('\n') : null;
  }
};

export const InstructionHowToPlugin = {
  id: INTENT_MODALITIES.INSTRUCTION_HOWTO,
  name: 'Instruction / How-To',
  priority: 50,
  description: 'Procedural, sequential, and how-to guidance inquiries.',
  promptGuideline: 'INSTRUCTION & HOW-TO: Provide step-by-step procedural directions aligned with jobsite standards and municipal protocols.',
  classifier: (cleanQuery) => {
    return /\b(how do i|how to|what steps|procedure|step by step|how should we|guide me)\b/i.test(cleanQuery);
  }
};

export const RecommendationPlugin = {
  id: INTENT_MODALITIES.RECOMMENDATION,
  name: 'Recommendation',
  priority: 60,
  description: 'Best practice suggestions, material recommendations, and trade advisory.',
  promptGuideline: 'RECOMMENDATION: Provide grounded expert recommendations tailored to the specific lot constraints.',
  classifier: (cleanQuery) => {
    return /\b(recommend|suggest|what do you suggest|what should i buy|best option|advice|advise)\b/i.test(cleanQuery);
  }
};

export const PlanningPlugin = {
  id: INTENT_MODALITIES.PLANNING,
  name: 'Planning & Scheduling',
  priority: 70,
  description: 'Phase timeline, mobilization scheduling, and trade sequencing inquiries.',
  promptGuideline: 'PLANNING: Outline sequencing dependencies, trade prerequisites, and milestone roadmaps.',
  classifier: (cleanQuery) => {
    return /\b(plan|schedule|timeline|next phase|sequencing|when should we|roadmap)\b/i.test(cleanQuery) && !/\b(floor\s*plan|blueprint|pdf|file|doc)\b/i.test(cleanQuery);
  }
};

export const ConfirmationPlugin = {
  id: INTENT_MODALITIES.CONFIRMATION,
  name: 'Confirmation',
  priority: 80,
  description: 'Affirmations, approvals, and user consent for pending actions.',
  promptGuideline: 'CONFIRMATION: Execute the confirmed staged action and state completion clearly.',
  classifier: (cleanQuery) => {
    return /^(yes|yeah|yep|sure|go ahead|proceed|approved|do it|confirm|sounds good|please do)$/i.test(cleanQuery.trim());
  }
};

export const ActionCommandPlugin = {
  id: INTENT_MODALITIES.ACTION_COMMAND,
  name: 'Action / Command',
  priority: 15,
  description: 'Imperative modifications, document writes, client actions, reminders, and database updates.',
  promptGuideline: 'ACTION & COMMAND: Execute the requested mutation or client action tool accurately. Confirm success ONLY after verifying the client tool executed successfully. If the tool reports an error, missing file, or empty folder, state the failure reason faithfully without claiming it succeeded.',
  classifier: (cleanQuery) => {
    return /\b(add|create|update|mark|delete|remove|sync|save|remind me|schedule an?|open|launch|navigate|switch to)\b/i.test(cleanQuery) && !/\b(how do i|how to|what is the schedule|what's the schedule|schedule for)\b/i.test(cleanQuery);
  },
  synthesizeEvidence: (evidenceList, query, projectContext) => {
    const responses = [];
    for (const t of evidenceList) {
      const res = t.result;
      if (!res) continue;

      if (t.name === 'open_drive_document') {
        if (res.success) {
          responses.push(`Opened "${res.fileName}" (${res.folderName || 'Google Drive'}).`);
        } else {
          responses.push(res.error || `I couldn't open that document.`);
        }
      } else if (t.name === 'open_drive_folder') {
        if (res.success) {
          responses.push(`Opened the "${res.folderName}" folder in Google Drive (${res.fileCount} files).`);
        } else {
          responses.push(res.error || `I couldn't open that folder.`);
        }
      } else if (t.name === 'navigate_app_tab') {
        responses.push(res.message || `Switched to the ${res.tab} tab.`);
      } else if (res.message) {
        responses.push(res.message);
      }
    }
    return responses.length > 0 ? responses.join('\n\n') : null;
  }
};

export const ClarificationPlugin = {
  id: INTENT_MODALITIES.CLARIFICATION,
  name: 'Clarification',
  priority: 100,
  description: 'Disambiguation and follow-up inquiry when details are ambiguous.',
  promptGuideline: 'CLARIFICATION: Ask a targeted follow-up question to resolve ambiguity before proceeding.',
  classifier: (cleanQuery) => {
    return /\b(what do you mean|clarify|elaborate|which one do you mean)\b/i.test(cleanQuery);
  }
};

export const RetrievalPlugin = {
  id: INTENT_MODALITIES.RETRIEVAL,
  name: 'Content Retrieval',
  priority: 999,
  description: 'Standard factual lookup and full content record retrieval.',
  promptGuideline: 'CONTENT RETRIEVAL: Present the retrieved data cleanly and faithfully. For broad purchasing list inquiries across multiple categories (e.g. "what do we have on the list?", "show me the list"), summarize by category heading and item counts (e.g. Quartz Hardware (2 items), Electrical (10 items), Plumbing (8 items)) to keep voice output conversational and concise, offering to read specific sections. If the user asks for a specific trade (e.g. "what electrical items do we need?") or explicitly asks for "all items" / "item by item", present the full line-item checklist.',
  classifier: () => true, // default catch-all
  synthesizeEvidence: (evidenceList, query, projectContext) => {
    const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';
    const responses = [];

    for (const t of evidenceList) {
      const res = t.result;
      if (t.name === 'get_purchasing_list') {
        const sections = res.sections || [];
        const wantsDetailedItems = /\b(all items|everything|detail|item by item|read all|show all items)\b/i.test(query || '') || (sections.length === 1);
        if (sections.length > 0) {
          if (!wantsDetailedItems && sections.length > 1) {
            const summaryLines = [`On your ${activeProject} Purchasing Checklist, you have ${sections.length} main sections:`];
            for (const s of sections) {
              const count = (s.items || []).length;
              summaryLines.push(`• ${s.category || s.title} (${count} item${count === 1 ? '' : 's'})`);
            }
            summaryLines.push(`\nWhich section would you like me to read off?`);
            responses.push(summaryLines.join('\n'));
          } else {
            const lines = [];
            for (const s of sections) {
              lines.push(`${s.category || s.title}:`);
              for (const item of (s.items || [])) {
                const qtyStr = item.quantity && item.hasExplicitQuantity ? ` (${item.quantity})` : '';
                const statusStr = item.isPurchased ? ' - Purchased' : '';
                lines.push(`• ${item.name}${qtyStr}${statusStr}`);
              }
              lines.push('');
            }
            responses.push(lines.join('\n').trim());
          }
        } else {
          responses.push(res.message || `No items found on the ${activeProject} Purchasing Checklist.`);
        }
      } else if (t.name === 'get_subcontractor_balance' || t.name === 'get_vendor_history') {
        const records = res.results || [];
        if (records.length > 0) {
          const lines = records.map(item => `For ${item.phaseName || item.contractor}: Quote is $${item.quote?.toLocaleString()}, Total Paid is $${item.totalPaid?.toLocaleString()}, and Remaining Balance owed is $${item.remainingBalance?.toLocaleString()}.`);
          responses.push(lines.join('\n'));
        } else {
          responses.push(res.message || 'No balance records found.');
        }
      } else if (t.name === 'search_receipts') {
        const receipts = res.results || res.receipts || [];
        if (receipts.length > 0) {
          responses.push(`Found ${receipts.length} receipt(s) totaling $${receipts.reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}.`);
        } else {
          responses.push(res.message || 'No matching receipts found.');
        }
      } else if (t.name === 'search_memories' || t.name === 'list_memories') {
        const memories = res.memories || [];
        if (memories.length > 0) {
          const list = memories.map(m => `• ${m.text}`).join('\n');
          responses.push(list);
        } else {
          responses.push(`I don't have any saved notes or preferences matching that request for this project.`);
        }
      } else if (t.name === 'get_drive_files') {
        const files = res.files || [];
        if (res.isFolderEmpty && res.folderName) {
          responses.push(`The "${res.folderName}" directory exists in Google Drive for ${activeProject}, but it does not currently contain any files.`);
        } else if (files.length > 0) {
          const list = files.map(f => `• ${f.name} (${f.folderName || 'Google Drive'})`).join('\n');
          responses.push(list);
        } else {
          responses.push(res.message || `No files found in Google Drive for ${activeProject}.`);
        }
      } else if (res.message) {
        responses.push(res.message);
      }
    }
    return responses.length > 0 ? responses.join('\n\n') : null;
  }
};

/**
 * ----------------------------------------------------------------------------
 * TRUE PLUGIN-BASED SEMANTIC INTENT REGISTRY
 * ----------------------------------------------------------------------------
 */
export class SemanticIntentRegistry {
  constructor() {
    this._plugins = new Map();
    this._initializeBuiltins();
  }

  _initializeBuiltins() {
    this.registerPlugin(AnalyticalPlugin);
    this.registerPlugin(VerificationMetaPlugin);
    this.registerPlugin(ExplanationWhyPlugin);
    this.registerPlugin(SummarizationPlugin);
    this.registerPlugin(InstructionHowToPlugin);
    this.registerPlugin(RecommendationPlugin);
    this.registerPlugin(PlanningPlugin);
    this.registerPlugin(ConfirmationPlugin);
    this.registerPlugin(ActionCommandPlugin);
    this.registerPlugin(ClarificationPlugin);
    this.registerPlugin(RetrievalPlugin);
  }

  /**
   * Registers a self-contained modality plugin with strict contract validation.
   */
  registerPlugin(plugin) {
    validatePluginContract(plugin);
    this._plugins.set(plugin.id, {
      ...plugin,
      priority: plugin.priority ?? 500
    });
    return true;
  }

  /**
   * Backward-compatible helper for object-based modality registration.
   */
  registerModality(id, handler = {}) {
    return this.registerPlugin({
      id,
      name: handler.name || id,
      priority: handler.priority ?? 500,
      description: handler.description || 'Custom Modality',
      promptGuideline: handler.promptGuideline || '',
      classifier: typeof handler.classifier === 'function' ? handler.classifier : () => false,
      isApplicable: handler.isApplicable,
      synthesizeEvidence: handler.synthesizeEvidence
    });
  }

  /**
   * Unregisters a modality plugin.
   */
  unregisterPlugin(id) {
    return this._plugins.delete(id);
  }

  unregisterModality(id) {
    return this.unregisterPlugin(id);
  }

  /**
   * Checks if a modality plugin is registered.
   */
  hasModality(id) {
    return this._plugins.has(id);
  }

  /**
   * Retrieves a registered plugin by ID.
   */
  getPlugin(id) {
    return this._plugins.get(id) || null;
  }

  /**
   * Returns all plugins sorted by priority.
   */
  getPlugins() {
    return Array.from(this._plugins.values()).sort((a, b) => a.priority - b.priority);
  }

  getModalities() {
    return this.getPlugins();
  }

  /**
   * Deterministic Semantic Intent Classifier with Multi-Match & Conflict Resolution
   */
  classify(query = '', conversationHistory = [], context = {}, evidenceList = []) {
    if (!query || typeof query !== 'string') {
      return {
        modality: INTENT_MODALITIES.RETRIEVAL,
        confidence: 1.0,
        score: 100,
        subIntent: 'direct_retrieval'
      };
    }

    const clean = query.trim().toLowerCase();
    const matches = [];

    for (const plugin of this.getPlugins()) {
      if (plugin.id === INTENT_MODALITIES.RETRIEVAL) continue; // evaluated as fallback

      // 1. Check optional applicability guard
      if (typeof plugin.isApplicable === 'function') {
        try {
          if (!plugin.isApplicable(context, evidenceList)) {
            continue;
          }
        } catch (_) {
          continue;
        }
      }

      // 2. Evaluate classifier
      try {
        const result = plugin.classifier(clean, conversationHistory, context);
        if (result) {
          const confidence = typeof result === 'object' && result.confidence ? result.confidence : 0.90;
          const specificity = typeof result === 'object' && result.specificity ? result.specificity : 1.0;
          const subIntent = typeof result === 'object' && result.subIntent ? result.subIntent : plugin.description;

          // Deterministic multi-match score: higher confidence & specificity wins, priority breaks ties
          const score = (confidence * 100) + (specificity * 10) - (plugin.priority * 0.1);

          matches.push({
            modality: plugin.id,
            confidence,
            specificity,
            priority: plugin.priority,
            score,
            subIntent,
            plugin
          });
        }
      } catch (_) {}
    }

    if (matches.length > 0) {
      // Deterministically pick highest scored match
      matches.sort((a, b) => b.score - a.score);
      const winner = matches[0];
      return {
        modality: winner.modality,
        confidence: winner.confidence,
        score: winner.score,
        subIntent: winner.subIntent
      };
    }

    // Default Fallback: Retrieval
    return {
      modality: INTENT_MODALITIES.RETRIEVAL,
      confidence: 0.90,
      score: 0,
      subIntent: 'default_retrieval'
    };
  }

  /**
   * Compiles dynamic grounding guidelines for Gemini Cloud AI prompt from all registered plugins.
   */
  compilePromptGuidelines() {
    const guidelines = [];
    for (const plugin of this.getPlugins()) {
      if (plugin.promptGuideline) {
        guidelines.push(`- ${plugin.promptGuideline}`);
      }
    }
    return guidelines.join('\n');
  }

  /**
   * Universal Intent-Aware Grounded Evidence Synthesizer
   */
  synthesize(toolTelemetryList = [], userQuery = '', projectContext = {}) {
    const successfulTools = (toolTelemetryList || []).filter(t => t.success && t.result);
    if (successfulTools.length === 0) {
      const errorTool = (toolTelemetryList || []).find(t => !t.success && (t.error || t.result?.error));
      return errorTool ? (errorTool.error || errorTool.result?.error || 'Action could not be completed.') : null;
    }

    const classification = this.classify(userQuery, [], projectContext, successfulTools);
    const plugin = this._plugins.get(classification.modality);

    if (plugin && typeof plugin.synthesizeEvidence === 'function') {
      const result = plugin.synthesizeEvidence(successfulTools, userQuery, projectContext);
      if (result) return result;
    }

    // Fallback to Retrieval Plugin
    const retrievalPlugin = this._plugins.get(INTENT_MODALITIES.RETRIEVAL);
    if (retrievalPlugin && typeof retrievalPlugin.synthesizeEvidence === 'function') {
      return retrievalPlugin.synthesizeEvidence(successfulTools, userQuery, projectContext);
    }

    return null;
  }
}

// Global Singleton Registry
export const intentRegistry = new SemanticIntentRegistry();

/**
 * Public Classification API
 */
export function classifySemanticIntent(query = '', conversationHistory = [], context = {}, evidenceList = []) {
  return intentRegistry.classify(query, conversationHistory, context, evidenceList);
}

/**
 * Public Grounded Synthesis API
 */
export function synthesizeGroundedEvidence(toolTelemetryList = [], userQuery = '', projectContext = {}) {
  return intentRegistry.synthesize(toolTelemetryList, userQuery, projectContext);
}

/**
 * Public Cloud AI Grounding Prompt Compiler
 */
export function getSemanticPromptGuidelines() {
  return intentRegistry.compilePromptGuidelines();
}
