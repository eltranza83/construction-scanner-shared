/**
 * Google Docs Master Purchasing List Service (V1 Final)
 * 
 * Storage-agnostic, production-grade domain architecture for:
 * 1. resourceType: "purchasing_master" (Company Master Purchasing Template in parent folder)
 * 2. resourceType: "project_purchasing" (Independent working purchasing records for project lots)
 * 
 * V1 Final Features:
 * - Automatic Master Versioning (v1.0 -> v1.1 -> v1.2) with changelog tracking.
 * - Project Provenance (records initialMasterVersion on clone).
 * - Dual Payload Previews (concise voiceSummary for audio, detailedPreview table for UI).
 * - Item Deprecation (marks status: deprecated in Master; excluded from new projects, preserved in active projects).
 * - Sync Idempotency (repeated runs produce 0 duplicate writes).
 * - Conflict Protection (custom project quantities & notes are strictly preserved).
 */

export const RESOURCE_TYPES = {
  PURCHASING_MASTER: 'purchasing_master',
  PROJECT_PURCHASING: 'project_purchasing'
};

export const MASTER_PROJECT_ID = 'master';

export function getPurchasingDocStorageKey(projectId = 'default') {
  const cleanId = String(projectId || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `sitetactix_purchasing_doc_${cleanId}`;
}

export const TRADE_SECTION_MAP = {
  quartz: {
    id: 'quartz',
    title: 'Quartz Hardware',
    aliases: ['quartz', 'countertop', 'countertops', 'stone', 'granite', 'quartz guy', 'slab'],
    keywords: [
      'electrical pass-through', 'pass-through', 'caps', 'hole grommets', 'grommet',
      'quartz', 'countertop', 'sink cutout', 'support bracket', 'undermount sink clip',
      'seam adhesive', 'corbel', 'waterfall edge', 'backsplash bracket'
    ]
  },
  electrical: {
    id: 'electrical',
    title: 'Electrical Hardware Fixtures',
    aliases: ['electrician', 'electrical', 'electric', 'lighting', 'lights', 'sparky'],
    keywords: [
      'security light', 'security lights', 'doorbell', 'chime kit', 'smart doorbell',
      'hanging light', 'porch light', 'exterior column light', 'column lights',
      'garage ceiling light', 'ceiling light', 'vanity light', 'vanity lights',
      'smart switch', 'smart switches', 'extension rod', 'extension rods',
      'ceiling fan', 'ceiling fans', 'gfci', 'gfi', 'outlet', 'outlets',
      'breaker', 'dimmer', 'dimmer switch', 'dimmer switches', 'can light', 'can lights', 'recessed light',
      'junction box', 'switch plate', 'motion sensor', 'under cabinet lighting'
    ]
  },
  plumbing: {
    id: 'plumbing',
    title: 'Plumbing Hardware Fixtures',
    aliases: ['plumber', 'plumbing', 'pipes', 'fixtures', 'water'],
    keywords: [
      'soap dispenser', 'garbage disposal', 'disposal button', 'air switch',
      'water heater', 'water heater stand', 'water heater tray', 'expansion tank',
      'shower kit', 'shower kits', 'toilet', 'toilets', 'rough-in valve',
      'shower valve', 'faucet', 'faucets', 'p-trap', 'drain', 'angle stop',
      'supply line', 'wax ring', 'flange', 'hose bibb', 'tub spout',
      'shower pan liner', 'shower head', 'cleanout plug'
    ]
  },
  hvac: {
    id: 'hvac',
    title: 'HVAC Hardware & Fixtures',
    aliases: ['hvac', 'ac', 'heating', 'cooling', 'air conditioning', 'mechanical'],
    keywords: [
      'thermostat', 'smart thermostat', 'vent', 'register', 'diffuser',
      'return grill', 'filter', 'furnace filter', 'condensate pump', 'line set',
      'exhaust fan', 'bath fan', 'damper', 'duct cap'
    ]
  },
  paint_drywall: {
    id: 'paint_drywall',
    title: 'Paint & Drywall Supplies',
    aliases: ['paint', 'painter', 'drywall', 'sheetrock', 'mud'],
    keywords: [
      'primer', 'paint', 'roller cover', 'tray liner', 'caulk',
      'joint compound', 'drywall tape', 'corner bead', 'sanding sponge',
      'sheen', 'drop cloth', 'masking tape', 'patch kit'
    ]
  },
  general: {
    id: 'general',
    title: 'General Hardware & Materials',
    aliases: ['general', 'materials', 'hardware', 'other', 'misc', 'miscellaneous'],
    keywords: []
  }
};

export const TRADE_CATEGORIES = TRADE_SECTION_MAP;

export const DEFAULT_MASTER_TEMPLATE_DOC = `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template — v1.0)
<!-- version: 1.0 -->

<!-- section: quartz -->
## 1. Quartz Hardware

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
`;

export function getDefaultProjectDoc(projectId = 'default', masterVersion = 'v1.0') {
  return `# Master Fixtures & Hardware Purchasing Checklist - Project ${projectId} (Template: ${masterVersion})

<!-- section: quartz -->
## 1. Quartz Hardware

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
`;
}

/**
 * Extracts version string (e.g. 'v1.0') from doc text or comments
 */
export function parseMasterVersion(docText = '') {
  if (!docText) return 'v1.0';
  const tagMatch = docText.match(/<!--\s*version:\s*([0-9.]+)\s*-->/i);
  if (tagMatch) return `v${tagMatch[1]}`;
  const headerMatch = docText.match(/—\s*v([0-9.]+)/i);
  if (headerMatch) return `v${headerMatch[1]}`;
  return 'v1.0';
}

/**
 * Auto-increments version (e.g. v1.0 -> v1.1 -> v1.2)
 */
export function incrementMasterVersion(currentVer = 'v1.0') {
  const clean = String(currentVer || 'v1.0').replace(/^v/i, '').trim();
  const parts = clean.split('.');
  const major = parseInt(parts[0], 10) || 1;
  const minor = parseInt(parts[1], 10) || 0;
  return `v${major}.${minor + 1}`;
}

/**
 * Updates version tags in doc content
 */
export function updateMasterVersionInDoc(docText = '', newVersion = 'v1.1') {
  const cleanNum = newVersion.replace(/^v/i, '');
  let updated = docText;
  if (updated.match(/<!--\s*version:\s*[0-9.]+\s*-->/i)) {
    updated = updated.replace(/<!--\s*version:\s*[0-9.]+\s*-->/i, `<!-- version: ${cleanNum} -->`);
  } else {
    updated = `<!-- version: ${cleanNum} -->
` + updated;
  }

  if (updated.match(/^# Master Fixtures & Hardware Purchasing Checklist.*?$/m)) {
    updated = updated.replace(/^# Master Fixtures & Hardware Purchasing Checklist.*?$/m, `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template — ${newVersion})`);
  }
  return updated;
}

/**
 * Default LocalStorage Persistence Adapter
 */
export class LocalStoragePurchasingAdapter {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.masterKey = 'sitetactix_purchasing_master_doc';
    this.auditKey = 'sitetactix_purchasing_audit_log';
  }

  getProjectKey(projectId) {
    const cleanId = String(projectId || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `sitetactix_purchasing_doc_${cleanId}`;
  }

  getMasterDocument(defaultDoc = null) {
    const stored = this.storage?.getItem ? this.storage.getItem(this.masterKey) : null;
    return stored || defaultDoc || DEFAULT_MASTER_TEMPLATE_DOC;
  }

  saveMasterDocument(content) {
    if (this.storage?.setItem) {
      this.storage.setItem(this.masterKey, content);
    }
    return content;
  }

  getProjectDocument(projectId, defaultDoc = null) {
    const key = this.getProjectKey(projectId);
    const stored = this.storage?.getItem ? this.storage.getItem(key) : null;
    return stored || defaultDoc || getDefaultProjectDoc(projectId);
  }

  saveProjectDocument(projectId, content) {
    const key = this.getProjectKey(projectId);
    if (this.storage?.setItem) {
      this.storage.setItem(key, content);
    }
    return content;
  }

  getAuditLogs(limit = 50) {
    try {
      const raw = this.storage?.getItem ? this.storage.getItem(this.auditKey) : null;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
    } catch (_) {
      return [];
    }
  }

  saveAuditLog(entry) {
    try {
      const current = this.getAuditLogs(100);
      current.unshift(entry);
      if (this.storage?.setItem) {
        this.storage.setItem(this.auditKey, JSON.stringify(current.slice(0, 100)));
      }
      return entry;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Resolves a storage adapter instance
 */
export function resolvePurchasingAdapter(storageOrAdapter) {
  if (storageOrAdapter && typeof storageOrAdapter.getMasterDocument === 'function' && typeof storageOrAdapter.getProjectDocument === 'function') {
    return storageOrAdapter;
  }
  return new LocalStoragePurchasingAdapter(storageOrAdapter);
}

/**
 * Helper to generate deterministic stable item_id
 */
export function generateItemId(rawName = '') {
  const clean = String(rawName || '').trim().toLowerCase()
    .replace(/<!--.*?-->/g, '')
    .replace(/[-—–:]\s*(?:qty|quantity|count):.*$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `item_${clean || 'generic'}`;
}

/**
 * Resolves target resource type and project ID cleanly.
 */
export function resolvePurchasingTarget(args = {}, projectContext = {}) {
  const targetResource = (args.targetResource || '').trim().toLowerCase();
  const explicitProjectId = (args.projectId || '').trim();

  if (targetResource === 'master' || targetResource === 'purchasing_master' || targetResource === 'template' || targetResource === 'global') {
    return {
      resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
      projectId: null
    };
  }

  if (explicitProjectId.toLowerCase() === 'master' || explicitProjectId.toLowerCase() === 'purchasing_master') {
    return {
      resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
      projectId: null
    };
  }

  let projId = explicitProjectId;
  if (!projId && projectContext?.projectId && typeof projectContext.projectId === 'string') {
    projId = projectContext.projectId.trim();
  }
  if (!projId && projectContext?.activeProject?.id && typeof projectContext.activeProject.id === 'string') {
    projId = projectContext.activeProject.id.trim();
  }
  if (!projId && projectContext?.id && typeof projectContext.id === 'string') {
    projId = projectContext.id.trim();
  }
  if (!projId) {
    projId = 'default';
  }

  return {
    resourceType: RESOURCE_TYPES.PROJECT_PURCHASING,
    projectId: projId
  };
}

export function resolveTargetProjectId(explicitProjectId = null, projectContext = {}) {
  const target = resolvePurchasingTarget({ projectId: explicitProjectId }, projectContext);
  return target.resourceType === RESOURCE_TYPES.PURCHASING_MASTER ? 'master' : target.projectId;
}

export function loadMasterPurchasingDoc(storageOrAdapter, defaultDoc = null) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  return adapter.getMasterDocument(defaultDoc);
}

export function saveMasterPurchasingDoc(storageOrAdapter, content = '', autoIncrement = false) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  let finalContent = content;
  if (autoIncrement) {
    const currentVer = parseMasterVersion(content);
    const nextVer = incrementMasterVersion(currentVer);
    finalContent = updateMasterVersionInDoc(content, nextVer);
  }
  return adapter.saveMasterDocument(finalContent);
}

export function loadProjectPurchasingDoc(storageOrAdapter, projectId = 'default', defaultDoc = null) {
  if (projectId === 'master' || projectId === 'purchasing_master' || projectId === MASTER_PROJECT_ID) {
    return loadMasterPurchasingDoc(storageOrAdapter, defaultDoc);
  }
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  return adapter.getProjectDocument(projectId, defaultDoc);
}

export function saveProjectPurchasingDoc(storageOrAdapter, projectId = 'default', content = '') {
  if (projectId === 'master' || projectId === 'purchasing_master' || projectId === MASTER_PROJECT_ID) {
    return saveMasterPurchasingDoc(storageOrAdapter, content);
  }
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  return adapter.saveProjectDocument(projectId, content);
}

export function getPurchasingAuditLog(storageOrAdapter, limit = 50) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  return adapter.getAuditLogs(limit);
}

export function recordPurchasingAuditLog(storageOrAdapter, entry = {}) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  const newEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    resourceType: entry.resourceType || RESOURCE_TYPES.PURCHASING_MASTER,
    source: entry.source || 'Master',
    masterVersion: entry.masterVersion || null,
    itemId: entry.itemId || null,
    itemName: entry.itemName || '',
    projectsAffected: Array.isArray(entry.projectsAffected) ? entry.projectsAffected : [],
    action: entry.action || 'sync',
    userCommand: entry.userCommand || null,
    details: entry.details || null
  };
  return adapter.saveAuditLog(newEntry);
}

export function classifyTradeCategory(itemText = '', explicitOverride = null) {
  const textLower = (itemText && typeof itemText === 'string') ? itemText.toLowerCase().trim() : '';
  const overrideLower = (explicitOverride && typeof explicitOverride === 'string') ? explicitOverride.toLowerCase().trim() : '';

  if (overrideLower) {
    if (TRADE_SECTION_MAP[overrideLower]) {
      return TRADE_SECTION_MAP[overrideLower];
    }
    for (const [key, cat] of Object.entries(TRADE_SECTION_MAP)) {
      if (cat.id === overrideLower || cat.aliases.some(alias => overrideLower.includes(alias))) {
        return cat;
      }
    }
  }

  for (const [key, cat] of Object.entries(TRADE_SECTION_MAP)) {
    if (cat.keywords && cat.keywords.length > 0) {
      for (const kw of cat.keywords) {
        if (textLower.includes(kw)) {
          return cat;
        }
      }
    }
  }

  return TRADE_SECTION_MAP.general;
}

export function parseQuantity(rawText = '') {
  let text = (rawText || '').trim();
  
  let embeddedId = null;
  const idMatch = text.match(/<!--\s*id:\s*([a-zA-Z0-9_-]+)\s*-->/i);
  if (idMatch) {
    embeddedId = idMatch[1];
    text = text.replace(idMatch[0], '').trim();
  }

  let status = 'active';
  const statusMatch = text.match(/<!--\s*status:\s*([a-zA-Z0-9_-]+)\s*-->/i);
  if (statusMatch) {
    status = statusMatch[1].toLowerCase();
    text = text.replace(statusMatch[0], '').trim();
  }

  const wordNumbers = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'dozen': 12, 'twenty': 20
  };

  const qtySuffixMatch = text.match(/^(?:[-*•]\s*)?(?:\[[ xX]\]\s*)?(.+?)(?:\s*[-—–:]\s*(?:Qty|Quantity|Count):\s*(\d+))(.*)$/i);
  if (qtySuffixMatch) {
    const rawItem = qtySuffixMatch[1].trim();
    const additionalNotes = qtySuffixMatch[3] ? qtySuffixMatch[3].trim() : '';
    return {
      itemId: embeddedId || generateItemId(rawItem),
      itemName: rawItem,
      quantity: parseInt(qtySuffixMatch[2], 10) || 1,
      status: status,
      notes: additionalNotes
    };
  }

  const wordPrefixMatch = text.match(/^(?:add\s+|i need\s+|buy\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\s+(?:more\s+)?(.+)$/i);
  if (wordPrefixMatch && !text.toLowerCase().includes('inch') && !text.toLowerCase().includes('gallon')) {
    const qty = wordNumbers[wordPrefixMatch[1].toLowerCase()] || 1;
    const rawItem = wordPrefixMatch[2].trim();
    return {
      itemId: embeddedId || generateItemId(rawItem),
      itemName: rawItem,
      quantity: qty,
      status: status,
      notes: ''
    };
  }

  const numPrefixMatch = text.match(/^(?:add\s+|i need\s+|buy\s+)?(\d+)\s+(?:more\s+)?(.+)$/i);
  if (numPrefixMatch && !text.toLowerCase().includes('inch') && !text.toLowerCase().includes('gallon')) {
    const rawItem = numPrefixMatch[2].trim();
    return {
      itemId: embeddedId || generateItemId(rawItem),
      itemName: rawItem,
      quantity: parseInt(numPrefixMatch[1], 10) || 1,
      status: status,
      notes: ''
    };
  }

  const cleaned = text.replace(/^(?:add\s+|i need\s+|buy\s+)/i, '').trim();
  return {
    itemId: embeddedId || generateItemId(cleaned),
    itemName: cleaned,
    quantity: 1,
    status: status,
    notes: ''
  };
}

export function parseGoogleDocPurchasingStructure(docData) {
  let fullText = '';
  const sections = [];

  if (typeof docData === 'string') {
    fullText = docData;
  } else if (docData && Array.isArray(docData.body?.content)) {
    for (const elem of docData.body.content) {
      if (elem.paragraph?.elements) {
        for (const pe of elem.paragraph.elements) {
          if (pe.textRun?.content) {
            fullText += pe.textRun.content;
          }
        }
      }
    }
  } else if (docData && typeof docData.text === 'string') {
    fullText = docData.text;
  }

  const masterVersion = parseMasterVersion(fullText);
  const lines = fullText.split('\n');
  let currentSection = null;
  let runningIndex = 0;
  let pendingTagId = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStartIndex = runningIndex;
    const lineEndIndex = runningIndex + line.length;
    runningIndex = lineEndIndex + 1;

    const trimmed = line.trim();
    if (!trimmed) continue;

    const tagMatch = trimmed.match(/<!--\s*section:\s*([a-zA-Z0-9_-]+)\s*-->/i);
    if (tagMatch) {
      pendingTagId = tagMatch[1].toLowerCase();
      continue;
    }
    
    const isDocTitle = trimmed.startsWith('# ') && (trimmed.toLowerCase().includes('master') || trimmed.toLowerCase().includes('purchasing checklist') || trimmed.toLowerCase().includes('purchasing list'));
    const isHeading = !isDocTitle && (
      trimmed.startsWith('##') || 
      trimmed.match(/^\d+\.\s+[A-Za-z\s&]+(?:Hardware|Fixtures|Supplies|Materials|Package|List|Notes|Gear|Wiring|Equipment)/i) ||
      (trimmed.endsWith(':') && (trimmed.toLowerCase().includes('hardware') || trimmed.toLowerCase().includes('fixtures') || trimmed.toLowerCase().includes('plumbing') || trimmed.toLowerCase().includes('electrical') || trimmed.toLowerCase().includes('quartz') || trimmed.toLowerCase().includes('hvac')))
    );

    if (isHeading || (pendingTagId && !currentSection)) {
      const sectionIdentifier = trimmed.replace(/^[#\d.\s]+/, '').replace(/:$/, '').trim();
      const stableSectionId = pendingTagId || classifyTradeCategory('', sectionIdentifier).id;
      const category = TRADE_SECTION_MAP[stableSectionId] || classifyTradeCategory('', sectionIdentifier);

      currentSection = {
        categoryId: category.id,
        sectionId: category.id,
        title: sectionIdentifier || category.title,
        canonicalTitle: category.title,
        headingLine: line,
        startIndex: lineStartIndex,
        items: []
      };
      sections.push(currentSection);
      pendingTagId = null;
      continue;
    }

    if (currentSection) {
      const isListItem = trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•') || trimmed.includes('[ ]') || trimmed.includes('[x]') || trimmed.includes('[X]');
      
      if (isListItem) {
        const isPurchased = trimmed.includes('[x]') || trimmed.includes('[X]');
        const cleanedText = trimmed.replace(/^[-*•]\s*/, '').replace(/^\[[ xX]\]\s*/, '').trim();
        const parsed = parseQuantity(cleanedText);

        currentSection.items.push({
          rawLine: line,
          itemId: parsed.itemId,
          itemName: parsed.itemName,
          normalizedName: parsed.itemName.toLowerCase().replace(/[^a-z0-9]/g, ''),
          quantity: parsed.quantity,
          status: parsed.status || 'active',
          notes: parsed.notes || '',
          isPurchased: isPurchased,
          startIndex: lineStartIndex,
          endIndex: lineEndIndex
        });
      }
    }
  }

  return {
    fullText,
    masterVersion,
    totalLength: fullText.length,
    sections
  };
}

export function calculateSectionInsertion(docStructure, itemInput, quantityOrCategory = 1, explicitCategory = null, itemIdOverride = null) {
  let quantity = 1;
  let categoryOverride = null;

  if (typeof quantityOrCategory === 'number') {
    quantity = quantityOrCategory;
    categoryOverride = explicitCategory;
  } else if (typeof quantityOrCategory === 'string') {
    categoryOverride = quantityOrCategory;
  }

  const parsedItem = parseQuantity(itemInput);
  const effectiveItemId = itemIdOverride || parsedItem.itemId;
  const finalQuantity = Math.max(quantity, parsedItem.quantity);
  const targetCategory = classifyTradeCategory(parsedItem.itemName, categoryOverride);
  let targetSection = docStructure.sections.find(s => (s.sectionId || s.categoryId) === targetCategory.id);

  const cleanItemName = parsedItem.itemName.trim();
  const normalizedItemName = cleanItemName.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (targetSection) {
    const existingItem = targetSection.items.find(item => 
      (item.itemId && effectiveItemId && item.itemId === effectiveItemId) ||
      item.normalizedName === normalizedItemName ||
      (item.normalizedName.length > 4 && normalizedItemName.includes(item.normalizedName)) ||
      (normalizedItemName.length > 4 && item.normalizedName.includes(normalizedItemName))
    );

    if (existingItem) {
      const updatedQty = existingItem.quantity + finalQuantity;
      const notesSuffix = existingItem.notes ? ` ${existingItem.notes}` : '';
      const updatedLine = `- [${existingItem.isPurchased ? 'x' : ' '}] ${existingItem.itemName} — Qty: ${updatedQty}${notesSuffix}`;

      return {
        action: 'UPDATE_QUANTITY',
        isDuplicate: true,
        category: targetCategory,
        itemId: existingItem.itemId || effectiveItemId,
        existingItem: existingItem,
        newQuantity: updatedQty,
        replaceRange: {
          startIndex: existingItem.startIndex,
          endIndex: existingItem.endIndex
        },
        replacementText: updatedLine,
        message: `Updated ${existingItem.itemName} from ${existingItem.quantity} to ${updatedQty} under ${targetCategory.title}.`
      };
    }
  }

  const qtyStr = finalQuantity > 1 ? ` — Qty: ${finalQuantity}` : '';
  const newLineText = `- [ ] ${cleanItemName}${qtyStr}
`;

  if (targetSection) {
    const sectionIndex = docStructure.sections.indexOf(targetSection);
    let insertionIndex = docStructure.totalLength;

    if (targetSection.items.length > 0) {
      const lastItem = targetSection.items[targetSection.items.length - 1];
      insertionIndex = lastItem.endIndex + 1;
    } else if (sectionIndex + 1 < docStructure.sections.length) {
      const nextSection = docStructure.sections[sectionIndex + 1];
      insertionIndex = nextSection.startIndex;
    }

    return {
      action: 'INSERT_ITEM',
      isDuplicate: false,
      category: targetCategory,
      itemId: effectiveItemId,
      insertionIndex: Math.min(insertionIndex, docStructure.totalLength),
      textToInsert: newLineText,
      message: `Added "${cleanItemName}"${qtyStr} to ${targetCategory.title}.`
    };
  }

  const newSectionText = `
<!-- section: ${targetCategory.id} -->
## ${targetCategory.title}
${newLineText}`;
  return {
    action: 'CREATE_SECTION_AND_INSERT',
    isDuplicate: false,
    category: targetCategory,
    itemId: effectiveItemId,
    insertionIndex: docStructure.totalLength,
    textToInsert: newSectionText,
    message: `Created new section "${targetCategory.title}" and added "${cleanItemName}"${qtyStr}.`
  };
}

export function calculateMarkPurchased(docStructure, itemNameOrId, isPurchased = true) {
  const searchNormalized = (itemNameOrId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!searchNormalized) {
    return { found: false, message: 'No item name provided.' };
  }

  for (const section of docStructure.sections) {
    for (const item of section.items) {
      if ((item.itemId && itemNameOrId && item.itemId === itemNameOrId) ||
          item.normalizedName === searchNormalized || 
          (item.normalizedName.length > 4 && searchNormalized.includes(item.normalizedName)) ||
          (searchNormalized.length > 4 && item.normalizedName.includes(searchNormalized))) {
        
        const checkMark = isPurchased ? 'x' : ' ';
        const qtyStr = item.quantity > 1 ? ` — Qty: ${item.quantity}` : '';
        const notesSuffix = item.notes ? ` ${item.notes}` : '';
        const updatedLine = `- [${checkMark}] ${item.itemName}${qtyStr}${notesSuffix}`;

        return {
          found: true,
          item: item,
          category: section,
          isPurchased: isPurchased,
          replaceRange: {
            startIndex: item.startIndex,
            endIndex: item.endIndex
          },
          replacementText: updatedLine,
          message: `Marked "${item.itemName}" as ${isPurchased ? 'purchased' : 'pending'} under ${section.canonicalTitle || section.title}.`
        };
      }
    }
  }

  return {
    found: false,
    message: `Could not find "${itemNameOrId}" in the purchasing checklist.`
  };
}

export function queryPurchasingList(docStructure, options = {}) {
  const {
    trade = null,
    unpurchasedOnly = true
  } = options;

  let matchedSections = docStructure.sections;
  if (trade) {
    const targetCat = classifyTradeCategory('', trade);
    matchedSections = docStructure.sections.filter(s => (s.sectionId || s.categoryId) === targetCat.id);
  }

  const results = [];
  for (const s of matchedSections) {
    const items = s.items.filter(item => !unpurchasedOnly || !item.isPurchased);
    if (items.length > 0) {
      results.push({
        category: s.canonicalTitle || s.title,
        categoryId: s.categoryId,
        sectionId: s.sectionId || s.categoryId,
        items: items.map(it => ({
          id: it.itemId,
          name: it.itemName,
          quantity: it.quantity,
          status: it.status || 'active',
          notes: it.notes || '',
          isPurchased: it.isPurchased
        }))
      });
    }
  }

  return results;
}

/**
 * Deprecates an item in the Master Template (Never deletes it).
 * Sets <!-- status: deprecated --> and auto-increments Master version.
 */
export function deprecateMasterItem(storageOrAdapter, itemNameOrId) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  let masterDoc = adapter.getMasterDocument();
  const structure = parseGoogleDocPurchasingStructure(masterDoc);
  const searchNormalized = (itemNameOrId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const section of structure.sections) {
    for (const item of section.items) {
      if ((item.itemId && itemNameOrId && item.itemId === itemNameOrId) ||
          item.normalizedName === searchNormalized) {
        
        const qtyStr = item.quantity > 1 ? ` — Qty: ${item.quantity}` : '';
        const notesSuffix = item.notes ? ` ${item.notes}` : '';
        const deprecatedLine = `- [ ] ${item.itemName} <!-- id: ${item.itemId} --> <!-- status: deprecated -->${qtyStr}${notesSuffix}`;

        const before = masterDoc.slice(0, item.startIndex);
        const after = masterDoc.slice(item.endIndex);
        masterDoc = before + deprecatedLine + after;

        const currentVer = parseMasterVersion(masterDoc);
        const nextVer = incrementMasterVersion(currentVer);
        masterDoc = updateMasterVersionInDoc(masterDoc, nextVer);

        adapter.saveMasterDocument(masterDoc);
        recordPurchasingAuditLog(adapter, {
          resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
          source: 'Master',
          masterVersion: nextVer,
          itemId: item.itemId,
          itemName: item.itemName,
          projectsAffected: ['purchasing_master'],
          action: 'deprecated',
          details: { previousVersion: currentVer, newVersion: nextVer }
        });

        return {
          success: true,
          itemId: item.itemId,
          itemName: item.itemName,
          newVersion: nextVer,
          message: `Deprecated "${item.itemName}" in Master Template (${nextVer}). It will be excluded from future projects while active projects keep their historical record.`
        };
      }
    }
  }

  return {
    success: false,
    message: `Item "${itemNameOrId}" was not found in Master Purchasing Template.`
  };
}

/**
 * Storage-Agnostic Non-Destructive Synchronization Engine (V1 Final)
 * Provides dual-payload previews (concise voiceSummary, detailedPreview table).
 */
export function syncMasterPurchasingToProjects(storageOrAdapter, targetProjectIds = [], options = {}) {
  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  const {
    dryRun = false,
    userCommand = null
  } = options;

  const masterDocContent = adapter.getMasterDocument();
  const masterStructure = parseGoogleDocPurchasingStructure(masterDocContent);
  const masterVersion = masterStructure.masterVersion || 'v1.0';

  const results = {
    resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
    masterVersion: masterVersion,
    isDryRun: Boolean(dryRun),
    totalProjectsTargeted: targetProjectIds.length,
    projectsSynced: [],
    missingInProjects: {},
    itemsAddedSummary: {},
    detailedPreview: [],
    auditEntries: [],
    totalMissingItemsCount: 0,
    alreadyCurrentCount: 0,
    customItemsUntouchedCount: 0
  };

  for (const projId of targetProjectIds) {
    if (!projId || projId === 'master') continue;

    let projDoc = adapter.getProjectDocument(projId);
    let projStructure = parseGoogleDocPurchasingStructure(projDoc);
    const addedItemsForProject = [];
    const missingForDryRun = [];
    const customUntouched = [];

    // Filter out deprecated items from Master so they aren't added to projects
    const activeMasterSections = masterStructure.sections.map(sec => ({
      ...sec,
      items: sec.items.filter(it => it.status !== 'deprecated')
    }));

    for (const masterSection of activeMasterSections) {
      for (const masterItem of masterSection.items) {
        const targetProjSection = projStructure.sections.find(s => (s.sectionId || s.categoryId) === masterSection.categoryId);
        
        // Match on item_id first, then normalized name fallback
        const existingItem = targetProjSection?.items.find(it => 
          (it.itemId && masterItem.itemId && it.itemId === masterItem.itemId) ||
          it.normalizedName === masterItem.normalizedName ||
          (it.normalizedName.length > 4 && masterItem.normalizedName.includes(it.normalizedName)) ||
          (masterItem.normalizedName.length > 4 && it.normalizedName.includes(masterItem.normalizedName))
        );

        if (!existingItem) {
          missingForDryRun.push({
            itemId: masterItem.itemId,
            itemName: masterItem.itemName,
            quantity: masterItem.quantity,
            category: masterSection.canonicalTitle || masterSection.title,
            sectionId: masterSection.categoryId,
            proposedAction: 'add'
          });

          if (!dryRun) {
            const insertion = calculateSectionInsertion(projStructure, masterItem.itemName, masterItem.quantity, masterSection.categoryId, masterItem.itemId);
            if (insertion.action === 'INSERT_ITEM' || insertion.action === 'CREATE_SECTION_AND_INSERT') {
              const before = projDoc.slice(0, insertion.insertionIndex);
              const after = projDoc.slice(insertion.insertionIndex);
              projDoc = before + insertion.textToInsert + after;
              projStructure = parseGoogleDocPurchasingStructure(projDoc);
              addedItemsForProject.push({
                itemId: masterItem.itemId,
                name: masterItem.itemName,
                quantity: masterItem.quantity,
                category: masterSection.canonicalTitle || masterSection.title,
                sectionId: masterSection.categoryId
              });
            }
          }
        } else {
          // Check if item is customized or already current
          const hasCustomization = existingItem.isPurchased || existingItem.quantity !== masterItem.quantity || Boolean(existingItem.notes);
          if (hasCustomization) {
            customUntouched.push({
              itemId: existingItem.itemId,
              itemName: existingItem.itemName,
              projectQuantity: existingItem.quantity,
              masterQuantity: masterItem.quantity,
              isPurchased: existingItem.isPurchased,
              notes: existingItem.notes,
              action: 'leave_untouched'
            });
            results.customItemsUntouchedCount++;
          } else {
            results.alreadyCurrentCount++;
          }
        }
      }
    }

    results.totalMissingItemsCount += missingForDryRun.length;

    results.detailedPreview.push({
      projectId: projId,
      missingItems: missingForDryRun,
      missingCount: missingForDryRun.length,
      customUntouched: customUntouched,
      customUntouchedCount: customUntouched.length
    });

    if (dryRun) {
      results.missingInProjects[projId] = missingForDryRun;
      if (missingForDryRun.length > 0) {
        results.projectsSynced.push(projId);
      }
    } else {
      adapter.saveProjectDocument(projId, projDoc);
      results.projectsSynced.push(projId);
      results.itemsAddedSummary[projId] = addedItemsForProject;

      if (addedItemsForProject.length > 0) {
        for (const it of addedItemsForProject) {
          const auditEntry = recordPurchasingAuditLog(adapter, {
            resourceType: RESOURCE_TYPES.PURCHASING_MASTER,
            source: 'Master',
            masterVersion: masterVersion,
            itemId: it.itemId,
            itemName: it.name,
            projectsAffected: [projId],
            action: 'added',
            userCommand: userCommand,
            details: { projectId: projId, category: it.category }
          });
          if (auditEntry) results.auditEntries.push(auditEntry);
        }
      }
    }
  }

  const affectedProjectsCount = results.projectsSynced.length;
  if (dryRun) {
    results.voiceSummary = affectedProjectsCount > 0
      ? `I found ${affectedProjectsCount} project(s) missing ${results.totalMissingItemsCount} Master items. Want me to sync them?`
      : `All active projects are already up to date with Master ${masterVersion}.`;
    results.summaryPrompt = results.voiceSummary;
    results.message = results.voiceSummary;
  } else {
    const totalAdded = Object.values(results.itemsAddedSummary).reduce((sum, list) => sum + list.length, 0);
    results.voiceSummary = totalAdded > 0
      ? `Master ${masterVersion} synchronized to ${affectedProjectsCount} active project(s). Added ${totalAdded} item(s); custom project packages were left untouched.`
      : `All active projects were already current with Master ${masterVersion}. No changes needed.`;
    results.message = results.voiceSummary;
  }

  return results;
}

/**
 * Initializes a new project purchasing document by cloning the Master Purchasing Template.
 * Provenance tracking: records initialMasterVersion and excludes deprecated items.
 */
export function cloneMasterToNewProject(storageOrAdapter, newProjectId) {
  if (!newProjectId) return null;
  const adapter = resolvePurchasingAdapter(storageOrAdapter);

  const masterDocContent = adapter.getMasterDocument();
  const masterStructure = parseGoogleDocPurchasingStructure(masterDocContent);
  const masterVersion = masterStructure.masterVersion || 'v1.0';

  let projectLines = [];
  projectLines.push(`# Master Fixtures & Hardware Purchasing Checklist - Project ${newProjectId} (Template: ${masterVersion})`);
  projectLines.push(`<!-- initial_master_version: ${masterVersion} -->\n`);

  for (const section of masterStructure.sections) {
    projectLines.push(`<!-- section: ${section.sectionId || section.categoryId} -->`);
    projectLines.push(`## ${section.canonicalTitle || section.title}`);
    for (const item of section.items) {
      if (item.status !== 'deprecated') {
        const qtyStr = item.quantity > 1 ? ` — Qty: ${item.quantity}` : '';
        const idAnchor = item.itemId ? ` <!-- id: ${item.itemId} -->` : '';
        projectLines.push(`- [ ] ${item.itemName}${idAnchor}${qtyStr}`);
      }
    }
    projectLines.push('');
  }

  const freshLotDoc = projectLines.join('\n');
  adapter.saveProjectDocument(newProjectId, freshLotDoc);
  return freshLotDoc;
}

/**
 * Scans projectContext driveTree or storage metadata to discover and bind
 * the authoritative Google Drive purchasing checklist document for a project.
 */
export function discoverAndBindProjectPurchasingDoc(storageOrAdapter, projectId = 'default', projectContext = {}) {
  if (!projectId || projectId === 'master') {
    return { found: false, documentId: null, fileName: null, folderName: null, content: null };
  }

  const adapter = resolvePurchasingAdapter(storageOrAdapter);
  const currentDoc = adapter.getProjectDocument(projectId, '');

  // 1. Check if document already has an embedded DocumentId tag
  const existingIdMatch = currentDoc.match(/DocumentId:\s*([^\s\n]+)/i);
  const existingNameMatch = currentDoc.match(/DocumentName:\s*([^\n]+)/i);
  if (existingIdMatch) {
    return {
      found: true,
      documentId: existingIdMatch[1].trim(),
      fileName: existingNameMatch ? existingNameMatch[1].trim() : 'Purchasing Checklist',
      folderName: 'Google Doc Purchasing List',
      content: currentDoc
    };
  }

  // 2. Scan driveTree / files in projectContext for designated purchasing checklist
  const driveTree = projectContext?.driveTree || projectContext?.currentLiveTree || projectContext?.dashboardData?.driveTree || null;
  let matchedFile = null;
  let matchedFolder = null;

  if (driveTree) {
    if (Array.isArray(driveTree.subfolders)) {
      for (const sub of driveTree.subfolders) {
        const folderName = (sub.folderName || sub.name || '').toLowerCase();
        const isPurchasingFolder = folderName.includes('purchasing') || folderName.includes('checklist') || folderName.includes('materials');
        
        if (Array.isArray(sub.files)) {
          for (const file of sub.files) {
            const fileName = (file.name || file.title || '').toLowerCase();
            const isPurchasingFile = fileName.includes('purchasing') || fileName.includes('checklist');
            
            if (isPurchasingFolder || isPurchasingFile) {
              matchedFile = file;
              matchedFolder = sub.folderName || sub.name || 'Google Doc Purchasing List';
              break;
            }
          }
        }
        if (matchedFile) break;
      }
    }

    if (!matchedFile && Array.isArray(driveTree.directFiles)) {
      for (const file of driveTree.directFiles) {
        const fileName = (file.name || file.title || '').toLowerCase();
        if (fileName.includes('purchasing') || fileName.includes('checklist')) {
          matchedFile = file;
          matchedFolder = 'Google Drive';
          break;
        }
      }
    }
  }

  // 3. If matched, bind document metadata into the project purchasing document
  if (matchedFile && matchedFile.id) {
    const docId = matchedFile.id;
    const docName = matchedFile.name || 'Purchasing Checklist.docx';
    const folderName = matchedFolder || 'Google Doc Purchasing List';

    let boundContent = currentDoc;
    if (!boundContent || boundContent === getDefaultProjectDoc(projectId)) {
      boundContent = `# Master Fixtures & Hardware Purchasing Checklist - Project ${projectId}\nDocumentId: ${docId}\nDocumentName: ${docName}\n\n<!-- section: quartz -->\n## 1. Quartz Hardware\n\n<!-- section: electrical -->\n## 2. Electrical Hardware Fixtures\n\n<!-- section: plumbing -->\n## 3. Plumbing Hardware Fixtures\n`;
    } else {
      if (!boundContent.includes(`DocumentId: ${docId}`)) {
        boundContent = boundContent.replace(/^(# Master Fixtures & Hardware Purchasing Checklist.*?\n)/m, `$1DocumentId: ${docId}\nDocumentName: ${docName}\n`);
      }
    }

    adapter.saveProjectDocument(projectId, boundContent);

    return {
      found: true,
      documentId: docId,
      fileName: docName,
      folderName: folderName,
      content: boundContent
    };
  }

  return {
    found: false,
    documentId: null,
    fileName: null,
    folderName: null,
    content: currentDoc || null
  };
}
