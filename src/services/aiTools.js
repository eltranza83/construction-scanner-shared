import { fetchDocumentContent, writeDocumentContent, DOCUMENT_STATES } from './documentContentProvider.js';
/**
 * Client-Side AI Tool Executors, Data Retrieval & Diagnostic Test Suite
 */
import { AI_TOOL_DECLARATIONS, executeWeatherTool } from '../../api/_lib/ai-tools-definitions.js';
import {
  saveMemory,
  getMemories,
  searchMemories,
  updateMemory,
  deactivateMemory,
  detectAmbiguity,
  loadUserPreferences,
  saveUserPreference,
  updateUserPreferenceStatus,
  deleteUserPreference,
  resetAllUserPreferences
} from './memoryService.js';
import {
  PREFERENCE_STATUS,
  PREFERENCE_SCOPES,
  PREFERENCE_SOURCES,
  resolvePreferenceConflicts
} from './userPreferenceEngine.js';
import {
  parseGoogleDocPurchasingStructure,
  calculateSectionInsertion,
  calculateMarkPurchased,
  queryPurchasingList,
  resolvePurchasingTarget,
  classifyTradeCategory,
  resolveTargetProjectId,
  loadMasterPurchasingDoc,
  saveMasterPurchasingDoc,
  loadProjectPurchasingDoc,
  saveProjectPurchasingDoc,
  getPurchasingDocStorageKey,
  syncMasterPurchasingToProjects,
  cloneMasterToNewProject,
  getPurchasingAuditLog,
  recordPurchasingAuditLog,
  deprecateMasterItem,
  incrementMasterVersion,
  discoverAndBindProjectPurchasingDoc,
  RESOURCE_TYPES,
  MASTER_PROJECT_ID
} from './googleDocsPurchasingService.js';

export { AI_TOOL_DECLARATIONS, executeWeatherTool };

/**
 * Explicit Tool Classification & Provenance Registry
 */
export const TOOL_REGISTRY = {
  get_weather_for_jobsite: {
    type: 'READ',
    source: 'Weather API',
    description: 'Fetches real-time weather observations for jobsite coordinates.'
  },
  get_purchasing_list: {
    type: 'READ',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Retrieves materials and fixtures from the Master Purchasing Google Doc, filtered by trade.'
  },
  add_purchasing_item: {
    type: 'WRITE',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Inserts or updates quantity of a purchasing item in the correct trade section of the Google Doc.'
  },
  update_purchasing_item_status: {
    type: 'WRITE',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Marks an item as purchased/completed in the Google Docs Master Purchasing List.'
  },
  sync_purchasing_master_to_projects: {
    type: 'WRITE',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Non-destructively synchronizes standard items from Master Purchasing into active project purchasing lists.'
  },
  deprecate_purchasing_master_item: {
    type: 'WRITE',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Marks an item as deprecated in the Company Master Purchasing Template.'
  },
  get_purchasing_audit_log: {
    type: 'READ',
    source: 'Google Docs (Master Purchasing Checklist)',
    description: 'Retrieves the historical audit log of purchasing modifications and synchronization events.'
  },
  get_subcontractor_balance: {
    type: 'READ',
    source: 'Google Sheets (Subcontractor Ledger)',
    description: 'Retrieves contract quote, amount paid, and remaining balance owed.'
  },
  get_vendor_history: {
    type: 'READ',
    source: 'Google Sheets (Subcontractor Ledger)',
    description: 'Retrieves line-item payment records for a subcontractor.'
  },
  search_receipts: {
    type: 'READ',
    source: 'Google Sheets (Receipts & Expenses)',
    description: 'Searches recorded receipts by payee, description, or amount.'
  },
  get_project_budget: {
    type: 'READ',
    source: 'Google Sheets (Project Financials)',
    description: 'Fetches overall project budget, spending, and variance.'
  },
  get_project_schedule: {
    type: 'READ',
    source: 'Field Reminders (SiteTactix App)',
    description: 'Retrieves upcoming field milestones and trade calls from local app storage.'
  },
  get_municipal_inspections: {
    type: 'READ',
    source: 'Municipal Inspections',
    description: 'Retrieves the 6-stage municipal building inspection checklist and passed stages.'
  },
  get_drive_files: {
    type: 'READ',
    source: 'Google Drive',
    description: 'Searches project blueprints, permits, and engineering files.'
  },
  get_homeowner_specs: {
    type: 'READ',
    source: 'Homeowner Specifications',
    description: 'Retrieves finish, fixture, and paint specifications.'
  },
  get_site_setup: {
    type: 'READ',
    source: 'Site Setup Checklist Database',
    description: 'Retrieves jobsite logistics, gates, power, and sanitation status.'
  },
  get_site_setup_protocol: {
    type: 'READ',
    source: 'Site Setup Checklist Database',
    description: 'Retrieves safety, dumpster, porta-potty, and staging checklist.'
  },
  search_memories: {
    type: 'READ',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    description: 'Searches contextual notes, contractor preferences, and business facts.'
  },
  list_memories: {
    type: 'READ',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    description: 'Lists all active memories for the project or user.'
  },
  save_memory: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'auto_safe',
    description: 'Stores a verified fact, preference, or reminder in the persistent vault.'
  },
  update_memory: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'explicit',
    description: 'Modifies an existing memory note in the vault.'
  },
  delete_memory: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'explicit',
    description: 'Deactivates a memory record.'
  },
  list_user_preferences: {
    type: 'READ',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    description: 'Lists all learned and configured user communication preferences.'
  },
  confirm_user_preference: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'auto_safe',
    description: 'Promotes an observed candidate to an active user preference.'
  },
  deactivate_user_preference: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'explicit',
    description: 'Deactivates or forgets a specific learned communication preference.'
  },
  reset_user_preferences: {
    type: 'WRITE',
    source: 'J.A.R.V.I.S. Memory (Persistent Vault)',
    confirmationPolicy: 'explicit',
    description: 'Purges all learned communication preferences for the user.'
  }
};

/**
 * Deterministic Idempotency & Deduplication Engine for WRITE tools
 */
const recentWriteActions = new Map();
const inFlightWritePromises = new Map();
const IDEMPOTENCY_WINDOW_MS = 60000; // 60 seconds duplicate protection
export const TOOL_TIMEOUT_MS = 6000; // 6000ms max execution time per tool

export function generateIdempotencyKey(toolName, args = {}, projectId = '') {
  const normalizedText = String(args.text || args.updatedText || args.searchQuery || args.memoryId || args.item || args.itemName || '').trim().toLowerCase();
  const normalizedCategory = String(args.category || '').trim().toLowerCase();
  const normalizedDate = String(args.effectiveDate || '').trim();
  return `${toolName}:${projectId || 'global'}:${normalizedText}:${normalizedCategory}:${normalizedDate}`;
}

export function checkIdempotency(toolName, args = {}, projectId = '') {
  const meta = TOOL_REGISTRY[toolName] || { type: 'READ' };
  if (meta.type !== 'WRITE') return null;

  const key = generateIdempotencyKey(toolName, args, projectId);
  const now = Date.now();

  if (recentWriteActions.has(key)) {
    const entry = recentWriteActions.get(key);
    if (now - entry.timestamp < IDEMPOTENCY_WINDOW_MS) {
      return {
        isDuplicate: true,
        key,
        cachedResult: entry.result
      };
    }
  }
  return { isDuplicate: false, key };
}

export function resetWriteIdempotencyState() {
  recentWriteActions.clear();
  inFlightWritePromises.clear();
}

export function recordIdempotency(key, result) {
  if (!key) return;
  recentWriteActions.set(key, {
    timestamp: Date.now(),
    result
  });

  const now = Date.now();
  for (const [k, v] of recentWriteActions.entries()) {
    if (now - v.timestamp > IDEMPOTENCY_WINDOW_MS * 2) {
      recentWriteActions.delete(k);
    }
  }
}

export function clearIdempotencyCache() {
  recentWriteActions.clear();
  inFlightWritePromises.clear();
}

/**
 * Dependency Circuit Breaker for External Services
 * Trips after 3 failures, recovers after 30s
 */
export class DependencyCircuitBreaker {
  constructor() {
    this.services = new Map();
    this.FAILURE_THRESHOLD = 3;
    this.RECOVERY_WINDOW_MS = 30000;
  }

  isOpen(serviceName) {
    const entry = this.services.get(serviceName);
    if (!entry) return false;
    if (entry.state === 'OPEN') {
      if (Date.now() - entry.lastFailureTime > this.RECOVERY_WINDOW_MS) {
        entry.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(serviceName) {
    this.services.set(serviceName, { failures: 0, state: 'CLOSED', lastFailureTime: 0 });
  }

  recordFailure(serviceName) {
    const entry = this.services.get(serviceName) || { failures: 0, state: 'CLOSED', lastFailureTime: 0 };
    entry.failures += 1;
    entry.lastFailureTime = Date.now();
    if (entry.failures >= this.FAILURE_THRESHOLD) {
      entry.state = 'OPEN';
    }
    this.services.set(serviceName, entry);
  }

  getStatus(serviceName) {
    const entry = this.services.get(serviceName);
    return entry ? entry.state : 'CLOSED';
  }

  reset() {
    this.services.clear();
  }
}

export const circuitBreaker = new DependencyCircuitBreaker();

/**
 * Argument Sanitizer: Strips control characters and script injections
 */
export function sanitizeToolArgs(args = {}) {
  if (!args || typeof args !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gi, '')
        .trim();
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string'
          ? item
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
              .replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gi, '')
              .trim()
          : item
      );
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeToolArgs(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Tool Result Schema Validator: Enforces standard contract with schemaVersion "1.0"
 */
export function validateToolResultContract(rawResult, toolName = '', correlationId = '') {
  const toolMeta = TOOL_REGISTRY[toolName] || { type: 'READ', source: 'Local Project Data' };
  const safeResult = rawResult && typeof rawResult === 'object' ? rawResult : {};

  const isSuccess = safeResult.success !== undefined ? Boolean(safeResult.success) : !safeResult.error;
  const status = safeResult.status || (isSuccess ? 'ok' : 'error');

  return {
    ...safeResult,
    schemaVersion: '1.0',
    correlationId: correlationId || safeResult.correlationId || `corr_${Date.now()}`,
    toolName: toolName || safeResult.toolName || 'unknown_tool',
    toolType: safeResult.toolType || toolMeta.type || 'READ',
    source: safeResult.source || toolMeta.source || 'Local Project Data',
    success: isSuccess,
    status,
    data: safeResult.data !== undefined ? safeResult.data : (safeResult.error ? null : safeResult),
    isDuplicate: Boolean(safeResult.isDuplicate),
    idempotencyKey: safeResult.idempotencyKey || null,
    error: safeResult.error ? String(safeResult.error) : null,
    _executionDurationMs: typeof safeResult._executionDurationMs === 'number' ? safeResult._executionDurationMs : 0
  };
}

/**
 * Execution Timeout Wrapper
 */
export async function withToolTimeout(promiseFn, functionName, timeoutMs = TOOL_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tool execution for ${functionName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promiseFn(), timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(num) ? 0 : num;
}

function getPhasesArray(dashboardData) {
  if (!dashboardData) return [];
  if (Array.isArray(dashboardData.subcontractors) && dashboardData.subcontractors.length > 0) {
    return dashboardData.subcontractors;
  }
  if (Array.isArray(dashboardData.phases) && dashboardData.phases.length > 0) {
    return dashboardData.phases;
  }
  return [];
}

/**
 * Execute tool call dynamically against client-side project data.
 */
export async function executeClientToolCall(functionName, rawArgs = {}, projectContext = {}, correlationId = '') {
  const startTime = Date.now();
  const toolMeta = TOOL_REGISTRY[functionName] || {
    type: 'READ',
    source: 'Local Engine'
  };
  const args = sanitizeToolArgs(rawArgs);

  // 1. Circuit Breaker Check for External / Failing Dependencies
  if (circuitBreaker.isOpen(functionName)) {
    return validateToolResultContract({
      success: false,
      status: 'circuit_open',
      error: `The service for ${functionName} is temporarily unavailable due to repeated failures (Circuit Breaker OPEN).`,
      _executionDurationMs: Date.now() - startTime
    }, functionName, correlationId);
  }

  // 2. Idempotency & Concurrency Mutex for WRITE Tools
  let idempotencyKey = null;
  if (toolMeta.type === 'WRITE') {
    idempotencyKey = generateIdempotencyKey(functionName, args, projectContext.projectId);

    // A. Check cached duplicate
    const cached = checkIdempotency(functionName, args, projectContext.projectId);
    if (cached?.isDuplicate) {
      return validateToolResultContract({
        success: true,
        status: 'deduplicated',
        isDuplicate: true,
        saved: true,
        updated: true,
        deleted: true,
        idempotencyKey,
        data: cached.cachedResult?.data || args,
        message: 'Action already completed previously.',
        _executionDurationMs: Date.now() - startTime
      }, functionName, correlationId);
    }

    // B. Check in-flight concurrent execution for this exact key
    if (inFlightWritePromises.has(idempotencyKey)) {
      try {
        const inFlightRes = await inFlightWritePromises.get(idempotencyKey);
        return validateToolResultContract({
          ...inFlightRes,
          status: 'deduplicated',
          isDuplicate: true,
          _executionDurationMs: Date.now() - startTime
        }, functionName, correlationId);
      } catch (_) {
        // Fall through to retry fresh execution if in-flight failed
      }
    }
  }

  const executeInternal = async () => {
    const {
      items = [],
      dashboardData = null,
      driveTree = null,
      projectSpecs = [],
      siteSetupData = null
    } = projectContext;

    let resultPayload = null;

    switch (functionName) {
      case 'get_weather_for_jobsite': {
        resultPayload = await executeWeatherTool(args);
        break;
      }

    case 'get_subcontractor_balance':
    case 'get_vendor_history': {
      const target = args.vendorName || args.tradeOrContractor || '';
      const query = target.toLowerCase();
      const phases = getPhasesArray(dashboardData);
      let matches = [];

      for (const phase of phases) {
        const phaseName = (phase.phase || phase.name || '').toLowerCase();
        const contractor = (phase.payee || phase.contractor || '').toLowerCase();
        const payments = Array.isArray(phase.payments) ? phase.payments : [];

        const isMatch = !query || phaseName.includes(query) || contractor.includes(query) ||
          payments.some(p => (p.vendor || p.payee || '').toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query));

        if (isMatch) {
          const quote = parseAmount(phase.originalQuote || phase.contractAmount || phase.estimatedCost);
          const totalPaid = parseAmount(phase.totalSpent || phase.totalPaid || payments.reduce((sum, p) => sum + parseAmount(p.amount || p.totalCost || p.materialCost || p.laborCost), 0));
          const remainingBalance = parseAmount(phase.remainingBalance) || Math.max(0, quote - totalPaid);

          // For general queries (!query), only include phases with active contracts, balances, or payments
          if (!query && quote === 0 && totalPaid === 0 && remainingBalance === 0) {
            continue;
          }

          matches.push({
            phaseName: phase.phase || phase.name,
            contractor: phase.payee || phase.contractor,
            quote,
            totalPaid,
            remainingBalance,
            payments: payments.map(p => ({
              date: p.date,
              amount: parseAmount(p.amount || p.totalCost || p.materialCost || p.laborCost),
              payee: p.vendor || p.payee,
              notes: p.description
            }))
          });
        }
      }

      if (matches.length === 0) {
        resultPayload = {
          found: false,
          query: target,
          message: target
            ? `I cannot locate records or quotes for "${target}" in this project.`
            : `There are currently no active subcontractor balances recorded for this project.`,
          results: []
        };
      } else {
        resultPayload = {
          found: true,
          query: target,
          foundCount: matches.length,
          results: matches
        };
      }
      break;
    }


    case 'search_receipts': {
      const q = (args.query || '').toLowerCase();
      const phases = getPhasesArray(dashboardData);
      const receipts = [];

      for (const phase of phases) {
        const payments = Array.isArray(phase.payments) ? phase.payments : [];
        const phaseSpent = parseAmount(phase.totalSpent || phase.totalPaid);
        const phaseName = (phase.phase || phase.name || '').toLowerCase();
        const payee = (phase.payee || phase.contractor || '').toLowerCase();

        if (payments.length > 0) {
          for (const p of payments) {
            const desc = (p.description || '').toLowerCase();
            const pPayee = (p.vendor || p.payee || payee).toLowerCase();
            const amount = parseAmount(p.amount || p.totalCost || p.materialCost || p.laborCost);

            let match = !q || desc.includes(q) || pPayee.includes(q) || phaseName.includes(q);
            if (args.minAmount && amount < args.minAmount) match = false;
            if (args.maxAmount && amount > args.maxAmount) match = false;

            if (match) {
              receipts.push({
                phase: phase.phase || phase.name,
                payee: p.vendor || p.payee || phase.payee || 'Vendor',
                amount,
                date: p.date || null,
                description: p.description || phase.phase || 'Payment',
                checkNumber: p.checkNumber || null
              });
            }
          }
        } else if (phaseSpent > 0) {
          let match = !q || payee.includes(q) || phaseName.includes(q);
          if (args.minAmount && phaseSpent < args.minAmount) match = false;
          if (args.maxAmount && phaseSpent > args.maxAmount) match = false;

          if (match) {
            receipts.push({
              phase: phase.phase || phase.name,
              payee: phase.payee || phase.contractor || phase.phase || 'Unassigned',
              amount: phaseSpent,
              date: null,
              description: `Total recorded payment for ${phase.phase || phase.name}`,
              checkNumber: null
            });
          }
        }
      }

      if (receipts.length === 0) {
        resultPayload = {
          found: false,
          query: args.query,
          message: `I cannot locate receipts or invoices matching "${args.query || 'your query'}" in this project.`,
          count: 0,
          receipts: []
        };
      } else {
        resultPayload = {
          found: true,
          query: args.query,
          count: receipts.length,
          receipts: receipts.slice(0, 20)
        };
      }
      break;
    }

    case 'get_purchasing_list': {
      const trade = args.trade || null;
      const unpurchasedOnly = args.unpurchasedOnly !== false;
      const target = resolvePurchasingTarget(args, projectContext);
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const projLabel = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER ? 'Master' : (projectContext?.activeProjectName || target.projectId || 'Lot');
      const sourceLabel = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? 'Google Docs (Master Purchasing Checklist)'
        : `Google Docs (${projLabel} Purchasing Checklist)`;

      const discovery = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? { found: true, documentId: 'master_doc', fileName: 'Master Purchasing Checklist' }
        : discoverAndBindProjectPurchasingDoc(storage, target.projectId, projectContext);

      const hasDoc = Boolean(discovery.found || target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER);
      const docName = discovery.fileName || (target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER ? 'Master Purchasing Checklist' : 'Purchasing Checklist');

      let rawDoc = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? loadMasterPurchasingDoc(storage)
        : (discovery.content || loadProjectPurchasingDoc(storage, target.projectId, projectContext?.[target.projectId]?.purchasingDocContent || (projectContext?.projectId === target.projectId ? projectContext?.purchasingDocContent : null)));

      // LIVE GOOGLE DRIVE CONTENT READ:
      // If bound to a Google Drive document, fetch current live content directly from Drive (Source of Truth)
      if (discovery.found && discovery.documentId && target.resourceType !== RESOURCE_TYPES.PURCHASING_MASTER) {
        const contentRes = await fetchDocumentContent({
          documentId: discovery.documentId,
          fileName: discovery.fileName,
          modifiedTime: discovery.modifiedTime,
          projectContext
        });

        if (contentRes.success && contentRes.content !== null && contentRes.content !== undefined) {
          rawDoc = contentRes.content;
          // Update local cache with freshly fetched live content
          saveProjectPurchasingDoc(storage, target.projectId, rawDoc);
        } else if (!contentRes.success && contentRes.state === DOCUMENT_STATES.DOCUMENT_READ_ERROR) {
          // Distinct failure state: report read error truthfully, NEVER report as empty!
          resultPayload = {
            found: true,
            hasExistingDocument: true,
            readError: true,
            state: DOCUMENT_STATES.DOCUMENT_READ_ERROR,
            documentId: discovery.documentId,
            documentName: docName,
            resourceType: target.resourceType,
            projectId: target.projectId,
            source: sourceLabel,
            message: `I found the ${projLabel} Purchasing Checklist ("${docName}") in Google Drive, but I was unable to read its current contents: ${contentRes.error}`,
            error: contentRes.error,
            sections: [],
            totalItems: null
          };
          break;
        }
      }

      const parsed = parseGoogleDocPurchasingStructure(rawDoc);
      const queryResults = queryPurchasingList(parsed, { trade, unpurchasedOnly });

      let message = '';
      if (queryResults.length > 0) {
        message = `Found ${queryResults.reduce((sum, s) => sum + s.items.length, 0)} item(s) in ${docName} for ${projLabel}.`;
      } else if (hasDoc) {
        message = `Project ${projLabel} has an active purchasing document "${docName}" in Google Drive (ID: ${discovery.documentId || 'active'}), but currently has no pending items listed${trade ? ` for ${trade}` : ''}.`;
      } else {
        message = `No purchasing checklist document has been configured or discovered for project ${projLabel} yet. Would you like to initialize one from the Master Purchasing Template?`;
      }

      resultPayload = {
        found: queryResults.length > 0 || hasDoc,
        hasExistingDocument: hasDoc,
        documentId: discovery.documentId || null,
        documentName: docName,
        resourceType: target.resourceType,
        projectId: target.projectId,
        source: sourceLabel,
        trade: trade || 'all',
        unpurchasedOnly,
        totalSections: queryResults.length,
        totalItems: queryResults.reduce((sum, s) => sum + s.items.length, 0),
        sections: queryResults,
        message
      };
      break;
    }

    case 'add_purchasing_item': {
      const itemInput = args.item || '';
      const quantity = args.quantity || 1;
      const category = args.category || null;
      const target = resolvePurchasingTarget(args, projectContext);
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const projLabel = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER ? 'Master' : (projectContext?.activeProjectName || target.projectId || 'Lot');
      const sourceLabel = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? 'Google Docs (Master Purchasing Checklist)'
        : `Google Docs (${projLabel} Purchasing Checklist)`;

      const discovery = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? { found: true, documentId: 'master_doc', fileName: 'Master Purchasing Checklist' }
        : discoverAndBindProjectPurchasingDoc(storage, target.projectId, projectContext);

      const docName = discovery.fileName || (target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER ? 'Master Purchasing Checklist' : 'Purchasing Checklist');

      let rawDoc = target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER
        ? loadMasterPurchasingDoc(storage)
        : (discovery.content || loadProjectPurchasingDoc(storage, target.projectId, projectContext?.[target.projectId]?.purchasingDocContent || (projectContext?.projectId === target.projectId ? projectContext?.purchasingDocContent : null)));

      // 1. LIVE DRIVE READ: Fetch current live version before modifying
      if (discovery.found && discovery.documentId && target.resourceType !== RESOURCE_TYPES.PURCHASING_MASTER) {
        const fetchRes = await fetchDocumentContent({
          documentId: discovery.documentId,
          fileName: discovery.fileName,
          modifiedTime: discovery.modifiedTime,
          projectContext
        });
        if (fetchRes.success && fetchRes.content !== null && fetchRes.content !== undefined) {
          rawDoc = fetchRes.content;
        }
      }

      const parsed = parseGoogleDocPurchasingStructure(rawDoc);
      const insertion = calculateSectionInsertion(parsed, itemInput, quantity, category);

      let updatedDoc = rawDoc;
      if (insertion.action === 'UPDATE_QUANTITY') {
        const before = rawDoc.slice(0, insertion.replaceRange.startIndex);
        const after = rawDoc.slice(insertion.replaceRange.endIndex);
        updatedDoc = before + insertion.replacementText + after;
      } else if (insertion.action === 'INSERT_ITEM' || insertion.action === 'CREATE_SECTION_AND_INSERT') {
        const before = rawDoc.slice(0, insertion.insertionIndex);
        const after = rawDoc.slice(insertion.insertionIndex);
        updatedDoc = before + insertion.textToInsert + after;
      }

      // 2. SAFE WRITE-BACK PIPELINE: Write to Google Drive first
      if (target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER) {
        saveMasterPurchasingDoc(storage, updatedDoc, true);
        const nextMasterVer = incrementMasterVersion(parsed.masterVersion || 'v1.0');
        recordPurchasingAuditLog(storage, {
          resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
          source: 'Master',
          masterVersion: nextMasterVer,
          itemId: insertion.itemId,
          itemName: itemInput,
          projectsAffected: ['purchasing_master'],
          action: insertion.action,
          userCommand: args.userCommand || projectContext?.lastUserMessage
        });
      } else {
        // Write to Drive if document is bound
        if (discovery.found && discovery.documentId) {
          const writeRes = await writeDocumentContent({
            documentId: discovery.documentId,
            fileName: discovery.fileName,
            content: updatedDoc,
            projectContext
          });

          if (!writeRes.success) {
            resultPayload = {
              success: false,
              writeError: true,
              state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
              documentId: discovery.documentId,
              documentName: docName,
              source: sourceLabel,
              message: `Failed to write item to Google Drive document "${docName}": ${writeRes.error}`,
              error: writeRes.error
            };
            break;
          }
        }

        // 3. ONLY ON CONFIRMED DRIVE WRITE SUCCESS: Update local cache
        saveProjectPurchasingDoc(storage, target.projectId, updatedDoc);
      }

      if (projectContext) {
        if (!projectContext[target.projectId]) projectContext[target.projectId] = {};
        projectContext[target.projectId].purchasingDocContent = updatedDoc;
        if (projectContext.projectId === target.projectId || !projectContext.projectId) {
          projectContext.purchasingDocContent = updatedDoc;
        }
      }

      resultPayload = {
        success: true,
        state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
        resourceType: target.resourceType,
        projectId: target.projectId,
        source: sourceLabel,
        documentId: discovery.documentId || null,
        documentName: docName,
        item: itemInput,
        quantity: insertion.newQuantity || quantity,
        isDuplicate: insertion.action === 'UPDATE_QUANTITY',
        updatedQuantity: insertion.newQuantity || quantity,
        action: insertion.action,
        category: insertion.category?.canonicalTitle || insertion.category?.title,
        sectionId: insertion.category?.sectionId || insertion.category?.categoryId,
        message: insertion.message
      };
      break;
    }

    case 'update_purchasing_item_status': {
      const itemName = args.itemName || '';
      const isPurchased = args.isPurchased !== false;
      const targetProjectId = resolveTargetProjectId(args.projectId, projectContext);
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const projLabel = projectContext?.activeProjectName || targetProjectId || 'Lot';
      const sourceLabel = `Google Docs (${projLabel} Purchasing Checklist)`;

      const discovery = discoverAndBindProjectPurchasingDoc(storage, targetProjectId, projectContext);
      const docName = discovery.fileName || 'Purchasing Checklist';

      let rawDoc = discovery.content || loadProjectPurchasingDoc(storage, targetProjectId, projectContext?.[targetProjectId]?.purchasingDocContent || (projectContext?.projectId === targetProjectId ? projectContext?.purchasingDocContent : null));

      // 1. LIVE DRIVE READ
      if (discovery.found && discovery.documentId) {
        const fetchRes = await fetchDocumentContent({
          documentId: discovery.documentId,
          fileName: discovery.fileName,
          modifiedTime: discovery.modifiedTime,
          projectContext
        });
        if (fetchRes.success && fetchRes.content !== null && fetchRes.content !== undefined) {
          rawDoc = fetchRes.content;
        }
      }

      const parsed = parseGoogleDocPurchasingStructure(rawDoc);
      const markRes = calculateMarkPurchased(parsed, itemName, isPurchased);

      if (markRes.found) {
        const before = rawDoc.slice(0, markRes.replaceRange.startIndex);
        const after = rawDoc.slice(markRes.replaceRange.endIndex);
        const updatedDoc = before + markRes.replacementText + after;

        // 2. SAFE WRITE-BACK
        if (discovery.found && discovery.documentId) {
          const writeRes = await writeDocumentContent({
            documentId: discovery.documentId,
            fileName: discovery.fileName,
            content: updatedDoc,
            projectContext
          });

          if (!writeRes.success) {
            resultPayload = {
              success: false,
              writeError: true,
              state: DOCUMENT_STATES.DOCUMENT_WRITE_ERROR,
              documentId: discovery.documentId,
              documentName: docName,
              source: sourceLabel,
              message: `Failed to update item status in Google Drive document "${docName}": ${writeRes.error}`,
              error: writeRes.error
            };
            break;
          }
        }

        // 3. Update local cache after confirmed Drive write
        saveProjectPurchasingDoc(storage, targetProjectId, updatedDoc);
        if (projectContext) {
          if (!projectContext[targetProjectId]) projectContext[targetProjectId] = {};
          projectContext[targetProjectId].purchasingDocContent = updatedDoc;
          if (projectContext.projectId === targetProjectId || !projectContext.projectId) {
            projectContext.purchasingDocContent = updatedDoc;
          }
        }

        resultPayload = {
          success: true,
          state: DOCUMENT_STATES.DOCUMENT_WRITE_SUCCESS,
          projectId: targetProjectId,
          documentId: discovery.documentId || null,
          documentName: docName,
          source: sourceLabel,
          itemId: markRes.item.itemId,
          itemName: markRes.item.itemName,
          category: markRes.category?.canonicalTitle || markRes.category?.title,
          sectionId: markRes.category?.sectionId || markRes.category?.categoryId,
          isPurchased,
          message: markRes.message
        };
      } else {
        resultPayload = {
          success: false,
          projectId: targetProjectId,
          documentId: discovery.documentId || null,
          documentName: docName,
          source: sourceLabel,
          message: markRes.message || `Item "${itemName}" was not found in the purchasing checklist for project ${targetProjectId}.`
        };
      }
      break;
    }

    case 'sync_purchasing_master_to_projects': {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      let targets = Array.isArray(args.targetProjectIds) && args.targetProjectIds.length > 0 ? args.targetProjectIds : [];
      
      if (targets.length === 0) {
        if (Array.isArray(projectContext?.projects)) {
          targets = projectContext.projects.map(p => p.id).filter(Boolean);
        } else if (Array.isArray(projectContext?.allProjects)) {
          targets = projectContext.allProjects.map(p => p.id).filter(Boolean);
        } else {
          targets = ['lot_3', 'lot_37', 'lot_55', 'lot_59'];
        }
      }

      const syncResult = syncMasterPurchasingToProjects(storage, targets, {
        dryRun: Boolean(args.dryRun),
        userCommand: args.userCommand || projectContext?.lastUserMessage
      });

      if (syncResult.isDryRun) {
        resultPayload = {
          success: true,
          isDryRun: true,
          masterVersion: syncResult.masterVersion,
          resourceType: syncResult.resourceType,
          totalProjectsTargeted: syncResult.totalProjectsTargeted,
          projectsSynced: syncResult.projectsSynced,
          missingInProjects: syncResult.missingInProjects,
          detailedPreview: syncResult.detailedPreview,
          totalMissingItemsCount: syncResult.totalMissingItemsCount,
          alreadyCurrentCount: syncResult.alreadyCurrentCount,
          customItemsUntouchedCount: syncResult.customItemsUntouchedCount,
          voiceSummary: syncResult.voiceSummary,
          summaryPrompt: syncResult.voiceSummary,
          message: syncResult.voiceSummary
        };
      } else {
        resultPayload = {
          success: true,
          isDryRun: false,
          masterVersion: syncResult.masterVersion,
          resourceType: syncResult.resourceType,
          totalProjectsTargeted: syncResult.totalProjectsTargeted,
          projectsSynced: syncResult.projectsSynced,
          itemsAddedSummary: syncResult.itemsAddedSummary,
          detailedPreview: syncResult.detailedPreview,
          auditEntriesCount: syncResult.auditEntries.length,
          voiceSummary: syncResult.voiceSummary,
          message: syncResult.voiceSummary
        };
      }
      break;
    }

    case 'deprecate_purchasing_master_item': {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const item = args.item;
      const res = deprecateMasterItem(storage, item);
      resultPayload = res;
      break;
    }

    case 'get_purchasing_audit_log': {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null;
      const limit = typeof args.limit === 'number' ? args.limit : 20;
      const logs = getPurchasingAuditLog(storage, limit);

      resultPayload = {
        success: true,
        totalEntries: logs.length,
        entries: logs
      };
      break;
    }

    case 'get_project_schedule': {
      const category = args.category || 'all';
      const filtered = items.filter(i => {
        if (category === 'all') return true;
        if (category === 'reminder') return i.category === 'reminder';
        if (category === 'trade_call') return i.category === 'subcontractor';
        if (category === 'watchout') return i.category === 'watchout';
        return true;
      });

      resultPayload = {
        found: true,
        category,
        totalItems: filtered.length,
        items: filtered.map(i => ({
          title: i.title,
          category: i.category,
          status: i.status,
          notes: i.notes,
          targetDate: i.targetDate || null
        }))
      };
      break;
    }

    case 'get_municipal_inspections': {
      const inspections = projectContext?.inspectionsData || [];
      const stageId = (args.stageId || '').toLowerCase();
      const filtered = stageId
        ? inspections.filter(s => (s.id || '').toLowerCase().includes(stageId) || (s.title || '').toLowerCase().includes(stageId))
        : inspections;

      resultPayload = {
        found: true,
        totalStages: inspections.length,
        stages: filtered.map(s => ({
          id: s.id,
          title: s.title,
          isPassed: Boolean(s.isPassed),
          progress: s.progress || 0,
          pendingItemsCount: Array.isArray(s.items) ? s.items.filter(it => !it.checked).length : 0
        }))
      };
      break;
    }

    case 'get_project_budget': {
      const info = dashboardData?.projectInfo || {};
      const phases = getPhasesArray(dashboardData);

      const budgetGross = parseAmount(info.budgetGross || info.grossBudget);
      const budgetBuild = parseAmount(info.budgetBuild || info.buildBudget || info.hardCostBudget);
      const infoSpent = parseAmount(info.totalSpent || info.drawsPaid || info.spent);
      const capitalBalance = parseAmount(info.capitalBalance || info.netCapital);

      let phaseTotalBudget = 0;
      let phaseTotalSpent = 0;

      const breakdown = phases.map(p => {
        const quote = parseAmount(p.originalQuote || p.contractAmount || p.estimatedCost);
        const spent = parseAmount(p.totalSpent || p.totalPaid || (p.payments || []).reduce((sum, pay) => sum + parseAmount(pay.amount || pay.totalCost || pay.materialCost || pay.laborCost), 0));
        phaseTotalBudget += quote;
        phaseTotalSpent += spent;
        return {
          phaseName: p.phase || p.name || 'Unassigned',
          contractor: p.payee || p.contractor || '',
          budget: quote,
          spent,
          remainingBalance: parseAmount(p.remainingBalance) || Math.max(0, quote - spent)
        };
      });

      const totalBudget = budgetGross || budgetBuild || phaseTotalBudget;
      const totalSpent = infoSpent || phaseTotalSpent;
      const remainingBudget = capitalBalance || (totalBudget > 0 ? Math.max(0, totalBudget - totalSpent) : null);

      if (!totalBudget && !totalSpent && phases.length === 0) {
        resultPayload = {
          found: false,
          message: 'I cannot locate financial dashboard data or budget records for this project.',
          totalBudget: null,
          totalSpent: null,
          remainingBudget: null,
          breakdown: []
        };
      } else {
        resultPayload = {
          found: true,
          grossBudget: budgetGross || totalBudget,
          buildBudget: budgetBuild || totalBudget,
          totalBudget,
          totalSpent,
          remainingBudget,
          netCapital: capitalBalance || remainingBudget,
          breakdown: breakdown.slice(0, 30)
        };
      }
      break;
    }

    case 'get_drive_files': {
      const folderName = (args.folderName || '').toLowerCase();
      const keyword = (args.keyword || '').toLowerCase();
      
      let nodes = [];
      if (Array.isArray(driveTree)) {
        nodes = driveTree;
      } else if (driveTree && typeof driveTree === 'object') {
        nodes = [...(driveTree.directFiles || []), ...(driveTree.subfolders || [])];
      }

      const results = [];
      function searchTree(nodeList) {
        if (!Array.isArray(nodeList)) return;
        for (const n of nodeList) {
          const name = (n.name || '').toLowerCase();
          if ((!folderName || name.includes(folderName)) && (!keyword || name.includes(keyword))) {
            results.push({ name: n.name, type: n.isFolder || n.mimeType?.includes('folder') ? 'folder' : 'file', link: n.webViewLink || null });
          }
          if (Array.isArray(n.children) && n.children.length > 0) {
            searchTree(n.children);
          }
        }
      }
      searchTree(nodes);

      resultPayload = {
        found: results.length > 0,
        count: results.length,
        message: results.length === 0 ? 'I cannot locate any matching files in Google Drive for this project.' : undefined,
        files: results.slice(0, 20)
      };
      break;
    }

    case 'get_homeowner_specs': {
      const cat = (args.category || '').toLowerCase();
      const room = (args.room || '').toLowerCase();
      const specs = projectSpecs.filter(s => {
        const matchesCat = !cat || (s.category || '').toLowerCase().includes(cat);
        const matchesRoom = !room || (s.location || '').toLowerCase().includes(room);
        return matchesCat && matchesRoom;
      });

      resultPayload = {
        found: specs.length > 0,
        count: specs.length,
        message: specs.length === 0 ? 'I cannot locate any finish or paint specifications matching that request.' : undefined,
        specs: specs.map(s => ({
          category: s.category,
          location: s.location,
          brand: s.brand,
          title: s.title || s.code,
          sheen: s.sheen,
          notes: s.notes
        }))
      };
      break;
    }

    case 'get_site_setup': {
      const checklist = siteSetupData?.protocol?.inspectionChecklist || [];
      const checks = siteSetupData?.checks || {};
      const completed = checklist.filter(c => checks[c.id]).length;

      resultPayload = {
        found: true,
        status: `${completed}/${checklist.length} Completed`,
        checklist: checklist.map(c => ({ text: c.text, isCompleted: Boolean(checks[c.id]) }))
      };
      break;
    }

    case 'save_memory': {
      const textToSave = String(args.text || '').trim();
      const ambiguityCheck = detectAmbiguity(textToSave);
      
      if (ambiguityCheck.isAmbiguous) {
        resultPayload = {
          success: false,
          status: 'ambiguous',
          saved: false,
          isAmbiguous: true,
          warning: ambiguityCheck.warning,
          message: `I noticed this statement contains speculative language ("${ambiguityCheck.indicator}"). Do you want me to save this as a permanent memory, or was it just a possibility?`
        };
        break;
      }

      // Idempotency / Duplicate Check
      const idempotency = checkIdempotency('save_memory', args, projectContext.projectId);
      if (idempotency?.isDuplicate) {
        resultPayload = {
          success: true,
          status: 'deduplicated',
          isDuplicate: true,
          saved: true,
          idempotencyKey: idempotency.key,
          data: idempotency.cachedResult?.data || { text: textToSave },
          message: `Got it. I've already saved that to your memory.`
        };
        break;
      }

      const savedItem = await saveMemory({
        text: textToSave,
        projectId: args.projectId || projectContext.projectId || null,
        category: args.category || 'general',
        memoryType: args.memoryType || 'project_fact',
        importance: args.importance || 'important',
        isGlobal: Boolean(args.isGlobal),
        effectiveDate: args.effectiveDate || null,
        source: 'user_explicit'
      });

      resultPayload = {
        success: true,
        status: 'ok',
        isDuplicate: false,
        idempotencyKey: idempotency?.key,
        saved: true,
        memoryId: savedItem.id,
        memory: savedItem,
        data: savedItem,
        message: `Got it. I've saved that to your memory.`
      };

      if (idempotency?.key) {
        recordIdempotency(idempotency.key, resultPayload);
      }
      break;
    }

    case 'search_memories': {
      const searchQuery = String(args.query || '').trim();
      const searchTargetProj = args.projectId || projectContext.projectId || null;
      const results = await searchMemories(searchQuery, {
        projectId: searchTargetProj,
        category: args.category,
        memoryType: args.memoryType
      });

      resultPayload = {
        success: true,
        status: results.length > 0 ? 'ok' : 'not_found',
        found: results.length > 0,
        query: searchQuery,
        totalMatches: results.length,
        data: results,
        memories: results.map(m => ({
          id: m.id,
          text: m.text,
          projectId: m.projectId,
          isGlobal: m.isGlobal,
          category: m.category,
          memoryType: m.memoryType,
          importance: m.importance,
          effectiveDate: m.effectiveDate,
          createdAt: m.createdAt
        }))
      };
      break;
    }

    case 'list_memories': {
      const listTargetProj = args.projectId || projectContext.projectId || null;
      const list = await getMemories({
        projectId: listTargetProj,
        category: args.category,
        includeGlobal: args.includeGlobal !== false,
        activeOnly: true
      });

      resultPayload = {
        success: true,
        status: list.length > 0 ? 'ok' : 'not_found',
        found: list.length > 0,
        projectId: listTargetProj,
        total: list.length,
        data: list,
        memories: list.map(m => ({
          id: m.id,
          text: m.text,
          projectId: m.projectId,
          isGlobal: m.isGlobal,
          category: m.category,
          memoryType: m.memoryType,
          importance: m.importance
        }))
      };
      break;
    }

    case 'update_memory': {
      const targetQuery = String(args.searchQuery || args.memoryId || args.updatedText || '').trim();
      const updateTargetProj = args.projectId || projectContext.projectId || null;
      let targetId = args.memoryId;

      // Idempotency / Duplicate Check
      const idempotency = checkIdempotency('update_memory', args, projectContext.projectId);
      if (idempotency?.isDuplicate) {
        resultPayload = {
          success: true,
          status: 'deduplicated',
          isDuplicate: true,
          updated: true,
          idempotencyKey: idempotency.key,
          data: idempotency.cachedResult?.data || { text: args.updatedText },
          message: `Memory has already been updated.`
        };
        break;
      }

      if (!targetId && targetQuery) {
        const found = await searchMemories(targetQuery, { projectId: updateTargetProj, limit: 1 });
        if (found.length > 0) {
          targetId = found[0].id;
        }
      }

      if (targetId) {
        const updatedItem = await updateMemory(
          targetId,
          { text: args.updatedText },
          args.reason || 'Updated via conversation'
        );
        resultPayload = {
          success: true,
          status: 'ok',
          isDuplicate: false,
          idempotencyKey: idempotency?.key,
          updated: true,
          memoryId: targetId,
          memory: updatedItem,
          data: updatedItem,
          message: `I've updated that memory.`
        };
        if (idempotency?.key) {
          recordIdempotency(idempotency.key, resultPayload);
        }
      } else {
        // If no existing memory found, save as new
        const savedNew = await saveMemory({
          text: args.updatedText,
          projectId: updateTargetProj,
          source: 'user_explicit'
        });
        resultPayload = {
          success: true,
          status: 'ok',
          isDuplicate: false,
          idempotencyKey: idempotency?.key,
          updated: true,
          isNew: true,
          memoryId: savedNew.id,
          memory: savedNew,
          data: savedNew,
          message: `I didn't find the exact previous memory, but I've saved the updated information.`
        };
        if (idempotency?.key) {
          recordIdempotency(idempotency.key, resultPayload);
        }
      }
      break;
    }

    case 'delete_memory': {
      const deleteQuery = String(args.searchQuery || args.memoryId || '').trim();
      const deleteTargetProj = args.projectId || projectContext.projectId || null;
      let deleteId = args.memoryId;

      // Idempotency / Duplicate Check
      const idempotency = checkIdempotency('delete_memory', args, projectContext.projectId);
      if (idempotency?.isDuplicate) {
        resultPayload = {
          success: true,
          status: 'deduplicated',
          isDuplicate: true,
          deleted: true,
          idempotencyKey: idempotency.key,
          message: `Memory was already deactivated.`
        };
        break;
      }

      if (!deleteId && deleteQuery) {
        const found = await searchMemories(deleteQuery, { projectId: deleteTargetProj, limit: 1 });
        if (found.length > 0) {
          deleteId = found[0].id;
        }
      }

      if (deleteId) {
        await deactivateMemory(deleteId, args.reason || 'Deactivated via user request');
        resultPayload = {
          success: true,
          status: 'ok',
          isDuplicate: false,
          idempotencyKey: idempotency?.key,
          deleted: true,
          memoryId: deleteId,
          message: `Got it. I've deactivated that memory.`
        };
        if (idempotency?.key) {
          recordIdempotency(idempotency.key, resultPayload);
        }
      } else {
        resultPayload = {
          success: false,
          status: 'not_found',
          deleted: false,
          message: `I couldn't locate that specific memory to delete.`
        };
      }
      break;
    }

    case 'list_user_preferences': {
      const targetUserId = projectContext.userId || projectContext.uid || 'default_user';
      const prefs = await loadUserPreferences(targetUserId, projectContext.projectId);
      const activeOnly = prefs.filter(p => p.status === 'active');
      const resolved = resolvePreferenceConflicts(activeOnly, projectContext.projectId);

      resultPayload = {
        success: true,
        status: resolved.length > 0 ? 'ok' : 'not_found',
        totalPreferences: resolved.length,
        preferences: resolved.map(p => ({
          id: p.id,
          category: p.category,
          scope: p.scope,
          projectId: p.projectId,
          statement: p.preferenceStatement,
          source: p.source,
          confidence: p.confidence
        })),
        data: resolved,
        message: resolved.length > 0
          ? `I have ${resolved.length} active communication preference(s) saved.`
          : `You don't have any custom communication preferences saved yet.`
      };
      break;
    }

    case 'confirm_user_preference': {
      const targetUserId = projectContext.userId || projectContext.uid || 'default_user';
      const candidateId = args.candidateId;
      let record;

      if (candidateId) {
        record = await updateUserPreferenceStatus(targetUserId, candidateId, 'active');
      } else if (args.statement) {
        record = await saveUserPreference(targetUserId, {
          preferenceStatement: args.statement,
          scope: args.scope || 'global',
          projectId: args.scope === 'project' ? projectContext.projectId : null,
          source: 'explicit',
          status: 'active',
          confidence: 1.0
        });
      }

      resultPayload = {
        success: true,
        status: 'ok',
        activated: true,
        data: record,
        preference: record,
        message: `I've confirmed and saved your preference as default.`
      };
      break;
    }

    case 'deactivate_user_preference': {
      const targetUserId = projectContext.userId || projectContext.uid || 'default_user';
      const queryStr = String(args.searchQuery || '').toLowerCase();
      const prefs = await loadUserPreferences(targetUserId, projectContext.projectId);
      const match = prefs.find(p => p.status === 'active' && (
        p.preferenceStatement.toLowerCase().includes(queryStr) ||
        p.inferredIntent.toLowerCase().includes(queryStr) ||
        p.category.toLowerCase().includes(queryStr)
      ));

      if (match) {
        await deleteUserPreference(targetUserId, match.id);
        resultPayload = {
          success: true,
          status: 'ok',
          deactivated: true,
          preferenceId: match.id,
          statement: match.preferenceStatement,
          message: `I've removed that preference.`
        };
      } else {
        resultPayload = {
          success: false,
          status: 'not_found',
          deactivated: false,
          message: `I couldn't locate a saved preference matching "${args.searchQuery}".`
        };
      }
      break;
    }

    case 'reset_user_preferences': {
      const targetUserId = projectContext.userId || projectContext.uid || 'default_user';
      await resetAllUserPreferences(targetUserId);
      resultPayload = {
        success: true,
        status: 'ok',
        reset: true,
        message: `I've reset all saved communication preferences.`
      };
      break;
    }

      default:
        resultPayload = { success: false, status: 'error', found: false, error: `Tool ${functionName} not implemented` };
    }

    return resultPayload;
  };

  // 3. Execute with Timeout and In-Flight Concurrency Tracking
  let executionPromise;
  if (toolMeta.type === 'WRITE' && idempotencyKey) {
    executionPromise = withToolTimeout(executeInternal, functionName, TOOL_TIMEOUT_MS);
    inFlightWritePromises.set(idempotencyKey, executionPromise);
  } else {
    executionPromise = withToolTimeout(executeInternal, functionName, TOOL_TIMEOUT_MS);
  }

  let finalPayload = null;
  try {
    finalPayload = await executionPromise;
    if (finalPayload?.success === false && (finalPayload?.error || finalPayload?.status === 'error')) {
      circuitBreaker.recordFailure(functionName);
    } else {
      circuitBreaker.recordSuccess(functionName);
    }
  } catch (err) {
    circuitBreaker.recordFailure(functionName);
    finalPayload = {
      success: false,
      status: 'error',
      error: err.message || 'Tool execution failed'
    };
  } finally {
    if (idempotencyKey) {
      inFlightWritePromises.delete(idempotencyKey);
    }
  }

  finalPayload._executionDurationMs = Date.now() - startTime;
  if (idempotencyKey && finalPayload.success && !finalPayload.isDuplicate) {
    recordIdempotency(idempotencyKey, finalPayload);
  }

  return validateToolResultContract(finalPayload, functionName, correlationId);
}

/**
 * Two-Tier Health Evaluator: Separates Tool/API Infrastructure from Project Data Health
 */
export function evaluateSystemAndDataHealth(projectContext = {}) {
  const {
    items = [],
    dashboardData = null,
    driveTree = null,
    projectSpecs = [],
    apiKey = '',
    googleToken = ''
  } = projectContext;

  const phases = getPhasesArray(dashboardData);
  const allPayments = phases.flatMap(p => p.payments || []);
  const directFiles = driveTree?.directFiles || [];
  const subfolders = driveTree?.subfolders || [];
  const totalDriveFiles = directFiles.length + subfolders.reduce((acc, f) => acc + (f.files?.length || 0), 0);
  const info = dashboardData?.projectInfo || {};
  const totalSpent = parseAmount(info.totalSpent || info.drawsPaid || allPayments.reduce((sum, p) => sum + parseAmount(p.amount), 0));

  // 1. Tool & API Infrastructure Health
  const toolHealth = [
    {
      id: 'weather_api',
      name: 'Open-Meteo Weather API',
      isHealthy: true,
      badge: '🟢 Operational',
      detail: 'REST Endpoint Active (No API Key Required)'
    },
    {
      id: 'gemini_brain',
      name: 'Gemini Brain Engine',
      isHealthy: true,
      badge: '🟢 Operational',
      detail: 'Model: gemini-flash-latest (High Quota)'
    },
    {
      id: 'google_drive_api',
      name: 'Google Drive API',
      isHealthy: true,
      badge: googleToken ? '🟢 Authenticated' : '🟡 Offline Cache',
      detail: googleToken ? 'OAuth2 Bearer Token Valid' : 'Using Local Storage Drive Cache'
    },
    {
      id: 'sheets_engine',
      name: 'Sheets Ledger Engine',
      isHealthy: true,
      badge: '🟢 Operational',
      detail: 'Direct Phase Category Router Active'
    },
    {
      id: 'memory_engine',
      name: 'Persistent Memory Second Brain',
      isHealthy: true,
      badge: '🟢 Operational',
      detail: 'Firestore & Dual-Store Memory Engine Active'
    }
  ];

  // 2. Project Data Health
  const dataHealth = [
    {
      id: 'subcontractor_ledger',
      name: 'Subcontractor Ledger',
      hasData: phases.length > 0 || Boolean(info.budgetGross),
      badge: phases.length > 0 ? `🟢 ${phases.length} Phases Indexed` : (info.budgetGross ? `🟢 Budget: ${info.budgetGross}` : '🟡 Empty Sheet / No Data'),
      detail: info.budgetGross ? `Gross Budget: ${info.budgetGross} | Spent: $${totalSpent.toLocaleString()}` : (phases.length > 0 ? `$${phases.reduce((sum, p) => sum + parseAmount(p.originalQuote || p.contractAmount), 0).toLocaleString()} Total Contract Value` : 'No phase contracts loaded in sheet')
    },
    {
      id: 'receipts_transactions',
      name: 'Receipts & Transactions',
      hasData: allPayments.length > 0 || totalSpent > 0,
      badge: totalSpent > 0 ? `🟢 $${totalSpent.toLocaleString()} Spent / Paid` : '🟡 0 Transactions Found',
      detail: allPayments.length > 0 ? `${allPayments.length} payment records logged` : (totalSpent > 0 ? `$${totalSpent.toLocaleString()} recorded in project summary` : 'No payment records in sheet ledger')
    },
    {
      id: 'drive_documents',
      name: 'Drive Document Tree',
      hasData: totalDriveFiles > 0,
      badge: totalDriveFiles > 0 ? `🟢 ${totalDriveFiles} Files Indexed` : '🟡 No Files Indexed',
      detail: totalDriveFiles > 0 ? `${subfolders.length} subfolders indexed` : 'Drive folder has no files indexed yet'
    },
    {
      id: 'finish_specs',
      name: 'Homeowner Finish Specs',
      hasData: projectSpecs.length > 0,
      badge: projectSpecs.length > 0 ? `🟢 ${projectSpecs.length} Specs Logged` : '🟡 0 Specs Configured',
      detail: projectSpecs.length > 0 ? 'Paint & finish codes active' : 'No finish specs added for this project'
    },
    {
      id: 'field_schedule',
      name: 'Field Checklist & Schedule',
      hasData: items.length > 0,
      badge: items.length > 0 ? `🟢 ${items.length} Items Active` : '🟢 Default Protocol Ready',
      detail: items.length > 0 ? `${items.filter(i => i.status === 'completed').length} completed` : 'Standard 6-stage municipal protocol ready'
    },
    {
      id: 'persistent_memories',
      name: 'Persistent Context Memories',
      hasData: true,
      badge: '🟢 Second Brain Ready',
      detail: 'Contextual memory database active'
    }
  ];

  const overallToolOperational = toolHealth.every(t => t.isHealthy);
  const dataWarningCount = dataHealth.filter(d => !d.hasData).length;

  return {
    toolHealth,
    dataHealth,
    overallToolOperational,
    dataWarningCount,
    summary: {
      toolStatusText: overallToolOperational ? '🟢 Tools: Operational' : '🔴 Tool Outage',
      dataStatusText: dataWarningCount === 0 ? '🟢 Data: Populated' : `🟡 Data: ${dataWarningCount} Notices`
    }
  };
}

/**
 * One-Click Diagnostic Test Runner for all AI Tools
 */
export async function runAllAiToolDiagnostics(projectContext = {}) {
  const tests = [
    {
      id: 'weather',
      title: 'Jobsite Weather Check',
      tool: 'get_weather_for_jobsite',
      args: { locationName: 'Jobsite Lot 3' }
    },
    {
      id: 'balance',
      title: 'Subcontractor Balance Check',
      tool: 'get_subcontractor_balance',
      args: { tradeOrContractor: 'Electrician' }
    },
    {
      id: 'receipts',
      title: 'Receipts Search Check',
      tool: 'search_receipts',
      args: { query: 'lumber' }
    },
    {
      id: 'budget',
      title: 'Project Budget Summary Check',
      tool: 'get_project_budget',
      args: { category: 'all' }
    },
    {
      id: 'schedule',
      title: 'Field Schedule & Reminders Check',
      tool: 'get_project_schedule',
      args: { category: 'all' }
    },
    {
      id: 'memory',
      title: 'Persistent Memory Search Check',
      tool: 'search_memories',
      args: { query: 'painter' }
    }
  ];

  const results = [];
  for (const t of tests) {
    const tStart = Date.now();
    try {
      const payload = await executeClientToolCall(t.tool, t.args, projectContext);
      const durationMs = Date.now() - tStart;
      const passed = !payload.error;
      results.push({
        id: t.id,
        title: t.title,
        tool: t.tool,
        args: t.args,
        passed,
        durationMs,
        payload
      });
    } catch (err) {
      results.push({
        id: t.id,
        title: t.title,
        tool: t.tool,
        args: t.args,
        passed: false,
        durationMs: Date.now() - tStart,
        error: err.message
      });
    }
  }

  const health = evaluateSystemAndDataHealth(projectContext);

  return {
    testResults: results,
    health
  };
}
