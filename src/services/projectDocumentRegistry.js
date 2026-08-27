/**
 * Declarative Document Registry for SiteTactix Second Brain
 * Defines discovery patterns, scoring criteria, resource types, and templates for all project document types.
 */

export const PROJECT_DOC_REGISTRY = {
  purchasing_checklist: {
    docType: 'purchasing_checklist',
    displayName: 'Purchasing Checklist',
    masterResourceType: 'purchasing_master',
    projectResourceType: 'project_purchasing',
    folderPatterns: ['purchasing', 'purchasing list', 'purchasing checklist', 'google doc purchasing list', 'materials'],
    filePatterns: [/purchasing.*checklist/i, /purchasing.*list/i, /materials.*list/i],
    canonicalFileName: 'Purchasing Checklist.docx',
    defaultFolderName: 'Google Doc Purchasing List',
    masterTemplate: (version = 'v1.0') =>
      '# Master Fixtures & Hardware Purchasing Checklist (Company Master Template — ' + version + ')\n' +
      'DocumentId: doc_master_template_uuid\n' +
      '<!-- version: ' + version.replace('v', '') + ' -->\n\n' +
      '<!-- section: quartz -->\n## 1. Quartz Hardware\n- [ ] Electrical pass-through caps\n\n' +
      '<!-- section: electrical -->\n## 2. Electrical Hardware Fixtures\n- [ ] Security lights\n- [ ] Contractor doorbell chime kit\n\n' +
      '<!-- section: plumbing -->\n## 3. Plumbing Hardware Fixtures\n- [ ] Soap dispenser\n- [ ] Garbage disposal\n- [ ] Toilets\n',
    projectTemplate: (projectId, docId = '', fileName = 'Purchasing Checklist.docx', masterVersion = 'v1.0') =>
      '# Master Fixtures & Hardware Purchasing Checklist - Project ' + projectId + ' (Template: ' + masterVersion + ')\n' +
      'DocumentId: ' + docId + '\n' +
      'DocumentName: ' + fileName + '\n' +
      '<!-- initial_master_version: ' + masterVersion + ' -->\n\n' +
      '<!-- section: quartz -->\n## 1. Quartz Hardware\n\n' +
      '<!-- section: electrical -->\n## 2. Electrical Hardware Fixtures\n\n' +
      '<!-- section: plumbing -->\n## 3. Plumbing Hardware Fixtures\n'
  },

  municipal_inspections: {
    docType: 'municipal_inspections',
    displayName: 'Municipal Inspection Log',
    masterResourceType: 'inspections_master',
    projectResourceType: 'project_inspections',
    folderPatterns: ['inspections', 'municipal inspections', 'city inspections', 'permits & inspections', 'permits and inspections'],
    filePatterns: [/inspection.*(log|checklist|report|schedule|tracker)/i, /city.*inspection/i, /municipal.*inspection/i, /building.*inspection/i],
    canonicalFileName: 'Municipal Inspection Log.docx',
    defaultFolderName: 'Inspections',
    masterTemplate: (version = 'v1.0') =>
      '# Municipal Building Inspections Log (Company Master Standards — ' + version + ')\n' +
      'DocumentId: doc_inspections_master_uuid\n' +
      '<!-- version: ' + version.replace('v', '') + ' -->\n\n' +
      '<!-- section: stage_1 -->\n## 1. Foundation & Plumbing Underground\n- [ ] Plumbing Ground Inspection\n- [ ] Foundation Steel & Pre-Pour\n\n' +
      '<!-- section: stage_2 -->\n## 2. Framing & Rough-Ins\n- [ ] Framing Inspection\n- [ ] Rough Plumbing\n- [ ] Rough Electrical\n- [ ] Rough HVAC Mechanical\n\n' +
      '<!-- section: stage_3 -->\n## 3. Insulation & Energy\n- [ ] Insulation Inspection\n- [ ] Air Barrier Seal\n\n' +
      '<!-- section: stage_4 -->\n## 4. Final Inspections & Certificate of Occupancy\n- [ ] Building Final\n- [ ] Electrical Final\n- [ ] Plumbing Final\n- [ ] Certificate of Occupancy\n',
    projectTemplate: (projectId, docId = '', fileName = 'Municipal Inspection Log.docx', masterVersion = 'v1.0') =>
      '# Municipal Building Inspections Log - Project ' + projectId + ' (Template: ' + masterVersion + ')\n' +
      'DocumentId: ' + docId + '\n' +
      'DocumentName: ' + fileName + '\n' +
      '<!-- initial_master_version: ' + masterVersion + ' -->\n\n' +
      '<!-- section: stage_1 -->\n## 1. Foundation & Plumbing Underground\n- [ ] Plumbing Ground Inspection\n- [ ] Foundation Pre-Pour\n\n' +
      '<!-- section: stage_2 -->\n## 2. Framing & Rough-Ins\n- [ ] Framing Inspection\n- [ ] Rough Plumbing\n- [ ] Rough Electrical\n- [ ] Rough HVAC\n\n' +
      '<!-- section: stage_3 -->\n## 3. Insulation & Energy\n- [ ] Insulation Inspection\n\n' +
      '<!-- section: stage_4 -->\n## 4. Final Inspections & Certificate of Occupancy\n- [ ] Building Final\n- [ ] Certificate of Occupancy\n'
  },

  change_orders: {
    docType: 'change_orders',
    displayName: 'Change Orders Log',
    masterResourceType: 'change_orders_master',
    projectResourceType: 'project_change_orders',
    folderPatterns: ['change orders', 'change order', 'co logs', 'modifications', 'variations', 'client changes'],
    filePatterns: [/change.*order/i, /co.*log/i, /client.*change/i, /contract.*variation/i],
    canonicalFileName: 'Change Orders Log.docx',
    defaultFolderName: 'Change Orders',
    masterTemplate: (version = 'v1.0') =>
      '# Project Change Orders & Modifications Log (Company Master Standards — ' + version + ')\n' +
      'DocumentId: doc_change_orders_master_uuid\n' +
      '<!-- version: ' + version.replace('v', '') + ' -->\n\n' +
      '<!-- section: approved -->\n## 1. Approved Change Orders\n\n' +
      '<!-- section: pending -->\n## 2. Pending Client Review\n\n' +
      '<!-- section: draft -->\n## 3. Draft & In-Estimation\n',
    projectTemplate: (projectId, docId = '', fileName = 'Change Orders Log.docx', masterVersion = 'v1.0') =>
      '# Project Change Orders & Modifications Log - Project ' + projectId + ' (Template: ' + masterVersion + ')\n' +
      'DocumentId: ' + docId + '\n' +
      'DocumentName: ' + fileName + '\n' +
      '<!-- initial_master_version: ' + masterVersion + ' -->\n\n' +
      '<!-- section: approved -->\n## 1. Approved Change Orders\n\n' +
      '<!-- section: pending -->\n## 2. Pending Client Review\n\n' +
      '<!-- section: draft -->\n## 3. Draft & In-Estimation\n'
  },

  finishes_specs: {
    docType: 'finishes_specs',
    displayName: 'Finishes & Material Selections',
    masterResourceType: 'finishes_master',
    projectResourceType: 'project_finishes',
    folderPatterns: ['finishes', 'specs', 'selections', 'finishes & specs', 'finishes and specs', 'materials'],
    filePatterns: [/finishes.*(spec|selection|list|schedule)/i, /material.*spec/i, /finishes.*and.*specs/i],
    canonicalFileName: 'Finishes and Material Selections.docx',
    defaultFolderName: 'Finishes & Specifications',
    masterTemplate: (version = 'v1.0') =>
      '# Finishes & Material Specifications (Company Master Standards — ' + version + ')\n' +
      'DocumentId: doc_finishes_master_uuid\n' +
      '<!-- version: ' + version.replace('v', '') + ' -->\n\n' +
      '<!-- section: paint -->\n## 1. Paint & Stains\n* [Whole House - Interior Walls]: Sherwin-Williams SW 7005 Pure White (Flat)\n* [Whole House - Ceilings]: Sherwin-Williams SW 7005 Pure White Flat\n* [Whole House - Trim & Doors]: Sherwin-Williams SW 7005 Pure White (Semi-Gloss)\n\n' +
      '<!-- section: roofing -->\n## 2. Roofing & Gutters\n* [Whole House - Main Roof]: Owens Corning Duration Architectural Shingle (Estate Gray)\n',
    projectTemplate: (projectId, docId = '', fileName = 'Finishes and Material Selections.docx', masterVersion = 'v1.0') =>
      '# Finishes & Material Specifications - Project ' + projectId + ' (Template: ' + masterVersion + ')\n' +
      'DocumentId: ' + docId + '\n' +
      'DocumentName: ' + fileName + '\n' +
      '<!-- initial_master_version: ' + masterVersion + ' -->\n\n' +
      '<!-- section: paint -->\n## 1. Paint & Stains\n\n' +
      '<!-- section: roofing -->\n## 2. Roofing & Gutters\n'
  }
};

export function getDocumentDefinition(docTypeKey = 'purchasing_checklist') {
  const key = String(docTypeKey || '').trim().toLowerCase();
  const def = PROJECT_DOC_REGISTRY[key];
  if (def) return def;

  for (const d of Object.values(PROJECT_DOC_REGISTRY)) {
    if (
      d.docType.toLowerCase() === key ||
      d.displayName.toLowerCase() === key ||
      d.projectResourceType.toLowerCase() === key ||
      d.masterResourceType.toLowerCase() === key
    ) {
      return d;
    }
  }
  return PROJECT_DOC_REGISTRY.purchasing_checklist;
}
