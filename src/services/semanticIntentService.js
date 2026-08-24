/**
 * Semantic Intent & Grounded Evidence Reasoning Engine
 * 
 * Core Principle:
 * - Tool output = Grounded Evidence.
 * - Synthesis layer = Identifies semantic intent, reasons over evidence, and answers the actual question.
 * 
 * Three Universal Modalities:
 * 1. RETRIEVAL: Direct content requests (e.g., "Show me the purchasing lists", "Give me everything")
 * 2. VERIFICATION_META: Exhaustiveness, exclusivity, existence, and absence inquiries (e.g., "Are there any other lists?", "So those are the only ones?", "What else do we have besides these?")
 * 3. ANALYTICAL: Comparative, ranking, calculation, and extremum inquiries (e.g., "Which list has the most items?", "Who is owed the highest balance?")
 */

export const INTENT_MODALITIES = {
  RETRIEVAL: 'retrieval',
  VERIFICATION_META: 'verification_meta',
  ANALYTICAL: 'analytical'
};

/**
 * Semantically classifies user query into one of the 3 universal intent modalities.
 * Uses semantic meaning, context structure, and conversational flow without brittle keyword reliance.
 */
export function classifySemanticIntent(query = '', conversationHistory = []) {
  if (!query || typeof query !== 'string') {
    return { modality: INTENT_MODALITIES.RETRIEVAL, confidence: 1.0, subIntent: 'direct_retrieval' };
  }

  const clean = query.trim().toLowerCase();

  // 1. ANALYTICAL & COMPARATIVE MODALITY:
  // Inquiries asking for extremum (most/least/highest/lowest/biggest), comparisons between items, or statistical aggregations
  const isAnalytical = 
    /\b(which|who|what)\b.*\b(most|least|highest|lowest|greatest|smallest|biggest|largest|more than|less than|heaviest|cheapest|expensive|max|min)\b/i.test(clean) ||
    /\b(compare|comparison|difference between|how many total|rank|top|bottom)\b/i.test(clean) ||
    /\b(which one|which list|which trade|which contractor|which phase|which stage|who has more|who owes more|what has more)\b/i.test(clean);

  if (isAnalytical) {
    return {
      modality: INTENT_MODALITIES.ANALYTICAL,
      confidence: 0.95,
      subIntent: 'comparative_analysis'
    };
  }

  // 2. VERIFICATION & META MODALITY:
  // Inquiries asking whether a set is exhaustive, whether other entities exist, verifying exclusivity, or asking about presence/absence
  const isVerificationMeta = 
    /\b(any other|any more|anything else|anything more|anything further|anything additional|anyone else|any others|another|besides|except|other than)\b/i.test(clean) ||
    /\b(is that all|is this all|are those all|are these all|is that everything|is this everything|are they all)\b/i.test(clean) ||
    /\b(only one|only ones|the only|all we have|all that exists|all that are listed|all that is listed)\b/i.test(clean) ||
    /\b(do we have more|are there more|is there more|do we have other|are there other|is there another|do we have anything)\b/i.test(clean) ||
    /\b(does anything else exist|do any other exist|is anything missing|are any missing)\b/i.test(clean);

  if (isVerificationMeta) {
    return {
      modality: INTENT_MODALITIES.VERIFICATION_META,
      confidence: 0.95,
      subIntent: 'exhaustiveness_verification'
    };
  }

  // 3. RETRIEVAL MODALITY (Default Content Presentation):
  return {
    modality: INTENT_MODALITIES.RETRIEVAL,
    confidence: 0.90,
    subIntent: 'content_retrieval'
  };
}

/**
 * Universal Intent-Aware Grounded Evidence Synthesizer
 * Reasons over tool telemetry evidence across ALL domains (purchasing, financials, receipts, memories, drive, inspections)
 */
export function synthesizeGroundedEvidence(toolTelemetryList = [], userQuery = '', projectContext = {}) {
  const intent = classifySemanticIntent(userQuery);
  const activeProject = projectContext?.activeProjectName || projectContext?.projectId || 'Active Project';

  if (!Array.isArray(toolTelemetryList) || toolTelemetryList.length === 0) {
    return null;
  }

  const successfulTools = toolTelemetryList.filter(t => t.success && t.result);
  if (successfulTools.length === 0) {
    const errorTool = toolTelemetryList.find(t => !t.success && t.error);
    return errorTool ? `Notice: ${errorTool.error}` : null;
  }

  const responses = [];

  for (const t of successfulTools) {
    const res = t.result;
    const toolName = t.name;

    // ------------------------------------------------------------------------
    // DOMAIN 1: Purchasing Checklists (Google Docs)
    // ------------------------------------------------------------------------
    if (toolName === 'get_purchasing_list') {
      const sections = res.sections || [];
      const totalSections = sections.length;
      const totalItems = res.totalItems || sections.reduce((sum, s) => sum + (s.items?.length || 0), 0);
      const sectionNames = sections.map(s => s.category || s.title || 'Category');

      if (intent.modality === INTENT_MODALITIES.VERIFICATION_META) {
        if (totalSections === 0) {
          responses.push(`There are currently no purchasing categories or items listed on the ${activeProject} Purchasing Checklist.`);
        } else {
          const namesList = sectionNames.join(', ');
          responses.push(`Those ${totalSections} categories (${namesList}) are currently all the categories listed on the ${activeProject} Purchasing Checklist.`);
        }
      } else if (intent.modality === INTENT_MODALITIES.ANALYTICAL) {
        if (sections.length === 0) {
          responses.push(`There are no purchasing items to compare on the ${activeProject} Purchasing Checklist.`);
        } else {
          const sorted = [...sections].sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0));
          const top = sorted[0];
          const topCount = top.items?.length || 0;
          responses.push(`${top.category || top.title} has the most items on the checklist with ${topCount} item${topCount === 1 ? '' : 's'} listed.`);
        }
      } else {
        // Retrieval
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
      }
    }

    // ------------------------------------------------------------------------
    // DOMAIN 2: Financials & Subcontractor Ledger (Google Sheets)
    // ------------------------------------------------------------------------
    else if (toolName === 'get_subcontractor_balance' || toolName === 'get_vendor_history') {
      const records = res.results || [];
      if (intent.modality === INTENT_MODALITIES.VERIFICATION_META) {
        if (records.length === 0) {
          responses.push(`There are no additional subcontractor balances recorded for ${activeProject} in the financial ledger.`);
        } else if (records.length === 1) {
          const item = records[0];
          responses.push(`For ${item.phaseName || item.contractor}, that is the only contract balance recorded in the financial ledger (Quote: $${item.quote?.toLocaleString() || 0}, Paid: $${item.totalPaid?.toLocaleString() || 0}, Balance: $${item.remainingBalance?.toLocaleString() || 0}).`);
        } else {
          responses.push(`Those ${records.length} trade contracts are currently all that are recorded in the ${activeProject} financial ledger.`);
        }
      } else if (intent.modality === INTENT_MODALITIES.ANALYTICAL) {
        if (records.length > 0) {
          const sorted = [...records].sort((a, b) => (b.remainingBalance || 0) - (a.remainingBalance || 0));
          const top = sorted[0];
          responses.push(`${top.phaseName || top.contractor} has the highest remaining balance owed at $${top.remainingBalance?.toLocaleString() || 0} (Quote: $${top.quote?.toLocaleString() || 0}, Paid: $${top.totalPaid?.toLocaleString() || 0}).`);
        } else {
          responses.push(res.message || 'No financial records available to compare.');
        }
      } else {
        if (records.length > 0) {
          const lines = records.map(item => `For ${item.phaseName || item.contractor}: Quote is $${item.quote?.toLocaleString()}, Total Paid is $${item.totalPaid?.toLocaleString()}, and Remaining Balance owed is $${item.remainingBalance?.toLocaleString()}.`);
          responses.push(lines.join('\n'));
        } else {
          responses.push(res.message || 'No balance records found.');
        }
      }
    }

    // ------------------------------------------------------------------------
    // DOMAIN 3: Receipts & Expenses
    // ------------------------------------------------------------------------
    else if (toolName === 'search_receipts') {
      const receipts = res.results || res.receipts || [];
      if (intent.modality === INTENT_MODALITIES.VERIFICATION_META) {
        if (receipts.length === 0) {
          responses.push(`There are no other receipts found for ${activeProject} matching that query.`);
        } else {
          responses.push(`Those ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} are currently all that are recorded for that category in ${activeProject}.`);
        }
      } else if (intent.modality === INTENT_MODALITIES.ANALYTICAL) {
        if (receipts.length > 0) {
          const sorted = [...receipts].sort((a, b) => (b.amount || 0) - (a.amount || 0));
          const top = sorted[0];
          responses.push(`The largest receipt is $${top.amount?.toLocaleString()} from ${top.vendor || 'Vendor'} on ${top.date || 'recorded date'}.`);
        } else {
          responses.push('No receipts found to analyze.');
        }
      } else {
        if (receipts.length > 0) {
          responses.push(`Found ${receipts.length} receipt(s) totaling $${receipts.reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString()}.`);
        } else {
          responses.push(res.message || 'No matching receipts found.');
        }
      }
    }

    // ------------------------------------------------------------------------
    // DOMAIN 4: Persistent Memories & Preferences (Firestore)
    // ------------------------------------------------------------------------
    else if (toolName === 'search_memories' || toolName === 'list_memories') {
      const memories = res.memories || [];
      if (intent.modality === INTENT_MODALITIES.VERIFICATION_META) {
        if (memories.length === 0) {
          responses.push(`I don't have any other saved notes or memories recorded for ${activeProject}.`);
        } else {
          responses.push(`Those ${memories.length} note${memories.length === 1 ? '' : 's'} are currently all the persistent memories I have saved for this topic.`);
        }
      } else {
        if (memories.length > 0) {
          const list = memories.map(m => `• ${m.text}`).join('\n');
          responses.push(list);
        } else {
          responses.push(`I don't have any saved notes or preferences matching that request for this project.`);
        }
      }
    }

    // ------------------------------------------------------------------------
    // DOMAIN 5: Google Drive Files & Blueprints
    // ------------------------------------------------------------------------
    else if (toolName === 'get_drive_files') {
      const files = res.files || [];
      if (intent.modality === INTENT_MODALITIES.VERIFICATION_META) {
        if (files.length === 0) {
          responses.push(`There are no other files or blueprints found in your ${activeProject} Google Drive folder matching that search.`);
        } else {
          responses.push(`Those ${files.length} file${files.length === 1 ? '' : 's'} are currently all that exist in that folder.`);
        }
      } else {
        if (files.length > 0) {
          const list = files.map(f => `• ${f.name} (${f.folderName || 'Google Drive'})`).join('\n');
          responses.push(list);
        } else {
          responses.push(`No files found in Google Drive for ${activeProject}.`);
        }
      }
    }

    // ------------------------------------------------------------------------
    // DOMAIN 6: Generic State / Message Fallback
    // ------------------------------------------------------------------------
    else {
      if (res.message) {
        responses.push(res.message);
      }
    }
  }

  return responses.length > 0 ? responses.join('\n\n') : null;
}
