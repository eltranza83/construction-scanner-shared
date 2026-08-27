/**
 * SiteTactix Structured Finishes & Specs Engine (Firestore-First Architecture)
 * 
 * Provides decoupled, domain-driven finish and material specification operations
 * for project lots, mirroring the clean purchasingService.js architecture:
 * - Single source of truth in Firestore: /projects/{projectId}/finishes/{finishId}
 * - Clean local cache / offline fallback adapter
 * - Anchor fields (category, scope, surface, location, code, brand, sheen, notes)
 * - Open-ended dynamic attributes map for specialty trades (Texture, Sealant, Thickness, Warranty)
 * - Explicit Whole House Default vs. Location Override hierarchy
 * - Conservative AI matching and ambiguity protection
 * - Safe 1-time legacy localStorage migration without duplication
 */

import { getFirebaseDb } from './firebase.js';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore/lite';

export const FINISH_SCOPES = {
  WHOLE_HOUSE: 'whole_house',
  ROOM_OVERRIDE: 'room_override',
  EXTERIOR_GENERAL: 'exterior_general',
  AREA_SPECIFIC: 'area_specific'
};

export const SURFACE_TYPES = [
  'Interior Walls',
  'Ceilings',
  'Trim & Doors',
  'Cabinets',
  'Exterior Body / Walls',
  'Exterior Trim / Fascia',
  'Accent Wall / Feature',
  'Flooring / Countertop',
  'General / Structure'
];

export const STANDARD_FINISH_CATEGORIES = [
  { id: 'Paint', label: '🎨 Paint & Stains', defaultScope: 'whole_house' },
  { id: 'Tile & Grout', label: '🧱 Tile, Grout & Stone', defaultScope: 'area_specific' },
  { id: 'Stucco', label: '🏡 Stucco & Exterior Plaster', defaultScope: 'exterior_general' },
  { id: 'Stone', label: '🏛️ Architectural Stone / Cantera', defaultScope: 'exterior_general' },
  { id: 'Roofing', label: '🏠 Roofing & Gutters', defaultScope: 'whole_house' },
  { id: 'Countertops & Flooring', label: '🪚 Countertops & Flooring', defaultScope: 'area_specific' },
  { id: 'Fixtures & Hardware', label: '💡 Plumbing & Electrical Fixtures', defaultScope: 'area_specific' },
  { id: 'Siding & Millwork', label: '🪵 Siding, Trim & Millwork', defaultScope: 'exterior_general' },
  { id: 'Appliances & Custom', label: '📝 Appliances & Custom', defaultScope: 'whole_house' }
];

export function cleanProjectId(rawId) {
  if (!rawId) return 'default_project';
  return String(rawId).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

/**
 * Normalizes a finish spec document from Firestore or input form
 */
export function normalizeFinishSpec(data, id = null) {
  const specId = id || data.id || `spec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const category = (data.category || 'General').trim();
  const locationRaw = (data.location || '').trim();
  const surfaceRaw = (data.surface || '').trim();
  
  // Determine scope: if location is empty or says "whole house", mark as whole_house
  let scope = data.scope;
  if (!scope) {
    const locLower = locationRaw.toLowerCase();
    if (!locationRaw || locLower.includes('whole house') || locLower.includes('entire house') || locLower === 'general') {
      scope = FINISH_SCOPES.WHOLE_HOUSE;
    } else if (locLower.includes('exterior') && !locLower.includes('front') && !locLower.includes('accent')) {
      scope = FINISH_SCOPES.EXTERIOR_GENERAL;
    } else {
      scope = FINISH_SCOPES.ROOM_OVERRIDE;
    }
  }

  // Derive intelligent surface default if omitted
  let surface = surfaceRaw;
  if (!surface) {
    const locLower = locationRaw.toLowerCase();
    if (locLower.includes('ceiling')) surface = 'Ceilings';
    else if (locLower.includes('trim') || locLower.includes('baseboard') || locLower.includes('door')) surface = 'Trim & Doors';
    else if (locLower.includes('cabinet') || locLower.includes('island')) surface = 'Cabinets';
    else if (locLower.includes('accent')) surface = 'Accent Wall / Feature';
    else if (category.toLowerCase() === 'paint' || category.toLowerCase() === 'stucco') surface = 'Interior Walls';
    else surface = 'General / Structure';
  }

  const location = locationRaw || (scope === FINISH_SCOPES.WHOLE_HOUSE ? 'Whole House' : 'General');
  const code = (data.code || data.title || data.name || '').trim();
  const brand = (data.brand || data.supplier || data.brandOrSupplier || '').trim();
  const sheen = (data.sheen || data.specs || '').trim();
  const notes = (data.notes || '').trim();

  // Normalize dynamic attributes map
  let attributes = {};
  if (data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes)) {
    Object.entries(data.attributes).forEach(([k, v]) => {
      if (k && v !== undefined && v !== null && String(v).trim()) {
        attributes[k.trim()] = String(v).trim();
      }
    });
  }

  return {
    id: specId,
    category,
    scope,
    surface,
    location,
    name: code,
    code,
    brand,
    sheen,
    notes,
    attributes,
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedByUid: data.updatedByUid || null,
    source: data.source || 'ui'
  };
}

/**
 * In-Memory / LocalStorage Adapter for Offline Execution & Unit Tests
 */
export class LocalStorageFinishAdapter {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this.storage = storage;
    this.memoryStore = new Map();
  }

  _getKey(projectId) {
    const cleanId = cleanProjectId(projectId);
    return `sitetactix_finishes_${cleanId}`;
  }

  async getSpecs(projectId) {
    const key = this._getKey(projectId);
    const storageObj = this.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (storageObj?.getItem) {
      try {
        const raw = storageObj.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((p) => normalizeFinishSpec(p));
          }
        }
      } catch (_) {}
    }
    return this.memoryStore.get(key) || [];
  }

  async saveSpecs(projectId, specs = []) {
    const key = this._getKey(projectId);
    const serialized = JSON.stringify(specs);
    const storageObj = this.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (storageObj?.setItem) {
      storageObj.setItem(key, serialized);
    }
    this.memoryStore.set(key, specs);
    return specs;
  }

  async saveSpec(projectId, spec) {
    const normalized = normalizeFinishSpec(spec, spec.id);
    const existing = await this.getSpecs(projectId);
    const idx = existing.findIndex((s) => s.id === normalized.id);
    if (idx >= 0) {
      existing[idx] = normalized;
    } else {
      existing.unshift(normalized);
    }
    await this.saveSpecs(projectId, existing);
    return normalized;
  }

  async deleteSpec(projectId, finishId) {
    if (!finishId) return;
    const existing = await this.getSpecs(projectId);
    const filtered = existing.filter((s) => s.id !== finishId);
    await this.saveSpecs(projectId, filtered);
  }
}

/**
 * Production Cloud Firestore Storage Adapter with Offline Fallback
 */
export class FirestoreFinishAdapter {
  constructor(db = null) {
    this.db = db;
    this.fallback = new LocalStorageFinishAdapter();
  }

  _getDb() {
    if (this.db) return this.db;
    if (typeof window !== 'undefined') {
      try {
        return getFirebaseDb();
      } catch (err) {
        console.warn('[FirestoreFinishAdapter] Failed to get Firebase DB:', err);
      }
    }
    return null;
  }

  async getSpecs(projectId) {
    const database = this._getDb();
    const cleanId = cleanProjectId(projectId);

    if (!database) {
      return await this.fallback.getSpecs(projectId);
    }

    try {
      const finishesCol = collection(database, 'projects', cleanId, 'finishes');
      const snap = await getDocs(finishesCol);
      const items = [];
      snap.forEach((docSnap) => {
        items.push(normalizeFinishSpec(docSnap.data(), docSnap.id));
      });

      if (items.length > 0) {
        const sorted = sortFinishes(items);
        await this.fallback.saveSpecs(projectId, sorted);
        return sorted;
      }

      // Check legacy migration if Firestore is empty
      const migrated = await migrateLegacyLocalStorageSpecs(projectId);
      if (migrated && migrated.length > 0) {
        const sorted = sortFinishes(migrated);
        await this.fallback.saveSpecs(projectId, sorted);
        for (const spec of sorted) {
          const docRef = doc(database, 'projects', cleanId, 'finishes', spec.id);
          await setDoc(docRef, spec, { merge: true }).catch(() => {});
        }
        return sorted;
      }

      // Check fallback cache
      const fallbackSpecs = await this.fallback.getSpecs(projectId);
      return sortFinishes(fallbackSpecs);
    } catch (err) {
      console.warn('[FirestoreFinishAdapter] Falling back to local cache:', err?.message);
      return await this.fallback.getSpecs(projectId);
    }
  }

  async saveSpec(projectId, spec) {
    const normalized = normalizeFinishSpec(spec, spec.id);
    await this.fallback.saveSpec(projectId, normalized);

    const database = this._getDb();
    if (!database) return normalized;

    try {
      const cleanId = cleanProjectId(projectId);
      const docRef = doc(database, 'projects', cleanId, 'finishes', normalized.id);
      await setDoc(docRef, normalized, { merge: true });
      return normalized;
    } catch (err) {
      console.warn(`[FirestoreFinishAdapter] Firestore save failed (${err?.message}), saved to local cache.`);
      return normalized;
    }
  }

  async deleteSpec(projectId, finishId) {
    if (!finishId) return true;
    await this.fallback.deleteSpec(projectId, finishId);

    const database = this._getDb();
    if (!database) return true;

    try {
      const cleanId = cleanProjectId(projectId);
      const docRef = doc(database, 'projects', cleanId, 'finishes', finishId);
      await deleteDoc(docRef);
      return true;
    } catch (err) {
      console.warn(`[FirestoreFinishAdapter] Firestore delete failed (${err?.message}), deleted from local cache.`);
      return true;
    }
  }
}

// Global Singleton Instance (Mirroring purchasingService)
export const finishService = new FirestoreFinishAdapter();

/**
 * Public Convenience Methods
 */
export async function fetchProjectFinishes(projectId) {
  return await finishService.getSpecs(projectId);
}

export async function saveFinishSpec(projectId, finishData) {
  return await finishService.saveSpec(projectId, finishData);
}

export async function deleteFinishSpec(projectId, finishId) {
  return await finishService.deleteSpec(projectId, finishId);
}

/**
 * Conservative Matching Engine for J.A.R.V.I.S. Updates
 * 
 * Determines if a voice command targets an existing record or creates a new one.
 * Matches against Category + Surface + Location + Scope.
 * If multiple records match, flags it as ambiguous so J.A.R.V.I.S. clarifies rather than overwriting.
 */
export function findMatchingFinish(existingSpecs = [], criteria = {}) {
  const targetCategory = (criteria.category || '').toLowerCase().trim();
  const targetLocation = (criteria.location || '').toLowerCase().trim();
  const targetSurface = (criteria.surface || '').toLowerCase().trim();
  const targetScope = (criteria.scope || '').toLowerCase().trim();

  if (!targetCategory && !targetLocation && !targetSurface) {
    return { match: null, ambiguous: false, candidates: [] };
  }

  // Filter candidates by category (fuzzy or exact)
  let candidates = existingSpecs.filter((s) => {
    if (!targetCategory) return true;
    const cat = (s.category || '').toLowerCase();
    return cat === targetCategory || cat.includes(targetCategory) || targetCategory.includes(cat);
  });

  if (candidates.length === 0) {
    return { match: null, ambiguous: false, candidates: [] };
  }

  // If specific surface specified (e.g. "Ceilings", "Cabinets", "Trim", "Walls")
  if (targetSurface) {
    const surfaceMatches = candidates.filter((s) => {
      const surf = (s.surface || '').toLowerCase();
      return surf === targetSurface || surf.includes(targetSurface) || targetSurface.includes(surf);
    });

    if (surfaceMatches.length === 1) {
      return { match: surfaceMatches[0], ambiguous: false, candidates: surfaceMatches };
    }
    if (surfaceMatches.length > 1) {
      candidates = surfaceMatches;
    }
  }

  // If specific location provided, match location
  if (targetLocation) {
    const locationMatches = candidates.filter((s) => {
      const loc = (s.location || '').toLowerCase();
      return loc === targetLocation || loc.includes(targetLocation) || targetLocation.includes(loc);
    });

    if (locationMatches.length === 1) {
      return { match: locationMatches[0], ambiguous: false, candidates: locationMatches };
    }
    if (locationMatches.length > 1) {
      return { match: null, ambiguous: true, candidates: locationMatches };
    }
  }

  // If scope specified
  if (targetScope) {
    const scopeMatches = candidates.filter((s) => (s.scope || '').toLowerCase() === targetScope);
    if (scopeMatches.length === 1) {
      return { match: scopeMatches[0], ambiguous: false, candidates: scopeMatches };
    }
    if (scopeMatches.length > 1) {
      return { match: null, ambiguous: true, candidates: scopeMatches };
    }
  }

  // If only 1 record exists in this filtered set, it is an exact single match
  if (candidates.length === 1) {
    return { match: candidates[0], ambiguous: false, candidates };
  }

  // Multiple candidates exist in this category and criteria wasn't specific enough
  return {
    match: null,
    ambiguous: true,
    candidates
  };
}

/**
 * Formats finishes into structured data for J.A.R.V.I.S. AI Tool responses
 * with explicit Whole House Defaults vs. Location Overrides and Surface Types.
 */
export function formatFinishesForAI(specs = []) {
  if (!specs || specs.length === 0) {
    return {
      found: false,
      count: 0,
      wholeHouseDefaults: [],
      locationOverrides: [],
      categories: [],
      summaryText: 'No finish selections or paint specifications found for this project.'
    };
  }

  const wholeHouse = [];
  const overrides = [];
  const categoriesSet = new Set();

  specs.forEach((s) => {
    categoriesSet.add(s.category);
    const formattedItem = {
      id: s.id,
      category: s.category,
      scope: s.scope,
      surface: s.surface || 'General / Structure',
      location: s.location,
      brand: s.brand || 'Unspecified',
      codeOrProduct: s.code || s.name || s.title,
      sheen: s.sheen || undefined,
      notes: s.notes || undefined,
      attributes: s.attributes && Object.keys(s.attributes).length > 0 ? s.attributes : undefined
    };

    if (s.scope === FINISH_SCOPES.WHOLE_HOUSE || s.scope === FINISH_SCOPES.EXTERIOR_GENERAL || s.location.toLowerCase().includes('whole house')) {
      wholeHouse.push(formattedItem);
    } else {
      overrides.push(formattedItem);
    }
  });

  // Construct structured text summary for prompt
  const lines = [];
  if (wholeHouse.length > 0) {
    lines.push('--- WHOLE-HOUSE & GENERAL SPECIFICATIONS ---');
    wholeHouse.forEach((item) => {
      let line = `* [${item.category} - ${item.location} (Surface: ${item.surface})]: ${item.brand !== 'Unspecified' ? item.brand + ' ' : ''}${item.codeOrProduct}`;
      if (item.sheen) line += ` (Finish/Sheen: ${item.sheen})`;
      if (item.attributes) {
        const attrStr = Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(' | ');
        line += ` [${attrStr}]`;
      }
      if (item.notes) line += ` — Notes: ${item.notes}`;
      lines.push(line);
    });
  }

  if (overrides.length > 0) {
    lines.push('\n--- ROOM & LOCATION-SPECIFIC OVERRIDES / ACCENTS ---');
    overrides.forEach((item) => {
      let line = `* [${item.category} - ${item.location} (Surface: ${item.surface})] (OVERRIDE): ${item.brand !== 'Unspecified' ? item.brand + ' ' : ''}${item.codeOrProduct}`;
      if (item.sheen) line += ` (Finish/Sheen: ${item.sheen})`;
      if (item.attributes) {
        const attrStr = Object.entries(item.attributes).map(([k, v]) => `${k}: ${v}`).join(' | ');
        line += ` [${attrStr}]`;
      }
      if (item.notes) line += ` — Notes: ${item.notes}`;
      lines.push(line);
    });
  }

  return {
    found: true,
    count: specs.length,
    wholeHouseDefaults: wholeHouse,
    locationOverrides: overrides,
    categories: Array.from(categoriesSet),
    summaryText: lines.join('\n')
  };
}

/**
 * 1-Time Safe Migration from legacy localStorage to Firestore
 */
export async function migrateLegacyLocalStorageSpecs(projectId) {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  const cleanId = cleanProjectId(projectId);
  const possibleKeys = [
    `sitetactix_finishes_${cleanId}`,
    `sitetactix_finishes_${projectId}`,
    `sitetactix_specs_${cleanId}`,
    `sitetactix_specs_${projectId}`,
    `jobscan_specs_${cleanId}`,
    `jobscan_specs_${projectId}`,
    'jobscan_specs',
    'sitetactix_specs'
  ];

  let raw = null;
  let sourceKey = null;
  for (const k of possibleKeys) {
    const val = window.localStorage.getItem(k);
    if (val) {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length > 0) {
          raw = val;
          sourceKey = k;
          break;
        }
      } catch (_) {}
    }
  }

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const database = getFirebaseDb();
    const migratedList = [];

    for (const item of parsed) {
      const normalized = normalizeFinishSpec(item);
      migratedList.push(normalized);

      if (database) {
        try {
          const docRef = doc(database, 'projects', cleanId, 'finishes', normalized.id);
          await setDoc(docRef, normalized, { merge: true });
        } catch (docErr) {
          console.warn(`[finishService] Failed to write migrated doc ${normalized.id}:`, docErr);
        }
      }
    }

    return migratedList;
  } catch (err) {
    console.error(`[finishService] Migration error for ${cleanId}:`, err);
    return [];
  }
}

/**
 * Exports project finishes to a clean, human-readable Google Doc / Markdown specification document
 * mirroring the purchasingService exportToGoogleDocMarkdown pattern.
 */
export async function exportToGoogleDocMarkdown(projectId, options = {}) {
  const cleanProjName = String(projectId || 'Project').replace(/^lot_?(\d+)$/i, (_, n) => `Lot ${n}`);
  const { title = `Finishes & Material Specifications - ${cleanProjName}` } = options;
  const specs = await fetchProjectFinishes(projectId);

  if (!specs || specs.length === 0) {
    return `# ${title}\nApplicable to all trades, interior designers, and subconsultants.\n\n*No finish selections or specifications recorded yet for this project.*\n`;
  }

  // Group by category
  const categoriesMap = new Map();
  specs.forEach((s) => {
    const cat = s.category || 'General';
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, { wholeHouse: [], overrides: [] });
    }
    const group = categoriesMap.get(cat);
    if (s.scope === FINISH_SCOPES.WHOLE_HOUSE || s.scope === FINISH_SCOPES.EXTERIOR_GENERAL || (s.location || '').toLowerCase().includes('whole house')) {
      group.wholeHouse.push(s);
    } else {
      group.overrides.push(s);
    }
  });

  // Sort categories by standard ordering
  const standardCatOrder = STANDARD_FINISH_CATEGORIES.map(c => c.id.toLowerCase());
  const sortedCategories = Array.from(categoriesMap.entries()).sort(([catA], [catB]) => {
    const idxA = standardCatOrder.findIndex(o => catA.toLowerCase().includes(o) || o.includes(catA.toLowerCase()));
    const idxB = standardCatOrder.findIndex(o => catB.toLowerCase().includes(o) || o.includes(catB.toLowerCase()));
    if (idxA >= 0 && idxB >= 0) return idxA - idxB;
    if (idxA >= 0) return -1;
    if (idxB >= 0) return 1;
    return catA.localeCompare(catB);
  });

  const lines = [`# ${title}`, 'Applicable to all trades, interior designers, and subconsultants.', ''];
  let sectionNum = 1;

  for (const [catName, group] of sortedCategories) {
    lines.push(`## ${sectionNum}. ${catName}`);
    
    const allItems = [...group.wholeHouse, ...group.overrides];
    allItems.forEach((s) => {
      const isOverride = s.scope === FINISH_SCOPES.ROOM_OVERRIDE || s.scope === FINISH_SCOPES.AREA_SPECIFIC;
      const overrideTag = isOverride ? ' (OVERRIDE)' : '';
      const surfaceTag = s.surface ? ` (${s.surface})` : '';
      const brandStr = s.brand && s.brand !== 'Unspecified' ? `${s.brand} ` : '';
      const codeOrProduct = s.code || s.name || 'Unspecified';
      const sheenStr = s.sheen ? ` (${s.sheen})` : '';

      let line = `* [${s.location || 'General'}${surfaceTag}]${overrideTag}: ${brandStr}${codeOrProduct}${sheenStr}`;

      if (s.attributes && Object.keys(s.attributes).length > 0) {
        const attrStr = Object.entries(s.attributes)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
          .join(' | ');
        line += ` [${attrStr}]`;
      }

      if (s.notes) {
        line += ` — ${s.notes}`;
      }

      lines.push(line);
    });

    lines.push('');
    sectionNum++;
  }

  return lines.join('\n').trim() + '\n';
}

// Internal Helpers
function sortFinishes(list = []) {
  return [...list].sort((a, b) => {
    // Whole house first
    if (a.scope === FINISH_SCOPES.WHOLE_HOUSE && b.scope !== FINISH_SCOPES.WHOLE_HOUSE) return -1;
    if (b.scope === FINISH_SCOPES.WHOLE_HOUSE && a.scope !== FINISH_SCOPES.WHOLE_HOUSE) return 1;
    // Category alphabetical
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    // Location alphabetical
    return (a.location || '').localeCompare(b.location || '');
  });
}
