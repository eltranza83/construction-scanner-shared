import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESOURCE_TYPES,
  loadMasterPurchasingDoc,
  saveMasterPurchasingDoc,
  loadProjectPurchasingDoc,
  saveProjectPurchasingDoc,
  syncMasterPurchasingToProjects,
  cloneMasterToNewProject,
  getPurchasingAuditLog,
  recordPurchasingAuditLog,
  calculateSectionInsertion,
  parseGoogleDocPurchasingStructure
} from '../src/services/googleDocsPurchasingService.js';

/**
 * Custom Cloud Database / Firestore Adapter Mock
 * Demonstrates 100% decoupling from localStorage and key naming conventions.
 */
class CustomCloudPurchasingAdapter {
  constructor() {
    this.collections = {
      master_templates: new Map(),
      project_records: new Map(),
      audit_events: []
    };
  }

  getMasterDocument(defaultDoc = null) {
    return this.collections.master_templates.get('company_root_template') || defaultDoc || null;
  }

  saveMasterDocument(content) {
    this.collections.master_templates.set('company_root_template', content);
    return content;
  }

  getProjectDocument(projectId, defaultDoc = null) {
    return this.collections.project_records.get(projectId) || defaultDoc || null;
  }

  saveProjectDocument(projectId, content) {
    this.collections.project_records.set(projectId, content);
    return content;
  }

  getAuditLogs(limit = 50) {
    return this.collections.audit_events.slice(0, limit);
  }

  saveAuditLog(entry) {
    this.collections.audit_events.unshift(entry);
    return entry;
  }
}

const CUSTOM_MASTER_DOC = `# Master Fixtures & Hardware Purchasing Checklist (Company Master Template)

<!-- section: electrical -->
## 2. Electrical Hardware Fixtures
- [ ] 200A main panel breaker <!-- id: item_200a_breaker --> — Qty: 1
- [ ] GFCI outlets <!-- id: item_gfci_outlets --> — Qty: 6

<!-- section: plumbing -->
## 3. Plumbing Hardware Fixtures
- [ ] Soap dispenser <!-- id: item_soap_dispenser -->
`;

const CUSTOM_LOT_DOC = `# Master Fixtures & Hardware Purchasing Checklist - Project lot_99

<!-- section: plumbing -->
## Plumbing Hardware Fixtures
- [x] Soap dispenser <!-- id: item_soap_dispenser --> — Notes: Brushed Gold (PO-501)
- [ ] Custom steam shower unit <!-- id: item_custom_steam_unit -->
`;

describe('Storage-Agnostic Purchasing Domain & Custom Adapter Suite', () => {
  let customAdapter;

  beforeEach(() => {
    customAdapter = new CustomCloudPurchasingAdapter();
    customAdapter.saveMasterDocument(CUSTOM_MASTER_DOC);
    customAdapter.saveProjectDocument('lot_99', CUSTOM_LOT_DOC);
  });

  test('1. Domain logic reads and writes Master resource without localStorage keys', () => {
    const loadedMaster = loadMasterPurchasingDoc(customAdapter);
    assert.ok(loadedMaster.includes('200A main panel breaker'));
    assert.equal(customAdapter.collections.master_templates.size, 1);

    // Append item directly via domain
    const parsed = parseGoogleDocPurchasingStructure(loadedMaster);
    const insertion = calculateSectionInsertion(parsed, 'Smart doorbell chime', 1, 'electrical');
    const updated = loadedMaster.slice(0, insertion.insertionIndex) + insertion.textToInsert + loadedMaster.slice(insertion.insertionIndex);
    
    saveMasterPurchasingDoc(customAdapter, updated);
    assert.ok(customAdapter.getMasterDocument().includes('Smart doorbell chime'));
  });

  test('2. Storage-Agnostic Non-Destructive Merge: Merges into custom adapter cleanly', () => {
    const syncRes = syncMasterPurchasingToProjects(customAdapter, ['lot_99'], {
      dryRun: false,
      userCommand: 'Sync Master to lot 99'
    });

    assert.equal(syncRes.resourceType, RESOURCE_TYPES.PURCHASING_MASTER);
    assert.equal(syncRes.projectsSynced.length, 1);

    const lot99After = loadProjectPurchasingDoc(customAdapter, 'lot_99');

    // 1. Missing electrical items added
    assert.ok(lot99After.includes('200A main panel breaker'), 'Must receive 200A breaker');
    assert.ok(lot99After.includes('GFCI outlets'), 'Must receive GFCI outlets');

    // 2. Preserves purchased [x] status and notes
    assert.ok(lot99After.includes('- [x] Soap dispenser') && lot99After.includes('Notes: Brushed Gold (PO-501)'), 'Must preserve [x] and notes');

    // 3. Preserves project-specific custom items
    assert.ok(lot99After.includes('Custom steam shower unit'), 'Must preserve lot-specific items');

    // 4. Audit entry recorded inside custom adapter
    const audits = getPurchasingAuditLog(customAdapter);
    assert.ok(audits.length > 0, 'Audit entries must be saved to custom adapter');
    assert.equal(audits[0].projectsAffected[0], 'lot_99');
  });

  test('3. Storage-Agnostic Project Cloning: Clones fresh template via custom adapter', () => {
    cloneMasterToNewProject(customAdapter, 'lot_100');

    const lot100Doc = loadProjectPurchasingDoc(customAdapter, 'lot_100');
    assert.ok(lot100Doc.includes('Project lot_100'));
    assert.ok(lot100Doc.includes('200A main panel breaker'));
    assert.ok(!lot100Doc.includes('[x]'), 'Must be unchecked');
  });
});
