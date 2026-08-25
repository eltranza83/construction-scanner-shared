/**
 * J.A.R.V.I.S. Extensible Semantic Intent & Grounded Evidence Reasoning Engine
 * 
 * Core Architectural Pillars:
 * 1. Tool Output = Grounded Evidence.
 * 2. Semantic Intent Engine = Classifies user intent based on semantic meaning & context.
 * 3. Synthesis Layer = Reasons over evidence according to the active modality.
 * 4. Extensible Registry = Allows registering new modalities (Explanation, Summarization, Planning, etc.)
 *    without modifying existing core reasoning logic.
 */

export const INTENT_MODALITIES = Object.freeze({
  // Core Default Modalities
  RETRIEVAL: 'retrieval',
  VERIFICATION_META: 'verification_meta',
  ANALYTICAL: 'analytical',

  // Extensible Future Modalities
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
 * Universal Intent Registry for Modality Handlers and Grounding Prompts
 */
class SemanticIntentRegistry {
  constructor() {
    this._modalities = new Map();
    this._initializeStandardModalities();
  }

  _initializeStandardModalities() {
    // 1. Analytical & Comparative Modality
    this.registerModality(INTENT_MODALITIES.ANALYTICAL, {
      priority: 10,
      description: 'Comparative, ranking, extremum (most/least/highest/lowest), and statistical calculation inquiries.',
      promptGuideline: 'ANALYTICAL & COMPARATIVE: Perform calculations, comparisons, or rankings over the evidence and state the specific analytical answer directly with supporting figures.',
      classifier: (cleanQuery) => {
        return (
          /\b(which|who|what)\b.*\b(most|least|highest|lowest|greatest|smallest|biggest|largest|more than|less than|heaviest|cheapest|expensive|max|min)\b/i.test(cleanQuery) ||
          /\b(compare|comparison|difference between|how many total|rank|top|bottom)\b/i.test(cleanQuery) ||
          /\b(which one|which list|which trade|which contractor|which phase|which stage|who has more|who owes more|what has more)\b/i.test(cleanQuery)
        );
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
    });

    // 2. Verification & Meta Modality
    this.registerModality(INTENT_MODALITIES.VERIFICATION_META, {
      priority: 20,
      description: 'Exhaustiveness, exclusivity, existence, presence/absence, and completeness inquiries.',
      promptGuideline: 'VERIFICATION & META: Answer the existential/completeness question directly (e.g. "Those N items are currently all that are recorded on [Source].") rather than dumping raw lists.',
      classifier: (cleanQuery) => {
        return (
          /\b(any other|any more|anything else|anything more|anything further|anything additional|anyone else|any others|another|besides|except|other than)\b/i.test(cleanQuery) ||
          /\b(is that all|is this all|are those all|are these all|is that everything|is this everything|are they all)\b/i.test(cleanQuery) ||
          /\b(only one|only ones|the only|all we have|all that exists|all that are listed|all that is listed)\b/i.test(cleanQuery) ||
          /\b(do we have more|are there more|is there more|do we have other|are there other|is there another|do we have anything)\b/i.test(cleanQuery) ||
          /\b(does anything else exist|do any other exist|is anything missing|are any missing)\b/i.test(cleanQuery)
        );
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
            responses.push(`Those ${files.length} file${files.length === 1 ? '' : 's'} are currently all that exist in that folder.`);
          }
        }
        return responses.length > 0 ? responses.join('\n\n') : null;
      }
    });

    // 3. Explanation & Why Modality
    this.registerModality(INTENT_MODALITIES.EXPLANATION_WHY, {
      priority: 30,
      description: 'Reasoning, root cause, rationale, and justification inquiries.',
      promptGuideline: 'EXPLANATION & WHY: Provide a clear, logical rationale and root cause grounded strictly in project records.',
      classifier: (cleanQuery) => {
        return /\b(why|reason|explain why|how come|what caused|why did|rationale)\b/i.test(cleanQuery);
      }
    });

    // 4. Summarization Modality
    this.registerModality(INTENT_MODALITIES.SUMMARIZATION, {
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
    });

    // 5. Instruction / How-To Modality
    this.registerModality(INTENT_MODALITIES.INSTRUCTION_HOWTO, {
      priority: 50,
      description: 'Procedural, sequential, and how-to guidance inquiries.',
      promptGuideline: 'INSTRUCTION & HOW-TO: Provide step-by-step procedural directions aligned with jobsite standards and municipal protocols.',
      classifier: (cleanQuery) => {
        return /\b(how do i|how to|what steps|procedure|step by step|how should we|guide me)\b/i.test(cleanQuery);
      }
    });

    // 6. Recommendation Modality
    this.registerModality(INTENT_MODALITIES.RECOMMENDATION, {
      priority: 60,
      description: 'Best practice suggestions, material recommendations, and trade advisory.',
      promptGuideline: 'RECOMMENDATION: Provide grounded expert recommendations tailored to the specific lot constraints.',
      classifier: (cleanQuery) => {
        return /\b(recommend|suggest|what do you suggest|what should i buy|best option|advice|advise)\b/i.test(cleanQuery);
      }
    });

    // 7. Planning Modality
    this.registerModality(INTENT_MODALITIES.PLANNING, {
      priority: 70,
      description: 'Phase timeline, mobilization scheduling, and trade sequencing inquiries.',
      promptGuideline: 'PLANNING: Outline sequencing dependencies, trade prerequisites, and milestone roadmaps.',
      classifier: (cleanQuery) => {
        return /\b(plan|schedule|timeline|next phase|sequencing|when should we|roadmap)\b/i.test(cleanQuery);
      }
    });

    // 8. Confirmation Modality
    this.registerModality(INTENT_MODALITIES.CONFIRMATION, {
      priority: 80,
      description: 'Affirmations, approvals, and user consent for pending actions.',
      promptGuideline: 'CONFIRMATION: Execute the confirmed staged action and state completion clearly.',
      classifier: (cleanQuery) => {
        return /^(yes|yeah|yep|sure|go ahead|proceed|approved|do it|confirm|sounds good|please do)$/i.test(cleanQuery.trim());
      }
    });

    // 9. Action / Command Modality
    this.registerModality(INTENT_MODALITIES.ACTION_COMMAND, {
      priority: 90,
      description: 'Imperative modifications, document writes, reminders, and database updates.',
      promptGuideline: 'ACTION & COMMAND: Execute the requested mutation tool accurately and confirm success.',
      classifier: (cleanQuery) => {
        return /\b(add|create|update|mark|delete|remove|sync|save|remind me|schedule)\b/i.test(cleanQuery) && !/\b(how do i|how to)\b/i.test(cleanQuery);
      }
    });

    // 10. Clarification Modality
    this.registerModality(INTENT_MODALITIES.CLARIFICATION, {
      priority: 100,
      description: 'Disambiguation and follow-up inquiry when details are ambiguous.',
      promptGuideline: 'CLARIFICATION: Ask a targeted follow-up question to resolve ambiguity before proceeding.',
      classifier: (cleanQuery) => {
        return /\b(what do you mean|clarify|elaborate|which one do you mean)\b/i.test(cleanQuery);
      }
    });

    // 11. Content Retrieval Modality (Default Fallback)
    this.registerModality(INTENT_MODALITIES.RETRIEVAL, {
      priority: 999,
      description: 'Standard factual lookup and full content record retrieval.',
      promptGuideline: 'CONTENT RETRIEVAL: Present the retrieved data cleanly, faithfully, and completely without artificial truncation.',
      classifier: () => true, // default catch-all
      synthesizeEvidence: (evidenceList, query, projectContext) => {
        const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';
        const responses = [];

        for (const t of evidenceList) {
          const res = t.result;
          if (t.name === 'get_purchasing_list') {
            const sections = res.sections || [];
            if (sections.length > 0) {
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
            if (files.length > 0) {
              const list = files.map(f => `• ${f.name} (${f.folderName || 'Google Drive'})`).join('\n');
              responses.push(list);
            } else {
              responses.push(`No files found in Google Drive for ${activeProject}.`);
            }
          } else if (res.message) {
            responses.push(res.message);
          }
        }
        return responses.length > 0 ? responses.join('\n\n') : null;
      }
    });
  }

  /**
   * Extensibility Hook: Register a new custom modality dynamically at runtime.
   */
  registerModality(id, handler = {}) {
    if (!id) return;
    this._modalities.set(id, {
      id,
      priority: handler.priority ?? 500,
      description: handler.description || 'Custom semantic modality',
      promptGuideline: handler.promptGuideline || '',
      classifier: typeof handler.classifier === 'function' ? handler.classifier : () => false,
      synthesizeEvidence: typeof handler.synthesizeEvidence === 'function' ? handler.synthesizeEvidence : null
    });
  }

  /**
   * Unregister a modality
   */
  unregisterModality(id) {
    this._modalities.delete(id);
  }

  /**
   * Returns sorted modalities by priority
   */
  getModalities() {
    return Array.from(this._modalities.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Classify user query against all registered semantic modalities
   */
  classify(query = '', conversationHistory = []) {
    if (!query || typeof query !== 'string') {
      return { modality: INTENT_MODALITIES.RETRIEVAL, confidence: 1.0, subIntent: 'direct_retrieval' };
    }

    const clean = query.trim().toLowerCase();
    const sorted = this.getModalities();

    for (const mod of sorted) {
      if (mod.id === INTENT_MODALITIES.RETRIEVAL) continue; // evaluated last
      try {
        if (mod.classifier(clean, conversationHistory)) {
          return {
            modality: mod.id,
            confidence: 0.95,
            subIntent: mod.description
          };
        }
      } catch (_) {}
    }

    return {
      modality: INTENT_MODALITIES.RETRIEVAL,
      confidence: 0.90,
      subIntent: 'default_retrieval'
    };
  }

  /**
   * Dynamically compiles guidelines for the Gemini cloud grounding prompt from all registered modalities
   */
  compilePromptGuidelines() {
    const guidelines = [];
    for (const mod of this.getModalities()) {
      if (mod.promptGuideline) {
        guidelines.push(`- ${mod.promptGuideline}`);
      }
    }
    return guidelines.join('\n');
  }

  /**
   * Synthesize evidence using the appropriate registered modality synthesizer
   */
  synthesize(toolTelemetryList = [], userQuery = '', projectContext = {}) {
    const classification = this.classify(userQuery);
    const mod = this._modalities.get(classification.modality);

    const successfulTools = (toolTelemetryList || []).filter(t => t.success && t.result);
    if (successfulTools.length === 0) {
      const errorTool = (toolTelemetryList || []).find(t => !t.success && t.error);
      return errorTool ? `Notice: ${errorTool.error}` : null;
    }

    if (mod && typeof mod.synthesizeEvidence === 'function') {
      const result = mod.synthesizeEvidence(successfulTools, userQuery, projectContext);
      if (result) return result;
    }

    // Default to retrieval synthesizer
    const defaultMod = this._modalities.get(INTENT_MODALITIES.RETRIEVAL);
    if (defaultMod && typeof defaultMod.synthesizeEvidence === 'function') {
      return defaultMod.synthesizeEvidence(successfulTools, userQuery, projectContext);
    }

    return null;
  }
}

// Global Singleton Registry
export const intentRegistry = new SemanticIntentRegistry();

/**
 * Public Classify Function (Synchronized across Cloud & Local Paths)
 */
export function classifySemanticIntent(query = '', conversationHistory = []) {
  return intentRegistry.classify(query, conversationHistory);
}

/**
 * Public Evidence Synthesizer
 */
export function synthesizeGroundedEvidence(toolTelemetryList = [], userQuery = '', projectContext = {}) {
  return intentRegistry.synthesize(toolTelemetryList, userQuery, projectContext);
}

/**
 * Public Dynamic Guidelines Compiler for Gemini Prompting
 */
export function getSemanticPromptGuidelines() {
  return intentRegistry.compilePromptGuidelines();
}
